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
 * Russian counts need three forms and picking one at random reads as broken to a
 * native speaker, which is exactly the complaint we already fixed once in the
 * chat replies. Hebrew needs singular vs plural; English needs the -s.
 */
function stepsUnit(count: number, lang: ResponseLanguage): string {
  if (lang === "he") return count === 1 ? "צעד" : "צעדים";
  if (lang === "ru") {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return "шаг";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "шага";
    return "шагов";
  }
  return count === 1 ? "step" : "steps";
}

function noStepsMessage(lang: ResponseLanguage): string {
  if (lang === "he") return "לא נרשמו צעדים לתקופה שביקשת.";
  if (lang === "ru") return "За выбранный период шаги не записаны.";
  return "No steps were recorded for that period.";
}

function stepsTotalMessage(total: number, days: number, lang: ResponseLanguage): string {
  const unit = stepsUnit(total, lang);
  if (lang === "he") return `\nסה"כ: ${total.toLocaleString("he-IL")} ${unit} ב-${days} ימים.`;
  if (lang === "ru") {
    return `\nИтого: ${total.toLocaleString("ru-RU")} ${unit} за ${days} дн.`;
  }
  return `\nTotal: ${total.toLocaleString("en-US")} ${unit} across ${days} day(s).`;
}

function formatStepsDate(value: unknown, lang: ResponseLanguage): string {
  const parsed = new Date(asString(value));
  if (Number.isNaN(parsed.getTime())) return asString(value);
  return parsed.toLocaleDateString(LOCALE_BY_LANG[lang], { dateStyle: "medium" });
}

/** Deterministic daily-steps formatting in the user's UI language. */
export function formatStepsRows(
  rows: Record<string, unknown>[],
  lang: ResponseLanguage
): string {
  if (rows.length === 0) return noStepsMessage(lang);

  const days = rows
    .map((row) => ({ date: row.date, steps: asNumber(row.steps) }))
    .filter((d) => d.steps > 0);

  if (days.length === 0) return noStepsMessage(lang);

  // One day is the common case ("how many steps today?") — a bare sentence reads
  // better than a one-row list with a redundant total underneath.
  if (days.length === 1) {
    const only = days[0];
    const count = Math.round(only.steps);
    return `${formatStepsDate(only.date, lang)}: ${count.toLocaleString(LOCALE_BY_LANG[lang])} ${stepsUnit(count, lang)}`;
  }

  const lines = days.map((d) => {
    const count = Math.round(d.steps);
    return `• ${formatStepsDate(d.date, lang)} — ${count.toLocaleString(LOCALE_BY_LANG[lang])} ${stepsUnit(count, lang)}`;
  });
  const total = Math.round(days.reduce((sum, d) => sum + d.steps, 0));
  lines.push(stepsTotalMessage(total, days.length, lang));
  return lines.join("\n");
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
