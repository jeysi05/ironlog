import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const LogSchema = {
  type: Type.OBJECT,
  properties: {
    foods: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          quantity: { type: Type.STRING },
          calories: { type: Type.INTEGER },
          protein_g: { type: Type.NUMBER },
          carbs_g: { type: Type.NUMBER },
          fat_g: { type: Type.NUMBER },
        },
        required: ["name", "calories", "protein_g", "carbs_g", "fat_g"],
      },
    },
    exercises: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          exercise_name: { type: Type.STRING },
          sets: { type: Type.INTEGER },
          reps: { type: Type.INTEGER },
          weight_kg: { type: Type.NUMBER },
          cardio_minutes: { type: Type.INTEGER },
          calories_burned: { type: Type.INTEGER },
        },
        required: ["exercise_name", "calories_burned"],
      },
    },
    weight_kg: {
      type: Type.NUMBER,
      description: "Scale weigh-in if mentioned by user (e.g. 94.5kg)",
    },
  },
  required: ["foods", "exercises"],
};

export async function POST(req: Request) {
  try {
    const { message, imageBase64, mimeType, profile } = await req.json();

    if (!message && !imageBase64) {
      return NextResponse.json({ error: "No input provided" }, { status: 400 });
    }

    const userWeight = profile?.weight_kg || 95.0;
    const userGender = profile?.gender || 'male';
    const userGoal = profile?.goal || 'cut';

    const contents: any[] = [];

    if (imageBase64 && mimeType) {
      contents.push({
        inlineData: {
          data: imageBase64,
          mimeType: mimeType,
        },
      });
    }

    const promptText = `You are an elite sports scientist and registered dietitian. Parse this entry into verified nutrition, lifting, and weigh-in data.

ACTIVE USER BIOMETRICS:
- Weight: ${userWeight} kg
- Gender: ${userGender}
- Protocol: ${userGoal}

RULES:
1. Macro Accuracy: Accurately estimate kcal, protein_g, carbs_g, fat_g. Include prep oils if ambiguous.
2. Calories Burned: MUST be calculated specifically for a ${userWeight}kg ${userGender}:
   - Working lifting sets: ~${(userWeight * 0.05).toFixed(1)} to ${(userWeight * 0.07).toFixed(1)} kcal/set.
   - Brisk walking: ~${(userWeight * 0.065).toFixed(1)} kcal/min.
   - Running: ~${(userWeight * 0.125).toFixed(1)} kcal/min.
3. Weigh-In: If user records a scale weight (e.g., "93.4kg"), extract to weight_kg.
Input text: "${message || ''}"`;

    contents.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: LogSchema,
        temperature: 0.1,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("AI Parse Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to parse log" },
      { status: 500 }
    );
  }
}