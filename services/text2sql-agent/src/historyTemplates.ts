const MEAL_HISTORY_SELECT = `
SELECT meals.meal_datetime, meals.meal_type, meal_items.food_type, meal_items.estimated_quantity,
       nutrition_values.calories, nutrition_values.protein, nutrition_values.fat, nutrition_values.carbs
FROM meals
JOIN meal_items ON meal_items.meal_id = meals.meal_id
LEFT JOIN nutrition_values ON nutrition_values.item_id = meal_items.item_id`.trim();

/** Deterministic SQL for common meal-history questions — works without an LLM. */
export function matchHistorySql(question: string): string | null {
  const q = question.toLowerCase();

  if (q.includes("yesterday") || q.includes("אתמול")) {
    return `${MEAL_HISTORY_SELECT}
WHERE meals.meal_datetime >= CURRENT_DATE - INTERVAL '1 day'
  AND meals.meal_datetime < CURRENT_DATE
LIMIT 500`;
  }

  if (q.includes("today") || q.includes("היום")) {
    return `${MEAL_HISTORY_SELECT}
WHERE meals.meal_datetime >= CURRENT_DATE
  AND meals.meal_datetime < CURRENT_DATE + INTERVAL '1 day'
LIMIT 500`;
  }

  if (
    q.includes("this week") ||
    q.includes("past week") ||
    q.includes("last 7") ||
    (q.includes("שבוע") && !q.includes("אתמול"))
  ) {
    return `${MEAL_HISTORY_SELECT}
WHERE meals.meal_datetime >= CURRENT_DATE - INTERVAL '7 days'
LIMIT 500`;
  }

  if (q.includes("what did i eat") || q.includes("מה אכלתי")) {
    return `${MEAL_HISTORY_SELECT}
WHERE meals.meal_datetime >= CURRENT_DATE - INTERVAL '1 day'
  AND meals.meal_datetime < CURRENT_DATE
LIMIT 500`;
  }

  return null;
}
