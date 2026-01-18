using System.Numerics;

namespace _3DTestHumanoid.Main.Client;

public class HumanoidRecipe
{
    // Meta
    public string Name { get; set; } = "Character";

    // Morphology (FBX Transforms)
    public float HeightScale { get; set; } = 1.0f;
    public float WidthScale { get; set; } = 1.0f;
    
    // Detailed Genes
    public float ShoulderWidth { get; set; } = 1.0f; // Clavicle X
    public float LegLength { get; set; } = 1.0f;     // UpLeg Y
    public float ArmLength { get; set; } = 1.0f;     // UpArm Y
    public float HeadSize { get; set; } = 1.0f;      // Head Uniform

    public string SkinColor { get; set; } = "#D2B48C";
    
    // Config
    public string BodyType { get; set; } = "Average";

    // Clothing Layer
    public bool HasShirt { get; set; } = false;
    public bool HasPants { get; set; } = false;
    public bool HasBoots { get; set; } = false;

    // Arsenal
    public bool HasSword { get; set; } = false;
    public bool HasShield { get; set; } = false;
    public bool HasSpear { get; set; } = false;
    
    public string ClothColor { get; set; } = "#3B5998"; // Denim Blue
    public string LeatherColor { get; set; } = "#3D2B1F"; // Dark Brown
    public string MetalColor { get; set; } = "#C0C0C0"; // Silver
    public string WoodColor { get; set; } = "#5C4033"; // Wood
}

public class VectorDto
{
    public float X { get; set; }
    public float Y { get; set; }
    public float Z { get; set; }
    public VectorDto(float x, float y, float z) { X = x; Y = y; Z = z; }
}

public class BodyPartDto
{
    public string Name { get; set; } = "";
    public VectorDto[] Path { get; set; } = Array.Empty<VectorDto>();
    public float[] Radii { get; set; } = Array.Empty<float>();
    public VectorDto Scale { get; set; } = new VectorDto(1, 1, 1);
    public string Color { get; set; } = "#ffffff";
    public VectorDto? Origin { get; set; } // New property for local positioning
    public int CapMode { get; set; } = 3; // Default CAP_ALL
}

public static class HumanoidSolver
{
    public static List<BodyPartDto> Solve(HumanoidRecipe recipe)
    {
        var parts = new List<BodyPartDto>();

        // We only pass flags to the renderer now. 
        // The Geometry is handled by Mesh Inflation in JS (Option B).

        if (recipe.HasShirt)
        {
             parts.Add(new BodyPartDto { Name = "Shirt", Color = recipe.ClothColor });
        }

        if (recipe.HasPants)
        {
            parts.Add(new BodyPartDto { Name = "Pants", Color = recipe.ClothColor });
        }
        
        if (recipe.HasBoots)
        {
             parts.Add(new BodyPartDto { Name = "Boots", Color = recipe.LeatherColor });
        }

        // --- ARSENAL (Local Space Geometry) ---
        // JS will attach these to Hand Bones (Index 8/12). 
        // Origin (0,0,0) = Hand Bone Position.

        var handOrigin = Vector3.Zero;
        float h = 100f; // Scale reference

        if (recipe.HasShield)
        {
            // Shield: Attached to Left Hand. Offset slightly to be on forearm/side.
            var shieldPos = handOrigin + new Vector3(0, 0, 5); // Offset Z
            parts.Add(new BodyPartDto {
                Name = "Shield_Plate",
                Path = CreateLine(shieldPos, shieldPos + new Vector3(0, 2, 0), 2),
                Radii = new float[] { 25f, 25f }, // 25 radius = 50 width
                Scale = new VectorDto(1f, 1.2f, 0.2f), // Flatten
                Color = recipe.MetalColor
            });
            // Handle
             parts.Add(GenerateTube("Shield_Handle", shieldPos + new Vector3(0, -5, -2), shieldPos + new Vector3(0, 5, -2), 1.5f, recipe.LeatherColor));
        }

        if (recipe.HasSword)
        {
            // Sword: Attached to Right Hand.
            // Hilt
            parts.Add(GenerateTube("Sword_Hilt", handOrigin + new Vector3(0,-5,0), handOrigin + new Vector3(0,5,0), 1.5f, recipe.LeatherColor));
            
            // Crossguard
            parts.Add(GenerateTube("Sword_Guard", handOrigin + new Vector3(-8, 5, 0), handOrigin + new Vector3(8, 5, 0), 1.5f, recipe.MetalColor));

            // Blade
            var bladeStart = handOrigin + new Vector3(0, 5, 0);
            var bladeEnd = bladeStart + new Vector3(0, 60, 0);
            parts.Add(new BodyPartDto {
                Name = "Sword_Blade",
                Path = CreateLine(bladeStart, bladeEnd, 2),
                Radii = new float[] { 4f, 0.5f }, // Taper
                Scale = new VectorDto(0.2f, 1f, 1f), // Flatten X (Edge along Z)
                Color = recipe.MetalColor
            });
        }

        if (recipe.HasSpear)
        {
            // Spear: Attached to Right Hand.
            // Shaft
            var shaftBottom = handOrigin + new Vector3(0, -60, 0);
            var shaftTop = handOrigin + new Vector3(0, 60, 0);
            parts.Add(GenerateTube("Spear_Shaft", shaftBottom, shaftTop, 1.2f, recipe.WoodColor));
            
            // Head
            parts.Add(new BodyPartDto {
                Name = "Spear_Head",
                Path = CreateLine(shaftTop, shaftTop + new Vector3(0, 15, 0), 2),
                Radii = new float[] { 3f, 0.1f },
                Scale = new VectorDto(0.2f, 1f, 1f), // Flatten
                Color = recipe.MetalColor
            });
        }

        return parts;
    }

    // --- GEOMETRY HELPERS ---
    private static VectorDto[] CreateLine(Vector3 start, Vector3 end, int steps)
    {
        var path = new VectorDto[steps];
        for (int i = 0; i < steps; i++)
        {
            var t = i / (float)(steps - 1);
            var v = Vector3.Lerp(start, end, t);
            path[i] = new VectorDto(v.X, v.Y, v.Z);
        }
        return path;
    }

    private static BodyPartDto GenerateTube(string name, Vector3 start, Vector3 end, float width, string color)
    {
        return new BodyPartDto
        {
            Name = name,
            Path = CreateLine(start, end, 2),
            Radii = new float[] { width, width },
            Color = color,
            Scale = new VectorDto(1, 1, 1)
        };
    }
}