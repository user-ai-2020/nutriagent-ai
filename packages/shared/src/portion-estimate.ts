/** Typical portion in grams when models return "1" or "1 piece" instead of "120g" */
export function defaultGramsForFood(foodType: string): number {
  const f = foodType.toLowerCase();
  if (f.includes("macaron")) return f.includes("macarons") || f.endsWith("s") ? 40 : 20;
  if (f.includes("croissant")) return 60;
  if (f.includes("pasta") || f.includes("penne") || f.includes("spaghetti")) return 280;
  if (f.includes("sandwich") || f.includes("toast")) return 150;
  if (f.includes("coffee") || f.includes("tea")) return 200;
  if (f.includes("milk") || f.includes("cream")) return 150;
  if (f.includes("strawberr")) return 50;
  if (f.includes("parsley")) return 8;
  if (f.includes("cherry tomato") || (f.includes("tomato") && !f.includes("pasta") && !f.includes("sauce")))
    return 25;
  if (f.includes("bacon")) return 30;
  if (f.includes("lettuce")) return 40;
  return 100;
}

/** Normalizes a vision model's free-text quantity guess ("1 piece", "150g", "1 cup") into grams. */
export function parseQuantityGrams(quantity: string, foodType: string): number {
  const lower = quantity.toLowerCase().trim();
  const numeric = parseFloat(quantity.replace(/[^\d.]/g, ""));

  if (/\d+(?:\.\d+)?\s*(g|gram|grams|גרם)\b/i.test(lower) && numeric > 0) return numeric;
  if (/(\d+\s*)?(ml|milliliter|cup|oz)\b/.test(lower) && numeric > 0) {
    return lower.includes("oz") ? numeric * 28 : numeric;
  }

  const countLike =
    /piece|pieces|item|unit|each|serving|slice|whole|medium|large|small/.test(lower) ||
    (numeric > 0 && numeric <= 10 && !/g|gram|ml|oz/.test(lower));

  if (countLike) {
    const count = numeric > 0 ? numeric : 1;
    return Math.round(count * defaultGramsForFood(foodType));
  }

  if (numeric > 0) return numeric >= 20 ? numeric : Math.round(numeric * defaultGramsForFood(foodType));
  return defaultGramsForFood(foodType);
}
