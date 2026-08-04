/**
 * Deterministic SQL for the handful of questions users actually ask most.
 *
 * Why this exists: the LLM path costs a round-trip, can hallucinate columns, and
 * is non-deterministic — the same question can generate valid SQL once and
 * whitelist-rejected SQL the next time. Anything we can answer without asking a
 * model, we should.
 *
 * Why every supported language must be listed: this used to match English and
 * Hebrew only, so Russian silently fell through to the LLM. That is how
 * "Что я ел вчера?" ended up as a 500 while the identical English question
 * worked — not a Russian bug, a coverage gap. Keep KEYWORDS in sync with
 * SUPPORTED_RESPONSE_LANGUAGES in @nutriagent/shared.
 */

const MEAL_HISTORY_SELECT = `
SELECT meals.meal_datetime, meals.meal_type, meal_items.food_type, meal_items.estimated_quantity,
       nutrition_values.calories, nutrition_values.protein, nutrition_values.fat, nutrition_values.carbs
FROM meals
JOIN meal_items ON meal_items.meal_id = meals.meal_id
LEFT JOIN nutrition_values ON nutrition_values.item_id = meal_items.item_id`.trim();

const STEPS_SELECT = `
SELECT activity.daily_steps.date, activity.daily_steps.steps, activity.daily_steps.source
FROM activity.daily_steps`.trim();

/** What shape the rows come back in — the formatter needs to know. */
export type HistoryTemplateKind = "meals" | "steps";

export type HistoryTemplate = {
  sql: string;
  kind: HistoryTemplateKind;
};

/**
 * Substrings are matched against the lower-cased question, so Russian entries
 * are stems rather than full words ("вчерашн" covers вчерашний/вчерашнего/…).
 * Hebrew has no casing and few inflections here, so plain words suffice.
 */
const YESTERDAY = ["yesterday", "אתמול", "вчера", "вчерашн"];
const TODAY = ["today", "היום", "сегодня", "сегодняшн"];
const WEEK = [
  "this week",
  "past week",
  "last week",
  "last 7",
  "past 7",
  "שבוע",
  "неделю",
  "неделе",
  "недели",
  "неделя",
  "7 дней",
  "семь дней",
];
const ATE = ["what did i eat", "what i ate", "מה אכלתי", "что я ел", "что я ела", "что ел", "что ела"];
const STEPS = ["step", "צעד", "шаг"];

function hasAny(q: string, needles: string[]): boolean {
  return needles.some((n) => q.includes(n));
}

export function matchHistoryTemplate(question: string): HistoryTemplate | null {
  const q = question.toLowerCase();

  // Steps first: "how many steps yesterday?" is a steps question that happens to
  // mention yesterday, and answering it with a meal list would be nonsense.
  if (hasAny(q, STEPS)) {
    if (hasAny(q, YESTERDAY)) {
      return {
        kind: "steps",
        sql: `${STEPS_SELECT}
WHERE activity.daily_steps.date = CURRENT_DATE - INTERVAL '1 day'
LIMIT 500`,
      };
    }
    if (hasAny(q, WEEK)) {
      return {
        kind: "steps",
        sql: `${STEPS_SELECT}
WHERE activity.daily_steps.date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY activity.daily_steps.date DESC
LIMIT 500`,
      };
    }
    return {
      kind: "steps",
      sql: `${STEPS_SELECT}
WHERE activity.daily_steps.date = CURRENT_DATE
LIMIT 500`,
    };
  }

  if (hasAny(q, YESTERDAY)) {
    return {
      kind: "meals",
      sql: `${MEAL_HISTORY_SELECT}
WHERE meals.meal_datetime >= CURRENT_DATE - INTERVAL '1 day'
  AND meals.meal_datetime < CURRENT_DATE
LIMIT 500`,
    };
  }

  if (hasAny(q, TODAY)) {
    return {
      kind: "meals",
      sql: `${MEAL_HISTORY_SELECT}
WHERE meals.meal_datetime >= CURRENT_DATE
  AND meals.meal_datetime < CURRENT_DATE + INTERVAL '1 day'
LIMIT 500`,
    };
  }

  if (hasAny(q, WEEK)) {
    return {
      kind: "meals",
      sql: `${MEAL_HISTORY_SELECT}
WHERE meals.meal_datetime >= CURRENT_DATE - INTERVAL '7 days'
LIMIT 500`,
    };
  }

  // Bare "what did I eat?" with no period. Defaults to today rather than
  // yesterday: someone asking mid-day almost always means the meals they have
  // logged so far, and an empty yesterday reads as though logging is broken.
  if (hasAny(q, ATE)) {
    return {
      kind: "meals",
      sql: `${MEAL_HISTORY_SELECT}
WHERE meals.meal_datetime >= CURRENT_DATE
  AND meals.meal_datetime < CURRENT_DATE + INTERVAL '1 day'
LIMIT 500`,
    };
  }

  return null;
}

/** Back-compat wrapper: SQL only, for callers that do not care about row shape. */
export function matchHistorySql(question: string): string | null {
  return matchHistoryTemplate(question)?.sql ?? null;
}
