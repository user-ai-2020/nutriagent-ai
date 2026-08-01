import { Router } from "express";
import { getCachedLlmSettings } from "@nutriagent/db";
import {
  POC_VISION_MODELS,
  VisionAnalyzeResponse,
  VisionFoodItem,
  VisionModelResult,
  friendlyOpenRouterError,
  imageDataUrl,
  openRouterChat,
  parseVisionJson,
} from "@nutriagent/shared";
import { rerankVisionResults } from "./reranker";

export const visionRouter = Router();

const VISION_FOOD_PROMPT =
  "Carefully scan the ENTIRE photo and list every distinct physical food/drink item visible. " +
  "Exactly ONE entry per real item on the plate: if one croissant is in the photo, output one croissant — do NOT split it into cheese vs jam/topping variants. " +
  "For assembled dishes served as one unit (cheeseburger, hamburger, sandwich, wrap, shawarma, shakshuka in a pan, pizza slice), output ONE entry for the whole dish with total estimated weight — " +
  "do NOT list bun, patty, cheese, lettuce, tomato, mayo, or sauce separately unless they are clearly separate items on the plate (e.g. side salad next to pasta, not inside a burger). " +
  "Include small items (tea cup, milk splash, single macaron). " +
  "Estimate estimatedQuantity in grams (or ml for liquids): cheeseburger ≈ 280g, full dinner plate of pasta ≈ 280g, croissant ≈ 60g, macaron ≈ 10g each, tea/coffee cup ≈ 200ml, medium strawberry ≈ 12g each, parsley garnish ≈ 8g. " +
  'Reply with ONLY a valid JSON array, no markdown: [{"foodType":"cheeseburger","estimatedQuantity":"280g","visionConfidence":0.9}]';

const MOCK_FOODS: VisionFoodItem[] = [
  { foodType: "Grilled chicken breast", estimatedQuantity: "150g", visionConfidence: 0.92 },
  { foodType: "Steamed broccoli", estimatedQuantity: "80g", visionConfidence: 0.88 },
  { foodType: "Brown rice", estimatedQuantity: "120g", visionConfidence: 0.85 },
];

async function analyzeWithModel(
  modelId: string,
  modelLabel: string,
  apiKey: string,
  imageBase64: string,
  imageMime?: string
): Promise<VisionModelResult> {
  try {
    const content = await openRouterChat({
      apiKey,
      model: modelId,
      maxTokens: 900,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: VISION_FOOD_PROMPT,
            },
            {
              type: "image_url",
              image_url: { url: imageDataUrl(imageBase64, imageMime) },
            },
          ],
        },
      ],
    });
    if (!content) return { modelId, modelLabel, items: [], error: "Empty response from model" };

    const items = parseVisionJson(content);
    return { modelId, modelLabel, items };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Model failed";
    return {
      modelId,
      modelLabel,
      items: [],
      error: friendlyOpenRouterError(raw),
    };
  }
}

function mockModelResults(message?: string): VisionModelResult[] {
  const items =
    message?.toLowerCase().includes("salad")
      ? [
          { foodType: "Mixed green salad", estimatedQuantity: "200g", visionConfidence: 0.9 },
          { foodType: "Grilled salmon", estimatedQuantity: "130g", visionConfidence: 0.87 },
        ]
      : MOCK_FOODS;

  return POC_VISION_MODELS.map((m, i) => ({
    modelId: m.id,
    modelLabel: m.label,
    items: items.map((item) => ({
      ...item,
      visionConfidence: Math.max(0.5, item.visionConfidence - i * 0.04),
    })),
  }));
}

visionRouter.post("/analyze", async (req, res) => {
  const { imageBase64, message, imageMime } = req.body as {
    imageBase64?: string;
    message?: string;
    ragContext?: string[];
    imageMime?: string;
  };

  let modelResults: VisionModelResult[];

  const llm = await getCachedLlmSettings();
  const apiKey = llm.openRouterApiKey || process.env.OPENROUTER_API_KEY;

  if (imageBase64) {
    if (apiKey) {
      try {
        modelResults = await Promise.all(
          POC_VISION_MODELS.map((m) =>
            analyzeWithModel(m.id, m.label, apiKey, imageBase64, imageMime)
          )
        );
        // If ALL models returned errors with no items, fall back to mock
        if (modelResults.every((r) => r.items.length === 0 && r.error)) {
          console.warn("All vision models failed, using mock fallback");
          modelResults = mockModelResults(message);
        }
      } catch (err) {
        console.warn("Vision analysis failed, using mock fallback:", err);
        modelResults = mockModelResults(message);
      }
    } else {
      modelResults = mockModelResults(message);
    }
  } else {
    modelResults = mockModelResults(message);
  }

  const {
    items: rerankedItems,
    scores: rerankerScores,
    rerankModel,
    fusionMethod,
    fallbackModelId,
    fallbackModelLabel,
  } = await rerankVisionResults(modelResults, apiKey);

  const response: VisionAnalyzeResponse = {
    modelResults,
    rerankedItems,
    rerankerScores,
    rerankModel,
    fusionMethod,
    fallbackModelId,
    fallbackModelLabel,
  };

  res.json(response);
});
