import os
import json
import re
import math

def get_region_id(bone_id):
    # 0: Head (Neck, Head)
    if bone_id in [3, 4]: return 0
    # 1: Torso (Spine, Spine1, Shoulders)
    if bone_id in [1, 2, 5, 9]: return 1
    # 2: L_Arm (Arm, ForeArm, Hand)
    if bone_id in [6, 7, 8]: return 2
    # 3: R_Arm (Arm, ForeArm, Hand)
    if bone_id in [10, 11, 12]: return 3
    # 4: Hips/Thighs (Hips, UpLegs) - Pants Top
    if bone_id in [0, 13, 16]: return 4
    # 5: L_Leg (Leg, Foot) - Pants Bottom / Boots
    if bone_id in [14, 15]: return 5
    # 6: R_Leg (Leg, Foot) - Pants Bottom / Boots
    if bone_id in [17, 18]: return 6
    return -1

def parse_fbx_to_json(fbx_path, json_path):
    print(f"Parsing FBX for High-Fidelity Rigging: {fbx_path}")
    
    vertices = []
    indices = []
    
    # Read as binary first to check Kaydara, then try to find data
    with open(fbx_path, 'rb') as f:
        head = f.read(20)
        is_binary = b"Kaydara" in head
    
    # We need a robust parser. Since we are in a script, let's use a simpler "find the array" approach
    # for positions and indices that works for both.
    # --- GEOMETRY-NODE PARSER (Surgical Pairing) ---
    all_vertices = []
    all_indices = []
    
    with open(fbx_path, 'rb') as f:
        content = f.read()

    # Find each Geometry: node as a starting point
    # We use a lenient search for maximum robustness
    geom_starts = [m.start() for m in re.finditer(b"Geometry:", content)]
    
    if not geom_starts:
        print("ERROR: Could not find any Geometry nodes. Check if file is ASCII.")
        return

    print(f"Found {len(geom_starts)} geometry nodes. Extracting pairs...")
    
    v_master_offset = 0
    all_material_ids = []
    num_regex = b"[-+]?(?:\\d*\\.\\d+|\\d+)(?:[eE][-+]?\\d+)?"

    for part_idx, gs in enumerate(geom_starts):
        # Find next Vertices and PolygonVertexIndex AFTER this Geometry start
        # but BEFORE the next Geometry start
        next_gs = content.find(b"Geometry:", gs + 1)
        if next_gs == -1: next_gs = len(content)
        
        chunk = content[gs:next_gs]
        
        # We need both Vertices and Indices in this chunk
        v_match = re.search(b"Vertices[^{]*{([^}]+)}", chunk, re.DOTALL)
        i_match = re.search(b"PolygonVertexIndex[^{]*{([^}]+)}", chunk, re.DOTALL)
        
        if v_match and i_match:
            print(f"Applying Mesh Part {part_idx} at offset {gs}...")
            v_list = [float(x) for x in re.findall(num_regex, v_match.group(1))]
            i_list = [int(x) for x in re.findall(num_regex, i_match.group(1))]
            
            all_vertices.extend(v_list)
            
            # Tag all vertices in this part with their part_idx
            all_material_ids.extend([part_idx] * (len(v_list) // 3))
            
            tri_indices = []
            face = []
            for idx in i_list:
                if idx < 0:
                    face.append(~idx + v_master_offset)
                    if len(face) >= 3:
                        v0 = face[0]
                        for i in range(1, len(face)-1):
                            tri_indices.extend([v0, face[i], face[i+1]])
                    face = []
                else:
                    face.append(idx + v_master_offset)
            
            all_indices.extend(tri_indices)
            v_master_offset += (len(v_list) // 3)

    vertices = all_vertices
    indices = all_indices
    material_ids = all_material_ids
    print(f"Final Merged Geometry: {len(vertices)//3} vertices, {len(indices)//3} triangles.")

    # 3. Precision Skeleton (Aligned to Y:177, X:89)
    # Moved pivots closer to body (X=18) to avoid "gap" webbing
    joints = [
        {"name": "Hips",          "pos": (0, 95, 0),    "parent": -1}, # 0
        {"name": "Spine",         "pos": (0, 115, 0),   "parent": 0},  # 1
        {"name": "Spine1",        "pos": (0, 135, 0),   "parent": 1},  # 2
        {"name": "Neck",          "pos": (0, 153, 0),   "parent": 2},  # 3
        {"name": "Head",          "pos": (0, 175, 0),   "parent": 3},  # 4
        
        # Left Arm (Shoulder socket at X=18)
        {"name": "LShoulder",     "pos": (12, 142, 0),  "parent": 2},  # 5
        {"name": "LArm",          "pos": (18, 142, 0),  "parent": 5},  # 6
        {"name": "LForeArm",      "pos": (50, 142, 0),  "parent": 6},  # 7
        {"name": "LHand",         "pos": (85, 142, 0),  "parent": 7},  # 8
        
        # Right Arm
        {"name": "RShoulder",     "pos": (-12, 142, 0), "parent": 2},  # 9
        {"name": "RArm",          "pos": (-18, 142, 0), "parent": 9},  # 10
        {"name": "RForeArm",      "pos": (-50, 142, 0), "parent": 10}, # 11
        {"name": "RHand",         "pos": (-85, 142, 0), "parent": 11}, # 12
        
        # Legs
        {"name": "LUpLeg",        "pos": (15, 92, 0),    "parent": 0},  # 13
        {"name": "LLeg",          "pos": (15, 45, 0),    "parent": 13}, # 14
        {"name": "LFoot",         "pos": (15, 5, 5),     "parent": 14}, # 15
        
        {"name": "RUpLeg",        "pos": (-15, 92, 0),   "parent": 0},  # 16
        {"name": "RLeg",          "pos": (-15, 45, 0),   "parent": 16}, # 17
        {"name": "RFoot",         "pos": (-15, 5, 5),    "parent": 17}  # 18
    ]
    
    bones = []
    # Pelvis Anchor
    bones.append({"id": 0, "start": (0, 75, 0), "end": (0, 105, 0)})
    
    for i, j in enumerate(joints):
        if j["parent"] != -1:
            bones.append({"id": i, "start": joints[j["parent"]]["pos"], "end": j["pos"]})

    def dist_to_segment(p, a, b):
        pa = (p[0]-a[0], p[1]-a[1], p[2]-a[2])
        ba = (b[0]-a[0], b[1]-a[1], b[2]-a[2])
        d2 = ba[0]**2 + ba[1]**2 + ba[2]**2
        if d2 < 1e-9: return math.sqrt(pa[0]**2 + pa[1]**2 + pa[2]**2)
        t = max(0, min(1, (pa[0]*ba[0] + pa[1]*ba[1] + pa[2]*ba[2]) / d2))
        closest = (a[0] + t*ba[0], a[1] + t*ba[1], a[2] + t*ba[2])
        return math.sqrt((p[0]-closest[0])**2 + (p[1]-closest[1])**2 + (p[2]-closest[2])**2)

    print("Calculating Low-Distortion Weights & Regions...")
    m_indices = []
    m_weights = []
    region_ids = []
    
    num_verts = len(vertices) // 3
    
    # --- A-POSE BAKE SETTINGS ---
    # Drop ONLY arms (6-8, 10-12). Keep Shoulders (5, 9) static to avoid chest ripping.
    arm_angle = math.radians(-45)
    arm_pivot_l = (18, 142, 0)
    arm_pivot_r = (-18, 142, 0)

    def rotate_point_z(p, pivot, angle):
        px, py, pz = p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]
        rx = px * math.cos(angle) - py * math.sin(angle)
        ry = px * math.sin(angle) + py * math.cos(angle)
        return rx + pivot[0], ry + pivot[1], pz + pivot[2]

    new_vertices = []

    for v_idx in range(num_verts):
        vx, vy, vz = vertices[v_idx*3 : v_idx*3+3]
        p = (vx, vy, vz)
        
        dists = []
        for b in bones:
            dists.append((b["id"], dist_to_segment(p, b["start"], b["end"])))
        
        dists.sort(key=lambda x: x[1])
        closest4 = dists[:4]
        
        p_weights = []
        sum_p = 0
        for b_id, d in closest4:
            if b_id in [6, 7, 8, 10, 11, 12] and abs(vx) < 22:
                d += 1000.0
                
            power = 4.0
            w = 1.0 / (d**power + 25.0)
            
            if b_id in [1, 2, 5, 9] and abs(vx) < 25:
                w *= 5.0
                
            p_weights.append((b_id, w))
            sum_p += w
            
        # BAKE A-POSE INTO VERTICES
        # Only bake if dominant bone is lower arm (6-8 or 10-12)
        # We keep the Shoulder (5, 9) vertices static so they act as the "bridge"
        best_b = max(p_weights, key=lambda x: x[1])[0]
        if best_b in [6, 7, 8]:
            p = rotate_point_z(p, arm_pivot_l, arm_angle)
        elif best_b in [10, 11, 12]:
            p = rotate_point_z(p, arm_pivot_r, -arm_angle)

        new_vertices.extend([p[0], p[1], p[2]])

        v_indices = []
        v_weights = []
        for b_id, w in p_weights:
            v_indices.append(b_id)
            v_weights.append(w / (sum_p + 1e-9))
            
        m_indices.extend(v_indices)
        m_weights.extend(v_weights)
        
        region_ids.append(get_region_id(best_b))

    vertices = new_vertices 

    # BAKE A-POSE INTO BONES (Only Arm hierarchy)
    for j in joints:
        if j["name"] in ["LArm", "LForeArm", "LHand"]:
             j["pos"] = list(rotate_point_z(j["pos"], arm_pivot_l, arm_angle))
        if j["name"] in ["RArm", "RForeArm", "RHand"]:
             j["pos"] = list(rotate_point_z(j["pos"], arm_pivot_r, -arm_angle))

    bone_data = []
    for j in joints:
        local_pos = list(j["pos"])
        if j["parent"] != -1:
            pp = joints[j["parent"]]["pos"]
            local_pos = [j["pos"][0]-pp[0], j["pos"][1]-pp[1], j["pos"][2]-pp[2]]
        
        bone_data.append({
            "name": j["name"],
            "parentIndex": j["parent"],
            "pos": local_pos,
            "rot": [0,0,0],
            "scl": [1,1,1]
        })

    data = {
        "positions": vertices,
        "indices": indices,
        "bones": bone_data,
        "matricesIndices": m_indices,
        "matricesWeights": m_weights,
        "regionIds": region_ids,
        "materialIds": material_ids
    }
    
    with open(json_path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print(f"Saved to {json_path}")

if __name__ == "__main__":
    # Point to the High-Fidelity Realistic model (TestModel.fbx)
    parse_fbx_to_json("TestModel.fbx", "humanoid_data.json")
