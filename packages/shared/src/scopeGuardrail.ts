import type { ResponseLanguage } from "./language";
import { enTranslations, heTranslations, ruTranslations } from "./locales";

/**
 * Prompt block for answer-generating LLMs on in-scope questions only.
 * Off-topic chat should hit {@link outOfScopeReply} before any LLM call.
 */
export function scopeGuardrailInstruction(): string {
  return [
    "SCOPE RULE: You are NutriAgent — nutrition, diet, food, fitness, and wellness only.",
    "If the topic is unrelated, refuse briefly and suggest a nutrition or health question.",
    "Do not diagnose; suggest a professional when appropriate.",
  ].join(" ");
}

/** English tokens matched with word boundaries so "eat" does not hit "weather". */
const IN_SCOPE_EN_RE =
  /\b(eat|eaten|eating|foods?|meals?|diets?|calories?|kcals?|proteins?|carbs?|carbohydrates?|fats?|nutrition|nutrients?|vitamins?|minerals?|allerg(?:y|ies|en|ic)|diabet(?:es|ic)|health|healthy|weight|steps?|exercise|workout|recipes?|restaurants?|hunger|hungry|breakfast|lunch|dinner|snacks?|hydrat(?:e|ion)|bmi|keto|vegan|vegetarian|gluten|sugar|sodium|cholesterol|fib(?:er|re)|supplements?|portions?|fasting|obesity|hypertens(?:ion|ive)|blood pressure|lactose|celiac|iron|calcium|omega|fruits?|vegetables?|wellness|macros?|tdee|bmr|insulin|metabolism|cholesterol)\b/i;

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
  /\b(javascript|typescript|leetcode|bitcoin|cryptocurrency|nasdaq|netflix|election|president|programming|coding|docker|kubernetes|linux|weather|wether|wheather|forecast|forcast|football|soccer|basketball|baseball|hockey|tennis|cricket|rugby|nfl|nba|fifa|minecraft|fortnite|roblox|valorant|xbox|playstation|nintendo|videogame|gaming|steam|tiktok|instagram|celebrity|marvel|disney|harry potter|star wars)\b/i;

/** "What is football?" / "Tell me about Minecraft" — trivia without nutrition keywords. */
const OFF_TOPIC_TRIVIA_RE =
  /^(what is|what's|who is|who's|who was|what are|tell me about|explain|describe|how does|how do)\s+(the\s+|a\s+|an\s+)?/i;

const NUTRITION_TRIVIA_EXCEPTION_RE =
  /\b(keto|mediterranean|vegan|vegetarian|balanced|low carb|paleo|dash|calories in|protein in|symptoms|disease|allerg(?:y|ies)|diabet|intoleran|deficien|macro|micronutrient|supplement|fasting|intermittent)\b/i;

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

function isLikelyOffTopicTrivia(text: string): boolean {
  if (!OFF_TOPIC_TRIVIA_RE.test(text)) return false;
  if (NUTRITION_TRIVIA_EXCEPTION_RE.test(text)) return false;
  return true;
}

function messageHasInScopeSignal(text: string): boolean {
  return IN_SCOPE_EN_RE.test(text) || includesAny(text, IN_SCOPE_PHRASES);
}

/** True when the message is clearly outside nutrition / health / wellness. */
export function isClearlyOutOfScope(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (text.length < 2) return false;
  if (messageHasInScopeSignal(text)) return false;
  if (includesAny(text, OUT_OF_SCOPE_PHRASES) || OUT_OF_SCOPE_EN_RE.test(text)) return true;
  if (isLikelyOffTopicTrivia(text)) return true;
  return false;
}

/**
 * Fixed refusal copy — zero LLM tokens. Used whenever {@link isClearlyOutOfScope}
 * fires or when a late refusal is normalized to the staple.
 */
export function outOfScopeReply(lang: ResponseLanguage): string {
  if (lang === "he") return heTranslations.chat.outOfScopeRefusal;
  if (lang === "ru") return ruTranslations.chat.outOfScopeRefusal;
  return enTranslations.chat.outOfScopeRefusal;
}

/** True when the model already refused as out-of-scope (heuristic missed the question). */
export function isScopeRefusalReply(reply: string): boolean {
  const text = reply.trim();
  if (text.length < 20 || text.length > 600) return false;
  return (
    /can't provide information about|cannot (answer|help with) (that|unrelated)|only (answer|help with).{0,60}(nutrition|meals|health|wellness)|nutrition and wellness questions|unrelated topics|outside (of )?(nutrition|my (scope|expertise))|i'm sorry, but i can't|i am sorry, but i can't|i'm here to assist with nutrition|feel free to ask!|לא אוכל לענות|רק בנושא|на другие темы|только на вопросы о (еде|питании)|only help with food/i.test(
      text
    )
  );
}

/** Normalize any scope refusal (heuristic or model) to the zero-token staple. */
export function normalizeScopeRefusal(
  message: string,
  reply: string,
  lang: ResponseLanguage
): { refused: boolean; reply: string } {
  const refused = isClearlyOutOfScope(message) || isScopeRefusalReply(reply);
  return refused ? { refused: true, reply: outOfScopeReply(lang) } : { refused: false, reply };
}
