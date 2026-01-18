console.log("DEBUG: VERSION MANUAL SKELETON REBUILD LOADED");

let engine = null;
let scene = null;
let characterRoot = null;
let skeletonProxy = null;
let clothingSkeletons = []; // Store cloned skeletons for animation
let inputMap = {};


// Duplicate removed


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

// --- INITIALIZATION ---
export function initCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (engine) engine.dispose();

    engine = new BABYLON.Engine(canvas, true);
    scene = new BABYLON.Scene(engine);
    // Lighter background to see shadows/contrast
    scene.clearColor = new BABYLON.Color4(0.4, 0.4, 0.4, 1.0);

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

// --- MATERIAL SYSTEM ---
function createMaterial(name, hexColor, type) {
    // FALLBACK: Using StandardMaterial for guaranteed "Video Game" shine
    const mat = new BABYLON.StandardMaterial(name, scene);
    mat.diffuseColor = BABYLON.Color3.FromHexString(hexColor);

    switch (type) {
        case 'plate':
        case 'metal':
        case 'chain':
            // High Shine / Metallic
            mat.specularColor = new BABYLON.Color3(1.0, 1.0, 1.0); // White Reflection
            mat.specularPower = 64; // Sharp
            break;
        case 'leather':
            // High Shine
            mat.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5); // Grey Reflection
            mat.specularPower = 32; // Tight, gloss highlight
            break;
        case 'cloth':
            // No Shine
            mat.specularColor = new BABYLON.Color3(0.0, 0.0, 0.0); // No Reflection
            mat.specularPower = 0;
            break;
        case 'wood':
            mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Low Shine
            mat.specularPower = 4;
            break;
        case 'skin':
        default:
            // Soft Shine
            mat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
            mat.specularPower = 8; // Broad, soft highlight
            break;
    }

    mat.backFaceCulling = false;

    // Z-Offset to prevent Z-Fighting (Black Splotches)
    if (type !== 'skin') {
        mat.zOffset = -1.0; // Draw slightly closer to camera
    }

    return mat;
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

        // Material (SKIN)
        mesh.material = createMaterial("humanMat", "#D2B48C", 'skin');

        mesh.parent = characterRoot;
        mesh.scaling = new BABYLON.Vector3(1, 1, 1);
        mesh.position.y = 0;

        // 3. Animation Test
        scene.registerBeforeRender(() => {
            updateMovement();
            updateAnimation();

            // SYNC SKELETONS TO ROOT (Fix for "Loses its mind")
            // Ensure clothing skeletons follow the character movement if they drift.
            // (Note: Usually parenting mesh is enough, but cloned skeletons can be finicky).
            if (characterRoot) {
                // If we need to manual sync, we would do it here.
                // But first, let's try the overrideMesh fix in createClothingMesh.
            }
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
    mesh.material.albedoColor = BABYLON.Color3.FromHexString(hexColor);
}
export function isMoving() { return animState === "walk"; }
export function getCharacterPosition() {
    return { x: characterRoot.position.x, y: characterRoot.position.y, z: characterRoot.position.z };
}

// ------ CLOTHING GENERATION ------

// --- MORPHOLOGY ---
export function setMorphology(shoulder, leg, arm, head, thickness = 1.0) {
    console.log(`setMorphology: Shoulder=${shoulder}, Leg=${leg}, Arm=${arm}, Head=${head}, Thickness=${thickness}`);
    const allSkeletons = [skeletonProxy, ...clothingSkeletons].filter(s => s);
    if (!allSkeletons.length) return;



    allSkeletons.forEach(skel => {

        // Helper
        const setScale = (idx, x, y, z) => {
            if (skel.bones[idx]) skel.bones[idx].scaling = new BABYLON.Vector3(x, y, z);
        };

        // LEGS: Length = Y, Thickness = X, Z
        const setLeg = (idx, len, thick) => {
            if (skel.bones[idx]) {
                skel.bones[idx].scaling = new BABYLON.Vector3(thick, len, thick);
            }
        };

        // ARMS: Length = X, Thickness = Y, Z (Based on T-Pose)
        const setArm = (idx, len, thick) => {
            if (skel.bones[idx]) {
                // IMPORTANT: X is Length for Arms
                skel.bones[idx].scaling = new BABYLON.Vector3(len, thick, thick);
            }
        };

        // HEAD: Uniform
        const setUniform = (idx, val) => {
            if (skel.bones[idx]) skel.bones[idx].scaling = new BABYLON.Vector3(val, val, val);
        };

        // INVERSE: For Hands/Feet, inverted scale must match the Parent's Length/Thick mix
        // Arms (Parent X=Len) -> Hand needs X=1/Len
        // Legs (Parent Y=Len) -> Foot needs Y=1/Len
        const setInverseArm = (idx, len, thick) => {
            if (skel.bones[idx]) {
                skel.bones[idx].scaling = new BABYLON.Vector3(1 / len, 1 / thick, 1 / thick);
            }
        };
        const setInverseLeg = (idx, len, thick) => {
            if (skel.bones[idx]) {
                skel.bones[idx].scaling = new BABYLON.Vector3(1 / thick, 1 / len, 1 / thick);
            }
        };

        // 1. LEGS (13, 16, 14, 17)
        // Dampen thickness effect on legs to prevent "bulge above knee" (User Request)
        // If thickness is 1.2 (Heavy), Legs become 1.1.
        const legThickness = 1.0 + (thickness - 1.0) * 0.5;

        // Inherits: X=Thick, Y=1, Z=Thick (from Hips)
        // Target:   X=Thick, Y=Len, Z=Thick
        // Local:    X=1, Y=Len, Z=1
        // Since Hips are NOT scaled by thickness (reverted previously), we apply full legThickness.

        const legLocalThick = legThickness;

        setScale(13, legLocalThick, leg, legLocalThick);
        setScale(16, legLocalThick, leg, legLocalThick);
        setScale(14, legLocalThick, leg, legLocalThick);
        setScale(17, legLocalThick, leg, legLocalThick);

        // 2. FEET (15, 18)
        // Inherits: X=LegThick, Y=Len, Z=LegThick
        // Target:   X=1, Y=1, Z=1
        // Local:    1/LegThick, 1/Len, 1/LegThick
        setScale(15, 1.0 / legThickness, 1.0 / leg, 1.0 / legThickness);
        setScale(18, 1.0 / legThickness, 1.0 / leg, 1.0 / legThickness);

        // 3. ARMS (6, 10, 7, 11)
        setArm(6, arm, thickness);
        setArm(10, arm, thickness);
        setArm(7, arm, thickness);
        setArm(11, arm, thickness);

        // 4. HANDS (8, 12) - Inverse of Arm Scale
        setInverseArm(8, arm, thickness);
        setInverseArm(12, arm, thickness);

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
function createClothingMesh(name, targetRegions, inflateAmount, colorHex, matType, excludeBones = [], maxHeight = null, includeBones = null) {
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
        let maxW = 0;
        let mainB = -1;
        for (let k = 0; k < 4; k++) {
            if (data.matricesWeights[oldIdx * 4 + k] > maxW) {
                maxW = data.matricesWeights[oldIdx * 4 + k];
                mainB = data.matricesIndices[oldIdx * 4 + k];
            }
            else if (data.matricesWeights[oldIdx * 4 + k] === maxW && data.matricesIndices[oldIdx * 4 + k] < mainB) {
                mainB = data.matricesIndices[oldIdx * 4 + k];
            }
        }
        return mainB;
    };

    const addVertex = (oldIdx) => {
        if (indexMap.has(oldIdx)) return indexMap.get(oldIdx);

        // Position Check
        const py = data.positions[oldIdx * 3 + 1];
        if (maxHeight !== null && py > maxHeight) return -1; // CLIP

        const newIdx = newPositions.length / 3;

        // Position + Inflation
        const px = data.positions[oldIdx * 3];
        const pz = data.positions[oldIdx * 3 + 2];

        const baseMesh = scene.getMeshByName("customHumanoid");
        let nx = 0, ny = 1, nz = 0;
        if (baseMesh) {
            const normals = baseMesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
            if (normals) {
                // FLIP NORMALS: FBX data is inverted
                nx = -normals[oldIdx * 3];
                ny = -normals[oldIdx * 3 + 1];
                nz = -normals[oldIdx * 3 + 2];
            }
        }

        newPositions.push(px + nx * inflateAmount);
        newPositions.push(py + ny * inflateAmount);
        newPositions.push(pz + nz * inflateAmount);

        // Weights
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

        // REGION FILTER
        let matchCount = 0;
        if (targetRegions.includes(r0)) matchCount++;
        if (targetRegions.includes(r1)) matchCount++;
        if (targetRegions.includes(r2)) matchCount++;

        if (matchCount >= 2) {
            // BONE & HEIGHT FILTER
            const b0 = getDominantBone(i0);
            const b1 = getDominantBone(i1);
            const b2 = getDominantBone(i2);

            // EXCLUDE check
            if (excludeBones.length > 0) {
                if (excludeBones.includes(b0) || excludeBones.includes(b1) || excludeBones.includes(b2)) continue;
            }

            // INCLUDE check
            if (includeBones) {
                // Relaxed Filter: Allow triangle if AT LEAST ONE vertex is in the allowed bones.
                // This creates an overlap at the joints, preventing gaps.
                if (!includeBones.includes(b0) && !includeBones.includes(b1) && !includeBones.includes(b2)) continue;
            }

            const n0 = addVertex(i0);
            const n1 = addVertex(i1);
            const n2 = addVertex(i2);

            // If any vertex was clipped (returns -1), drop the triangle
            if (n0 !== -1 && n1 !== -1 && n2 !== -1) {
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

    // 4. Shared Skeleton Strategy (Fixes "Explosion" and "Ghosting")
    // Instead of cloning the skeleton (which desynchronizes), we use the main skeletonProxy.
    // This ensures perfect synchronization with the body.
    mesh.skeleton = skeletonProxy;
    mesh.numBoneInfluencers = 4;
    mesh.refreshBoundingInfo();

    // Material (Uses new PBR Helper)
    mesh.material = createMaterial(name + "_mat", colorHex, matType);

    // Parent to Root so it moves with the character
    mesh.parent = characterRoot;
}


export function renderHumanoid(bodyParts) {
    if (!scene || !characterRoot) return;

    // Clean up old meshes AND skeletons
    scene.meshes.filter(m => m.name.startsWith("cloth_")).forEach(m => m.dispose());
    scene.meshes.filter(m => m.name.startsWith("armor_")).forEach(m => m.dispose()); // FIX: Cleanup new armor slots
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


        // --- ARSENAL & GEOMETRIC PARTS ---
        // Iterate over parts from Solver (Sword, Shield, etc.)
        bodyParts.forEach(part => {
            if (!part.path || part.path.length < 2) return; // Skip non-geometric parts (e.g. Shirt flags)

            // Convert DTO Path to Vector3
            const path = part.path.map(p => new BABYLON.Vector3(p.x, p.y, p.z));

            // Create Tube
            // Note: HumanoidSolver now uses Local Space for weapons.
            const mesh = BABYLON.MeshBuilder.CreateTube(part.name, {
                path: path,
                radius: part.radii[0], // Simplified radius usage
                radiusFunction: (i, dist) => {
                    // Support tapering if radii array has multiple values
                    if (part.radii.length > 1) {
                        const t = i / (path.length - 1);
                        return part.radii[0] * (1 - t) + part.radii[part.radii.length - 1] * t;
                    }
                    return part.radii[0];
                },
                cap: BABYLON.Mesh.CAP_ALL,
                updatable: true
            }, scene);

            // Apply Scale (Flattening)
            if (part.scale) {
                mesh.scaling = new BABYLON.Vector3(part.scale.x, part.scale.y, part.scale.z);
            }

            // Material Logic
            const nameLower = part.name.toLowerCase();
            let matType = 'standard';
            if (nameLower.includes("metal") || nameLower.includes("blade") || nameLower.includes("guard") || nameLower.includes("plate") || nameLower.includes("head")) {
                matType = 'metal';
            } else if (nameLower.includes("wood") || nameLower.includes("shaft") || nameLower.includes("handle")) {
                matType = 'wood';
            } else {
                matType = 'leather'; // Hilt grips etc
            }

            const mat = createMaterial(part.name + "_mat", part.color, matType);

            // Custom Material Tuning for Metals
            if (matType === 'metal') {
                mat.specularColor = new BABYLON.Color3(0.9, 0.9, 0.9); // High Shine
                mat.specularPower = 64; // Sharp highlights
            } else if (matType === 'wood') {
                mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Low Shine
                mat.specularPower = 4;
            }

            mesh.material = mat;

            // --- ATTACHMENT LOGIC ---
            // Attach weapons to Hand Bones so they move with the FBX animation/scaling
            // Right Hand = Bone 12
            // Left Hand = Bone 8
            if (skeletonProxy) {
                let targetBoneIndex = -1;

                if (part.name.includes("Sword") || part.name.includes("Spear")) {
                    targetBoneIndex = 12; // Right Hand
                } else if (part.name.includes("Shield")) {
                    targetBoneIndex = 8; // Left Hand
                }

                if (targetBoneIndex !== -1 && skeletonProxy.bones[targetBoneIndex]) {
                    const charMesh = scene.getMeshByName("customHumanoid");
                    if (charMesh) {
                        mesh.attachToBone(skeletonProxy.bones[targetBoneIndex], charMesh);
                    }

                    // Rotation Fix based on Local Space Generation
                    // C# Generates "Up" along Y.
                    // Hand Bone (Right) usually points X or -X.
                    // We might need to rotate the mesh to align with the hand.
                    // Sword/Spear: Generated Vertical (Y). 
                    // Attaching to Hand: We probably want it to align with the Hand's "Up" or "Forward".
                    // For now, let's just fix the crash. Alignment can be tuned next.
                } else {
                    // If not attached, parent to root?
                    // But these are local space coordinates... if not attached, they will spawn at 0,0,0 World.
                    // We should assume they MUST attach.
                }
            }
        });
    }

    // --- ARMOR & CLOTHING SLOT SYSTEM ---
    // Format: "Slot_Type" (e.g. "Torso_PlateArmor", "Legs_Pants")

    bodyParts.forEach(part => {
        const parts = part.name.split('_');
        if (parts.length < 2) return;

        const slot = parts[0]; // Torso, Legs, Feet, etc.
        const type = parts[1]; // PlateArmor, Pants, etc.

        let regions = [];
        let inflation = 1.0;
        let matType = 'cloth';
        let maxHeight = null;
        let exclusions = [];
        let includeBones = null;

        // 1. Determine Dimensions & Material based on TYPE
        if (type.includes("Plate")) {
            inflation = 2.5;
            matType = 'metal';
        } else if (type.includes("Chain")) {
            inflation = 1.6;
            matType = 'chain';
        } else if (type.includes("Leather")) {
            inflation = 1.4;
            matType = 'leather';
        } else {
            // Default Cloth
            inflation = 1.2;
            matType = 'cloth';
        }

        // 2. Determine Regions based on SLOT
        if (slot === "Torso") {
            regions = [1]; // Torso + Clavicles usually
            // STRICTLY Torso (Vest/Cuirass)
            // Bones: 0 (Hips), 1,2,3 (Spines), 4 (Neck)
            includeBones = [0, 1, 2, 3, 4];

        } else if (slot === "Shoulders") {
            regions = [1, 2, 3]; // Torso + Arms
            // Bones: 5 (LeftShoulder), 9 (RightShoulder)
            // Plus maybe top of UpperArms (6, 10)? Pauldrons usually hang over.
            includeBones = [5, 6, 9, 10];
            inflation += 0.5; // Make them float a bit

        } else if (slot === "Arms") {
            regions = [2, 3]; // Arms
            // Bones: 6, 7 (Left Arm/Forearm), 10, 11 (Right Arm/Forearm)
            // EXCLUDE Hands (8, 12)
            includeBones = [6, 7, 10, 11];

        } else if (slot === "Legs") {
            regions = [4, 5, 6]; // Hips + Legs
            if (matType === 'cloth') inflation = 1.2; // Pants tightness
            if (matType === 'cloth') exclusions = []; // Tucks into boots

        } else if (slot === "Feet") {
            regions = [5, 6]; // Legs
            maxHeight = 45.0; // Knee High
            if (type.includes("Plate")) inflation = 2.6;
            else if (type.includes("Cloth") || type.includes("Shoes")) inflation = 1.4; // Shoes/Wraps
            else inflation = 2.4; // Leather Boots

        } else if (slot === "Hands") {
            regions = [2, 3]; // Arms
            inflation += 0.1;
            includeBones = [8, 12]; // Strictly Hands


        } else if (slot === "Head") {
            regions = [0]; // Head
            if (type.includes("Cloth")) inflation = 1.25;
            else inflation = 1.5;
        }

        // 3. GENERATE
        if (regions.length > 0) {
            // Unique ID for the mesh
            const meshName = `armor_${slot}_${type}`;
            createClothingMesh(meshName, regions, inflation, part.color, matType, exclusions, maxHeight, includeBones);
        }
    });
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
