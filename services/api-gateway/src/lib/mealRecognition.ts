import {
  UserProfileData,
  VisionAnalyzeResponse,
  VisionFoodItem,
  buildVisionModelVersion,
} from "@nutriagent/shared";

const VISION_URL = process.env.VISION_AGENT_URL || "http://localhost:3002";
const NUTRITION_URL = process.env.NUTRITION_AGENT_URL || "http://localhost:3003";

async function callAgent<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

type NutritionCalc = {
  items: Array<
    VisionFoodItem & {
      nutrition: { calories: number; protein: number; fat: number; carbs: number; sugar: number };
    }
  >;
  totalNutrition: { calories: number; protein: number; fat: number; carbs: number; sugar: number };
  summary: string;
  sources: string[];
  warnings: string[];
};

export async function recognizeMealFromImage(params: {
  imageBase64: string;
  imageMime?: string;
  message?: string;
  profile?: UserProfileData;
}): Promise<{
  visionResult: VisionAnalyzeResponse;
  nutrition: NutritionCalc;
  visionModelVersion: string;
}> {
  const visionResult = await callAgent<VisionAnalyzeResponse>(`${VISION_URL}/analyze`, {
    imageBase64: params.imageBase64,
    imageMime: params.imageMime ?? "image/jpeg",
    message: params.message ?? "Re-analyze stored meal image",
  });

  const nutrition = await callAgent<NutritionCalc>(`${NUTRITION_URL}/calculate`, {
    items: visionResult.rerankedItems,
    profile: params.profile,
  });

  if (!visionResult.rerankedItems.length) {
    throw new Error("Vision models failed to identify food items");
  }

  return {
    visionResult,
    nutrition,
    visionModelVersion: buildVisionModelVersion(visionResult),
  };
}
