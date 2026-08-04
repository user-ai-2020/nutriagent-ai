/**
 * Body metrics and daily targets from published formulas.
 *
 * Sources:
 *  - BMI + categories: WHO, "Obesity: preventing and managing the global epidemic"
 *    (BMI = kg / m²; <18.5 underweight, 18.5–24.9 normal, 25–29.9 overweight, ≥30 obese).
 *  - BMR: Mifflin MD, St Jeor ST et al. (1990) "A new predictive equation for resting
 *    energy expenditure in healthy individuals", Am J Clin Nutr 51(2):241-7. Preferred
 *    over Harris-Benedict — more accurate in modern populations.
 *  - Activity multipliers (PAL): FAO/WHO/UNU Expert Consultation, Human Energy
 *    Requirements (2004).
 *  - Goal adjustment: ~0.5 kg/week ≈ 500 kcal/day (1 kg fat ≈ 7700 kcal). A lean-gain
 *    surplus is kept smaller (~10-15%) to limit fat gain — Garthe et al. (2013),
 *    Int J Sport Nutr Exerc Metab.
 *  - Protein: Morton RW et al. (2018) meta-analysis, Br J Sports Med — resistance
 *    training benefits plateau ~1.6 g/kg/day. Helms ER et al. (2014) recommend up to
 *    ~2.2-2.4 g/kg during a deficit to preserve lean mass. Maintenance uses ~1.2 g/kg,
 *    above the 0.8 g/kg RDA, which is a minimum to avoid deficiency, not an optimum.
 *
 * Educational estimates, not medical advice — individual needs vary.
 */

export type Sex = "male" | "female";

/** FAO/WHO physical activity level bands. */
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

/** What the user is training for — drives the calorie delta and protein target. */
export type FitnessGoal = "lose_fat" | "maintain" | "build_muscle";

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2, // desk job, little deliberate exercise
  light: 1.375, // light exercise 1-3 days/week
  moderate: 1.55, // moderate exercise 3-5 days/week
  active: 1.725, // hard exercise 6-7 days/week
  very_active: 1.9, // physical job or twice-daily training
};

/** g of protein per kg bodyweight per day. */
export const PROTEIN_PER_KG: Record<FitnessGoal, number> = {
  lose_fat: 2.0, // higher intake preserves lean mass in a deficit
  maintain: 1.2,
  build_muscle: 1.8,
};

/** Calorie change vs TDEE. Deficit is absolute; surplus is a % to limit fat gain. */
const LOSE_FAT_DEFICIT_KCAL = 500;
const BUILD_MUSCLE_SURPLUS_RATIO = 0.12;

/** Never recommend below this — rough floor for a supervised-free diet. */
const MIN_SAFE_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };

export type BmiCategory = "underweight" | "normal" | "overweight" | "obese";

/** The end result the calorie target actually produces. */
export type WeightDirection = "lose" | "maintain" | "gain";

/** 1 kg of body fat ≈ 7700 kcal (Wishnofsky, widely used for short-horizon estimates). */
const KCAL_PER_KG = 7700;

/** Below this weekly change the outcome is effectively maintenance. */
const MAINTENANCE_BAND_KG_PER_WEEK = 0.05;

export interface BodyMetricsInput {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activityLevel: ActivityLevel;
  goal: FitnessGoal;
}

export interface BodyMetrics {
  bmi: number;
  bmiCategory: BmiCategory;
  /** Basal metabolic rate — kcal at complete rest. */
  bmr: number;
  /** Total daily energy expenditure — BMR × activity multiplier. */
  tdee: number;
  /** Recommended intake for the chosen goal. */
  targetCalories: number;
  /** Calorie delta vs TDEE (negative = deficit). */
  calorieDelta: number;
  targetProteinGrams: number;
  /** True when the goal's deficit was clamped to the safe floor. */
  clampedToSafeMinimum: boolean;
  /** What the target actually leads to — lose / maintain / gain weight. */
  weightDirection: WeightDirection;
  /** Expected weekly change in kg (positive = gain), from the calorie delta. */
  weeklyWeightChangeKg: number;
}

export function calculateBmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  return "obese";
}

/** Mifflin-St Jeor. */
export function calculateBmr(input: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
  return input.sex === "male" ? base + 5 : base - 161;
}

export function calculateBodyMetrics(input: BodyMetricsInput): BodyMetrics {
  const bmi = calculateBmi(input.weightKg, input.heightCm);
  const bmr = calculateBmr(input);
  const tdee = bmr * ACTIVITY_MULTIPLIERS[input.activityLevel];

  let target: number;
  if (input.goal === "lose_fat") target = tdee - LOSE_FAT_DEFICIT_KCAL;
  else if (input.goal === "build_muscle") target = tdee * (1 + BUILD_MUSCLE_SURPLUS_RATIO);
  else target = tdee;

  const floor = MIN_SAFE_KCAL[input.sex];
  const clampedToSafeMinimum = target < floor;
  if (clampedToSafeMinimum) target = floor;

  const calorieDelta = Math.round(target - tdee);

  // Derive the outcome from the ACTUAL delta, not the chosen goal: after the safe
  // floor clamp a "lose fat" target can end up at maintenance, and saying otherwise
  // would promise weight loss the plan no longer produces.
  const weeklyWeightChangeKg = round2((calorieDelta * 7) / KCAL_PER_KG);
  const weightDirection: WeightDirection =
    weeklyWeightChangeKg <= -MAINTENANCE_BAND_KG_PER_WEEK
      ? "lose"
      : weeklyWeightChangeKg >= MAINTENANCE_BAND_KG_PER_WEEK
        ? "gain"
        : "maintain";

  return {
    bmi: round1(bmi),
    bmiCategory: bmiCategory(bmi),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetCalories: Math.round(target),
    calorieDelta,
    targetProteinGrams: Math.round(input.weightKg * PROTEIN_PER_KG[input.goal]),
    clampedToSafeMinimum,
    weightDirection,
    weeklyWeightChangeKg,
  };
}

/** All fields needed before metrics can be computed. */
export function hasCompleteBodyMetrics(p: {
  weight?: number | null;
  height?: number | null;
  age?: number | null;
  sex?: string | null;
}): boolean {
  return Boolean(
    p.weight && p.weight > 0 && p.height && p.height > 0 && p.age && p.age > 0 && p.sex
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
