import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

type MultiModelMealCardsComponent = typeof import("./MultiModelMealCards").MultiModelMealCards;

let MultiModelMealCards: MultiModelMealCardsComponent;

before(async () => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  ({ MultiModelMealCards } = await import("./MultiModelMealCards"));
});

const nutrition = { calories: 420, protein: 22, fat: 12, carbs: 48, sugar: 6 };

const panels = [
  {
    modelId: "model-a",
    modelLabel: "Model A",
    items: [
      {
        foodType: "pancakes",
        estimatedQuantity: "120g",
        visionConfidence: 0.9,
        nutrition,
      },
    ],
    totalNutrition: nutrition,
  },
  {
    modelId: "reranker",
    modelLabel: "Reranker consensus",
    items: [
      {
        foodType: "pancakes",
        estimatedQuantity: "120g",
        visionConfidence: 0.88,
        nutrition,
      },
    ],
    totalNutrition: nutrition,
  },
];

describe("MultiModelMealCards — fusionMethod styling", () => {
  it("renders consensus highlight styling when fusionMethod is single_model_only", () => {
    const html = renderToStaticMarkup(
      React.createElement(MultiModelMealCards, {
        panels,
        rerankerScores: [],
        goalCalories: 2000,
        goalProtein: 150,
        fusionMethod: "single_model_only",
      })
    );

    assert.match(html, /2px solid var\(--color-accent\)/);
    assert.doesNotMatch(html, /color-accent-2-700, #b42318\)/);
  });

  it("renders consensus highlight styling when fusionMethod is full", () => {
    const html = renderToStaticMarkup(
      React.createElement(MultiModelMealCards, {
        panels,
        rerankerScores: [],
        goalCalories: 2000,
        goalProtein: 150,
        fusionMethod: "full",
      })
    );

    assert.match(html, /2px solid var\(--color-accent\)/);
    assert.match(html, /Reranker consensus/);
    assert.doesNotMatch(html, /color-accent-2-700, #b42318\)/);
  });

  it("renders amber degraded badge only for multi-model fallback", () => {
    const multiModelPanels = [
      {
        modelId: "model-a",
        modelLabel: "Model A",
        items: [{ foodType: "pancakes", estimatedQuantity: "120g", visionConfidence: 0.9, nutrition }],
        totalNutrition: nutrition,
      },
      {
        modelId: "model-b",
        modelLabel: "Model B",
        items: [{ foodType: "pancakes", estimatedQuantity: "120g", visionConfidence: 0.88, nutrition }],
        totalNutrition: nutrition,
      },
      {
        modelId: "reranker",
        modelLabel: "Consensus unavailable — showing Model B",
        items: [{ foodType: "pancakes", estimatedQuantity: "120g", visionConfidence: 0.88, nutrition }],
        totalNutrition: nutrition,
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(MultiModelMealCards, {
        panels: multiModelPanels,
        rerankerScores: [],
        goalCalories: 2000,
        goalProtein: 150,
        fusionMethod: "single_model_fallback",
        fallbackModelLabel: "Model B",
      })
    );

    assert.match(html, /color-accent-2-700, #b42318\)/);
    assert.doesNotMatch(html, /2px solid var\(--color-accent\)/);
  });

  it("does not render degraded styling for single-model pipeline fallback", () => {
    const degradedPanels = panels.map((panel) =>
      panel.modelId === "reranker"
        ? { ...panel, modelLabel: "Consensus unavailable — showing Model B" }
        : panel
    );

    const html = renderToStaticMarkup(
      React.createElement(MultiModelMealCards, {
        panels: degradedPanels,
        rerankerScores: [],
        goalCalories: 2000,
        goalProtein: 150,
        fusionMethod: "single_model_fallback",
        fallbackModelLabel: "Model B",
      })
    );

    assert.match(html, /chat\.fusionSingleModelOnly/);
    assert.match(html, /chat\.rerankerPanelSingleModel/);
    assert.doesNotMatch(html, /color-accent-2-700, #b42318\)/);
    assert.doesNotMatch(html, /2px solid var\(--color-accent\)/);
  });
});

describe("MultiModelMealCards — cross-model mean on single_model_fallback", () => {
  const mkPanel = (modelId: string, label: string, calories: number) => ({
    modelId,
    modelLabel: label,
    items: [
      {
        foodType: "shakshuka",
        estimatedQuantity: "600g",
        visionConfidence: 0.9,
        nutrition: { calories, protein: 20, fat: 10, carbs: 30, sugar: 8 },
      },
    ],
    totalNutrition: { calories, protein: 20, fat: 10, carbs: 30, sugar: 8 },
  });

  it("shows mean block without spread warning when models agree", () => {
    const disagreementPanels = [
      mkPanel("gemini-flash", "Gemini 2.5 Flash", 620),
      mkPanel("gemini-pro", "Gemini 3 Pro", 640),
      mkPanel("claude", "Claude Haiku 4.5", 630),
      {
        modelId: "reranker",
        modelLabel: "Consensus unavailable — showing Gemini 2.5 Flash",
        items: mkPanel("gemini-flash", "Gemini 2.5 Flash", 620).items,
        totalNutrition: { calories: 620, protein: 20, fat: 10, carbs: 30, sugar: 8 },
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(MultiModelMealCards, {
        panels: disagreementPanels,
        rerankerScores: [],
        goalCalories: 2000,
        goalProtein: 150,
        fusionMethod: "single_model_fallback",
        fallbackModelLabel: "Gemini 2.5 Flash",
      })
    );

    assert.match(html, />630</);
    assert.match(html, /chat\.fusionModelMeanTitle/);
    assert.doesNotMatch(html, /chat\.fusionNutritionSpreadWarning/);
  });

  it("shows spread warning when calorie gap exceeds threshold", () => {
    const spreadPanels = [
      mkPanel("gemini-flash", "Gemini 2.5 Flash", 108),
      mkPanel("gemini-pro", "Gemini 3 Pro", 720),
      mkPanel("claude", "Claude Haiku 4.5", 650),
      {
        modelId: "reranker",
        modelLabel: "Consensus unavailable — showing Gemini 2.5 Flash",
        items: mkPanel("gemini-flash", "Gemini 2.5 Flash", 108).items,
        totalNutrition: { calories: 108, protein: 5, fat: 1, carbs: 23, sugar: 16 },
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(MultiModelMealCards, {
        panels: spreadPanels,
        rerankerScores: [],
        goalCalories: 2000,
        goalProtein: 150,
        fusionMethod: "single_model_fallback",
        fallbackModelLabel: "Gemini 2.5 Flash",
      })
    );

    assert.match(html, /chat\.fusionNutritionSpreadWarning/);
    assert.match(html, />493</);
    assert.match(html, /color-accent-2-700, #b42318\) 35%/);
  });

  it("does not crash with a single vision panel", () => {
    const singlePanel = [
      mkPanel("gemini-flash", "Gemini 2.5 Flash", 620),
      {
        modelId: "reranker",
        modelLabel: "Consensus unavailable — showing Gemini 2.5 Flash",
        items: mkPanel("gemini-flash", "Gemini 2.5 Flash", 620).items,
        totalNutrition: { calories: 620, protein: 20, fat: 10, carbs: 30, sugar: 8 },
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(MultiModelMealCards, {
        panels: singlePanel,
        rerankerScores: [],
        goalCalories: 2000,
        goalProtein: 150,
        fusionMethod: "single_model_fallback",
        fallbackModelLabel: "Gemini 2.5 Flash",
      })
    );

    assert.match(html, /Gemini 2.5 Flash/);
    assert.doesNotMatch(html, /fusionModelMeanTitle/);
  });
});
