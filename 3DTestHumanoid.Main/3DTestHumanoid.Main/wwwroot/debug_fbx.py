target = 'Model::mixamorig1:LeftShoulder'
with open('testhuman.fbx', 'r') as f:
    lines = f.readlines()
for i, l in enumerate(lines):
    if target in l:
        print(f"Found at line {i+1}")
        for j in range(i, i + 50):
            if j < len(lines):
                print(lines[j].strip())
        break
