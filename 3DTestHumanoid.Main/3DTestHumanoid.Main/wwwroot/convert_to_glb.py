import json
import base64
import numpy as np
from pygltflib import GLTF2, Scene, Node, Mesh, Primitive, Attributes, Buffer, BufferView, Accessor, Asset
from pygltflib import POSITION, NORMAL, JOINTS_0, WEIGHTS_0, SCALAR, VEC3, VEC4, UNSIGNED_SHORT, FLOAT

def create_glb_from_json(json_path, glb_path):
    print(f"Converting {json_path} to Native GLB...")
    with open(json_path, 'r') as f:
        data = json.load(f)

    # 1. Prepare Data
    pos = np.array(data["positions"], dtype=np.float32)
    indices = np.array(data["indices"], dtype=np.uint16)
    joints = np.array(data["matricesIndices"], dtype=np.uint16).reshape(-1, 4)
    weights = np.array(data["matricesWeights"], dtype=np.float32).reshape(-1, 4)
    
    # 2. Binary Buffers
    pos_bin = pos.tobytes()
    indices_bin = indices.tobytes()
    joints_bin = joints.tobytes()
    weights_bin = weights.tobytes()
    
    combined_bin = pos_bin + indices_bin + joints_bin + weights_bin
    
    # 3. Build GLTF Structure
    gltf = GLTF2(
        asset=Asset(version="2.0", generator="AntiGravity-Core"),
        scenes=[Scene(nodes=[0])],
        nodes=[Node(mesh=0)],
        meshes=[Mesh(primitives=[Primitive(
            attributes=Attributes(
                POSITION=0,
                JOINTS_0=2,
                WEIGHTS_0=3
            ),
            indices=1
        )])],
        accessors=[
            Accessor(bufferView=0, componentType=FLOAT, count=len(pos)//3, type=VEC3, max=pos.reshape(-1,3).max(axis=0).tolist(), min=pos.reshape(-1,3).min(axis=0).tolist()), # POS
            Accessor(bufferView=1, componentType=UNSIGNED_SHORT, count=len(indices), type=SCALAR), # INDICES
            Accessor(bufferView=2, componentType=UNSIGNED_SHORT, count=len(joints), type=VEC4), # JOINTS
            Accessor(bufferView=3, componentType=FLOAT, count=len(weights), type=VEC4), # WEIGHTS
        ],
        bufferViews=[
            BufferView(buffer=0, byteOffset=0, byteLength=len(pos_bin), target=34962), # VEC3
            BufferView(buffer=0, byteOffset=len(pos_bin), byteLength=len(indices_bin), target=34963), # ELEMENT
            BufferView(buffer=0, byteOffset=len(pos_bin)+len(indices_bin), byteLength=len(joints_bin), target=34962),
            BufferView(buffer=0, byteOffset=len(pos_bin)+len(indices_bin)+len(joints_bin), byteLength=len(weights_bin), target=34962),
        ],
        buffers=[Buffer(byteLength=len(combined_bin))]
    )
    
    gltf.set_binary_data(combined_bin)
    gltf.save(glb_path)
    print(f"Successfully baked Anatomical glTF: {glb_path}")

if __name__ == "__main__":
    create_glb_from_json("humanoid_data.json", "PerfectMale.glb")
