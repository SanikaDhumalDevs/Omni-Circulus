import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key Missing" }, { status: 500 });
    }

    const { image } = await req.json();
    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 

    // --- STRICT VALIDATION PROMPT ---
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

    const base64Data = image.includes("base64,") ? image.split("base64,")[1] : image;
    
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
    ]);

    const response = await result.response;
    const text = response.text();
    const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const data = JSON.parse(cleanText);
    
    return NextResponse.json(data);

  } catch (error) {
    console.error("AI Error:", error);
    return NextResponse.json({ error: "AI Scan Failed" }, { status: 500 });
  }
}