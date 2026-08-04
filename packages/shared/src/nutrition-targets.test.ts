import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTIVITY_MULTIPLIERS,
  bmiCategory,
  calculateBmi,
  calculateBmr,
  calculateBodyMetrics,
  hasCompleteBodyMetrics,
} from "./nutrition-targets.js";

describe("calculateBmi", () => {
  it("matches the WHO formula (kg / m^2)", () => {
    assert.equal(Math.round(calculateBmi(70, 175) * 10) / 10, 22.9);
    assert.equal(Math.round(calculateBmi(100, 180) * 10) / 10, 30.9);
  });
});

describe("bmiCategory", () => {
  it("uses WHO cut-offs, boundaries inclusive at the lower edge", () => {
    assert.equal(bmiCategory(18.4), "underweight");
    assert.equal(bmiCategory(18.5), "normal");
    assert.equal(bmiCategory(24.9), "normal");
    assert.equal(bmiCategory(25), "overweight");
    assert.equal(bmiCategory(29.9), "overweight");
    assert.equal(bmiCategory(30), "obese");
  });
});

describe("calculateBmr (Mifflin-St Jeor)", () => {
  it("computes the male equation", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    assert.equal(calculateBmr({ weightKg: 80, heightCm: 180, age: 30, sex: "male" }), 1780);
  });

  it("computes the female equation", () => {
    // 10*60 + 6.25*165 - 5*30 - 161 = 1320.25
    assert.equal(calculateBmr({ weightKg: 60, heightCm: 165, age: 30, sex: "female" }), 1320.25);
  });
});

describe("calculateBodyMetrics", () => {
  const base = {
    weightKg: 80,
    heightCm: 180,
    age: 30,
    sex: "male" as const,
    activityLevel: "moderate" as const,
  };

  it("maintain targets TDEE exactly", () => {
    const m = calculateBodyMetrics({ ...base, goal: "maintain" });
    assert.equal(m.tdee, Math.round(1780 * ACTIVITY_MULTIPLIERS.moderate));
    assert.equal(m.targetCalories, m.tdee);
    assert.equal(m.calorieDelta, 0);
  });

  it("lose_fat applies a 500 kcal deficit and a higher protein target", () => {
    const m = calculateBodyMetrics({ ...base, goal: "lose_fat" });
    assert.equal(m.calorieDelta, -500);
    assert.equal(m.targetCalories, m.tdee - 500);
    // 2.0 g/kg preserves lean mass in a deficit
    assert.equal(m.targetProteinGrams, 160);
  });

  it("build_muscle applies a modest surplus, not a bulk", () => {
    const m = calculateBodyMetrics({ ...base, goal: "build_muscle" });
    assert.ok(m.calorieDelta > 0, "should be a surplus");
    assert.ok(m.calorieDelta < 500, "surplus stays modest to limit fat gain");
    assert.equal(m.targetProteinGrams, 144); // 1.8 g/kg
  });

  it("never recommends below the safe calorie floor", () => {
    // Small, sedentary, aggressive goal — the raw deficit would go under 1200.
    const m = calculateBodyMetrics({
      weightKg: 45,
      heightCm: 150,
      age: 60,
      sex: "female",
      activityLevel: "sedentary",
      goal: "lose_fat",
    });
    assert.equal(m.clampedToSafeMinimum, true);
    assert.equal(m.targetCalories, 1200);
    assert.ok(m.targetCalories > m.tdee - 500, "clamped above the raw deficit");
  });

  it("states the end result: lose / maintain / gain weight", () => {
    assert.equal(calculateBodyMetrics({ ...base, goal: "maintain" }).weightDirection, "maintain");
    assert.equal(calculateBodyMetrics({ ...base, goal: "lose_fat" }).weightDirection, "lose");
    assert.equal(calculateBodyMetrics({ ...base, goal: "build_muscle" }).weightDirection, "gain");
  });

  it("estimates weekly weight change from the calorie delta (7700 kcal ≈ 1 kg)", () => {
    const m = calculateBodyMetrics({ ...base, goal: "lose_fat" });
    // -500 kcal/day * 7 / 7700 ≈ -0.45 kg/week
    assert.equal(m.weeklyWeightChangeKg, -0.45);
  });

  it("reports maintenance when a clamped deficit no longer produces loss", () => {
    // The safe floor raises the target back to ~TDEE, so promising weight loss
    // would be wrong even though the chosen goal was lose_fat.
    const m = calculateBodyMetrics({
      weightKg: 45,
      heightCm: 150,
      age: 60,
      sex: "female",
      activityLevel: "sedentary",
      goal: "lose_fat",
    });
    assert.equal(m.clampedToSafeMinimum, true);
    assert.ok(
      Math.abs(m.weeklyWeightChangeKg) < 0.45,
      "clamping must reduce the promised rate of loss"
    );
  });

  it("reports the BMI category alongside the targets", () => {
    const m = calculateBodyMetrics({ ...base, goal: "maintain" });
    assert.equal(m.bmi, 24.7);
    assert.equal(m.bmiCategory, "normal");
  });
});

describe("hasCompleteBodyMetrics", () => {
  it("requires weight, height, age and sex", () => {
    assert.equal(
      hasCompleteBodyMetrics({ weight: 80, height: 180, age: 30, sex: "male" }),
      true
    );
    assert.equal(hasCompleteBodyMetrics({ weight: 80, height: 180, age: 30 }), false);
    assert.equal(
      hasCompleteBodyMetrics({ weight: 0, height: 180, age: 30, sex: "male" }),
      false
    );
  });
});
