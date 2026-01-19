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

    // Clothing & Armor Slots
    public string HeadSlot { get; set; } = "None";   // None, LeatherHelm, ChainHood, PlateHelm
    public string ShouldersSlot { get; set; } = "None"; // None, LeatherPauldrons, PlatePauldrons
    public string TorsoSlot { get; set; } = "None"; // None, Shirt, LeatherVest, Chainmail, PlateArmor
    public string ArmsSlot { get; set; } = "None"; // None, Sleeves, Bracers
    public string LegsSlot { get; set; } = "None";  // None, Pants, LeatherChaps, ChainLegs, PlateGreaves
    public string FeetSlot { get; set; } = "None";  // None, Boots, PlateBoots
    public string HandsSlot { get; set; } = "None";  // None, LeatherGloves, PlateGauntlets

    // Facial Features
    public string HairStyle { get; set; } = "None"; // None, Short, Long, Mohawk
    public string BeardStyle { get; set; } = "None"; // None, Goatee, Full
    public string EyeColor { get; set; } = "#0000FF"; // Blue
    public string EyebrowColor { get; set; } = "#2C2C2C"; // Match Hair default
    public string HairColor { get; set; } = "#2C2C2C"; // Black/Dark Grey
    public bool HasEars { get; set; } = true; // Default Ears On
    
    // Face Calibration (1.0 = Default)
    public float EyeDepth { get; set; } = 1.0f;
    public float NoseDepth { get; set; } = 1.0f;
    public float BrowDepth { get; set; } = 1.0f;
    public float MouthDepth { get; set; } = 1.0f;

    // Arsenal
    public bool HasSword { get; set; } = false;
    public bool HasShield { get; set; } = false;
    public bool HasSpear { get; set; } = false;
    
    public string ClothColor { get; set; } = "#3B5998"; // Denim Blue
    public string LeatherColor { get; set; } = "#3D2B1F"; // Dark Brown
    public string ChainColor { get; set; } = "#685948"; // Rusty Iron
    public string MetalColor { get; set; } = "#E0E0E0"; // Bright Silver
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
    public static List<BodyPartDto> Solve(HumanoidRecipe recipe, bool includeBody = true)
    {
        var parts = new List<BodyPartDto>();
        
        // --- DIMENSIONS (World Space approx) ---
        // Used for generating geometry for Face/Weapons
        float yNeck = 148f;
        float yHead = 175f;
        float widthUnit = 20f; // Standard width reference (Increased from 16 to match FBX Head)

        // --- HEAD (The Lightbulb) ---
        var headStart = new Vector3(0, yNeck, 0);
        var headEnd = new Vector3(0, yHead, 0);
        float headHeight = yHead - yNeck;
        
        // Tapered Radii for "Lightbulb" shape
        // Steps 0-2: Neck/Jaw (Narrow)
        // Steps 3-6: Skull (Wide)
        var headRadii = new float[7];
        float baseWidth = widthUnit * recipe.HeadSize * 0.5f; 
        
        for (int i = 0; i < 7; i++)
        {
            float t = (float)i / 6f;
            if (t < 0.3f) 
                headRadii[i] = float.Lerp(baseWidth * 0.7f, baseWidth, t / 0.3f); // Jaw -> Cheeks
            else 
                headRadii[i] = float.Lerp(baseWidth, baseWidth * 0.8f, (t - 0.3f) / 0.7f); // Cheeks -> Dome
        }

        /* 
        // User Request: Remove the "Tube" Head for now.
        parts.Add(new BodyPartDto { 
            Name = "Head", 
            Path = CreateLine(headStart, headEnd, 7), 
            Radii = headRadii, 
            Color = recipe.SkinColor 
        });
        */

        // --- FACE FEATURES (Sculpted in C#) ---
        float eyeY = yNeck + (headHeight * 0.5f); // 50% Rule
        float headWidthAtEyes = baseWidth; 
        float eyeSpacing = headWidthAtEyes * 0.35f;
        
        // BASELINE: The standard depth for the face surface
        float baseFaceDepth = headWidthAtEyes * 1.15f; 
        
        // Face features disabled for GLB transition
        /*
        // 1. EYES (Isolated Multiplier)
        float eyeDepth = baseFaceDepth * recipe.EyeDepth; 
        
        // Pass the calculated Z to JS via Origin
        parts.Add(new BodyPartDto { 
            Name = "Face_Eyes", 
            Color = recipe.EyeColor,
            Origin = new VectorDto(0, eyeY, eyeDepth) 
        });

        // 2. NOSE (Vertical Tube Bridge)
        float noseStart = eyeY + (headHeight * 0.05f); 
        float noseEnd = yNeck + (headHeight * 0.25f);
        
        // Base Surface Depth (Independent of EyeDepth)
        float surfaceZ = baseFaceDepth * 0.93f; 

        // Apply Feature Multipliers
        float browZ = surfaceZ * recipe.BrowDepth;
        float mouthZ = surfaceZ * recipe.MouthDepth;
        float noseBridgeZ = surfaceZ * recipe.NoseDepth;
        float noseTipZ = baseFaceDepth * 1.1f * recipe.NoseDepth;

        var nosePath = CreateLine(new Vector3(0, noseStart, noseBridgeZ), 
                                  new Vector3(0, noseEnd, noseTipZ), 4);
        parts.Add(new BodyPartDto { 
            Name = "Face_Nose", 
            Path = nosePath, 
            Radii = new float[] { baseWidth * 0.1f, baseWidth * 0.12f, baseWidth * 0.15f, baseWidth * 0.12f }, 
            Color = recipe.SkinColor 
        });

        // 3. BROWS (Curved Tubes)
        float browY = eyeY + (headHeight * 0.12f);
        float browW = headWidthAtEyes * 0.3f;
        parts.Add(GenerateCurvedFeature("Face_Eyebrows_L", 
            new Vector3(-eyeSpacing - browW/2, browY - 1, browZ), 
            new Vector3(-eyeSpacing + browW/2, browY, browZ), 
            baseWidth * 0.08f, recipe.EyebrowColor));
        parts.Add(GenerateCurvedFeature("Face_Eyebrows_R", 
            new Vector3(eyeSpacing - browW/2, browY, browZ), 
            new Vector3(eyeSpacing + browW/2, browY - 1, browZ), 
            baseWidth * 0.08f, recipe.EyebrowColor));

        // 4. MOUTH (Curved Tube)
        float mouthY = yNeck + (headHeight * 0.12f);
        parts.Add(GenerateCurvedFeature("Face_Mouth", 
            new Vector3(-baseWidth * 0.3f, mouthY + 0.5f, mouthZ), 
            new Vector3(baseWidth * 0.3f, mouthY + 0.5f, mouthZ), 
            baseWidth * 0.06f, "#804040")); // Dark Red
        
        if (recipe.HasEars)
        {
             parts.Add(new BodyPartDto { Name = "Face_Ears", Color = recipe.SkinColor });
        }
        */

        /*
        if (!string.Equals(recipe.HairStyle, "None", StringComparison.OrdinalIgnoreCase))
        {
             parts.Add(new BodyPartDto { Name = $"Face_Hair_{recipe.HairStyle}", Color = recipe.HairColor });
        }

        if (!string.Equals(recipe.BeardStyle, "None", StringComparison.OrdinalIgnoreCase))
        {
             parts.Add(new BodyPartDto { Name = $"Face_Beard_{recipe.BeardStyle}", Color = recipe.HairColor });
        }
        */
        
        // We only pass flags to the renderer now. 
        // The Geometry is handled by Mesh Inflation in JS (Option B).

        if (!string.Equals(recipe.HeadSlot, "None", StringComparison.OrdinalIgnoreCase))
        {
             string col = recipe.MetalColor;
             if (recipe.HeadSlot.Contains("Leather")) col = recipe.LeatherColor;
             if (recipe.HeadSlot.Contains("Cloth") || recipe.HeadSlot.Contains("Hood")) col = recipe.ClothColor;
             if (recipe.HeadSlot.Contains("Chain")) col = recipe.ChainColor;
             
             parts.Add(new BodyPartDto { Name = $"Head_{recipe.HeadSlot}", Color = col });
        }

        if (!string.Equals(recipe.ShouldersSlot, "None", StringComparison.OrdinalIgnoreCase))
        {
             string col = recipe.LeatherColor;
             if (recipe.ShouldersSlot.Contains("Cloth")) col = recipe.ClothColor;
             if (recipe.ShouldersSlot.Contains("Chain")) col = recipe.ChainColor;
             if (recipe.ShouldersSlot.Contains("Plate")) col = recipe.MetalColor;

             parts.Add(new BodyPartDto { Name = $"Shoulders_{recipe.ShouldersSlot}", Color = col });
        }

        if (!string.Equals(recipe.TorsoSlot, "None", StringComparison.OrdinalIgnoreCase))
        {
             // Determine color based on material hint in name
             string col = recipe.ClothColor;
             if (recipe.TorsoSlot.Contains("Leather")) col = recipe.LeatherColor;
             if (recipe.TorsoSlot.Contains("Chain")) col = recipe.ChainColor;
             if (recipe.TorsoSlot.Contains("Plate")) col = recipe.MetalColor;
             
             parts.Add(new BodyPartDto { Name = $"Torso_{recipe.TorsoSlot}", Color = col });
        }

        if (!string.Equals(recipe.ArmsSlot, "None", StringComparison.OrdinalIgnoreCase))
        {
             string col = recipe.ClothColor; // Default to Sleeves
             if (recipe.ArmsSlot.Contains("Leather")) col = recipe.LeatherColor;
             if (recipe.ArmsSlot.Contains("Chain")) col = recipe.ChainColor;
             if (recipe.ArmsSlot.Contains("Plate")) col = recipe.MetalColor;

             parts.Add(new BodyPartDto { Name = $"Arms_{recipe.ArmsSlot}", Color = col });
        }

        if (!string.Equals(recipe.LegsSlot, "None", StringComparison.OrdinalIgnoreCase))
        {
             string col = recipe.ClothColor;
             if (recipe.LegsSlot.Contains("Leather")) col = recipe.LeatherColor;
             if (recipe.LegsSlot.Contains("Chain")) col = recipe.ChainColor;
             if (recipe.LegsSlot.Contains("Plate")) col = recipe.MetalColor;

             parts.Add(new BodyPartDto { Name = $"Legs_{recipe.LegsSlot}", Color = col });
        }
        
        if (!string.Equals(recipe.FeetSlot, "None", StringComparison.OrdinalIgnoreCase))
        {
             string col = recipe.LeatherColor;
             if (recipe.FeetSlot.Contains("Cloth") || recipe.FeetSlot.Contains("Shoes")) col = recipe.ClothColor;
             if (recipe.FeetSlot.Contains("Chain")) col = recipe.ChainColor;
             if (recipe.FeetSlot.Contains("Plate")) col = recipe.MetalColor;

             parts.Add(new BodyPartDto { Name = $"Feet_{recipe.FeetSlot}", Color = col });
        }

        if (!string.Equals(recipe.HandsSlot, "None", StringComparison.OrdinalIgnoreCase))
        {
             string col = recipe.LeatherColor;
             if (recipe.HandsSlot.Contains("Cloth")) col = recipe.ClothColor;
             if (recipe.HandsSlot.Contains("Chain")) col = recipe.ChainColor;
             if (recipe.HandsSlot.Contains("Plate") || recipe.HandsSlot.Contains("Gauntlet")) col = recipe.MetalColor;

             parts.Add(new BodyPartDto { Name = $"Hands_{recipe.HandsSlot}", Color = col });
        }

        float h = 100f; // Scale reference
        var handOrigin = Vector3.Zero;

        // --- ARMS (A-Pose - Pointing down and slightly forward) ---
        float armSep = widthUnit * recipe.ShoulderWidth * 0.9f;
        float armLen = h * 0.35f * recipe.ArmLength;
        float baseThick = widthUnit * 0.4f;
        float muscleAdd = recipe.BodyType == "Muscular" ? 2.0f : 0f;

        // 1. ADD A FORWARD OFFSET: 
        // Anatomy: Human shoulders are slightly anterior to the spine midline
        float armForwardOffset = baseThick * 0.8f; 

        // 2. DEFINE THE A-POSE:
        // Downward and slightly outward
        var lArm = GenerateLimb("LeftArm", 
            new Vector3(-armSep, yNeck, armForwardOffset),                                  // Shoulder
            new Vector3(-armSep - (armLen * 0.15f), yNeck - (armLen * 0.4f), armForwardOffset), // Elbow
            new Vector3(-armSep - (armLen * 0.25f), yNeck - armLen, armForwardOffset),         // Hand
            baseThick, muscleAdd, false, recipe.SkinColor);

        var rArm = GenerateLimb("RightArm", 
            new Vector3(armSep, yNeck, armForwardOffset),                                   // Shoulder
            new Vector3(armSep + (armLen * 0.15f), yNeck - (armLen * 0.4f), armForwardOffset),  // Elbow
            new Vector3(armSep + (armLen * 0.25f), yNeck - armLen, armForwardOffset),          // Hand
            baseThick, muscleAdd, false, recipe.SkinColor);

        if (includeBody)
        {
            parts.Add(lArm); parts.Add(rArm);

            // 3. UPDATE DELTOIDS (Shoulder Balls):
            float deltSize = baseThick * 2.2f + muscleAdd;
            string deltColor = recipe.SkinColor;
            parts.Add(GenerateBall("L_Deltoid", new Vector3(-armSep, yNeck, armForwardOffset), deltSize, deltColor));
            parts.Add(GenerateBall("R_Deltoid", new Vector3(armSep, yNeck, armForwardOffset), deltSize, deltColor));
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

    private static BodyPartDto GenerateCurvedFeature(string name, Vector3 start, Vector3 end, float radius, string col)
    {
        var mid = Vector3.Lerp(start, end, 0.5f) + new Vector3(0, 0.5f, 0); // Slight upward arc
        var path = new List<VectorDto>();
        path.Add(new VectorDto(start.X, start.Y, start.Z));
        path.Add(new VectorDto(mid.X, mid.Y, mid.Z));
        path.Add(new VectorDto(end.X, end.Y, end.Z));
        
        return new BodyPartDto { 
            Name = name, 
            Path = path.ToArray(), 
            Radii = new float[] { radius, radius, radius }, 
            Color = col,
            CapMode = 2 // CAP_ROUND
        };
    }

    private static BodyPartDto GenerateLimb(string name, Vector3 start, Vector3 mid, Vector3 end, float thickness, float muscleAdd, bool isRound, string color)
    {
        return new BodyPartDto
        {
            Name = name,
            Path = new VectorDto[] { 
                new VectorDto(start.X, start.Y, start.Z), 
                new VectorDto(mid.X, mid.Y, mid.Z), 
                new VectorDto(end.X, end.Y, end.Z) 
            },
            Radii = new float[] { thickness + muscleAdd, thickness + muscleAdd, thickness + muscleAdd },
            Color = color,
            CapMode = isRound ? 2 : 3
        };
    }

    private static BodyPartDto GenerateBall(string name, Vector3 pos, float size, string color)
    {
        return new BodyPartDto
        {
            Name = name,
            Origin = new VectorDto(pos.X, pos.Y, pos.Z),
            Radii = new float[] { size },
            Color = color
        };
    }
}