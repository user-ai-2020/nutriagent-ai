import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findNutrition } from "./nutrition-db";
import { parseQuantityGrams } from "@nutriagent/shared";
import { isSuspiciousNutrition, kcalPer100g } from "./nutrition-sanity";

function mealKcal(foodType: string, quantity: string): number {
  const base = findNutrition(foodType);
  const grams = parseQuantityGrams(quantity, foodType);
  return Math.round((base.calories * grams) / 100);
}

describe("findNutrition", () => {
  it("matches pasta main dish, not tomato garnish in the name", () => {
    const n = findNutrition("penne pasta with tomato sauce");
    assert.ok(n.calories >= 130, "should use pasta macros, not tomato");
    assert.equal(Math.round((n.calories * 300) / 100), 480);
  });

  it("still matches plain tomato when that is the food", () => {
    assert.equal(findNutrition("cherry tomato").calories, 18);
  });

  it("uses shakshuka macros for composite shakshuka label (not tomato garnish)", () => {
    const n = findNutrition("shakshuka with eggs and tomato sauce");
    assert.ok(n.calories >= 100, "should not use tomato garnish density");
    const kcal = mealKcal("shakshuka with eggs and tomato sauce", "600g");
    assert.ok(kcal >= 550 && kcal <= 850, `expected ~550-850 kcal, got ${kcal}`);
  });

  it("uses pasta for pasta with sauce composite", () => {
    const kcal = mealKcal("spaghetti with tomato sauce", "350g");
    assert.ok(kcal >= 400 && kcal <= 650, `expected ~400-650 kcal, got ${kcal}`);
  });

  it("uses cheeseburger macros for whole burger label", () => {
    const kcal = mealKcal("cheeseburger", "280g");
    assert.ok(kcal >= 600 && kcal <= 850, `expected ~600-850 kcal, got ${kcal}`);
  });

  it("decomposed burger components sum low; whole cheeseburger is realistic", () => {
    const parts = [
      { food: "tomato slice", qty: "20g" },
      { food: "mayonnaise", qty: "15g" },
      { food: "beef patty", qty: "120g" },
      { food: "lettuce", qty: "15g" },
      { food: "burger bun", qty: "60g" },
      { food: "cheese slice", qty: "25g" },
    ];
    const decomposedTotal = parts.reduce((sum, p) => sum + mealKcal(p.food, p.qty), 0);
    const wholeBurger = mealKcal("cheeseburger", "280g");
    assert.ok(decomposedTotal < 450, `decomposed should be low, got ${decomposedTotal}`);
    assert.ok(wholeBurger >= 600, `whole burger should be realistic, got ${wholeBurger}`);
  });
});

describe("parseQuantityGrams", () => {
  it("does not treat the g in serving as grams", () => {
    assert.equal(parseQuantityGrams("1 serving", "penne pasta"), 280);
  });
});

describe("nutrition sanity", () => {
  it("flags old shakshuka bug density (tomato @ 600g → 108 kcal)", () => {
    const per100 = kcalPer100g(108, 600);
    assert.equal(per100, 18);
    assert.equal(isSuspiciousNutrition(108, 600), true);
  });

  it("does not flag normal shakshuka portion", () => {
    assert.equal(isSuspiciousNutrition(780, 600), false);
  });

  it("flags absurd density above 900 kcal/100g", () => {
    assert.equal(isSuspiciousNutrition(1000, 100), true);
  });
});
