import { NutritionData } from "@nutriagent/shared";

export const NUTRITION_DB: Record<string, NutritionData> = {
  "penne pasta": { calories: 160, protein: 5.5, fat: 2.5, carbs: 28, sugar: 3 },
  "grilled chicken breast": { calories: 165, protein: 31, fat: 3.6, carbs: 0, sugar: 0 },
  "steamed broccoli": { calories: 35, protein: 2.4, fat: 0.4, carbs: 7, sugar: 1.4 },
  "brown rice": { calories: 111, protein: 2.6, fat: 0.9, carbs: 23, sugar: 0.4 },
  "mixed green salad": { calories: 25, protein: 2, fat: 0.3, carbs: 4, sugar: 2 },
  "grilled salmon": { calories: 208, protein: 20, fat: 13, carbs: 0, sugar: 0 },
  spaghetti: { calories: 157, protein: 5.8, fat: 2.2, carbs: 30, sugar: 3 },
  pasta: { calories: 131, protein: 5, fat: 1.1, carbs: 25, sugar: 2 },
  croissant: { calories: 406, protein: 8.2, fat: 21, carbs: 46, sugar: 11 },
  macaron: { calories: 390, protein: 7, fat: 16, carbs: 58, sugar: 42 },
  macarons: { calories: 390, protein: 7, fat: 16, carbs: 58, sugar: 42 },
  sandwich: { calories: 250, protein: 12, fat: 10, carbs: 28, sugar: 3 },
  bacon: { calories: 541, protein: 37, fat: 42, carbs: 1.4, sugar: 0 },
  coffee: { calories: 2, protein: 0.3, fat: 0, carbs: 0, sugar: 0 },
  tea: { calories: 1, protein: 0, fat: 0, carbs: 0.2, sugar: 0 },
  strawberry: { calories: 32, protein: 0.7, fat: 0.3, carbs: 7.7, sugar: 4.9 },
  strawberries: { calories: 32, protein: 0.7, fat: 0.3, carbs: 7.7, sugar: 4.9 },
  "cherry tomato": { calories: 18, protein: 0.9, fat: 0.2, carbs: 3.9, sugar: 2.6 },
  parsley: { calories: 36, protein: 3, fat: 0.8, carbs: 6, sugar: 0.9 },
  lettuce: { calories: 15, protein: 1.4, fat: 0.2, carbs: 2.9, sugar: 0.8 },
  tomato: { calories: 18, protein: 0.9, fat: 0.2, carbs: 3.9, sugar: 2.6 },
  bread: { calories: 265, protein: 9, fat: 3.2, carbs: 49, sugar: 5 },
  cheese: { calories: 402, protein: 25, fat: 33, carbs: 1.3, sugar: 0.5 },
  milk: { calories: 42, protein: 3.4, fat: 1, carbs: 5, sugar: 5 },
  cream: { calories: 195, protein: 2.8, fat: 19, carbs: 3.7, sugar: 3.7 },
  "green beans": { calories: 31, protein: 1.8, fat: 0.1, carbs: 7, sugar: 3.3 },
  shakshuka: { calories: 130, protein: 7, fat: 9, carbs: 6, sugar: 4 },
  egg: { calories: 155, protein: 13, fat: 11, carbs: 1.1, sugar: 1.1 },
  eggs: { calories: 155, protein: 13, fat: 11, carbs: 1.1, sugar: 1.1 },
  "chicken salad": { calories: 120, protein: 12, fat: 6, carbs: 5, sugar: 3 },
  cheeseburger: { calories: 260, protein: 14, fat: 14, carbs: 22, sugar: 5 },
  hamburger: { calories: 250, protein: 13, fat: 13, carbs: 21, sugar: 4 },
  burger: { calories: 255, protein: 13, fat: 13, carbs: 22, sugar: 4 },
};

/** Sub-ingredient keys — must not win over the main dish when both appear in a label */
const GARNISH_KEYS = new Set([
  "tomato",
  "cherry tomato",
  "parsley",
  "lettuce",
  "strawberry",
  "strawberries",
]);

const FALLBACK: NutritionData = { calories: 100, protein: 5, fat: 3, carbs: 12, sugar: 2 };

const GARNISH_MODIFIERS =
  /\b(cherry|fresh|diced|sliced|chopped|raw|ripe|small|large|whole|halved|half|grape|sun-dried|sun dried|roasted)\b/g;

/** True when the label describes the garnish itself, not a composite dish that merely contains it. */
function isStandaloneGarnishLabel(label: string, garnishKey: string): boolean {
  const stripped = label.replace(GARNISH_MODIFIERS, "").replace(/\s+/g, " ").trim();
  if (stripped === garnishKey) return true;
  if (stripped === `${garnishKey}s` || `${stripped}s` === garnishKey) return true;
  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && words.every((w) => garnishKey.includes(w))) return true;
  return false;
}

export function findNutrition(foodType: string): NutritionData {
  const lower = foodType.toLowerCase();
  const matches = Object.keys(NUTRITION_DB)
    .filter((k) => lower.includes(k))
    .sort((a, b) => b.length - a.length);

  if (!matches.length) return FALLBACK;

  const mainMatch = matches.find((k) => !GARNISH_KEYS.has(k));
  if (mainMatch) return NUTRITION_DB[mainMatch];

  const garnishKey = matches[0];
  if (isStandaloneGarnishLabel(lower, garnishKey)) return NUTRITION_DB[garnishKey];
  return FALLBACK;
}
