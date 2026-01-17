using System.Numerics;

namespace _3DTestHumanoid.Main.Client;

public class HumanoidRecipe
{
    public float HeightCm { get; set; } = 180;
    public float Muscularity { get; set; } = 0.5f;
    public float Obesity { get; set; } = 0.2f;
    public bool IsMale { get; set; } = true;
    public string SkinColor { get; set; } = "#D2B48C";
    public bool HasHelmet { get; set; } = false;
    public bool HasChestArmor { get; set; } = false;
    public bool HasShoulderPads { get; set; } = false;
    public bool HasArmArmor { get; set; } = false;
    public bool HasLegArmor { get; set; } = false;
    public float WalkPhase { get; set; } = 0f; // 0 to 1 cycle
    public float WalkSpeed { get; set; } = 1.0f;
    
    // Race Morphology Extensions
    public float ShoulderWidthMult { get; set; } = 1.0f;
    public float ArmLengthMult { get; set; } = 1.0f;
    public float LegLengthMult { get; set; } = 1.0f;
    public float TorsoHunch { get; set; } = 0.0f; // 0 (upright) to 1 (very hunched)
    public float NeckLengthMult { get; set; } = 1.0f;
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
    private static string ARMOR_COLOR = "#708090";
    private static string GOLD_COLOR = "#DAA520";

    public static List<BodyPartDto> Solve(HumanoidRecipe recipe)
    {
        var parts = new List<BodyPartDto>();

        float h = recipe.HeightCm;
        float yHead = h;
        float yNeck = h * 0.84f; // Lower neck
        float yShoulder = h * 0.77f; // Lower shoulder
        float yCrotch = h * 0.56f; // Higher crotch (FBX standard)
        float yWaist = h * 0.64f; 
        float yChest = h * 0.72f;
        float yKnee = h * 0.30f; // Higher knee

        float widthUnit = h / 8.0f;
        float shoulderWidth = (recipe.IsMale ? widthUnit * 1.8f : widthUnit * 1.5f) * recipe.ShoulderWidthMult;
        float baseThick = (h / 20f) * (1 + recipe.Obesity);
        float muscleAdd = baseThick * recipe.Muscularity;

        // Apply Hunch & Points
        float hunchOffset = recipe.TorsoHunch * (h * 0.15f);
        Vector3 hunchVector = new Vector3(0, -hunchOffset * 0.5f, hunchOffset);
        float neckLen = (yNeck - yShoulder) * recipe.NeckLengthMult;
        Vector3 neckStart = new Vector3(0, yShoulder + hunchVector.Y, hunchVector.Z);
        Vector3 neckEnd = new Vector3(0, yShoulder + hunchVector.Y + neckLen, hunchVector.Z);

        // Unified Torso & Neck (Smooth transition from Crotch to Base of Head)
        var torsoPoints = CreateLine(new Vector3(0, neckEnd.Y, neckEnd.Z), new Vector3(0, yCrotch, 0), 16);
        var torsoRadii = new float[16];
        float neckRad = widthUnit * 0.40f;
        float chestRad = (shoulderWidth * 0.35f) + muscleAdd + (recipe.Obesity * 5);
        float waistRad = (shoulderWidth * 0.25f) + (recipe.Obesity * 8);
        float pelvisRad = (shoulderWidth * 0.35f) + (recipe.Obesity * 12);

        for (int i = 0; i < 16; i++)
        {
            float t = (float)i / 15f;
            // 0 is top (neck), 1 is bottom (crotch)
            if (t < 0.2) torsoRadii[i] = neckRad; // Constant neck thickness at top
            else if (t < 0.35) torsoRadii[i] = Lerp(neckRad, chestRad, (t - 0.2f) / 0.15f);
            else if (t < 0.5) torsoRadii[i] = chestRad;
            else if (t < 0.8) torsoRadii[i] = Lerp(chestRad, waistRad, (t - 0.5f) / 0.3f);
            else torsoRadii[i] = Lerp(waistRad, pelvisRad, (t - 0.8f) / 0.2f);
        }
        var torso = new BodyPartDto { Name = "Torso", Path = torsoPoints, Radii = torsoRadii, Scale = new VectorDto(1.3f, 1f, 0.9f), Color = recipe.SkinColor, CapMode = 3 };
        parts.Add(torso);

        if (recipe.HasChestArmor) parts.Add(GenerateArmorOverlay("ChestArmor", torso, 2, 8, 1.12f, ARMOR_COLOR));

        // Legs
        float legSep = (shoulderWidth * 0.30f) * 0.7f;
        float legLen = h * 0.49f * recipe.LegLengthMult;
        float legStartHeight = yCrotch + (widthUnit * 0.4f);
        float legSwing = (float)Math.Sin(recipe.WalkPhase * Math.PI * 2) * 20f; 

        var lLeg = GenerateLimb("LeftLeg", new Vector3(-legSep, legStartHeight, 0), new Vector3(-legSep, legStartHeight - legLen * 0.5f, 0), new Vector3(-legSep, legStartHeight - legLen, 0), baseThick, muscleAdd, true, recipe.SkinColor, -legSwing);
        var rLeg = GenerateLimb("RightLeg", new Vector3(legSep, legStartHeight, 0), new Vector3(legSep, legStartHeight - legLen * 0.5f, 0), new Vector3(legSep, legStartHeight - legLen, 0), baseThick, muscleAdd, true, recipe.SkinColor, legSwing);
        parts.Add(lLeg); parts.Add(rLeg);

        // Joint Smoothing: Hips, Knees, Ankles
        float hipJointSize = baseThick * 1.3f;
        parts.Add(GenerateBall("L_HipJoint", new Vector3(-legSep, legStartHeight, 0), hipJointSize, recipe.SkinColor));
        parts.Add(GenerateBall("R_HipJoint", new Vector3(legSep, legStartHeight, 0), hipJointSize, recipe.SkinColor));
        
        parts.Add(GenerateBall("L_KneeJoint", GetPoint(lLeg.Path, 7), baseThick * 1.1f, recipe.SkinColor));
        parts.Add(GenerateBall("R_KneeJoint", GetPoint(rLeg.Path, 7), baseThick * 1.1f, recipe.SkinColor));

        // Feet
        float footSize = baseThick * 1.4f;
        parts.Add(GenerateFoot("L_Foot", GetPoint(lLeg.Path, 14), footSize, recipe.SkinColor));
        parts.Add(GenerateFoot("R_Foot", GetPoint(rLeg.Path, 14), footSize, recipe.SkinColor));

        if (recipe.HasLegArmor)
        {
            parts.Add(GenerateArmorOverlay("L_Greave", lLeg, 7, 14, 1.2f, ARMOR_COLOR));
            parts.Add(GenerateArmorOverlay("R_Greave", rLeg, 7, 14, 1.2f, ARMOR_COLOR));
        }

        // Arms
        float armSep = shoulderWidth * 0.55f;
        float armLen = h * 0.35f * recipe.ArmLengthMult;
        float armSwing = (float)Math.Sin(recipe.WalkPhase * Math.PI * 2) * 15f;

        var lArm = GenerateLimb("LeftArm", new Vector3(-armSep, yShoulder + hunchVector.Y, hunchVector.Z), new Vector3(-armSep, yShoulder + hunchVector.Y - armLen * 0.5f, hunchVector.Z), new Vector3(-armSep, yShoulder + hunchVector.Y - armLen, hunchVector.Z), baseThick, muscleAdd, false, recipe.SkinColor, armSwing, true);
        var rArm = GenerateLimb("RightArm", new Vector3(armSep, yShoulder + hunchVector.Y, hunchVector.Z), new Vector3(armSep, yShoulder + hunchVector.Y - armLen * 0.5f, hunchVector.Z), new Vector3(armSep, yShoulder + hunchVector.Y - armLen, hunchVector.Z), baseThick, muscleAdd, false, recipe.SkinColor, -armSwing, true);
        parts.Add(lArm); parts.Add(rArm);

        // Joint Smoothing: Elbows, Wrists
        parts.Add(GenerateBall("L_ElbowJoint", GetPoint(lArm.Path, 7), baseThick * 0.9f, recipe.SkinColor));
        parts.Add(GenerateBall("R_ElbowJoint", GetPoint(rArm.Path, 7), baseThick * 0.9f, recipe.SkinColor));

        // Hands
        float handSize = baseThick * 1.1f;
        parts.Add(GenerateHand("L_Hand", GetPoint(lArm.Path, 14), handSize, recipe.SkinColor));
        parts.Add(GenerateHand("R_Hand", GetPoint(rArm.Path, 14), handSize, recipe.SkinColor));

        if (recipe.HasArmArmor)
        {
            parts.Add(GenerateArmorOverlay("L_Bracer", lArm, 7, 14, 1.25f, ARMOR_COLOR));
            parts.Add(GenerateArmorOverlay("R_Bracer", rArm, 7, 14, 1.25f, ARMOR_COLOR));
        }

        // Deltoids & Pads
        float deltSize = baseThick * 2.2f + muscleAdd;
        string deltColor = recipe.HasShoulderPads ? GOLD_COLOR : recipe.SkinColor;
        parts.Add(GenerateBall("L_Deltoid", new Vector3(-armSep, yShoulder + hunchVector.Y, hunchVector.Z), deltSize, deltColor));
        parts.Add(GenerateBall("R_Deltoid", new Vector3(armSep, yShoulder + hunchVector.Y, hunchVector.Z), deltSize, deltColor));
    // Final hunch adjustment for armor
        if (recipe.HasShoulderPads)
        {
            parts.Add(GeneratePad("L_Pad", new Vector3(-armSep, yShoulder + hunchVector.Y + 2, hunchVector.Z), deltSize * 1.6f, deltSize * 0.6f, GOLD_COLOR));
            parts.Add(GeneratePad("R_Pad", new Vector3(armSep, yShoulder + hunchVector.Y + 2, hunchVector.Z), deltSize * 1.6f, deltSize * 0.6f, GOLD_COLOR));
        }

        // Head logic (Tapered)
        parts.Add(GenerateTube("NeckVisual", neckStart, neckEnd, baseThick * 0.9f, recipe.SkinColor)); // Background filler
        
        var headPath = CreateLine(neckEnd, neckEnd + new Vector3(0, yHead - yNeck, 0), 7);
        var headRadii = new float[7];
        for (int i = 0; i < 7; i++)
        {
            float t = (float)i / 6f;
            headRadii[i] = (widthUnit * 0.32f) + ((float)Math.Sin(t * Math.PI) * widthUnit * 0.25f);
            if (t < 0.3) headRadii[i] *= 0.85f; // Taper jaw
        }
        headRadii[0] = widthUnit * 0.35f;
        var head = new BodyPartDto { Name = "Head", Path = headPath, Radii = headRadii, Color = recipe.SkinColor };
        parts.Add(head);
        if (recipe.HasHelmet) parts.Add(GenerateArmorOverlay("Helmet", head, 0, 6, 1.25f, ARMOR_COLOR));

        return parts;
    }

    private static BodyPartDto GeneratePad(string name, Vector3 pos, float width, float height, string color)
    {
        float radius = width / 2.0f;
        var path = CreateLine(new Vector3(0, -(height / 2), 0), new Vector3(0, (height / 2), 0), 5);
        var radii = new float[5];
        for (int i = 0; i < 5; i++) radii[i] = (float)Math.Sin(((float)i / 4f) * Math.PI) * radius;
        return new BodyPartDto { Name = name, Path = path, Radii = radii, Color = color, Origin = new VectorDto(pos.X, pos.Y, pos.Z) };
    }

    private static BodyPartDto GenerateArmorOverlay(string name, BodyPartDto src, int start, int end, float mult, string col)
    {
        int len = end - start + 1;
        var nP = new VectorDto[len]; var nR = new float[len];
        for (int i = 0; i < len; i++) { nP[i] = src.Path[start + i]; nR[i] = src.Radii[start + i] * mult; }
        return new BodyPartDto { Name = name, Path = nP, Radii = nR, Scale = src.Scale, Color = col, CapMode = src.CapMode };
    }

    private static BodyPartDto GenerateLimb(string name, Vector3 s, Vector3 m, Vector3 e, float bt, float mus, bool leg, string col, float angleDeg = 0, bool isArm = false)
    {
        // Apply limb rotation for animation
        float rad = angleDeg * (float)Math.PI / 180f;
        
        // Rotate points m and e around s
        // For legs, we rotate around X axis (back/forth swing)
        // For arms, we rotate around X axis as well if they are down
        
        Vector3 Rotate(Vector3 point, Vector3 origin, float rotRad) {
            Vector3 relative = point - origin;
            float z = relative.Z * (float)Math.Cos(rotRad) - relative.Y * (float)Math.Sin(rotRad);
            float y = relative.Z * (float)Math.Sin(rotRad) + relative.Y * (float)Math.Cos(rotRad);
            return new Vector3(point.X, y + origin.Y, z + origin.Z);
        }

        Vector3 rm = Rotate(m, s, rad);
        Vector3 re = Rotate(e, s, rad);
        
        // Secondary bend (knee/elbow)
        float bendRad = rad * 0.5f;
        if (leg && angleDeg > 0) re = Rotate(re, rm, -bendRad); // Slight knee bend when leg goes back
        if (isArm) re = Rotate(re, rm, Math.Abs(rad) * 0.5f); // Constant slight elbow bend

        var s1 = CreateLine(s, rm, 8); var s2 = CreateLine(rm, re, 8);
        var pL = new List<VectorDto>(s1); pL.RemoveAt(pL.Count - 1); pL.AddRange(s2);
        var fP = pL.ToArray();
        var radii = new float[fP.Length];
        float lt = leg ? bt : bt * 0.7f;
        for (int i = 0; i < fP.Length; i++)
        {
            float t = (float)i / (fP.Length - 1);
            float bulge = (t < 0.5) ? (float)Math.Sin(t * 2 * Math.PI) * mus * 0.5f : (float)Math.Sin((t - 0.5) * 2 * Math.PI) * mus * 0.3f;
            radii[i] = lt + bulge;
        }
        if (leg) radii[0] *= 1.1f; radii[fP.Length - 1] *= 0.7f;
        return new BodyPartDto { Name = name, Path = fP, Radii = radii, Color = col };
    }

    private static BodyPartDto GenerateTorsoPart(string name, float yStart, float yEnd, float r1, float r2, float mus, string col, bool capBottom = true, bool capTop = true)
    {
        var p = CreateLine(new Vector3(0, yStart, 0), new Vector3(0, yEnd, 0), 6);
        var radii = new float[p.Length];
        for (int i = 0; i < p.Length; i++)
        {
            float t = (float)i / (p.Length - 1);
            float core = r1 + (r2 - r1) * t;
            radii[i] = core + (float)Math.Sin(t * Math.PI) * mus * 0.4f;
        }
        
        // Define Cap Mode (Babylon.js convention)
        // 0: NO_CAP, 1: CAP_START, 2: CAP_END, 3: CAP_ALL
        int capMode = 0;
        if (capBottom && capTop) capMode = 3;
        else if (capBottom) capMode = 1;
        else if (capTop) capMode = 2;

        return new BodyPartDto { Name = name, Path = p, Radii = radii, Color = col, CapMode = capMode };
    }

    private static BodyPartDto GenerateBall(string name, Vector3 pos, float diam, string col)
    {
        float r = diam / 2.0f;
        // Local path around (0,0,0)
        var path = CreateLine(new Vector3(0, -r, 0), new Vector3(0, r, 0), 5);
        var radii = new float[5];
        for (int i = 0; i < 5; i++) radii[i] = (float)Math.Sin(((float)i / 4f) * Math.PI) * r;
        return new BodyPartDto { Name = name, Path = path, Radii = radii, Color = col, Origin = new VectorDto(pos.X, pos.Y, pos.Z) };
    }

    private static BodyPartDto GenerateTube(string name, Vector3 s, Vector3 e, float r, string col)
    {
        return new BodyPartDto { Name = name, Path = CreateLine(s, e, 2), Radii = new float[] { r, r }, Color = col };
    }

    private static BodyPartDto GenerateHand(string name, Vector3 pos, float size, string col)
    {
        return new BodyPartDto { 
            Name = name, 
            Path = CreateLine(Vector3.Zero, new Vector3(0, -size*0.4f, 0), 2), 
            Radii = new float[] { size, size * 0.9f }, 
            Scale = new VectorDto(1.4f, 1.0f, 0.4f), // Wide Paddle
            Color = col,
            Origin = new VectorDto(pos.X, pos.Y, pos.Z)
        };
    }

    private static BodyPartDto GenerateFoot(string name, Vector3 pos, float size, string col)
    {
        return new BodyPartDto { 
            Name = name, 
            Path = CreateLine(Vector3.Zero, new Vector3(0, 0, size * 0.6f), 2), 
            Radii = new float[] { size, size * 0.7f }, 
            Scale = new VectorDto(1.2f, 0.5f, 2.0f), // Long Wedge
            Color = col,
            Origin = new VectorDto(pos.X, pos.Y, pos.Z)
        };
    }

    private static Vector3 GetPoint(VectorDto[] path, int index)
    {
        if (path == null || path.Length == 0) return Vector3.Zero;
        var p = path[Math.Clamp(index, 0, path.Length - 1)];
        return new Vector3(p.X, p.Y, p.Z);
    }

    private static VectorDto[] CreateLine(Vector3 s, Vector3 e, int steps)
    {
        var p = new VectorDto[steps];
        for (int i = 0; i < steps; i++)
        {
            var v = Vector3.Lerp(s, e, (float)i / (steps - 1));
            p[i] = new VectorDto(v.X, v.Y, v.Z);
        }
        return p;
    }

    private static float Lerp(float a, float b, float t) => a + (b - a) * t;
}