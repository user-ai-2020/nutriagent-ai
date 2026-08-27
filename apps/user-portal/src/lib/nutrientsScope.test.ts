import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dashboardHasLoggedMeals,
  resolveActiveMealId,
  sumMealNutrition,
  EMPTY_NUTRITION_TOTALS,
} from "./nutrientsScope";

describe("nutrientsScope", () => {
  const emptyDash = {
    mealCount: 0,
    totals: { calories: 0 },
    todayTotals: { calories: 0 },
  };

  it("dashboardHasLoggedMeals is false for an empty period", () => {
    assert.equal(dashboardHasLoggedMeals(emptyDash), false);
  });

  it("dashboardHasLoggedMeals is true when week totals or today meals exist", () => {
    assert.equal(dashboardHasLoggedMeals({ ...emptyDash, totals: { calories: 400 } }), true);
    assert.equal(dashboardHasLoggedMeals({ ...emptyDash, mealCount: 1 }), true);
  });

  it("resolveActiveMealId drops stale ids when dashboard is empty", () => {
    assert.equal(resolveActiveMealId(42, emptyDash), null);
    assert.equal(resolveActiveMealId(42, { ...emptyDash, mealCount: 1 }), 42);
  });

  it("sumMealNutrition returns zeros for missing items", () => {
    assert.deepEqual(sumMealNutrition(undefined), EMPTY_NUTRITION_TOTALS);
    assert.deepEqual(sumMealNutrition([]), EMPTY_NUTRITION_TOTALS);
  });

  it("sumMealNutrition adds item nutrition", () => {
    assert.deepEqual(
      sumMealNutrition([
        { nutritionValues: { calories: 20, protein: 1, fat: 1, carbs: 2, sugar: 0 } },
      ]),
      { calories: 20, protein: 1, fat: 1, carbs: 2, sugar: 0 }
    );
  });
});
