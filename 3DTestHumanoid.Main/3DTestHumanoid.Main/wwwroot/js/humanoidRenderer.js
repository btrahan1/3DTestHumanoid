console.log("DEBUG: VERSION MANUAL SKELETON REBUILD LOADED");

let engine = null;
let scene = null;
let characterRoot = null;
let skeletonProxy = null;
let clothingSkeletons = []; // Store cloned skeletons for animation
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
    // UPDATED: Animate specific skeletons AND the proxy
    const allSkeletons = [skeletonProxy, ...clothingSkeletons].filter(s => s && s.bones.length);
    if (!allSkeletons.length) return;

    const time = performance.now() * 0.005;

    if (animState === "walk") {
        const walkSpeed = 1.2;
        const cycle = time * walkSpeed;

        allSkeletons.forEach(skel => {
            const bones = skel.bones;
            // Legs
            bones[13].rotation = new BABYLON.Vector3(Math.sin(cycle) * 0.4, 0, 0); // LUpLeg
            bones[14].rotation = new BABYLON.Vector3(Math.max(0, Math.sin(cycle - 1)) * 0.4, 0, 0); // LLeg (Knee)

            bones[16].rotation = new BABYLON.Vector3(Math.sin(cycle + Math.PI) * 0.4, 0, 0); // RUpLeg
            bones[17].rotation = new BABYLON.Vector3(Math.max(0, Math.sin(cycle + Math.PI - 1)) * 0.4, 0, 0); // RLeg (Knee)

            // Arms 
            const armBaseZ = 1.45;
            bones[6].rotation = new BABYLON.Vector3(Math.sin(cycle + Math.PI) * 0.25, 0, -armBaseZ); // LArm
            bones[10].rotation = new BABYLON.Vector3(Math.sin(cycle) * 0.25, 0, armBaseZ); // RArm

            // Spine
            bones[1].rotation = new BABYLON.Vector3(0, Math.sin(cycle) * 0.03, 0);
            bones[0].rotation = new BABYLON.Vector3(0, Math.sin(cycle) * 0.05, 0);
        });

    } else {
        // Idle
        const idleSpeed = 0.4;
        const cycle = time * idleSpeed;

        allSkeletons.forEach(skel => {
            const bones = skel.bones;
            bones.forEach(b => b.rotation = BABYLON.Vector3.Zero());

            const armBaseZ = 1.5;
            bones[6].rotation = new BABYLON.Vector3(0, 0, -armBaseZ);
            bones[10].rotation = new BABYLON.Vector3(0, 0, armBaseZ);
            bones[1].rotation = new BABYLON.Vector3(Math.sin(cycle) * 0.02, 0, 0);
        });
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

// Global Data Store
window.humanoidData = null;

export async function loadHumanoidFbx() {
    if (!scene || !characterRoot) return;
    console.log("Loading Procedurally Rigged Humanoid...");

    try {
        const response = await fetch('./humanoid_data.json');
        if (!response.ok) throw new Error("Failed to load humanoid_data.json");
        const data = await response.json();
        window.humanoidData = data;

        // Dispose existing
        const oldMesh = scene.getMeshByName("customHumanoid");
        if (oldMesh) oldMesh.dispose();
        if (skeletonProxy) skeletonProxy.dispose();
        clothingSkeletons.forEach(s => s.dispose());
        clothingSkeletons = [];
        scene.meshes.filter(m => m.name.startsWith("cloth_")).forEach(m => m.dispose());

        // 1. Create Skeleton
        skeletonProxy = new BABYLON.Skeleton("proceduralSkeleton", "skel-01", scene);
        const babylonBones = [];

        data.bones.forEach((b, i) => {
            const parent = b.parentIndex !== -1 ? babylonBones[b.parentIndex] : null;
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
        mat.diffuseColor = new BABYLON.Color3(1.0, 0.8, 0.7);
        mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        mat.backFaceCulling = false;
        mesh.material = mat;

        mesh.parent = characterRoot;
        mesh.scaling = new BABYLON.Vector3(1, 1, 1);
        mesh.position.y = 0;

        // 3. Animation Test
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

// Stubs for UI controls
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

// ------ CLOTHING GENERATION ------

// --- MORPHOLOGY ---
// --- MORPHOLOGY ---
export function setMorphology(shoulder, leg, arm, head) {
    const allSkeletons = [skeletonProxy, ...clothingSkeletons].filter(s => s);
    if (!allSkeletons.length) return;

    allSkeletons.forEach(skel => {
        // Helper
        const setY = (idx, val) => {
            if (skel.bones[idx]) skel.bones[idx].scaling.y = val;
        };
        const setX = (idx, val) => {
            if (skel.bones[idx]) skel.bones[idx].scaling.x = val;
        };
        const setUniform = (idx, val) => {
            if (skel.bones[idx]) skel.bones[idx].scaling = new BABYLON.Vector3(val, val, val);
        };

        // LEGS: Scale Thighs (13, 16) and Shins/Calves (14, 17)
        setY(13, leg); // L UpLeg
        setY(16, leg); // R UpLeg
        setY(14, leg); // L Leg
        setY(17, leg); // R Leg

        // ARMS: Scale UpArms (6, 10) and ForeArms (7, 11)
        setY(6, arm);  // L UpArm
        setY(10, arm); // R UpArm
        setY(7, arm);  // L ForeArm
        setY(11, arm); // R ForeArm

        // HEAD: Scale Uniform (Index 4)
        setUniform(4, head);

        // SHOULDERS: Clavicles (Index 5=L, 9=R)
        // Scale X to widen shoulders (pushes arms out)
        if (skel.bones[5]) skel.bones[5].scaling.x = shoulder;
        if (skel.bones[9]) skel.bones[9].scaling.x = shoulder;
    });

    // ROOT HEIGHT CORRECTION
    const HEIGHT_FACTOR = 90.0;
    if (characterRoot) {
        characterRoot.position.y = (leg - 1.0) * HEIGHT_FACTOR;
    }
}

// --- CLOTHING MESH GENERATOR ---
function createClothingMesh(name, targetRegions, inflateAmount, colorHex, excludeBones = []) {
    console.log(`createClothingMesh: Called for ${name}`);

    if (!window.humanoidData || !scene) return;
    const data = window.humanoidData;
    const regionIds = data.regionIds;

    // 1. Filter Vertices & Build New Index Map
    const newPositions = [];
    const newIndices = [];
    const newMatricesIndices = [];
    const newMatricesWeights = [];
    const indexMap = new Map();

    // Helper: Get Primary Bone Index for a vertex
    const getDominantBone = (oldIdx) => {
        // Just check the first bone index (usually the highest weight in sorted export, 
        // but even if not, if it has ANY weight it's relevant). 
        // Ideally we check the one with max weight.
        let maxW = 0;
        let mainB = -1;
        for (let k = 0; k < 4; k++) {
            if (data.matricesWeights[oldIdx * 4 + k] > maxW) {
                maxW = data.matricesWeights[oldIdx * 4 + k];
                mainB = data.matricesIndices[oldIdx * 4 + k];
            }
            // If weights are equal, prefer lower bone index (arbitrary tie-breaker)
            else if (data.matricesWeights[oldIdx * 4 + k] === maxW && data.matricesIndices[oldIdx * 4 + k] < mainB) {
                mainB = data.matricesIndices[oldIdx * 4 + k];
            }
        }
        return mainB;
    };

    const addVertex = (oldIdx) => {
        if (indexMap.has(oldIdx)) return indexMap.get(oldIdx);

        const newIdx = newPositions.length / 3;

        // Position + Inflation
        const px = data.positions[oldIdx * 3];
        const py = data.positions[oldIdx * 3 + 1];
        const pz = data.positions[oldIdx * 3 + 2];

        const baseMesh = scene.getMeshByName("customHumanoid");
        let nx = 0, ny = 1, nz = 0;
        if (baseMesh) {
            const normals = baseMesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
            if (normals) {
                // FLIP NORMALS: FBX data is inverted, so we flip to point Outwards
                nx = -normals[oldIdx * 3];
                ny = -normals[oldIdx * 3 + 1];
                nz = -normals[oldIdx * 3 + 2];
            }
        }

        newPositions.push(px + nx * inflateAmount);
        newPositions.push(py + ny * inflateAmount);
        newPositions.push(pz + nz * inflateAmount);

        // Weights (Clean Pass)
        newMatricesIndices.push(data.matricesIndices[oldIdx * 4], data.matricesIndices[oldIdx * 4 + 1], data.matricesIndices[oldIdx * 4 + 2], data.matricesIndices[oldIdx * 4 + 3]);
        newMatricesWeights.push(data.matricesWeights[oldIdx * 4], data.matricesWeights[oldIdx * 4 + 1], data.matricesWeights[oldIdx * 4 + 2], data.matricesWeights[oldIdx * 4 + 3]);

        indexMap.set(oldIdx, newIdx);
        return newIdx;
    };

    // 2. Build Triangles
    for (let i = 0; i < data.indices.length; i += 3) {
        const i0 = data.indices[i];
        const i1 = data.indices[i + 1];
        const i2 = data.indices[i + 2];

        const r0 = regionIds[i0];
        const r1 = regionIds[i1];
        const r2 = regionIds[i2];

        // REGION FILTER: "At least 2 vertices" (Fixes Seams/Groin Gap)
        let matchCount = 0;
        if (targetRegions.includes(r0)) matchCount++;
        if (targetRegions.includes(r1)) matchCount++;
        if (targetRegions.includes(r2)) matchCount++;

        if (matchCount >= 2) {
            // BONE EXCLUSION FILTER: Drop triangle if ANY vertex is dominated by an excluded bone
            const b0 = getDominantBone(i0);
            const b1 = getDominantBone(i1);
            const b2 = getDominantBone(i2);

            if (!excludeBones.includes(b0) && !excludeBones.includes(b1) && !excludeBones.includes(b2)) {
                const n0 = addVertex(i0);
                const n1 = addVertex(i1);
                const n2 = addVertex(i2);
                newIndices.push(n0, n1, n2);
            }
        }
    }

    if (newIndices.length === 0) return;

    // 3. Create Mesh
    const mesh = new BABYLON.Mesh(name, scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = newPositions;
    vertexData.indices = newIndices;
    vertexData.matricesIndices = new Float32Array(newMatricesIndices);
    vertexData.matricesWeights = new Float32Array(newMatricesWeights);

    // Normals
    const calcNormals = [];
    BABYLON.VertexData.ComputeNormals(newPositions, newIndices, calcNormals);
    vertexData.normals = calcNormals;

    vertexData.applyToMesh(mesh);

    // CRITICAL FIX: Manually build a FRESH skeleton instead of cloning
    // Cloning was corrupting Bone 0. Manual rebuild ensures clean state.
    const newSkel = new BABYLON.Skeleton(name + "_skel", name + "_skel_id", scene);
    const babylonBones = [];

    data.bones.forEach((b, i) => {
        const parent = b.parentIndex !== -1 ? babylonBones[b.parentIndex] : null;
        const matrix = BABYLON.Matrix.Translation(b.pos[0], b.pos[1], b.pos[2]);
        const bone = new BABYLON.Bone(b.name, newSkel, parent, matrix);
        babylonBones.push(bone);
    });

    newSkel.returnToRest();
    clothingSkeletons.push(newSkel);

    mesh.skeleton = newSkel;
    mesh.numBoneInfluencers = 4;
    mesh.refreshBoundingInfo();

    // Material
    const mat = new BABYLON.StandardMaterial(name + "_mat", scene);
    mat.diffuseColor = BABYLON.Color3.FromHexString(colorHex);
    mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    mat.backFaceCulling = false; // Show inside of shirt
    mesh.material = mat;

    mesh.parent = characterRoot;
}

export function renderHumanoid(bodyParts) {
    if (!scene || !characterRoot) return;

    // Clean up old meshes AND skeletons
    scene.meshes.filter(m => m.name.startsWith("cloth_")).forEach(m => m.dispose());
    scene.meshes.filter(m => m.name.startsWith("proc_")).forEach(m => m.dispose());
    scene.meshes.filter(m => m.name.includes("_debug")).forEach(m => m.dispose());

    clothingSkeletons.forEach(s => s.dispose());
    clothingSkeletons = [];

    // Check flags
    const hasShirt = bodyParts.some(p => p.name.includes("Shirt"));
    const hasPants = bodyParts.some(p => p.name.includes("Pants"));
    const hasBoots = bodyParts.some(p => p.name.includes("Boot"));

    // Restore Body Defaults (remove debug x-ray/culling)
    const body = scene.getMeshByName("customHumanoid");
    if (body) {
        body.material.alpha = 1.0;
        body.material.backFaceCulling = false; // Keep false to act as double-sided
    }

    const shirtColor = bodyParts.find(p => p.name.includes("Shirt"))?.color || "#3B5998";
    const pantsColor = bodyParts.find(p => p.name.includes("Pants"))?.color || "#3B5998";
    const bootColor = bodyParts.find(p => p.name.includes("Boot"))?.color || "#3D2B1F";

    // BONE IDs:
    // LeftHand: 8, RightHand: 12
    // LeftFoot: 15, RightFoot: 18
    // LeftUpLeg: 13, RightUpLeg: 16

    if (hasShirt) {
        // Shirt: Cut Hands (8, 12)
        createClothingMesh("cloth_shirt", [1, 2, 3], 1.2, shirtColor, [8, 12]);
    }
    if (hasPants) {
        // Pants: Cut Feet (15, 18). Seam fix ensures Hips+Legs connect.
        createClothingMesh("cloth_pants", [4, 5, 6], 1.6, pantsColor, [15, 18]);
    }
    if (hasBoots) {
        // Boots: Keeps everything leg-related to ensure proper scaling with Thighs.
        createClothingMesh("cloth_boots", [5, 6], 2.7, bootColor, []);
    }
}

export function downloadModel(filename) {
    if (!scene) return;
    console.log("Downloading GLB...");

    // Export scene to GLB
    BABYLON.GLTF2Export.GLBAsync(scene, filename).then((glb) => {
        glb.downloadFiles();
    });
}

export function loadGlbModel(data) {
    if (!scene) return;
    try {
        console.log("Loading GLB from stream...");

        // Dispose existing meshes
        scene.meshes.forEach(m => {
            if (m.name !== "ground" && m.name !== "skybox") m.dispose();
        });
        if (characterRoot) characterRoot.dispose();
        if (skeletonProxy) skeletonProxy.dispose();
        clothingSkeletons.forEach(s => s.dispose());
        clothingSkeletons = [];

        // Create new Root
        characterRoot = new BABYLON.TransformNode("characterRoot", scene);

        // Create Blob URL
        const blob = new Blob([data]);
        const url = URL.createObjectURL(blob);

        BABYLON.SceneLoader.AppendAsync("", url, scene, (s) => {
            console.log("GLB Loaded successfully");

            // Re-bind camera?
            // Find root mesh or skeleton
            // Babylon GLTF loader creates __root__ usually.
            const rootMesh = scene.meshes.find(m => m.name === "__root__");
            if (rootMesh) {
                rootMesh.parent = characterRoot;
                // Fix rotation if needed (GLTF is usually Y-up but sometimes rotated).
                // Usually __root__ corrects valid GLTF.
            }

            // Try to find skeleton and animations
            // Reset animState
            animState = "idle";

        }, ".glb");

    } catch (e) {
        console.error("Error loading GLB:", e);
    }
}

// ------ RECIPE DOWNLOAD HELPER ------
export function downloadFileFromClient(filename, base64Content) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = "data:application/json;base64," + base64Content;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
