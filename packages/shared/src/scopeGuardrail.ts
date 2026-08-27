import type { ResponseLanguage } from "./language";

/**
 * Prompt block for every answer-generating LLM. Complements the keyword
 * short-circuit in `isClearlyOutOfScope` — the model still refuses topics
 * the heuristic missed.
 */
export function scopeGuardrailInstruction(): string {
  return [
    "SCOPE RULE: You are NutriAgent, a nutrition, diet, food, fitness, and wellness assistant.",
    "ONLY answer questions about nutrition, diet, meals, food, calories/macros, hydration,",
    "allergies, health conditions as they relate to eating, exercise/steps, sleep-as-lifestyle, and wellness.",
    "If the user asks about unrelated topics (programming, politics, sports scores, homework,",
    "weather, finance, entertainment, general trivia, or anything outside nutrition/health),",
    "politely refuse in 1-2 sentences. Do NOT answer the off-topic request.",
    "Suggest they ask about meals, nutrition, or health instead.",
    "Do not give a medical diagnosis or replace a doctor — share general nutrition/health",
    "information and suggest seeing a professional when appropriate.",
  ].join(" ");
}

/** English tokens matched with word boundaries so "eat" does not hit "weather". */
const IN_SCOPE_EN_RE =
  /\b(eat|eaten|eating|foods?|meals?|diets?|calories?|kcals?|proteins?|carbs?|carbohydrates?|fats?|nutrition|nutrients?|vitamins?|minerals?|allerg(?:y|ies|en|ic)|diabet(?:es|ic)|health|healthy|weight|steps?|exercise|workout|recipes?|restaurants?|hunger|hungry|breakfast|lunch|dinner|snacks?|hydrat(?:e|ion)|bmi|keto|vegan|vegetarian|gluten|sugar|sodium|cholesterol|fib(?:er|re)|supplements?|portions?|fasting|obesity|hypertens(?:ion|ive)|blood pressure|lactose|celiac|iron|calcium|omega|fruits?|vegetables?|wellness|macros?|tdee|bmr|calories?)\b/i;

const IN_SCOPE_PHRASES = [
  "blood pressure",
  // Hebrew
  "אוכל",
  "ארוחה",
  "ארוחת",
  "דיאטה",
  "קלור",
  "חלבון",
  "פחמימ",
  "תזונ",
  "אלרג",
  "סוכרת",
  "בריאות",
  "משקל",
  "צעד",
  "מסעד",
  "ויטמין",
  "לאכול",
  "אכלתי",
  "שתייה",
  "צום",
  "כושר",
  "אימון",
  // Russian
  "еда",
  "питани",
  "калор",
  "белок",
  "белка",
  "диет",
  "аллер",
  "диабет",
  "здоров",
  "ресторан",
  "завтрак",
  "обед",
  "ужин",
  "перекус",
  "витамин",
  "трениров",
  "шаг",
  "шагов",
  "похудеть",
  "похуден",
];

const OUT_OF_SCOPE_PHRASES = [
  "write code",
  "write a script",
  "write a program",
  "write a function",
  "python code",
  "html css",
  "react component",
  "node.js",
  "כתוב קוד",
  "תכתוב קוד",
  "קוד פייתון",
  "напиши код",
  "напиши программу",
  "political party",
  "prime minister",
  "בחירות",
  "ראש הממשלה",
  "כנסת",
  "выборы",
  "президент",
  "премьер",
  "stock market",
  "ביטקוין",
  "קריפטו",
  "биткоин",
  "криптовалют",
  "weather forecast",
  "what's the weather",
  "what is the weather",
  "whats the weather",
  "מזג האוויר",
  "מזג אוויר",
  "какая погода",
  "прогноз погоды",
  "movie recommendation",
  "who won the",
  "football score",
  "nba score",
  "מי ניצח",
  "кто выиграл",
  "solve this equation",
  "derivative of",
  "integral of",
  "capital of",
  "who invented",
  "מה הבירה של",
];

const OUT_OF_SCOPE_EN_RE =
  /\b(javascript|typescript|leetcode|bitcoin|cryptocurrency|nasdaq|netflix|election|president|programming|coding)\b/i;

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/** True when the message is clearly outside nutrition / health / wellness. */
export function isClearlyOutOfScope(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (text.length < 2) return false;
  if (IN_SCOPE_EN_RE.test(text) || includesAny(text, IN_SCOPE_PHRASES)) return false;
  if (includesAny(text, OUT_OF_SCOPE_PHRASES) || OUT_OF_SCOPE_EN_RE.test(text)) return true;
  return false;
}

export function outOfScopeReply(lang: ResponseLanguage): string {
  if (lang === "he") {
    return "אני עוזר תזונה ובריאות של NutriAgent, ויכול לעזור רק בנושאים כמו תזונה, ארוחות, דיאטה, כושר ורווחה. שאלו אותי על אוכל, קלוריות או בריאות — לא אוכל לענות על נושאים אחרים.";
  }
  if (lang === "ru") {
    return "Я помощник NutriAgent по питанию и здоровью и отвечаю только на вопросы о еде, диете, калориях, фитнесе и самочувствии. Спросите про питание или здоровье — на другие темы я ответить не могу.";
  }
  return "I'm NutriAgent's nutrition and health assistant, so I can only help with food, diet, meals, fitness, and wellness. Ask me about nutrition or health — I can't answer unrelated topics.";
}
