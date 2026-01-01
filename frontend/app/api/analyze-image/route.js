import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    // 1. Get API Key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("❌ Error: GEMINI_API_KEY is missing in environment variables");
      return NextResponse.json({ error: "Server Configuration Error: API Key Missing" }, { status: 500 });
    }

    // 2. Parse Body
    const body = await req.json();
    const { image } = body;
    
    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // 3. Detect MimeType (Handle PNG/JPEG dynamically)
    let mimeType = "image/jpeg";
    if (image.startsWith("data:")) {
        const matches = image.match(/^data:(.+);base64,/);
        if (matches && matches[1]) {
            mimeType = matches[1];
        }
    }

    // 4. Clean Base64 Data
    const base64Data = image.includes("base64,") ? image.split("base64,")[1] : image;

    // 5. Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

    // 6. Define Strict Prompt
    const prompt = `
      You are an Industrial Resource Scanner AI.
      Analyze this image.
      
      STEP 1: IDENTIFICATION
      Check if this image contains **Construction Materials, Industrial Waste, Scrap Metal, Wood, Bricks, Electronics, or Recyclable Plastic**.
      
      STEP 2: VALIDATION
      If the image contains:
      - Living things (Animals, People, Cats, Dogs)
      - Food or Drinks
      - Landscapes, Selfies, or unrelated objects
      
      ...Then return JSON with {"valid": false, "reason": "Non-industrial item detected"}.

      STEP 3: EXTRACTION (Only if Valid)
      Return a JSON object with:
      - "valid": true
      - "title": Short descriptive name (e.g., "Rusted Iron Pipes")
      - "type": One of ["Wood", "Metal", "Plastic", "Brick", "Electronics", "Other"]
      - "description": Short condition summary (max 15 words).
      
      Return ONLY JSON. Do not include markdown code blocks.
    `;

    // 7. Generate Content
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType: mimeType } }
    ]);

    const response = await result.response;
    const text = response.text();
    
    // 8. Clean JSON String (Remove markdown if present)
    const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    let data;
    try {
      data = JSON.parse(cleanText);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.error("Raw Text received:", text);
      return NextResponse.json({ error: "AI analysis returned invalid format" }, { status: 500 });
    }
    
    return NextResponse.json(data);

  } catch (error) {
    console.error("AI Route Error:", error);
    return NextResponse.json({ error: "AI Analysis Failed: " + error.message }, { status: 500 });
  }
}