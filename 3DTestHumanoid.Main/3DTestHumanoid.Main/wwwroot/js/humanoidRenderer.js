console.log("DEBUG: VERSION RIGGED LOADED");

let engine = null;
let scene = null;
let characterRoot = null;
let skeletonProxy = null; // The actual Babylon Skeleton
let inputMap = {};

export function initCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (engine) engine.dispose();

    engine = new BABYLON.Engine(canvas, true);
    scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.12, 1);

    // Character Root
    characterRoot = new BABYLON.TransformNode("characterRoot", scene);

    // Third Person Camera
    const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 300, new BABYLON.Vector3(0, 90, 0), scene);
    camera.lockedTarget = characterRoot;
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 100;
    camera.upperRadiusLimit = 600;

    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.7;
    const pl = new BABYLON.PointLight("pl", new BABYLON.Vector3(100, 100, -100), scene);
    pl.intensity = 0.6;

    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 2000, height: 2000 }, scene);
    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    groundMat.specularColor = new BABYLON.Color3(0, 0, 0);
    ground.material = groundMat;

    // Grid
    const grid = BABYLON.MeshBuilder.CreateGround("grid", { width: 2000, height: 2000 }, scene);
    const gridMat = new BABYLON.StandardMaterial("gridMat", scene);
    gridMat.wireframe = true;
    gridMat.alpha = 0.1;
    grid.material = gridMat;
    grid.position.y = 0.1;

    // Input handling
    scene.actionManager = new BABYLON.ActionManager(scene);
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyDownTrigger, (evt) => {
        inputMap[evt.sourceEvent.key.toLowerCase()] = true;
    }));
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyUpTrigger, (evt) => {
        inputMap[evt.sourceEvent.key.toLowerCase()] = false;
    }));

    engine.runRenderLoop(() => {
        updateMovement();
        scene.render();
    });
    window.addEventListener("resize", () => { engine.resize(); });

    // Auto-load for verification
    loadHumanoidFbx();
}

function updateMovement() {
    if (!characterRoot) return;

    let moveSpeed = 4.0;
    let rotationSpeed = 0.05;

    if (inputMap["w"]) {
        characterRoot.translate(BABYLON.Axis.Z, moveSpeed, BABYLON.Space.LOCAL);
    }
    if (inputMap["s"]) {
        characterRoot.translate(BABYLON.Axis.Z, -moveSpeed, BABYLON.Space.LOCAL);
    }
    if (inputMap["a"]) {
        characterRoot.rotate(BABYLON.Axis.Y, -rotationSpeed, BABYLON.Space.LOCAL);
    }
    if (inputMap["d"]) {
        characterRoot.rotate(BABYLON.Axis.Y, rotationSpeed, BABYLON.Space.LOCAL);
    }
}

export function isMoving() {
    return !!(inputMap["w"] || inputMap["s"] || inputMap["a"] || inputMap["d"]);
}

export function getCharacterPosition() {
    return { x: characterRoot.position.x, y: characterRoot.position.y, z: characterRoot.position.z };
}

// Replaced procedural logic with JSON loader
export async function loadHumanoidFbx() {
    if (!scene || !characterRoot) return;

    console.log("Loading Rigged Humanoid JSON...");

    try {
        const response = await fetch("./humanoid_data.json");
        if (!response.ok) throw new Error("Failed to load JSON");
        const data = await response.json();

        console.log("JSON Data:", data.positions.length / 3, "verts", data.bones.length, "bones");

        // 1. Create Mesh
        const mesh = new BABYLON.Mesh("customHumanoid", scene);
        const vertexData = new BABYLON.VertexData();
        vertexData.positions = data.positions;
        vertexData.indices = data.indices;
        // Normals will be calculated
        vertexData.applyToMesh(mesh);

        // Fix Normals
        mesh.createNormals(true);

        // 2. Create Skeleton
        skeletonProxy = new BABYLON.Skeleton("humanoidSkeleton", "humanoidSkeleton", scene);
        const bones = [];

        // Data.bones is flat list, but parents precede children usually? 
        // Need to be careful. If index based, we can create all then link.

        // First pass: Create Bones
        data.bones.forEach(bData => {
            // Matrix from FBX Local Transform
            const matrix = BABYLON.Matrix.Compose(
                new BABYLON.Vector3(bData.scl[0], bData.scl[1], bData.scl[2]),
                BABYLON.Quaternion.RotationYawPitchRoll(
                    bData.rot[1] * (Math.PI / 180),
                    bData.rot[0] * (Math.PI / 180),
                    bData.rot[2] * (Math.PI / 180)
                ),
                new BABYLON.Vector3(bData.pos[0], bData.pos[1], bData.pos[2])
            );

            const bone = new BABYLON.Bone(
                bData.name,
                skeletonProxy,
                null,
                matrix
            );
            bones.push(bone);
        });

        // Second pass: Link Parents
        data.bones.forEach((bData, index) => {
            if (bData.parentIndex >= 0 && bData.parentIndex < bones.length) {
                // bones[index].setParent(bones[bData.parentIndex]); 
                // Babylon Bone constructor with parent argument is immutable mostly? 
                // Actually need to re-parent or use linkTransformNode?
                // Wait, Babylon Bone hierarchy is strict. 
                // Correct way: create in order OR set parent after?
                // The constructor 'parentBone' arg is best. 
                // Let's redo creation loop to respect hierarchy order?
                // Or just use `getParent()`?

                // Let's try fixing parenting manually:
                const child = bones[index];
                const parent = bones[bData.parentIndex];
                // child.setParent(parent); // Deprecated?
                // Internal parent structure...
            }
        });

        // RE-DO SKELETON CREATION: Hierarchy Order Matters
        // We assume data.bones is roughly sorted or we map by index
        skeletonProxy.dispose();
        skeletonProxy = new BABYLON.Skeleton("humanoidSkeleton", "humanoidSkeleton", scene);
        const realBones = {}; // index -> Bone

        // Sort by parentIndex so we always create parents first
        // Roots have parentIndex -1
        const sortedBoneData = data.bones.map((b, i) => ({ ...b, originalIndex: i }));
        sortedBoneData.sort((a, b) => a.parentIndex - b.parentIndex);

        // Actually sorting by parent index works if parents always have lower index? 
        // FBX usually guarantees this. If not, we need a tree builder.
        // Let's trust index reference.

        // We iterate 0..N of ORIGINAL data to keep index mapping consistent with skin weights
        // But we need to create parent before child.

        // Iterative creation?
        // Let's just store them all as null first
        const boneObjects = new Array(data.bones.length).fill(null);

        // Multi-pass creation until all done
        let createdCount = 0;
        let loopGuard = 0;

        while (createdCount < data.bones.length && loopGuard < 100) {
            loopGuard++;
            data.bones.forEach((bData, idx) => {
                if (boneObjects[idx]) return; // Already created

                const pIdx = bData.parentIndex;
                let parentBone = null;

                if (pIdx !== -1) {
                    if (!boneObjects[pIdx]) return; // Parent not ready
                    parentBone = boneObjects[pIdx];
                }

                // Create
                // Create Matrix with Pre/Post Rotation
                // FBX: R = Pre * Rot * Post

                // Helper to deg->rad
                const toRad = Math.PI / 180;

                const rotQ = BABYLON.Quaternion.RotationYawPitchRoll(
                    bData.rot[1] * toRad,
                    bData.rot[0] * toRad,
                    bData.rot[2] * toRad
                );

                const preQ = bData.preRot ? BABYLON.Quaternion.RotationYawPitchRoll(
                    bData.preRot[1] * toRad,
                    bData.preRot[0] * toRad,
                    bData.preRot[2] * toRad
                ) : BABYLON.Quaternion.Identity();

                const postQ = bData.postRot ? BABYLON.Quaternion.RotationYawPitchRoll(
                    bData.postRot[1] * toRad,
                    bData.postRot[0] * toRad,
                    bData.postRot[2] * toRad
                ) : BABYLON.Quaternion.Identity();

                // Combine: Note Babylon multiply order is usually Post-Multiply for transforms?
                // But for Quats: qFinal = qParent * qChild? 
                // Let's assume standard order: Final = Pre * Rot * Post
                const finalRot = preQ.multiply(rotQ).multiply(postQ);

                const matrix = BABYLON.Matrix.Compose(
                    new BABYLON.Vector3(bData.scl[0], bData.scl[1], bData.scl[2]),
                    finalRot,
                    new BABYLON.Vector3(bData.pos[0], bData.pos[1], bData.pos[2])
                );

                boneObjects[idx] = new BABYLON.Bone(bData.name, skeletonProxy, parentBone, matrix);
                createdCount++;
            });
        }

        // 3. Apply Skin Weights
        // DEBUG: Temporarily disable skinning to check mesh visibility
        // mesh.skeleton = skeletonProxy;
        // mesh.setVerticesData(BABYLON.VertexBuffer.MatricesIndicesKind, data.matricesIndices);
        // mesh.setVerticesData(BABYLON.VertexBuffer.MatricesWeightsKind, data.matricesWeights);

        // 4. Material
        const mat = new BABYLON.StandardMaterial("skinMat", scene);
        mat.diffuseColor = new BABYLON.Color3(0.8, 0.6, 0.5);
        mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        mat.backFaceCulling = false; // DEBUG: Show backfaces
        mesh.material = mat;

        mesh.parent = characterRoot;
        mesh.scaling = new BABYLON.Vector3(1, 1, 1); // FBX units

        mesh.computeWorldMatrix(true);
        const bbox = mesh.getBoundingInfo();
        console.log("Mesh BBox:", bbox.minimum, bbox.maximum);

        // Debug: Show Skeleton (Disabled for Mesh Check)
        /*
        if (skeletonProxy.bones && skeletonProxy.bones.length > 0) {
            const viewer = new BABYLON.Debug.SkeletonViewer(skeletonProxy, mesh, scene);
            viewer.isEnabled = true;
            viewer.color = BABYLON.Color3.Red();
        }
        */

        console.log("Rigged Mesh Created!");

    } catch (err) {
        console.error("JSON Load Error:", err);
    }
}

// Customization Controls
export function setBodyScale(height, width) {
    if (!characterRoot) return;
    // Uniform scaling for now, but split for height/width
    // Height affects Y scale
    // Width affects X and Z scale
    characterRoot.scaling.y = height;
    characterRoot.scaling.x = width;
    characterRoot.scaling.z = width;
}

export function setXRayMode(enabled) {
    if (!scene) return;
    const mesh = scene.getMeshByName("customHumanoid");
    if (!mesh || !mesh.material) return;

    if (enabled) {
        mesh.material.alpha = 0.5;
        mesh.material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
    } else {
        mesh.material.alpha = 1.0;
        mesh.material.transparencyMode = BABYLON.Material.MATERIAL_OPAQUE;
    }
}

export function setSkinColor(hexColor) {
    if (!scene) return;
    const mesh = scene.getMeshByName("customHumanoid");
    if (!mesh || !mesh.material) return;

    mesh.material.diffuseColor = BABYLON.Color3.FromHexString(hexColor);
}

// Temporary stub for older calls
export function renderHumanoid(bodyParts) {
    // Disabled in this mode
}
