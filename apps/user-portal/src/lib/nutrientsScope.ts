export interface NutritionTotals {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  sugar: number;
}

/** API meal items may omit sugar; we normalize to 0 when summing. */
export interface MealItemNutrition {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  sugar?: number;
}

export const EMPTY_NUTRITION_TOTALS: NutritionTotals = {
  calories: 0,
  protein: 0,
  fat: 0,
  carbs: 0,
  sugar: 0,
};

export interface DashboardMealSignal {
  mealCount?: number;
  totals: Pick<NutritionTotals, "calories">;
  todayTotals: Pick<NutritionTotals, "calories">;
}

/** True when the dashboard week/day query returned at least one logged meal. */
export function dashboardHasLoggedMeals(data: DashboardMealSignal): boolean {
  return (data.mealCount ?? 0) > 0 || data.totals.calories > 0 || data.todayTotals.calories > 0;
}

/**
 * Ignore a persisted selectedMealId when the dashboard period has no meals —
 * otherwise React Query can still load an old meal by id and show phantom kcal.
 */
export function resolveActiveMealId(
  selectedMealId: number | null,
  data: DashboardMealSignal | undefined
): number | null {
  if (!selectedMealId || selectedMealId <= 0 || !data) return null;
  if (!dashboardHasLoggedMeals(data)) return null;
  return selectedMealId;
}

export function sumMealNutrition(
  items: Array<{ nutritionValues?: MealItemNutrition | null }> | undefined
): NutritionTotals {
  if (!items?.length) return { ...EMPTY_NUTRITION_TOTALS };
  return items.reduce<NutritionTotals>((acc, item) => {
    const n = item.nutritionValues;
    if (!n) return acc;
    return {
      calories: acc.calories + n.calories,
      protein: acc.protein + n.protein,
      fat: acc.fat + n.fat,
      carbs: acc.carbs + n.carbs,
      sugar: acc.sugar + (n.sugar ?? 0),
    };
  }, { ...EMPTY_NUTRITION_TOTALS });
}
