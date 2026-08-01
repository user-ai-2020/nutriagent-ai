import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FusionMethod, VisionModelResult } from "@nutriagent/shared";
import { rerankVisionResults } from "./reranker.js";

/** Invalid key → OpenRouter fetch fails → agreement-sort fallback on clusters. */
const FORCE_AGREEMENT_FALLBACK_KEY = "test-invalid-key";

type RerankParams = Parameters<
  NonNullable<NonNullable<Parameters<typeof rerankVisionResults>[2]>["rerank"]>
>[0];

function mockRerank(scorer: (document: string, index: number) => number) {
  return async ({ documents }: RerankParams) =>
    documents.map((document, index) => ({
      index,
      relevance_score: scorer(document, index),
    }));
}

const PANCAKE_FIXTURE: VisionModelResult[] = [
  {
    modelId: "model-a",
    modelLabel: "Model A",
    items: [{ foodType: "stack of pancakes", estimatedQuantity: "200g", visionConfidence: 0.95 }],
  },
  {
    modelId: "model-b",
    modelLabel: "Model B",
    items: [
      { foodType: "pancakes", estimatedQuantity: "120g", visionConfidence: 0.88 },
      { foodType: "blueberries", estimatedQuantity: "40g", visionConfidence: 0.86 },
      { foodType: "syrup", estimatedQuantity: "30g", visionConfidence: 0.84 },
    ],
  },
  {
    modelId: "model-c",
    modelLabel: "Claude Haiku",
    items: [
      { foodType: "pancake stack", estimatedQuantity: "110g", visionConfidence: 0.9 },
      { foodType: "blueberries on pancakes", estimatedQuantity: "25g", visionConfidence: 0.88 },
      { foodType: "blueberries scattered", estimatedQuantity: "15g", visionConfidence: 0.87 },
      { foodType: "honey or syrup in bowl", estimatedQuantity: "20g", visionConfidence: 0.85 },
    ],
  },
];

const LOW_AGREEMENT_FIXTURE: VisionModelResult[] = [
  {
    modelId: "a",
    modelLabel: "Model A",
    items: [{ foodType: "dragon fruit", estimatedQuantity: "50g", visionConfidence: 0.9 }],
  },
  {
    modelId: "b",
    modelLabel: "Model B",
    items: [{ foodType: "starfruit", estimatedQuantity: "40g", visionConfidence: 0.88 }],
  },
  {
    modelId: "c",
    modelLabel: "Model C",
    items: [{ foodType: "rambutan", estimatedQuantity: "30g", visionConfidence: 0.86 }],
  },
];

const EMPTY_MODELS_FIXTURE: VisionModelResult[] = [
  { modelId: "a", modelLabel: "A", items: [], error: "failed" },
  { modelId: "b", modelLabel: "B", items: [], error: "failed" },
];

const LABEL_DISAGREEMENT_FIXTURE: VisionModelResult[] = [
  {
    modelId: "model-a",
    modelLabel: "Model A",
    items: [{ foodType: "stack of pancakes", estimatedQuantity: "200g", visionConfidence: 0.95 }],
  },
  {
    modelId: "model-b",
    modelLabel: "Model B",
    items: [{ foodType: "pancakes", estimatedQuantity: "120g", visionConfidence: 0.7 }],
  },
];

/** Gemini-style panel: same label repeated within one model (Path B must dedupe). */
const CHERRY_TOMATO_DUPLICATE_FIXTURE: VisionModelResult[] = [
  {
    modelId: "google/gemini-3-pro-preview",
    modelLabel: "Gemini 3 Pro",
    items: [
      { foodType: "penne pasta with tomato sauce", estimatedQuantity: "180g", visionConfidence: 0.92 },
      { foodType: "cherry tomato", estimatedQuantity: "12g", visionConfidence: 0.85 },
      { foodType: "cherry tomato", estimatedQuantity: "10g", visionConfidence: 0.84 },
      { foodType: "cherry tomato", estimatedQuantity: "8g", visionConfidence: 0.83 },
    ],
  },
  {
    modelId: "anthropic/claude-haiku-4.5",
    modelLabel: "Claude Haiku 4.5",
    items: [
      { foodType: "cherry tomatoes", estimatedQuantity: "25g", visionConfidence: 0.88 },
      { foodType: "penne pasta", estimatedQuantity: "170g", visionConfidence: 0.9 },
    ],
  },
];

/** Pastry spread: one conservative model vs two over-counting models — multi-model items must survive low Cohere scores. */
const PASTRY_SPREAD_FIXTURE: VisionModelResult[] = [
  {
    modelId: "google/gemini-3-pro-preview",
    modelLabel: "Gemini 3 Pro",
    items: [{ foodType: "croissant with jam topping", estimatedQuantity: "75g", visionConfidence: 0.95 }],
  },
  {
    modelId: "google/gemini-2.5-flash",
    modelLabel: "Gemini 2.5 Flash",
    items: [
      { foodType: "croissant with topping", estimatedQuantity: "70g", visionConfidence: 0.9 },
      { foodType: "macaron", estimatedQuantity: "10g", visionConfidence: 0.88 },
      { foodType: "macaron", estimatedQuantity: "10g", visionConfidence: 0.87 },
      { foodType: "strawberry", estimatedQuantity: "12g", visionConfidence: 0.86 },
      { foodType: "strawberry", estimatedQuantity: "12g", visionConfidence: 0.85 },
    ],
  },
  {
    modelId: "anthropic/claude-haiku-4.5",
    modelLabel: "Claude Haiku 4.5",
    items: [
      { foodType: "croissant", estimatedQuantity: "65g", visionConfidence: 0.9 },
      { foodType: "macaron", estimatedQuantity: "10g", visionConfidence: 0.89 },
      { foodType: "macaron", estimatedQuantity: "10g", visionConfidence: 0.88 },
      { foodType: "strawberry", estimatedQuantity: "12g", visionConfidence: 0.87 },
    ],
  },
];

describe("rerankVisionResults — cluster-first fusion", () => {
  it("uses median grams when models agree on the same food identity", async () => {
    const modelResults: VisionModelResult[] = [
      {
        modelId: "model-a",
        modelLabel: "Model A",
        items: [{ foodType: "pancakes", estimatedQuantity: "80g", visionConfidence: 0.9 }],
      },
      {
        modelId: "model-b",
        modelLabel: "Model B",
        items: [{ foodType: "pancakes", estimatedQuantity: "100g", visionConfidence: 0.85 }],
      },
    ];

    const { items, fusionMethod } = await rerankVisionResults(
      modelResults,
      FORCE_AGREEMENT_FALLBACK_KEY
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]!.foodType, "pancakes");
    assert.equal(items[0]!.estimatedQuantity, "90g");
    assert.equal(fusionMethod, "cluster_no_rerank");
  });

  it("merges pancake stack variants with median portion and excludes false blueberry cluster members", async () => {
    const { items, fusionMethod } = await rerankVisionResults(
      PANCAKE_FIXTURE,
      FORCE_AGREEMENT_FALLBACK_KEY
    );

    assert.equal(items.length, 3);
    assert.equal(fusionMethod, "cluster_no_rerank");

    const pancake = items.find((i) => i.foodType.includes("pancake"));
    assert.ok(pancake, "expected a merged pancake cluster");
    assert.equal(pancake!.estimatedQuantity, "120g", "median of 200g, 120g, 110g");

    const blueberries = items.find((i) => i.foodType.includes("blueberr"));
    assert.ok(blueberries, "expected a merged blueberry cluster");
    assert.equal(blueberries!.estimatedQuantity, "25g", "median of 40g, 25g, 15g");

    const syrup = items.find((i) => i.foodType.includes("syrup"));
    assert.ok(syrup, "expected a merged syrup cluster");
    assert.equal(syrup!.estimatedQuantity, "25g", "median of 30g, 20g");
  });

  it("picks canonical label from Cohere relevance, not visionConfidence", async () => {
    const rerank = mockRerank((document) => {
      if (document.startsWith("pancakes (120g)")) return 0.95;
      if (document.startsWith("stack of pancakes (200g)")) return 0.5;
      return 0.85;
    });

    const { items, fusionMethod } = await rerankVisionResults(LABEL_DISAGREEMENT_FIXTURE, "test-key", {
      rerank,
    });

    assert.equal(fusionMethod, "full");
    assert.equal(items.length, 1);
    assert.equal(
      items[0]!.foodType,
      "pancakes",
      "label follows highest Cohere score, not highest visionConfidence (stack of pancakes)"
    );
  });

  it("does not exactly copy a single model panel when cluster fusion runs", async () => {
    const { items } = await rerankVisionResults(PANCAKE_FIXTURE, FORCE_AGREEMENT_FALLBACK_KEY);
    const panelB = PANCAKE_FIXTURE[1]!;

    const exactPanelMatch =
      items.length === panelB.items.length &&
      items.every((item, idx) => {
        const pb = panelB.items[idx]!;
        return item.foodType === pb.foodType && item.estimatedQuantity === pb.estimatedQuantity;
      });

    assert.equal(exactPanelMatch, false);
  });

  it("keeps all distinct foods when at least two models agree, even below Cohere relevance floor", async () => {
    const rerank = mockRerank((document) => {
      if (document.toLowerCase().includes("croissant")) return 0.92;
      if (document.toLowerCase().includes("macaron")) return 0.32;
      if (document.toLowerCase().includes("strawberry")) return 0.31;
      return 0.5;
    });

    const { items, fusionMethod } = await rerankVisionResults(PASTRY_SPREAD_FIXTURE, "test-key", {
      rerank,
    });

    assert.equal(fusionMethod, "full");
    assert.ok(items.length >= 3, `expected croissant + macaron + strawberry, got: ${items.map((i) => i.foodType).join(", ")}`);
    assert.ok(items.some((i) => i.foodType.toLowerCase().includes("croissant")));
    assert.ok(items.some((i) => i.foodType.toLowerCase().includes("macaron")));
    assert.ok(items.some((i) => i.foodType.toLowerCase().includes("strawberry")));
  });

  it("dedupes identical labels within a single model on Path B fallback", async () => {
    const lowScoreRerank = mockRerank(() => 0.3);

    const { items, fusionMethod, fallbackModelLabel } = await rerankVisionResults(
      LOW_AGREEMENT_FIXTURE,
      "test-key",
      { rerank: lowScoreRerank }
    );

    assert.equal(fusionMethod, "single_model_fallback");
    assert.ok(fallbackModelLabel);
    assert.equal(items.length, 1);
  });

  it("dedupes exact duplicate labels within a single model and merges cross-model synonyms", async () => {
    const lowScoreRerank = mockRerank(() => 0.35);

    const { items, fusionMethod } = await rerankVisionResults(
      CHERRY_TOMATO_DUPLICATE_FIXTURE,
      "test-key",
      { rerank: lowScoreRerank }
    );

    assert.equal(fusionMethod, "full");

    const cherryTomatoEntries = items.filter((i) =>
      i.foodType.toLowerCase().includes("cherry tomato")
    );
    assert.equal(
      cherryTomatoEntries.length,
      1,
      `expected one merged cherry tomato, got: ${items.map((i) => i.foodType).join(", ")}`
    );
    assert.equal(cherryTomatoEntries[0]!.estimatedQuantity, "28g", "median of merged 30g + 25g cross-model");
    assert.equal(items.length, 2, "penne pasta + one cherry tomato");
  });
});

describe("rerankVisionResults — single-model pipeline", () => {
  const SINGLE_MODEL_FIXTURE: VisionModelResult[] = [
    {
      modelId: "google/gemini-2.5-flash",
      modelLabel: "Gemini 2.5 Flash",
      items: [{ foodType: "penne pasta with tomato sauce", estimatedQuantity: "280g", visionConfidence: 0.9 }],
    },
  ];

  it("uses single_model_only when one vision model is configured and ran", async () => {
    const { fusionMethod, items } = await rerankVisionResults(SINGLE_MODEL_FIXTURE, "test-key", {
      rerank: mockRerank(() => 0.9),
    });
    assert.equal(fusionMethod, "single_model_only");
    assert.equal(items.length, 1);
  });

  it("uses single_model_only (not fallback) when single model path B fires", async () => {
    const decomposedBurger: VisionModelResult[] = [
      {
        modelId: "google/gemini-2.5-flash",
        modelLabel: "Gemini 2.5 Flash",
        items: [
          { foodType: "tomato slice", estimatedQuantity: "20g", visionConfidence: 0.9 },
          { foodType: "mayo", estimatedQuantity: "15g", visionConfidence: 0.88 },
          { foodType: "beef patty", estimatedQuantity: "120g", visionConfidence: 0.92 },
          { foodType: "lettuce", estimatedQuantity: "15g", visionConfidence: 0.85 },
          { foodType: "burger bun", estimatedQuantity: "60g", visionConfidence: 0.9 },
          { foodType: "cheese slice", estimatedQuantity: "25g", visionConfidence: 0.87 },
        ],
      },
    ];
    const { fusionMethod, items, fallbackModelLabel } = await rerankVisionResults(
      decomposedBurger,
      "test-key",
      { rerank: mockRerank(() => 0.3) }
    );
    assert.equal(fusionMethod, "single_model_only");
    assert.ok(items.length >= 1);
    assert.equal(fallbackModelLabel, undefined);
  });
});

describe("rerankVisionResults — fusionMethod table", () => {
  const highScoreRerank = mockRerank(() => 0.9);

  const cases: Array<{
    label: FusionMethod;
    modelResults: VisionModelResult[];
    apiKey?: string | null;
    rerank?: ReturnType<typeof mockRerank>;
    expected: FusionMethod;
  }> = [
    {
      label: "full",
      modelResults: PANCAKE_FIXTURE,
      apiKey: "test-key",
      rerank: highScoreRerank,
      expected: "full",
    },
    {
      label: "cluster_no_rerank",
      modelResults: PANCAKE_FIXTURE,
      apiKey: FORCE_AGREEMENT_FALLBACK_KEY,
      expected: "cluster_no_rerank",
    },
    {
      label: "single_model_fallback",
      modelResults: LOW_AGREEMENT_FIXTURE,
      apiKey: FORCE_AGREEMENT_FALLBACK_KEY,
      expected: "single_model_fallback",
    },
    {
      label: "empty_pool_fallback",
      modelResults: EMPTY_MODELS_FIXTURE,
      apiKey: FORCE_AGREEMENT_FALLBACK_KEY,
      expected: "empty_pool_fallback",
    },
  ];

  for (const testCase of cases) {
    it(`fusionMethod is ${testCase.label}`, async () => {
      const result = await rerankVisionResults(testCase.modelResults, testCase.apiKey, {
        rerank: testCase.rerank,
      });
      assert.equal(result.fusionMethod, testCase.expected);
      if (testCase.expected === "single_model_fallback") {
        assert.ok(result.fallbackModelLabel);
        assert.equal(result.items.length, 1);
      }
    });
  }
});
