import os
import re
import json

def parse_fbx_ascii(file_path):
    print(f"Parsing {file_path}...")
    
    # Data Stores
    vertices = []
    indices = []
    normals = []
    uvs = []
    
    # Bone Hierarchy: { ID: { Name, ParentID, Transform } }
    nodes = {} 
    
    # Skinning: { BoneID: { Indices: [], Weights: [] } }
    skin_data = {} 
    
    # Mappings
    connections = [] # (ChildID, ParentID)
    
    current_node_id = None
    current_node_name = None
    current_node_type = None
    
    in_connections = False
    
    with open(file_path, 'r') as f:
        lines = f.readlines()
        
    line_idx = 0
    while line_idx < len(lines):
        line = lines[line_idx].strip()
        
        # --- 1. Geometry Extraction ---
        if line.startswith('Geometry:') and '"Mesh"' in line:
            print("Found Geometry...")
            # Simple parsing assuming standard formatting
            while line_idx < len(lines):
                line = lines[line_idx].strip()
                if line.startswith('Vertices: *'):
                    count = int(line.split('*')[1].split('{')[0])
                    # Read number list
                    raw = ""
                    if not line.endswith('}'):
                        line_idx += 1
                        while not lines[line_idx].strip().startswith('}'):
                            raw += lines[line_idx].strip().replace('a:', '').replace(',', ' ') + " "
                            line_idx += 1
                    vertices = [float(x) for x in raw.split()]
                    print(f"  Vertices: {len(vertices)//3}")
                    
                if line.startswith('PolygonVertexIndex: *'):
                    # Same logic
                    raw = ""
                    if not line.endswith('}'):
                        line_idx += 1
                        while not lines[line_idx].strip().startswith('}'):
                            raw += lines[line_idx].strip().replace('a:', '').replace(',', ' ') + " "
                            line_idx += 1
                    raw_indices = [int(x) for x in raw.split()]
                    
                    # Convert FBX polygons to Triangles (Fan triangulation for simplicity)
                    # FBX: End of polygon is negative (index ^ -1)
                    indices = []
                    face_verts = []
                    for idx in raw_indices:
                        if idx < 0:
                            real_idx = idx ^ -1
                            face_verts.append(real_idx)
                            # Triangulate face: 0, 1, 2; 0, 2, 3; etc.
                            for i in range(1, len(face_verts) - 1):
                                indices.extend([face_verts[0], face_verts[i], face_verts[i+1]])
                            face_verts = []
                        else:
                            face_verts.append(idx)
                    print(f"  Indices: {len(indices)}")
                    
                if line.strip() == '}':
                    break # End Geometry
                line_idx += 1
                
        # --- 2. Node/Bone Extraction ---
        if line.startswith('Model:'):
            # Model: 12345, "Model::Name", "Type"
            parts = line.split(',')
            node_id = parts[0].split(':')[1].strip()
            node_name = parts[1].split('::')[1].replace('"', '').strip()
            # Fix: node_type might have trailing " {"
            node_type = parts[2].replace('"', '').split('{')[0].strip()
            
            # Scan forward a bit for properties 
            # (Risky if nested, but usually Properties70 is inside)
            pos = [0,0,0]
            rot = [0,0,0]
            scl = [1,1,1]
            pre_rot = [0,0,0]
            post_rot = [0,0,0]
            
            temp_idx = line_idx + 1
            depth = 1
            while depth > 0 and temp_idx < len(lines):
                l = lines[temp_idx].strip()
                if '{' in l: depth += 1
                if '}' in l: depth -= 1
                
                if l.startswith('P: "Lcl Translation"'):
                    p_parts = l.split(',')
                    pos = [float(p_parts[4]), float(p_parts[5]), float(p_parts[6])]
                if l.startswith('P: "Lcl Rotation"'):
                    p_parts = l.split(',')
                    rot = [float(p_parts[4]), float(p_parts[5]), float(p_parts[6])]
                if l.startswith('P: "PreRotation"'):
                    p_parts = l.split(',')
                    pre_rot = [float(p_parts[4]), float(p_parts[5]), float(p_parts[6])]
                if l.startswith('P: "PostRotation"'):
                    p_parts = l.split(',')
                    post_rot = [float(p_parts[4]), float(p_parts[5]), float(p_parts[6])]
                
                temp_idx += 1
                
            nodes[node_id] = {
                "id": node_id,
                "name": node_name,
                "type": node_type,
                "pos": pos,
                "rot": rot,
                "scl": scl,
                "preRot": pre_rot,
                "postRot": post_rot,
                "parentId": None
            }
            # print(f"  Node: {node_name} ({node_type})")

        # --- 3. Deformer (Skin Weights) Extraction ---
        # Note: In ASCII FBX, Deformer "Skin" connects to Geometry
        # Deformer "Cluster" connects to "Skin" AND "LimbNode" (Bone)
        # We need to parse: Deformer (Cluster) -> Indexes, Weights, Transform, TransformLink
        
        if line.startswith('Deformer:') and '"SubDeformer"' in line:
            # Deformer: 999123, "SubDeformer::", "Cluster"
            deformer_id = line.split(':')[1].split(',')[0].strip()
            
            # Next lines contain Indexes and Weights
            cluster_indices = []
            cluster_weights = []
            
            temp_idx = line_idx + 1
            depth = 1
            while depth > 0:
                l = lines[temp_idx].strip()
                if '{' in l: depth += 1
                if '}' in l: depth -= 1
                
                if l.startswith('Indexes: *'):
                    raw = ""
                    # Read multiline
                    if not l.endswith('}'):
                        temp_idx += 1
                        while not lines[temp_idx].strip().startswith('}'):
                            raw += lines[temp_idx].strip().replace('a:', '').replace(',', ' ') + " "
                            temp_idx += 1
                    else:
                         raw = l.split('*')[1].split('}')[0].replace('a:', '')
                         
                    cluster_indices = [int(x) for x in raw.split()]
                    
                if l.startswith('Weights: *'):
                    raw = ""
                    if not l.endswith('}'):
                        temp_idx += 1
                        while not lines[temp_idx].strip().startswith('}'):
                            raw += lines[temp_idx].strip().replace('a:', '').replace(',', ' ') + " "
                            temp_idx += 1
                    else:
                         raw = l.split('*')[1].split('}')[0].replace('a:', '')
                         
                    cluster_weights = [float(x) for x in raw.split()]
                
                temp_idx += 1
            
            skin_data[deformer_id] = {
                "indices": cluster_indices,
                "weights": cluster_weights,
                "boneId": None # Will resolve via connections
            }

        # --- 4. Connections ---
        if line.startswith('Connections:'):
            in_connections = True
        
        if in_connections:
            if line.startswith(';'): 
                pass
            elif line.startswith('C:'):
                # C: "OO", ChildID, ParentID
                parts = line.split(',')
                if len(parts) >= 3:
                    child = parts[1].strip()
                    parent = parts[2].strip()
                    connections.append((child, parent))
            
            if line.strip() == '}':
                in_connections = False

        line_idx += 1

    # --- Post-Processing Connections ---
    print("Resolving Hierarchy...")
    
    # 1. Build Node Tree
    bones = []
    root_bones = []
    
    for child_id, parent_id in connections:
        # Node Hierarchy (LimbNode -> LimbNode/Null)
        if child_id in nodes and parent_id in nodes:
            nodes[child_id]["parentId"] = parent_id
            
        # Cluster -> Bone Mapping (Cluster Deformer connects TO a Bone Node)
        if child_id in skin_data and parent_id in nodes:
            # wait, usually Cluster connects to Skin, and Bone connects to Cluster?
            # Or Bone is Linked to Cluster?
            # FBX: C: "OO", BoneID, ClusterID  <-- Actually typically Model -> SubDeformer? 
            # No, typically:
            # Model (Bone) --(OO)--> SubDeformer (Cluster) --(OO)--> Deformer (Skin) --(OO)--> Geometry
            pass

    # Let's re-scan connections for Bone -> Cluster links
    # Actually FBX ASCII "C: "OO", Model::Bone, SubDeformer::Cluster"
    
    bone_id_map = {} # deformer_id -> bone_id
    
    for child, parent in connections:
        # If child is Model and parent is Deformer (Cluster)
        if child in nodes and parent in skin_data:
            skin_data[parent]["boneId"] = child
            bone_id_map[parent] = child
            # print(f"  Linked Cluster {parent} to Bone {nodes[child]['name']}")

    # Create optimized JSON structure
    
    # Flatten Vertices
    # Note: Babylon needs list of floats
    
    # Flatten Skeleton
    # Convert map to list, ensuring order or ID reference
    cleaned_bones = []
    # Identify root bones (e.g. Hips)
    root_candidates = [n for k,n in nodes.items() if n['type'] in ['LimbNode', 'Null', 'Root']]
    
    # Re-index bones to 0..N for the engine
    node_id_to_index = {}
    
    # We only care about nodes that are part of the skeleton (referenced by skins OR hierarchy of those)
    # For now, export ALL LimbNodes and look for Hips (even with namespaces)
    skeleton_nodes = [n for k,n in nodes.items() if n['type'] == 'LimbNode' or 'Hips' in n['name']]
    
    # Sort by hierarchy? Not strictly needed if using ID refs, but cleaner.
    
    for i, node in enumerate(skeleton_nodes):
        node_id_to_index[node['id']] = i
        
    for i, node in enumerate(skeleton_nodes):
        p_idx = -1
        if node['parentId'] and node['parentId'] in node_id_to_index:
            p_idx = node_id_to_index[node['parentId']]
            
        cleaned_bones.append({
            "index": i,
            "name": node['name'],
            "parentIndex": p_idx,
            "pos": node['pos'],
            "rot": node['rot'],
            "scl": node['scl'],
            "preRot": node.get('preRot', [0,0,0]),
            "postRot": node.get('postRot', [0,0,0])
        })

    # Pack Skin Weights
    # Babylon expects 4 weights per vertex (MatricesIndices, MatricesWeights)
    # We have: Vertex Index -> [ (BoneIndex, Weight), ... ]
    
    vertex_bone_influences = [[] for _ in range(len(vertices)//3)]
    
    for deformer_id, data in skin_data.items():
        bone_id = data['boneId']
        if not bone_id or bone_id not in node_id_to_index:
            continue
            
        bone_idx = node_id_to_index[bone_id]
        
        for i in range(len(data['indices'])):
            v_idx = data['indices'][i]
            w = data['weights'][i]
            vertex_bone_influences[v_idx].append((bone_idx, w))
            
    # Normalize to 4 weights per vertex
    matrices_indices = []
    matrices_weights = []
    
    for v_infl in vertex_bone_influences:
        # Sort by weight desc
        v_infl.sort(key=lambda x: x[1], reverse=True)
        # Take top 4
        top_4 = v_infl[:4]
        
        # Pad if less than 4
        while len(top_4) < 4:
            top_4.append((0, 0.0))
            
        # Normalize sum to 1.0 (if sum > 0)
        total_w = sum(x[1] for x in top_4)
        if total_w > 0:
            top_4 = [(x[0], x[1]/total_w) for x in top_4]
            
        for b_idx, w in top_4:
            matrices_indices.append(b_idx)
            matrices_weights.append(w)

    output = {
        "positions": vertices,
        "indices": indices,
        "bones": cleaned_bones,
        "matricesIndices": matrices_indices,
        "matricesWeights": matrices_weights
    }
    
    return output

if __name__ == "__main__":
    data = parse_fbx_ascii("testhuman.fbx")
    with open("humanoid_data.json", "w") as f:
        json.dump(data, f, separators=(',', ':')) # Minify slightly
    print("Done. Json saved.")
