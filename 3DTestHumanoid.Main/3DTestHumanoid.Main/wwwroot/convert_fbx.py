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
    
    with open(fbx_path, 'r') as f:
        content = f.read()
    
    # 1. Extract Vertices
    v_match = re.search(r'Vertices:\s*\*(\d+)\s*\{([^}]+)\}', content, re.DOTALL)
    if v_match:
        raw_v = v_match.group(2)
        raw_v = raw_v.replace('a:', '').replace('\n', ' ').replace(',', ' ')
        vertices = [float(x) for x in raw_v.split()]
        print(f"Found {len(vertices)//3} vertices")
    
    # 2. Extract Indices
    i_match = re.search(r'PolygonVertexIndex:\s*\*(\d+)\s*\{([^}]+)\}', content, re.DOTALL)
    if i_match:
        raw_i = i_match.group(2)
        raw_i = raw_i.replace('a:', '').replace('\n', ' ').replace(',', ' ')
        raw_indices = [int(x) for x in raw_i.split()]
        
        tri_indices = []
        face = []
        for idx in raw_indices:
            if idx < 0:
                face.append(~idx)
                if len(face) >= 3:
                    v0 = face[0]
                    for i in range(1, len(face)-1):
                        tri_indices.extend([v0, face[i], face[i+1]])
                face = []
            else:
                face.append(idx)
        indices = tri_indices

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
            # EXCLUSION ZONE: If it's an arm bone (6-12) but the vertex is inside the torso (abs(vx) < 22), ignore it.
            # Bone 5/9 are shoulders which can bridge, but Arm 6/10 should NEVER grab the chest.
            if b_id in [6, 7, 8, 10, 11, 12] and abs(vx) < 22:
                d += 1000.0 # Effectively disqualifies it
                
            power = 4.0
            w = 1.0 / (d**power + 25.0) # Larger constant for volume preservation
            
            # TORSO BIAS: Favor Spine/Shoulder for central vertices
            if b_id in [1, 2, 5, 9] and abs(vx) < 25:
                w *= 5.0
                
            p_weights.append((b_id, w))
            sum_p += w
            
        v_indices = []
        v_weights = []
        for b_id, w in p_weights:
            v_indices.append(b_id)
            v_weights.append(w / (sum_p + 1e-9))
            
        m_indices.extend(v_indices)
        m_weights.extend(v_weights)
        
        # Calculate Dominant Region
        best_bone = -1
        best_weight = -1.0
        for b_id, w in p_weights: # Use p_weights (raw) for comparison
            if w > best_weight:
                best_weight = w
                best_bone = b_id
        
        region_ids.append(get_region_id(best_bone))

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
        "regionIds": region_ids
    }
    
    with open(json_path, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print(f"Saved to {json_path}")

if __name__ == "__main__":
    parse_fbx_to_json("testhuman.fbx", "humanoid_data.json")
