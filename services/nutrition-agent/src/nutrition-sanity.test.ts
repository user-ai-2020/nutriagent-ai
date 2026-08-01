import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSuspiciousMealTotal, isSuspiciousNutrition, kcalPer100g } from "./nutrition-sanity";

describe("kcalPer100g", () => {
  it("computes density correctly", () => {
    assert.equal(kcalPer100g(108, 600), 18);
    assert.equal(kcalPer100g(780, 600), 130);
  });
});

describe("isSuspiciousNutrition", () => {
  it("flags low density on large portions", () => {
    assert.equal(isSuspiciousNutrition(108, 600), true);
  });

  it("passes plausible main-dish density", () => {
    assert.equal(isSuspiciousNutrition(650, 600), false);
  });

  it("passes small garnish portions", () => {
    assert.equal(isSuspiciousNutrition(9, 50), false);
  });
});

describe("isSuspiciousMealTotal", () => {
  it("flags decomposed burger-style meal with low total kcal", () => {
    assert.equal(isSuspiciousMealTotal(315, 255, 6), true);
    assert.equal(isSuspiciousMealTotal(411, 255, 6), true);
  });

  it("passes realistic single cheeseburger meal", () => {
    assert.equal(isSuspiciousMealTotal(728, 280, 1), false);
  });
});
