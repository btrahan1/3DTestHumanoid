import bpy
import os
import sys

# Get paths from arguments
fbx_path = r"c:\Users\bartt\.gemini\antigravity\scratch\3DTestHumaoid\PrefectMale_Rigged.fbx"
glb_path = r"c:\Users\bartt\.gemini\antigravity\scratch\3DTestHumaoid\3DTestHumanoid.Main\3DTestHumanoid.Main\wwwroot\PerfectMale.glb"

# Clear existing objects
bpy.ops.wm.read_factory_settings(use_empty=True)

# Import FBX
print(f"Importing FBX: {fbx_path}")
bpy.ops.import_scene.fbx(filepath=fbx_path)

# Export GLB (glTF Binary)
print(f"Exporting GLB: {glb_path}")
# We include animations and skins to ensure the rig is preserved
bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format='GLB',
    export_skins=True,
    export_animations=True,
    export_yup=True
)

print("Conversion Complete!")
