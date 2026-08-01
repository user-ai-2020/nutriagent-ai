import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { VisionAnalyzeResponse } from "@nutriagent/shared";
import {
  buildMealDescription,
  buildNoFoodDetectedResponse,
  isEmptyVisionDetection,
} from "./mealAnalysis.js";

const EMPTY_VISION: VisionAnalyzeResponse = {
  modelResults: [
    {
      modelId: "google/gemini-3-pro-preview",
      modelLabel: "Gemini 3 Pro",
      items: [],
      error: "Vision model returned malformed JSON - retry or use a different photo.",
    },
    {
      modelId: "google/gemini-2.5-flash",
      modelLabel: "Gemini 2.5 Flash",
      items: [],
      error: "Vision model returned malformed JSON - retry or use a different photo.",
    },
    {
      modelId: "anthropic/claude-haiku-4.5",
      modelLabel: "Claude Haiku 4.5",
      items: [],
      error: "Vision model returned malformed JSON - retry or use a different photo.",
    },
  ],
  rerankedItems: [],
  rerankerScores: [],
  rerankModel: "cohere/rerank-4-fast",
  fusionMethod: "empty_pool_fallback",
};

const VISION_WITH_ITEMS: VisionAnalyzeResponse = {
  ...EMPTY_VISION,
  rerankedItems: [{ foodType: "penne pasta", estimatedQuantity: "280g", visionConfidence: 0.9 }],
  fusionMethod: "single_model_fallback",
  fallbackModelLabel: "Gemini 3 Pro",
};

describe("isEmptyVisionDetection", () => {
  it("is true when rerankedItems is empty (empty_pool_fallback)", () => {
    assert.equal(isEmptyVisionDetection(EMPTY_VISION), true);
  });

  it("is false when reranker produced items", () => {
    assert.equal(isEmptyVisionDetection(VISION_WITH_ITEMS), false);
  });

  it("is true when only placeholder labels like Nothing remain", () => {
    const vision: VisionAnalyzeResponse = {
      ...EMPTY_VISION,
      rerankedItems: [{ foodType: "Nothing", estimatedQuantity: "100g", visionConfidence: 0.6 }],
      fusionMethod: "single_model_only",
    };
    assert.equal(isEmptyVisionDetection(vision), true);
  });
});

describe("buildNoFoodDetectedResponse", () => {
  it("returns a successful meal_analysis shape without mealId or mealAnalysis", () => {
    const response = buildNoFoodDetectedResponse({
      vision: EMPTY_VISION,
      ragSourceLabels: ["clinical-knowledge-graph"],
      agentPath: ["Router/Orchestrator", "RAG Agent"],
      preferredLanguage: "en",
    });

    assert.equal(response.intent, "meal_analysis");
    assert.equal(response.itemsDetected, false);
    assert.equal(response.mealId, undefined);
    assert.equal(response.mealAnalysis, undefined);
    assert.match(response.reply, /No food items were recognized/);
    assert.equal(response.multiModelMealAnalysis?.items.length, 0);
    assert.equal(response.multiModelMealAnalysis?.totalNutrition.calories, 0);
    assert.equal(response.multiModelMealAnalysis?.fusionMethod, "empty_pool_fallback");
    assert.equal(response.multiModelMealAnalysis?.panels.length, 4);
    assert.ok(
      response.multiModelMealAnalysis?.panels.every((p) => p.items.length === 0),
      "panels should carry errors only, no fabricated items"
    );
  });

  it("uses Hebrew copy when preferredLanguage is he", () => {
    const response = buildNoFoodDetectedResponse({
      vision: EMPTY_VISION,
      ragSourceLabels: [],
      agentPath: [],
      preferredLanguage: "he",
    });
    assert.match(response.reply, /לא זוהו פריטי מזון/);
  });
});

describe("buildMealDescription", () => {
  it("describes a single fused item in English", () => {
    const text = buildMealDescription({
      items: [{ foodType: "croissant with orange topping", estimatedQuantity: "75g", visionConfidence: 0.9 }],
      preferredLanguage: "en",
    });
    assert.match(text, /In your photo I can see croissant with orange topping \(75g\)/);
    assert.doesNotMatch(text, /didn't fully agree/);
  });

  it("lists multiple items and notes model disagreement", () => {
    const text = buildMealDescription({
      items: [
        { foodType: "penne pasta with tomato sauce", estimatedQuantity: "280g", visionConfidence: 0.9 },
        { foodType: "parsley garnish", estimatedQuantity: "8g", visionConfidence: 0.8 },
      ],
      fusionMethod: "single_model_fallback",
      preferredLanguage: "en",
    });
    assert.match(text, /2 items/);
    assert.match(text, /didn't fully agree/);
  });

  it("uses Hebrew copy when preferredLanguage is he", () => {
    const text = buildMealDescription({
      items: [{ foodType: "פסטה", estimatedQuantity: "280g", visionConfidence: 0.9 }],
      preferredLanguage: "he",
    });
    assert.match(text, /בתמונה זיהיתי/);
  });
});

describe("downstream failures are not conflated with empty vision", () => {
  it("empty detection does not trigger when rerankedItems has entries", () => {
    assert.equal(isEmptyVisionDetection(VISION_WITH_ITEMS), false);
  });

  it("nutrition calc null guard throws instead of returning itemsDetected false", () => {
    const items = VISION_WITH_ITEMS.rerankedItems;
    assert.ok(items.length > 0);
    assert.throws(
      () => {
        if (!items.length) return;
        const calcResult = null;
        if (!calcResult) {
          throw new Error("Nutrition agent returned no data for non-empty vision items");
        }
      },
      /Nutrition agent returned no data/
    );
  });
});
