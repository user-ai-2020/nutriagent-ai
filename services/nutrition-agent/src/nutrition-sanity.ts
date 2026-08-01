/** Plausible kcal density per 100g for any food (0–900). Outside = data bug. */
export const KCAL_PER_100G_MIN = 0;
export const KCAL_PER_100G_MAX = 900;

/** Large portions below this density likely matched a garnish, not the main dish. */
export const LOW_DENSITY_MAIN_DISH_THRESHOLD = 30;
export const LARGE_PORTION_GRAMS = 150;

export function kcalPer100g(calories: number, grams: number): number {
  if (grams <= 0) return 0;
  return (calories / grams) * 100;
}

export function isSuspiciousNutrition(calories: number, grams: number): boolean {
  const per100 = kcalPer100g(calories, grams);
  if (per100 < KCAL_PER_100G_MIN || per100 > KCAL_PER_100G_MAX) return true;
  if (grams >= LARGE_PORTION_GRAMS && per100 < LOW_DENSITY_MAIN_DISH_THRESHOLD) return true;
  return false;
}

/** Meal-level check: many small items or a large portion with implausibly low total kcal. */
export function isSuspiciousMealTotal(
  totalCalories: number,
  totalGrams: number,
  itemCount: number
): boolean {
  if (totalGrams >= 200 && totalCalories < 350) return true;
  if (itemCount >= 4 && totalCalories < 500) return true;
  return false;
}
