console.log("DEBUG: VERSION MANUAL SKELETON REBUILD LOADED");
let animDebugLogged = false;
let lastBodyParts = [];
const restQuaternions = new Map();

let engine = null;
let scene = null;
let characterRoot = null;
let skeletonProxy = null;
let clothingSkeletons = []; // Store cloned skeletons for animation
let inputMap = {};


// Duplicate removed


// --- BONE HELPERS ---
function getBone(skel, name) {
    if (!skel) return null;
    // Multi-Prefix Search (Native, mixamorig:, mixamorig9:)
    let bone = skel.bones.find(b => {
        const bn = b.name.toLowerCase();
        const tn = name.toLowerCase();
        return bn === tn || bn.endsWith(":" + tn) || bn.endsWith("mixamorig:" + tn) || bn.endsWith("mixamorig9:" + tn);
    });
    return bone;
}

function getBoneIndex(skel, name) {
    if (!skel) return -1;
    let idx = skel.bones.findIndex(b => {
        const bn = b.name.toLowerCase();
        const tn = name.toLowerCase();
        return bn === tn || bn.endsWith(":" + tn) || bn.endsWith("mixamorig:" + tn) || bn.endsWith("mixamorig9:" + tn);
    });
    return idx;
}

let animState = "idle";

function updateAnimation() {
    const allSkeletons = [skeletonProxy, ...clothingSkeletons].filter(s => s && s.bones.length);
    if (!allSkeletons.length) return;

    const time = performance.now() * 0.005;

    allSkeletons.forEach(skel => {
        const rotateJoint = (name, rotation) => {
            const bone = getBone(skel, name);
            if (!bone) {
                if (!animDebugLogged) console.warn("Animation: Bone not found:", name);
                return;
            }

            const node = bone.getTransformNode();
            if (node) {
                const rest = restQuaternions.get(bone.name);
                const procRotation = BABYLON.Quaternion.FromEulerVector(rotation);

                if (rest) {
                    // Apply relative to rest pose
                    if (!node.rotationQuaternion) node.rotationQuaternion = rest.clone();
                    node.rotationQuaternion.copyFrom(rest.multiply(procRotation));
                } else {
                    // Fallback to absolute
                    if (!node.rotationQuaternion) node.rotationQuaternion = procRotation;
                    else node.rotationQuaternion.copyFrom(procRotation);
                }
            } else {
                // Legacy/JSON path: bones usually don't have complex rest pose transforms in our JSON
                if (bone.rotationQuaternion) {
                    bone.rotationQuaternion.copyFrom(BABYLON.Quaternion.FromEulerVector(rotation));
                } else {
                    bone.rotation = rotation;
                }
            }
        };
        // After one pass of all joints, silence the warnings
        if (!animDebugLogged && skel === skeletonProxy) {
            console.log("Animation: Initial Joint Pass Complete for skeletonProxy");
            animDebugLogged = true;
        }

        if (animState === "walk") {
            const walkSpeed = 1.2;
            const cycle = time * walkSpeed;
            const swingAmount = 0.4;

            // Legs
            rotateJoint("LeftUpLeg", new BABYLON.Vector3(Math.sin(cycle) * 0.4, 0, 0));
            rotateJoint("LeftLeg", new BABYLON.Vector3(Math.max(0, Math.sin(cycle - 1)) * 0.4, 0, 0));
            rotateJoint("RightUpLeg", new BABYLON.Vector3(Math.sin(cycle + Math.PI) * 0.4, 0, 0));
            rotateJoint("RightLeg", new BABYLON.Vector3(Math.max(0, Math.sin(cycle + Math.PI - 1)) * 0.4, 0, 0));

            // Arms: TEST ZERO (Let's see if the GLB naturally points them back)
            rotateJoint("LeftArm", BABYLON.Vector3.Zero());
            rotateJoint("RightArm", BABYLON.Vector3.Zero());
            rotateJoint("LeftShoulder", BABYLON.Vector3.Zero());
            rotateJoint("RightShoulder", BABYLON.Vector3.Zero());

            rotateJoint("Spine1", new BABYLON.Vector3(0, Math.sin(cycle) * 0.05, 0));
            rotateJoint("Hips", new BABYLON.Vector3(0, Math.sin(cycle) * 0.05, 0));

        } else {
            // Idle (A-Pose test)
            const idleSpeed = 0.4;
            const cycle = time * idleSpeed;

            // Zero arms to see TRUE natural rest pose
            rotateJoint("LeftArm", BABYLON.Vector3.Zero());
            rotateJoint("RightArm", BABYLON.Vector3.Zero());
            rotateJoint("LeftShoulder", BABYLON.Vector3.Zero());
            rotateJoint("RightShoulder", BABYLON.Vector3.Zero());

            rotateJoint("Spine1", new BABYLON.Vector3(Math.sin(cycle) * 0.02, 0, 0));

            // Sync legs
            rotateJoint("LeftUpLeg", BABYLON.Vector3.Zero());
            rotateJoint("RightUpLeg", BABYLON.Vector3.Zero());
            rotateJoint("LeftLeg", BABYLON.Vector3.Zero());
            rotateJoint("RightLeg", BABYLON.Vector3.Zero());
        }
    });
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

    // Create a target pivot so the camera follows the character but looks at the chest
    const cameraTargetNode = new BABYLON.TransformNode("cameraTargetNode", scene);
    cameraTargetNode.parent = characterRoot;
    // We use raw units (meters) because they get multiplied by characterRoot.scaling
    cameraTargetNode.position.y = 0.9; // Approx chest height in raw GLB units
    camera.lockedTarget = cameraTargetNode;

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
        updateAnimation();
        updateMovement();
        scene.render();
    });
    window.addEventListener("resize", () => { engine.resize(); });

    loadHumanoidFbx();
}

// --- MATERIAL SYSTEM ---
function createMaterial(name, hexColor, type) {
    // Phase 9: Premium PBR Material Pipeline
    const mat = new BABYLON.PBRMaterial(name, scene);
    mat.albedoColor = BABYLON.Color3.FromHexString(hexColor);

    // Environment/Lighting setup for PBR
    mat.metallic = 0.0; // Default non-metallic
    mat.roughness = 0.5;

    switch (type) {
        case 'plate':
        case 'metal':
            mat.metallic = 1.0;
            mat.roughness = 0.2;
            break;
        case 'leather':
            mat.metallic = 0.1;
            mat.roughness = 0.4;
            break;
        case 'cloth':
            mat.metallic = 0.0;
            mat.roughness = 0.9;
            break;
        case 'eyes':
            mat.metallic = 0.0;
            mat.roughness = 0.05; // High gloss
            break;
        case 'skin':
            mat.metallic = 0.0;
            mat.roughness = 0.7; // Soft skin
            // Subsurface simulation (pseudo)
            mat.subSurface.isScatteringEnabled = true;
            break;
        default:
            mat.roughness = 0.5;
            break;
    }

    mat.backFaceCulling = false;
    if (type !== 'skin' && type !== 'eyes' && type !== 'hair') {
        mat.zOffset = -1.0;
    }

    return mat;
}

// Global Data Store
window.humanoidData = null;

export async function loadHumanoidFbx() {
    if (!scene || !characterRoot) return;
    console.log("Loading Anatomical Foundation (PerfectMale / GLB)...");

    try {
        // 1. DISPOSE EVERYTHING (Fresh start)
        characterRoot.getChildMeshes().forEach(m => m.dispose());
        characterRoot.getChildren().forEach(c => c.dispose());
        if (skeletonProxy) skeletonProxy.dispose();
        clothingSkeletons.forEach(s => s.dispose());
        clothingSkeletons = [];
        scene.meshes.filter(m => m.name.startsWith("cloth_")).forEach(m => m.dispose());
        scene.meshes.filter(m => m.name.startsWith("armor_")).forEach(m => m.dispose());

        // 2. LOAD GLB
        try {
            console.log("Importing Native Anatomical glTF (PerfectMale.glb)...");
            const result = await BABYLON.SceneLoader.ImportMeshAsync("", "./", "PerfectMale.glb", scene);

            // Scale Normalization
            characterRoot.scaling = new BABYLON.Vector3(35, 35, 35);
            const root = result.meshes[0];
            root.name = "characterContainer"; // EXPLICIT NAME for parenting
            window.humanoidContainer = root; // PERSISTENT REFERENCE
            root.position = BABYLON.Vector3.Zero();
            root.parent = characterRoot;

            if (result.animationGroups) {
                result.animationGroups.forEach(ag => ag.stop());
            }

            // AUTO-CENTER
            let minX = Infinity, maxX = -Infinity;
            result.meshes.forEach(m => {
                if (m.name !== "__root__" && m.geometry) {
                    m.refreshBoundingInfo();
                    const box = m.getBoundingInfo().boundingBox;
                    minX = Math.min(minX, box.minimumWorld.x);
                    maxX = Math.max(maxX, box.maximumWorld.x);
                }
            });
            if (minX !== Infinity) {
                root.position.x = -((minX + maxX) / 2);
            }

            if (result.skeletons.length > 0) {
                skeletonProxy = result.skeletons[0];
                console.log(`GLB Skeleton '${skeletonProxy.name}' has ${skeletonProxy.bones.length} bones.`);
                restQuaternions.clear();
                skeletonProxy.bones.forEach(b => {
                    const node = b.getTransformNode();
                    if (node && node.rotationQuaternion) {
                        restQuaternions.set(b.name, node.rotationQuaternion.clone());
                    }
                });

                let minY = Infinity, maxY = -Infinity;
                result.meshes.forEach(m => {
                    if (m.name !== "__root__" && m.geometry) {
                        m.refreshBoundingInfo();
                        const box = m.getBoundingInfo().boundingBox;
                        minY = Math.min(minY, box.minimumWorld.y);
                        maxY = Math.max(maxY, box.maximumWorld.y);
                    }
                });
                console.log(`DIAGNOSTIC: GLB Native Height = ${maxY - minY} units.`);
            }

            console.log("Root Mesh:", root.name, "Parent:", root.parent ? root.parent.name : "null");
            console.log("Root Rotation:", root.rotation.toString(), "Root Quaternion:", root.rotationQuaternion ? root.rotationQuaternion.toString() : "null");

            // 3. GENERATE REGION BRAIN & APPLY MATERIALS
            console.log("Meshes Found:", result.meshes.map(m => m.name).join(", "));

            let bodyMesh = result.meshes.find(m => {
                const n = m.name.toLowerCase();
                return n.includes("body") || n.includes("skin") || n.includes("humanoid");
            });

            // Fallback: If no "Body" mesh found, take the largest mesh that has skeleton indices
            if (!bodyMesh) {
                const skinnedMeshes = result.meshes.filter(m => m.getVerticesData(BABYLON.VertexBuffer.MatricesIndicesKind));
                if (skinnedMeshes.length > 0) {
                    skinnedMeshes.sort((a, b) => b.getTotalVertices() - a.getTotalVertices());
                    bodyMesh = skinnedMeshes[0];
                }
            }

            if (bodyMesh && skeletonProxy) {
                console.log("Generating Region Brain from:", bodyMesh.name);
                const positions = bodyMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
                const indices = bodyMesh.getIndices();
                const matricesIndices = bodyMesh.getVerticesData(BABYLON.VertexBuffer.MatricesIndicesKind);
                const matricesWeights = bodyMesh.getVerticesData(BABYLON.VertexBuffer.MatricesWeightsKind);
                const regionIds = [];
                for (let i = 0; i < positions.length / 3; i++) {
                    let maxW = 0, mainB = -1;
                    for (let k = 0; k < 4; k++) {
                        if (matricesWeights[i * 4 + k] > maxW) {
                            maxW = matricesWeights[i * 4 + k];
                            mainB = matricesIndices[i * 4 + k];
                        }
                    }
                    const bName = skeletonProxy.bones[mainB].name.toLowerCase();
                    let rId = 1; // Torso
                    if (bName.includes("head") || bName.includes("neck")) rId = 0;
                    else if (bName.includes("leftarm") || bName.includes("leftforearm") || bName.includes("lefthand")) rId = 2;
                    else if (bName.includes("rightarm") || bName.includes("rightforearm") || bName.includes("righthand")) rId = 3;
                    else if (bName.includes("leftupleg") || bName.includes("rightupleg")) rId = 4;
                    else if (bName.includes("leftleg") || bName.includes("leftfoot")) rId = 5;
                    else if (bName.includes("rightleg") || bName.includes("rightfoot")) rId = 6;
                    regionIds.push(rId);
                }

                window.humanoidData = {
                    positions, indices, matricesIndices, matricesWeights, regionIds,
                    bones: skeletonProxy.bones.map(b => ({ name: b.name }))
                };
            }

            result.meshes.forEach(m => {
                const name = m.name.toLowerCase();
                if (m.name !== "__root__" && m.name !== "customHumanoidRoot") {
                    if (name.includes("eye")) {
                        m.material = createMaterial("perfectEyes", "#FFFFFF", 'eyes');
                    } else if (name.includes("hair") || name.includes("lash")) {
                        m.material = createMaterial("perfectHair", "#221100", 'cloth');
                    } else if (name.includes("body") || name.includes("skin") || name.includes("humanoid")) {
                        m.material = createMaterial("perfectSkin", "#FFDBAC", 'skin');
                        m.name = "customHumanoid"; // CRITICAL: Allow engine to find the body
                        window.humanoid = m;
                    }
                }
            });
            console.log("Perfect Anatomical Base Loaded. humanoidData status:", !!window.humanoidData);

            // RE-APPLY UI STATE
            const currentSkin = "#FFDBAC";
            setSkinColor(currentSkin);

            // RE-RENDER: Trigger equipment generation now that humanoidData is ready
            if (lastBodyParts.length > 0) {
                console.log(`Post-Load Equipment Render with ${lastBodyParts.length} parts...`);
                renderHumanoid(lastBodyParts);
            } else {
                console.log("Post-Load: No cached bodyParts to render yet.");
            }

        } catch (glbErr) {
            console.error("GLB Load Failed:", glbErr);
        }
    } catch (e) {
        console.error("Critical Error in loadHumanoidFbx:", e);
    }
}

// Stubs for UI controls
export function setAnimationState(state) { animState = state; }
export function setBodyScale(height, width) {
    if (!characterRoot) return;
    const baseScale = 35.0; // Phase 11 Calibration
    characterRoot.scaling.y = height * baseScale;
    characterRoot.scaling.x = width * baseScale;
    characterRoot.scaling.z = width * baseScale;
}
export function setXRayMode(enabled) {
    if (!characterRoot) return;
    characterRoot.getChildMeshes().forEach(m => {
        if (m.material) {
            m.material.alpha = enabled ? 0.3 : 1.0;
            // Ensure transparency is enabled in PBR
            if (m.material instanceof BABYLON.PBRMaterial) {
                m.material.transparencyMode = enabled ? BABYLON.PBRMaterial.PBRMETHOD_BLEND : BABYLON.PBRMaterial.PBRMETHOD_OPAQUE;
            }
        }
    });
}
export function setSkinColor(hexColor) {
    if (!characterRoot) return;
    characterRoot.getChildMeshes().forEach(m => {
        // Only update skin regions (meshes named "Body" or with skin material)
        if (m.name.toLowerCase().includes("body") || (m.material && m.material.name.includes("Skin"))) {
            if (m.material instanceof BABYLON.PBRMaterial) {
                m.material.albedoColor = BABYLON.Color3.FromHexString(hexColor);
            } else if (m.material instanceof BABYLON.StandardMaterial) {
                m.material.diffuseColor = BABYLON.Color3.FromHexString(hexColor);
            }
        }
    });
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
        // Helper to get bone by name
        const getBone = (skeleton, name) => skeleton.bones.find(b => b.name === name);

        // --- HELPERS ---
        const setScale = (name, x, y, z) => {
            const b = getBone(skel, name);
            if (b) b.scaling = new BABYLON.Vector3(x, y, z);
        };
        const setArm = (name, len, thick) => {
            const b = getBone(skel, name);
            if (b) b.scaling = new BABYLON.Vector3(len, thick, thick);
        };
        const setUniform = (name, val) => {
            const b = getBone(skel, name);
            if (b) b.scaling = new BABYLON.Vector3(val, val, val);
        };
        const setInverseArm = (name, len, thick) => {
            const b = getBone(skel, name);
            if (b) b.scaling = new BABYLON.Vector3(1 / len, 1 / thick, 1 / thick);
        };

        // 1. LEGS
        const legThickness = 1.0 + (thickness - 1.0) * 0.5;
        setScale("LeftUpLeg", legThickness, leg, legThickness);
        setScale("RightUpLeg", legThickness, leg, legThickness);
        setScale("LeftLeg", legThickness, leg, legThickness);
        setScale("RightLeg", legThickness, leg, legThickness);

        // 2. FEET (Inverse to keep them flat/normal)
        setScale("LeftFoot", 1.0 / legThickness, 1.0 / leg, 1.0 / legThickness);
        setScale("RightFoot", 1.0 / legThickness, 1.0 / leg, 1.0 / legThickness);

        // 3. ARMS
        setArm("LeftArm", arm, thickness);
        setArm("RightArm", arm, thickness);
        setArm("LeftForeArm", arm, thickness);
        setArm("RightForeArm", arm, thickness);

        // 4. HANDS (Inverse)
        setInverseArm("LeftHand", arm, thickness);
        setInverseArm("RightHand", arm, thickness);

        // 5. HEAD
        setUniform("Head", head);

        // 6. SHOULDERS (Clavicles)
        setScale("LeftShoulder", shoulder, 1.0, 1.0);
        setScale("RightShoulder", shoulder, 1.0, 1.0);
    });

    // ROOT HEIGHT CORRECTION
    const HEIGHT_FACTOR = 90.0 * 35.0; // Scaled for normalization
    if (characterRoot) {
        characterRoot.position.y = (leg - 1.0) * HEIGHT_FACTOR;
    }
}

// --- CLOTHING MESH GENERATOR ---
function createClothingMesh(name, targetRegions, inflateAmount, colorHex, matType, excludeBones = [], maxHeight = null, includeBones = null) {
    if (!window.humanoidData || !scene) {
        console.warn("createClothingMesh: humanoidData missing.");
        return;
    }
    const data = window.humanoidData;
    const regionIds = data.regionIds;
    console.log(`Generating Armor: ${name}, regions: ${targetRegions}, inflation: ${inflateAmount}`);

    const baseMesh = scene.getMeshByName("customHumanoid") || scene.meshes.find(m => m.name.toLowerCase().includes("body") || m.name.toLowerCase().includes("skin"));

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
            const bIdx = data.matricesIndices[oldIdx * 4 + k];
            const weight = data.matricesWeights[oldIdx * 4 + k];
            if (weight > maxW) {
                maxW = weight;
                mainB = bIdx;
            }
        }
        return mainB;
    };

    const addVertex = (oldIdx) => {
        if (indexMap.has(oldIdx)) return indexMap.get(oldIdx);

        // Position Check
        const rawY = data.positions[oldIdx * 3 + 1];
        if (maxHeight !== null && rawY > maxHeight) return -1; // CLIP

        const newIdx = newPositions.length / 3;

        // Position + Inflation
        // Normalization Factor: High-Fidelity Sync
        // Since we are extracting DIRECTLY from the GLB, norm is now 1.0!
        const norm = 1.0;
        const px = data.positions[oldIdx * 3] * norm;
        const py = data.positions[oldIdx * 3 + 1] * norm;
        const pz = data.positions[oldIdx * 3 + 2] * norm;

        // Auto-Center correction: GLB meshes are already shifted by root.position.x in load
        // so we don't need additional offsets here.

        // Inflation: Small GLB units
        const inf = inflateAmount * 0.012; // Boosted from 0.005 to 0.012 (approx 1cm per unit)

        let nx = 0, ny = 0, nz = 0;
        if (baseMesh) {
            const normals = baseMesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
            if (normals && oldIdx * 3 + 2 < normals.length) {
                // Mixamo GLTF normals are often flipped vs FBX/JSON
                nx = -normals[oldIdx * 3];
                ny = -normals[oldIdx * 3 + 1];
                nz = -normals[oldIdx * 3 + 2];
            }
        }

        newPositions.push(px + nx * inf);
        newPositions.push(py + ny * inf);
        newPositions.push(pz + nz * inf);

        // Weights (Direct index use since we extracted from current skeleton)
        for (let k = 0; k < 4; k++) {
            newMatricesIndices.push(data.matricesIndices[oldIdx * 4 + k]);
            newMatricesWeights.push(data.matricesWeights[oldIdx * 4 + k]);
        }

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
                // VERY Lenient Filter: Allow triangle if ANY vertex is in the allowed bones OR we are in a targeted region
                if (!includeBones.includes(b0) && !includeBones.includes(b1) && !includeBones.includes(b2)) {
                    // Fallback to region check if bone check fails
                    if (matchCount < 3) continue;
                }
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

    if (newIndices.length === 0) {
        console.warn(`createClothingMesh: No indices generated for ${name}.`);
        return;
    }
    console.log(`createClothingMesh: Created mesh ${name} with ${newIndices.length / 3} triangles.`);

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

    // Parent to the same node as the body to inherit coordinate system/offsets
    const container = window.humanoidContainer || scene.getMeshByName("characterContainer") || characterRoot;
    mesh.parent = container;

    if (baseMesh) {
        // MATCH BODY TRANSFORMS EXACTLY
        if (baseMesh.rotationQuaternion) mesh.rotationQuaternion = baseMesh.rotationQuaternion.clone();
        else mesh.rotation = baseMesh.rotation.clone();
        mesh.position = baseMesh.position.clone();
        mesh.scaling = baseMesh.scaling.clone();
    } else {
        mesh.position = BABYLON.Vector3.Zero();
        mesh.scaling = BABYLON.Vector3.One();
        // Fallback: If no body mesh, use standard stand-up rotation
        mesh.rotation.x = Math.PI / 2;
    }
}


export function renderHumanoid(bodyParts) {
    if (!scene || !characterRoot) return;
    lastBodyParts = bodyParts; // CACHE for post-load sync

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
        console.log(`renderHumanoid: Processing ${bodyParts.length} parts.`);
        bodyParts.forEach(part => {
            if (!part.path || part.path.length < 2) return;

            // SKIP FACE PARTS (Handled by renderFace for Bone attachment)
            if (part.name.startsWith("Face_")) return;

            // Convert DTO Path to Vector3 and NORMALIZE to GLB space
            const norm = 2.0 / 175.0;
            const path = part.path.map(p => new BABYLON.Vector3(p.x * norm, p.y * norm, p.z * norm));

            // Create Tube
            const mesh = BABYLON.MeshBuilder.CreateTube(part.name, {
                path: path,
                radius: (part.radii[0] || 0.5) * norm,
                radiusFunction: (i, dist) => {
                    if (part.radii.length > 1) {
                        const t = i / (path.length - 1);
                        const r = part.radii[0] * (1 - t) + part.radii[part.radii.length - 1] * t;
                        return r * norm;
                    }
                    return (part.radii[0] || 0.5) * norm;
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
            // Check Head/Shoulders/Arms/etc for material hints
            if (nameLower.includes("metal") || nameLower.includes("blade") || nameLower.includes("guard") || nameLower.includes("plate") || nameLower.includes("head_plate")) {
                matType = 'metal';
            } else if (nameLower.includes("wood") || nameLower.includes("shaft") || nameLower.includes("handle")) {
                matType = 'wood';
            } else if (nameLower.includes("head") && !nameLower.includes("helm")) {
                // The Head Itself (Skin)
                matType = 'skin';
            } else {
                matType = 'leather';
            }

            const mat = createMaterial(part.name + "_mat", part.color, matType);
            mesh.material = mat;

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
            if (skeletonProxy) {
                let targetBone = null;

                if (part.name.includes("Sword") || part.name.includes("Spear")) {
                    targetBone = getBone(skeletonProxy, "RightHand");
                } else if (part.name.includes("Shield")) {
                    targetBone = getBone(skeletonProxy, "LeftHand");
                }

                if (targetBone) {
                    const charMesh = scene.getMeshByName("customHumanoid");
                    if (charMesh) {
                        mesh.attachToBone(targetBone, charMesh);
                    }

                    // Rotation Fix based on Local Space Generation
                    // C# Generates "Up" along Y.
                    // Hand Bone (Right) usually points X or -X.
                    // We might need to rotate the mesh to align with the hand.
                    // Sword/Spear: Generated Vertical (Y). 
                    // Attaching to Hand: We probably want it to align with the Hand's "Up" or "Forward".
                    // For now, let's just fix the crash. Alignment can be tuned next.
                } else {
                    // If not attached, parent to same as body
                    if (charMesh) {
                        mesh.parent = charMesh.parent;
                        mesh.position = BABYLON.Vector3.Zero();
                        mesh.rotation.x = Math.PI / 2; // STAND UP
                    } else {
                        mesh.parent = characterRoot;
                    }
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
            regions = [1];
            includeBones = [
                getBoneIndex(skeletonProxy, "Hips"),
                getBoneIndex(skeletonProxy, "Spine"),
                getBoneIndex(skeletonProxy, "Spine1"),
                getBoneIndex(skeletonProxy, "Spine2"),
                getBoneIndex(skeletonProxy, "Neck")
            ];

        } else if (slot === "Shoulders") {
            regions = [1, 2, 3];
            includeBones = [
                getBoneIndex(skeletonProxy, "LeftShoulder"),
                getBoneIndex(skeletonProxy, "LeftArm"),
                getBoneIndex(skeletonProxy, "RightShoulder"),
                getBoneIndex(skeletonProxy, "RightArm")
            ];
            inflation += 0.5;

        } else if (slot === "Arms") {
            regions = [2, 3];
            includeBones = [
                getBoneIndex(skeletonProxy, "LeftArm"),
                getBoneIndex(skeletonProxy, "LeftForeArm"),
                getBoneIndex(skeletonProxy, "RightArm"),
                getBoneIndex(skeletonProxy, "RightForeArm")
            ];

        } else if (slot === "Legs") {
            regions = [4, 5, 6];
            if (matType === 'cloth') inflation = 1.2;
            if (matType === 'cloth') exclusions = [];

        } else if (slot === "Feet") {
            regions = [5, 6];
            maxHeight = 0.5; // Normalized height for Boots (GLB space)
            if (type.includes("Plate")) inflation = 2.6;
            else if (type.includes("Cloth") || type.includes("Shoes")) inflation = 1.4;
            else inflation = 2.4;

        } else if (slot === "Hands") {
            regions = [2, 3];
            inflation += 0.1;
            includeBones = [
                getBoneIndex(skeletonProxy, "LeftHand"),
                getBoneIndex(skeletonProxy, "RightHand")
            ];

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

    renderFace(bodyParts);
}

export function downloadModel(filename) {
    if (!scene) return;
    console.log("Downloading GLB...");

    // Export scene to GLB
    BABYLON.GLTF2Export.GLBAsync(scene, filename).then((glb) => {
        glb.downloadFiles();
    });
}

// --- FACE RENDERER (Humanoid V4 - Geometry Driven) ---
export function renderFace(bodyParts) {
    if (!scene || !skeletonProxy) return;

    // Dispose old face parts
    const oldRoot = scene.getTransformNodeByName("faceRoot");
    if (oldRoot) oldRoot.dispose();
    scene.meshes.filter(m => m.name.startsWith("face_")).forEach(m => m.dispose());

    const headBone = getBone(skeletonProxy, "Head");
    if (!headBone) return;

    const faceRoot = new BABYLON.TransformNode("faceRoot", scene);
    faceRoot.attachToBone(headBone, scene.getMeshByName("customHumanoid"));

    // Parse Parts
    const eyePart = bodyParts.find(p => p.name === "Face_Eyes");
    const noseParts = bodyParts.filter(p => p.name.includes("Face_Nose"));
    const browParts = bodyParts.filter(p => p.name.includes("Face_Eyebrows"));
    const mouthParts = bodyParts.filter(p => p.name.includes("Face_Mouth"));
    const earPart = bodyParts.find(p => p.name === "Face_Ears");
    const hairPart = bodyParts.find(p => p.name.startsWith("Face_Hair_"));
    const beardPart = bodyParts.find(p => p.name.startsWith("Face_Beard_"));

    // --- 1. EYES (Reference Only: C# sets position, JS renders high-poly) ---
    const eyeColorHex = eyePart ? eyePart.color : "#0000FF";

    // Default Fallbacks
    let eyeY = -12;
    let eyeZ = 10;
    const yOffset = 170; // Coordinate shift (Model -> Bone)

    if (eyePart && eyePart.origin) {
        // Use C# calculated positions (World -> Local)
        eyeY = eyePart.origin.y - yOffset;
        eyeZ = eyePart.origin.z;
    }

    const createEye = (name, xPos) => {
        const eyeGroup = new BABYLON.TransformNode(name + "_root", scene);
        eyeGroup.parent = faceRoot;
        eyeGroup.position = new BABYLON.Vector3(xPos, eyeY, eyeZ);

        // Sclera
        const sclera = BABYLON.MeshBuilder.CreateSphere(name + "_sclera", { diameter: 4.2 }, scene);
        const scleraMat = new BABYLON.StandardMaterial(name + "_scleraMat", scene);
        scleraMat.diffuseColor = new BABYLON.Color3(0.95, 0.95, 0.95);
        scleraMat.specularColor = new BABYLON.Color3(1, 1, 1);
        scleraMat.roughness = 0.2;
        sclera.material = scleraMat;
        sclera.parent = eyeGroup;

        // Iris
        const iris = BABYLON.MeshBuilder.CreateSphere(name + "_iris", { diameter: 2.1 }, scene);
        const irisMat = new BABYLON.StandardMaterial(name + "_irisMat", scene);
        irisMat.diffuseColor = BABYLON.Color3.FromHexString(eyeColorHex);
        irisMat.specularColor = new BABYLON.Color3(1, 1, 1);
        irisMat.roughness = 0.2;
        iris.material = irisMat;
        iris.parent = eyeGroup;
        iris.position.z = 1.8;
        iris.scaling.z = 0.5;

        // Pupil
        const pupil = BABYLON.MeshBuilder.CreateSphere(name + "_pupil", { diameter: 1.1 }, scene);
        const pupilMat = new BABYLON.StandardMaterial(name + "_pupilMat", scene);
        pupilMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        pupilMat.specularColor = new BABYLON.Color3(1, 1, 1);
        pupilMat.roughness = 0.2;
        pupil.material = pupilMat;
        pupil.parent = eyeGroup;
        pupil.position.z = 2.0;
        pupil.scaling.z = 0.5;
    };

    // Removed for GLB transition
    // createEye("face_eyeL", -3.5);
    // createEye("face_eyeR", 3.5);

    // --- HELPER: Render Tube from DTO ---
    const renderGeometryPart = (part, matSpec) => {
        if (!part || !part.path) return;

        // Convert to Vector3
        const path = part.path.map(p => new BABYLON.Vector3(p.x, p.y, p.z));

        // Transform to Local Box Space? 
        // C# coordinates are World/Model space (Head Top ~175).
        // faceRoot is attached to Head Bone.
        // If Head Bone is at ~160, the local coordinates need to be offsets.
        // BUT C# generaeted them as Absolute Y.
        // We need to shift them relative to the Head Bone Origin.
        // Head Bone Origin is roughly (0, yNeck, 0) or (0, 150?, 0).
        // Let's assume C# Path is "Model Space". 
        // We need to convert to "FaceRoot Space".
        // Offset: -HeadBonePosition.
        // HACK: Hardcoded Offset for now based on 'yNeck' ~ 145?
        // Actually, let's look at C# 'headStart' = yNeck.
        // If we attach to Head Bone, we are at yNeck.
        // so we subtract yNeck from the Y values?

        // Let's try rendering them directly first. If they float 150 units above the head, we know why.
        // C# Logic: yNeck is around 145.
        // Head Bone is usually around neck/head base.
        // So yes, we likely need to subtract ~145 from Y.

        const localPath = path.map(p => new BABYLON.Vector3(p.x, p.y - yOffset, p.z));

        const mesh = BABYLON.MeshBuilder.CreateTube(part.name, {
            path: localPath,
            radius: part.radii[0] || 0.5,
            radiusFunction: (i, dist) => {
                if (part.radii && part.radii.length > 1) {
                    const t = i / (path.length - 1); // simple linear map
                    // map t to radii index?
                    // C# radii array matches steps?
                    // If radii.length === path.length, 1:1 map
                    if (part.radii.length === path.length) return part.radii[i];
                }
                return part.radii[0];
            },
            cap: part.capMode || BABYLON.Mesh.CAP_ALL
        }, scene);

        const mat = new BABYLON.StandardMaterial(part.name + "_mat", scene);
        mat.diffuseColor = BABYLON.Color3.FromHexString(part.color);
        if (matSpec) {
            mat.specularColor = matSpec.specular;
            mat.roughness = matSpec.roughness;
        }
        mesh.material = mat;
        mesh.parent = faceRoot;
    };

    // --- 2. NOSE, BROWS, MOUTH (Geometry) ---
    // If we are using the Mixamo model, its face ALREADY has a nose and mouth.
    // We only want to render these if we are on the old "Potato" model.
    const isRealistic = scene.getMeshByName("customHumanoid")?.name.includes("Mixamo") || true;
    // HACK: for now, we assume if we are in this new version, we want the realistic look.
    // We keep eyebrows and eyes, but hide nose/mouth tubes.

    const matteSpec = { specular: new BABYLON.Color3(0, 0, 0), roughness: 0.9 };
    const skinSpec = { specular: new BABYLON.Color3(0.1, 0.1, 0.1), roughness: 0.8 };

    // browParts.forEach(p => renderGeometryPart(p, matteSpec)); 
    // Even eyebrows might look weird if the mesh has them textured. 
    // But let's leave them for now.

    // Hide nose/mouth tubes on realistic base
    if (!isRealistic) {
        noseParts.forEach(p => renderGeometryPart(p, skinSpec));
        mouthParts.forEach(p => renderGeometryPart(p, matteSpec));
    }

    // --- 4. EARS --
    // Keep Torus logic for now, or did we move it to C#? 
    // C# Logic sent 'Face_Ears' but no geometry.
    // So we keep JS generation.
    if (earPart) {
        const earMat = new BABYLON.StandardMaterial("earMat", scene);
        earMat.diffuseColor = BABYLON.Color3.FromHexString(earPart.color);
        earMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

        const createEar = (xPos) => {
            const ear = BABYLON.MeshBuilder.CreateTorus("face_ear", { diameter: 5, thickness: 1.5, tessellation: 20 }, scene);
            ear.material = earMat;
            ear.parent = faceRoot;
            ear.position = new BABYLON.Vector3(xPos, -13, 1);
            ear.rotation.z = Math.PI / 2;
            ear.rotation.y = Math.PI / 8 * (xPos > 0 ? -1 : 1);
            ear.scaling.z = 0.6;
        };
        createEar(-8.5);
        createEar(8.5);
    }

    // --- 5. CLEANUP ---
    // (Mouth is now handled via geometry loops above)

    // --- 6. HAIR ---
    if (hairPart) {
        const style = hairPart.name.replace("Face_Hair_", "");
        const hairColor = BABYLON.Color3.FromHexString(hairPart.color);
        const hairMat = new BABYLON.StandardMaterial("hairMat", scene);
        hairMat.diffuseColor = hairColor;
        hairMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Low shine

        if (style === "Short") {
            const hair = BABYLON.MeshBuilder.CreateSphere("face_hair", { diameterX: 23, diameterY: 23, diameterZ: 25, slice: 0.5 }, scene);
            hair.material = hairMat;
            hair.parent = faceRoot;
            hair.position = new BABYLON.Vector3(0, 1, 1);
            hair.rotation.x = Math.PI;
        } else if (style === "Long") {
            const hair = BABYLON.MeshBuilder.CreateSphere("face_hair_top", { diameter: 24, slice: 0.6 }, scene);
            hair.material = hairMat;
            hair.parent = faceRoot;
            hair.position = new BABYLON.Vector3(0, 1, 0);
            hair.rotation.x = Math.PI;

            const hairBack = BABYLON.MeshBuilder.CreateBox("face_hair_back", { width: 22, height: 35, depth: 4 }, scene);
            hairBack.material = hairMat;
            hairBack.parent = faceRoot;
            hairBack.position = new BABYLON.Vector3(0, -12, -8);
        } else if (style === "Mohawk") {
            // Replicating "Swoop" style from image? 
            // Let's stick to Mohawk but make it more volume-based
            const hair = BABYLON.MeshBuilder.CreateTube("face_hair", {
                path: [
                    new BABYLON.Vector3(0, 10, 8),
                    new BABYLON.Vector3(0, 14, 0),
                    new BABYLON.Vector3(0, 8, -8)
                ],
                radius: 3,
                cap: BABYLON.Mesh.CAP_ROUND
            }, scene);
            hair.material = hairMat;
            hair.parent = faceRoot;
        }
    }

    // --- 7. BEARD ---
    if (beardPart) {
        const style = beardPart.name.replace("Face_Beard_", "");
        const beardColor = BABYLON.Color3.FromHexString(beardPart.color);
        const beardMat = new BABYLON.StandardMaterial("beardMat", scene);
        beardMat.diffuseColor = beardColor;

        if (style === "Goatee") {
            const beard = BABYLON.MeshBuilder.CreateCylinder("face_beard", { height: 6, diameterTop: 4, diameterBottom: 1 }, scene);
            beard.material = beardMat;
            beard.parent = faceRoot;
            beard.position = new BABYLON.Vector3(0, -22, 14);
            beard.rotation.x = Math.PI / 1.5;
        } else if (style === "Full") {
            const beard = BABYLON.MeshBuilder.CreateTorus("face_beard", { diameter: 17, thickness: 4, tessellation: 24 }, scene);
            beard.material = beardMat;
            beard.parent = faceRoot;
            beard.position = new BABYLON.Vector3(0, -19, 7);
            beard.scaling.y = 1.4;
            beard.rotation.x = Math.PI / 6;
        }
    }
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
