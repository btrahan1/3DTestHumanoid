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

    // Clothing Layer
    public bool HasShirt { get; set; } = false;
    public bool HasPants { get; set; } = false;
    public bool HasBoots { get; set; } = false;
    
    public string ClothColor { get; set; } = "#3B5998"; // Denim Blue
    public string LeatherColor { get; set; } = "#3D2B1F"; // Dark Brown
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

        return parts;
    }
}