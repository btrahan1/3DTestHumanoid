console.log("DEBUG: VERSION PROCEDURAL RIG LOADED");

let engine = null;
let scene = null;
let characterRoot = null;
let skeletonProxy = null;
let inputMap = {};

export function initCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (engine) engine.dispose();

    engine = new BABYLON.Engine(canvas, true);
    scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.12, 1);

    // Root node
    characterRoot = new BABYLON.TransformNode("characterRoot", scene);

    // Camera
    const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 300, new BABYLON.Vector3(0, 90, 0), scene);
    camera.lockedTarget = characterRoot;
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 50;
    camera.upperRadiusLimit = 1000;

    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.8;
    const pl = new BABYLON.PointLight("pl", new BABYLON.Vector3(100, 100, -100), scene);
    pl.intensity = 0.6;

    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 2000, height: 2000 }, scene);
    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    groundMat.specularColor = new BABYLON.Color3(0, 0, 0);
    ground.material = groundMat;

    // Input handling
    scene.actionManager = new BABYLON.ActionManager(scene);
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyDownTrigger, (evt) => {
        inputMap[evt.sourceEvent.key.toLowerCase()] = true;
    }));
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyUpTrigger, (evt) => {
        inputMap[evt.sourceEvent.key.toLowerCase()] = false;
    }));

    engine.runRenderLoop(() => {
        scene.render();
    });
    window.addEventListener("resize", () => { engine.resize(); });

    loadHumanoidFbx();
}

let animState = "idle";

function updateAnimation() {
    if (!skeletonProxy || !skeletonProxy.bones.length) return;

    const time = performance.now() * 0.005; // Time factor for speed
    const bones = skeletonProxy.bones;

    // Bone Indices (Updated for High-Fidelity Rig):
    // 0:Hips, 1:Spine, 2:Spine1, 3:Neck, 4:Head
    // 5:LShoulder, 6:LArm, 7:LForeArm, 8:LHand
    // 9:RShoulder, 10:RArm, 11:RForeArm, 12:RHand
    // 13:LUpLeg, 14:LLeg, 15:LFoot
    // 16:RUpLeg, 17:RLeg, 18:RFoot

    if (animState === "walk") {
        const walkSpeed = 1.2;
        const cycle = time * walkSpeed;

        // Legs
        bones[13].rotation = new BABYLON.Vector3(Math.sin(cycle) * 0.4, 0, 0); // LUpLeg
        bones[14].rotation = new BABYLON.Vector3(Math.max(0, Math.sin(cycle - 1)) * 0.4, 0, 0); // LLeg (Knee)

        bones[16].rotation = new BABYLON.Vector3(Math.sin(cycle + Math.PI) * 0.4, 0, 0); // RUpLeg
        bones[17].rotation = new BABYLON.Vector3(Math.max(0, Math.sin(cycle + Math.PI - 1)) * 0.4, 0, 0); // RLeg (Knee)

        // Arms (Hanging down, swinging forward/back)
        const armBaseZ = 1.45;
        bones[6].rotation = new BABYLON.Vector3(Math.sin(cycle + Math.PI) * 0.25, 0, -armBaseZ); // LArm
        bones[10].rotation = new BABYLON.Vector3(Math.sin(cycle) * 0.25, 0, armBaseZ); // RArm

        // Stable Spine & Hips
        bones[1].rotation = new BABYLON.Vector3(0, Math.sin(cycle) * 0.03, 0);
        bones[0].rotation = new BABYLON.Vector3(0, Math.sin(cycle) * 0.05, 0);

    } else {
        // Idle (Slow breathing)
        const idleSpeed = 0.4;
        const cycle = time * idleSpeed;

        // Reset to default pose
        bones.forEach(b => b.rotation = BABYLON.Vector3.Zero());

        // Arms down
        const armBaseZ = 1.5;
        // Joint 6 is LArm, Joint 10 is RArm
        bones[6].rotation = new BABYLON.Vector3(0, 0, -armBaseZ);
        bones[10].rotation = new BABYLON.Vector3(0, 0, armBaseZ);

        // Very subtle breathing
        bones[1].rotation = new BABYLON.Vector3(Math.sin(cycle) * 0.02, 0, 0);
    }
}

function updateMovement() {
    if (!characterRoot) return;
    let moveSpeed = 2.0;
    let rotationSpeed = 0.05;
    let isMoving = false;

    if (inputMap["w"]) {
        characterRoot.translate(BABYLON.Axis.Z, moveSpeed, BABYLON.Space.LOCAL);
        isMoving = true;
    }
    if (inputMap["s"]) {
        characterRoot.translate(BABYLON.Axis.Z, -moveSpeed, BABYLON.Space.LOCAL);
        isMoving = true;
    }
    if (inputMap["a"]) {
        characterRoot.rotate(BABYLON.Axis.Y, -rotationSpeed, BABYLON.Space.LOCAL);
        isMoving = true;
    }
    if (inputMap["d"]) {
        characterRoot.rotate(BABYLON.Axis.Y, rotationSpeed, BABYLON.Space.LOCAL);
        isMoving = true;
    }

    animState = isMoving ? "walk" : "idle";
}

export async function loadHumanoidFbx() {
    if (!scene || !characterRoot) return;
    console.log("Loading Procedurally Rigged Humanoid...");

    try {
        const response = await fetch('./humanoid_data.json');
        if (!response.ok) throw new Error("Failed to load humanoid_data.json");
        const data = await response.json();

        console.log(`Mesh Data: ${data.positions.length / 3} verts, ${data.indices.length / 3} triangles, ${data.bones.length} bones`);

        // Dispose existing
        const oldMesh = scene.getMeshByName("customHumanoid");
        if (oldMesh) oldMesh.dispose();
        if (skeletonProxy) skeletonProxy.dispose();

        // 1. Create Skeleton
        skeletonProxy = new BABYLON.Skeleton("proceduralSkeleton", "skel-01", scene);
        const babylonBones = [];

        data.bones.forEach((b, i) => {
            const parent = b.parentIndex !== -1 ? babylonBones[b.parentIndex] : null;
            // Use Matrix.Compose to handle rotation if we ever add it to JSON
            const matrix = BABYLON.Matrix.Translation(b.pos[0], b.pos[1], b.pos[2]);
            const bone = new BABYLON.Bone(b.name, skeletonProxy, parent, matrix);
            babylonBones.push(bone);
        });

        // 2. Create Mesh
        const mesh = new BABYLON.Mesh("customHumanoid", scene);
        const vertexData = new BABYLON.VertexData();

        vertexData.positions = data.positions;
        vertexData.indices = data.indices;

        const normals = [];
        BABYLON.VertexData.ComputeNormals(data.positions, data.indices, normals);
        vertexData.normals = normals;

        // Apply Skinning Data
        vertexData.matricesIndices = new Float32Array(data.matricesIndices);
        vertexData.matricesWeights = new Float32Array(data.matricesWeights);

        vertexData.applyToMesh(mesh);
        mesh.skeleton = skeletonProxy;
        mesh.numBoneInfluencers = 4;

        // Material
        const mat = new BABYLON.StandardMaterial("humanMat", scene);
        mat.diffuseColor = new BABYLON.Color3(1.0, 0.8, 0.7); // Skin tone
        mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        mat.backFaceCulling = false;
        mesh.material = mat;

        mesh.parent = characterRoot;
        mesh.scaling = new BABYLON.Vector3(1, 1, 1);
        mesh.position.y = 0;

        // 3. Animation Test (Moved to updateAnimation loop)
        scene.registerBeforeRender(() => {
            updateMovement();
            updateAnimation();
        });

        console.log("Procedural Humanoid Created!");
        window.humanoid = mesh;
        window.skeleton = skeletonProxy;

    } catch (e) {
        console.error("Error loading humanoid:", e);
    }
}

// Stubs for UI controls to prevent errors
export function setAnimationState(state) { animState = state; }
export function setBodyScale(height, width) {
    if (!characterRoot) return;
    characterRoot.scaling.y = height;
    characterRoot.scaling.x = width;
    characterRoot.scaling.z = width;
}

export function setXRayMode(enabled) {
    const mesh = scene.getMeshByName("customHumanoid");
    if (!mesh) return;
    mesh.material.alpha = enabled ? 0.5 : 1.0;
}

export function setSkinColor(hexColor) {
    const mesh = scene.getMeshByName("customHumanoid");
    if (!mesh) return;
    mesh.material.diffuseColor = BABYLON.Color3.FromHexString(hexColor);
}

export function isMoving() { return animState === "walk"; }
export function getCharacterPosition() {
    return { x: characterRoot.position.x, y: characterRoot.position.y, z: characterRoot.position.z };
}
export function renderHumanoid() { }
