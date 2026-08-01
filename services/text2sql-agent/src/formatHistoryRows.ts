import type { ResponseLanguage } from "@nutriagent/shared";

type MealRow = {
  mealKey: string;
  mealType: string;
  mealDatetime: string;
  items: Array<{
    foodType: string;
    quantity: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  }>;
};

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asString(value: unknown): string {
  return value == null ? "" : String(value);
}

const MEAL_TYPE_LABELS: Record<ResponseLanguage, Record<string, string>> = {
  en: {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snack",
    meal: "Meal",
  },
  he: {
    breakfast: "ארוחת בוקר",
    lunch: "ארוחת צהריים",
    dinner: "ארוחת ערב",
    snack: "חטיף",
    meal: "ארוחה",
  },
  ru: {
    breakfast: "Завтрак",
    lunch: "Обед",
    dinner: "Ужин",
    snack: "Перекус",
    meal: "Приём пищи",
  },
};

const LOCALE_BY_LANG: Record<ResponseLanguage, string> = {
  en: "en-US",
  he: "he-IL",
  ru: "ru-RU",
};

export function localizeMealType(mealType: string, lang: ResponseLanguage): string {
  const key = mealType.trim().toLowerCase();
  return MEAL_TYPE_LABELS[lang][key] ?? mealType;
}

export function formatMealDatetime(value: string, lang: ResponseLanguage): string {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString(LOCALE_BY_LANG[lang], { dateStyle: "medium", timeStyle: "short" });
  }
  return value.replace("T", " ").slice(0, 16);
}

function groupMealRows(rows: Record<string, unknown>[]): MealRow[] {
  const map = new Map<string, MealRow>();

  for (const row of rows) {
    const foodType = asString(row.food_type) || "item";
    // Skip no-food / placeholder leftovers so history never shows "Nothing"/"כלום".
    if (isPlaceholderFoodLabel(foodType)) continue;

    const mealDatetime = asString(row.meal_datetime);
    const mealType = asString(row.meal_type) || "meal";
    const mealKey = `${mealDatetime}|${mealType}`;
    const existing =
      map.get(mealKey) ??
      ({
        mealKey,
        mealType,
        mealDatetime,
        items: [],
      } satisfies MealRow);

    existing.items.push({
      foodType,
      quantity: asString(row.estimated_quantity) || "—",
      calories: asNumber(row.calories),
      protein: asNumber(row.protein),
      fat: asNumber(row.fat),
      carbs: asNumber(row.carbs),
    });
    map.set(mealKey, existing);
  }

  // Drop meals that lost every item to the placeholder filter.
  return [...map.values()]
    .filter((m) => m.items.length > 0)
    .sort((a, b) => a.mealDatetime.localeCompare(b.mealDatetime));
}

function isPlaceholderFoodLabel(foodType: string): boolean {
  const t = foodType.trim();
  if (!t) return true;
  return /^(nothing|none|n\/?a|unknown|item|null|undefined|empty|no food(?: items?)?(?:\s+visible)?|unidentifiable(?:\s+or\s+no\s+food(?:\s+visible)?)?|no items?(?:\s+detected)?)$/i.test(
    t
  );
}

function emptyMessage(lang: ResponseLanguage): string {
  if (lang === "he") return "לא נמצאו ארוחות לתקופה שביקשת.";
  if (lang === "ru") return "За выбранный период приёмы пищи не найдены.";
  return "No meals were logged for that period.";
}

function headerMessage(count: number, lang: ResponseLanguage): string {
  if (lang === "he") return `נמצאו ${count} ארוחות:\n`;
  if (lang === "ru") return `Найдено приёмов пищи: ${count}:\n`;
  return `Found ${count} logged meal(s):\n`;
}

function totalMessage(totalCalories: number, mealCount: number, lang: ResponseLanguage): string {
  if (lang === "he") return `\nסה"כ: ${Math.round(totalCalories)} קק"ל מ-${mealCount} ארוחות.`;
  if (lang === "ru") {
    return `\nИтого: ${Math.round(totalCalories)} ккал из ${mealCount} приём(ов) пищи.`;
  }
  return `\nTotal: ${Math.round(totalCalories)} kcal across ${mealCount} meal(s).`;
}

function kcalLabel(lang: ResponseLanguage): string {
  if (lang === "he") return 'קק"ל';
  if (lang === "ru") return "ккал";
  return "kcal";
}

/**
 * Deterministic meal-history formatting in the user's UI language.
 * Meal types + dates are localized; food names stay as stored (often English from vision)
 * unless a later LLM polish step rewrites them.
 */
export function formatHistoryRows(
  rows: Record<string, unknown>[],
  lang: ResponseLanguage
): string {
  if (rows.length === 0) return emptyMessage(lang);

  const meals = groupMealRows(rows);
  let totalCalories = 0;
  const lines: string[] = [];
  const unit = kcalLabel(lang);

  for (const meal of meals) {
    const mealCalories = meal.items.reduce((sum, item) => sum + item.calories, 0);
    totalCalories += mealCalories;
    const timeLabel = formatMealDatetime(meal.mealDatetime, lang);
    const typeLabel = localizeMealType(meal.mealType, lang);
    lines.push(`${typeLabel} (${timeLabel}):`);
    for (const item of meal.items) {
      lines.push(`• ${item.foodType} (${item.quantity}) — ${Math.round(item.calories)} ${unit}`);
    }
  }

  lines.push(totalMessage(totalCalories, meals.length, lang));
  return headerMessage(meals.length, lang) + lines.join("\n");
}
