const STOP_WORDS = new Set([
  "with",
  "and",
  "the",
  "for",
  "on",
  "in",
  "at",
  "a",
  "an",
  "or",
  "of",
  "whole",
  "sliced",
  "half",
  "piece",
  "pieces",
  "small",
  "medium",
  "large",
  "bottom",
  "center",
  "left",
  "right",
  "top",
  "side",
  "pedestal",
  "topping",
  "filled",
  "glazed",
  "fresh",
  "ripe",
]);

/** Words that mark compound/multi-food labels. "of" is intentionally excluded (stack of pancakes). */
const PREPOSITION_WORDS = new Set(["on", "in", "with", "or", "and"]);

/** Ordered longest-first so "strawberr" matches before generic tokens */
const BASE_FOOD_TOKENS = [
  "penne pasta",
  "stack of pancakes",
  "pancake stack",
  "croissant",
  "macaron",
  "spaghetti",
  "pancakes",
  "pancake",
  "strawberr",
  "blueberr",
  "raspberr",
  "blackberr",
  "sandwich",
  "doughnut",
  "donut",
  "muffin",
  "bagel",
  "broccoli",
  "chicken",
  "salmon",
  "lettuce",
  "tomato",
  "parsley",
  "coffee",
  "toast",
  "bread",
  "bacon",
  "cheese",
  "cream",
  "pasta",
  "pizza",
  "rice",
  "salad",
  "syrup",
  "tea",
  "milk",
  "egg",
];

/** One physical item in the photo — topping/filling labels must not create duplicates */
const SINGLE_ITEM_FOODS = [
  "penne pasta",
  "pasta",
  "penne",
  "spaghetti",
  "pancake",
  "pancakes",
  "croissant",
  "macaron",
  "donut",
  "doughnut",
  "muffin",
  "bagel",
  "sandwich",
  "wrap",
  "burger",
  "hotdog",
  "hot dog",
  "roll",
  "bun",
];

/** Pastry-style single items — topping/filling variants merge (cheese vs jam on one croissant). */
const PASTRY_SINGLE_ITEM_FOODS = [
  "croissant",
  "macaron",
  "donut",
  "doughnut",
  "muffin",
  "bagel",
];

export function normalizeFoodName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentTokens(name: string): string[] {
  return normalizeFoodName(name)
    .split(" ")
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function hasPrepositionWord(name: string): boolean {
  return normalizeFoodName(name)
    .split(" ")
    .some((w) => PREPOSITION_WORDS.has(w));
}

function isSimpleLabel(name: string): boolean {
  return contentTokens(name).length <= 2 && !hasPrepositionWord(name);
}

function isSingleItemPrimary(canonical: string): boolean {
  return SINGLE_ITEM_FOODS.some(
    (single) => canonical.includes(single) || single.includes(canonical)
  );
}

function prepositionBoundary(name: string): number {
  const n = normalizeFoodName(name);
  let boundary = n.length;
  for (const word of PREPOSITION_WORDS) {
    const token = ` ${word} `;
    const idx = n.indexOf(token);
    if (idx !== -1 && idx < boundary) boundary = idx;
  }
  return boundary;
}

function isPastrySingleItem(canonical: string): boolean {
  return PASTRY_SINGLE_ITEM_FOODS.some(
    (pastry) => canonical.includes(pastry) || pastry.includes(canonical)
  );
}

function withClauseTail(name: string): string | null {
  const n = normalizeFoodName(name);
  const token = " with ";
  const idx = n.indexOf(token);
  if (idx === -1) return null;
  return n.slice(idx + token.length).trim();
}

/** Both labels name the same base but different "with …" modifiers (e.g. tomato vs meat sauce). */
function hasConflictingWithClause(a: string, b: string): boolean {
  const ta = withClauseTail(a);
  const tb = withClauseTail(b);
  if (!ta || !tb || ta === tb) return false;
  return jaccardTokenOverlap(ta, tb) < 0.55;
}

function isKnownSingleItemBase(base: string): boolean {
  return SINGLE_ITEM_FOODS.some((single) => base.includes(single) || single.includes(base));
}

export function primaryFoodToken(name: string): string | null {
  const n = normalizeFoodName(name);
  const boundary = prepositionBoundary(n);
  const matches: Array<{ base: string; index: number }> = [];

  for (const base of BASE_FOOD_TOKENS) {
    const index = n.indexOf(base);
    if (index === -1 || index >= boundary) continue;
    matches.push({ base, index });
  }

  if (matches.length) {
    const ranked = [...matches].sort((a, b) => {
      const aSingle = isKnownSingleItemBase(a.base) ? 0 : 1;
      const bSingle = isKnownSingleItemBase(b.base) ? 0 : 1;
      if (aSingle !== bSingle) return aSingle - bSingle;
      if (a.index !== b.index) return a.index - b.index;
      return b.base.length - a.base.length;
    });
    return ranked[0]!.base;
  }

  for (const base of BASE_FOOD_TOKENS) {
    const index = n.indexOf(base);
    if (index === -1) continue;
    return base;
  }

  const words = n.split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return words[0] ?? null;
}

/** Collapse inflections and disambiguate multi-name labels to one canonical primary. */
export function canonicalPrimaryToken(name: string): string | null {
  const n = normalizeFoodName(name);
  if (n.includes("syrup")) return "syrup";

  const raw = primaryFoodToken(name);
  if (!raw) return null;
  if (raw === "pancakes" || raw === "pancake" || raw === "pancake stack" || raw === "stack of pancakes") {
    return "pancake";
  }
  if (raw.startsWith("blueberr")) return "blueberr";
  if (raw.startsWith("strawberr")) return "strawberr";
  return raw;
}

function jaccardTokenOverlap(a: string, b: string): number {
  const ta = new Set(contentTokens(a));
  const tb = new Set(contentTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;

  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

/** Block cross-food merges caused by substring/preposition contamination. */
function blockedByPrepositionGuard(a: string, b: string): boolean {
  const ca = canonicalPrimaryToken(a);
  const cb = canonicalPrimaryToken(b);
  if (!ca || !cb || ca === cb) return false;
  return hasPrepositionWord(a) || hasPrepositionWord(b);
}

/** True when an "and"-joined label names two distinct foods (e.g. chicken and rice). */
function namesMultipleDistinctFoods(label: string): boolean {
  const n = normalizeFoodName(label);
  if (!n.includes(" and ")) return false;

  const parts = n.split(" and ").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return false;

  const primaries = parts
    .map((p) => canonicalPrimaryToken(p))
    .filter((p): p is string => Boolean(p));
  return new Set(primaries).size > 1;
}

export function tokenOverlap(a: string, b: string): number {
  const na = normalizeFoodName(a);
  const nb = normalizeFoodName(b);
  if (na === nb) return 1;

  const overlap = jaccardTokenOverlap(a, b);

  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (ta.length === 1 && tb.length === 1 && ta[0] === tb[0]) {
    const canonical = canonicalPrimaryToken(a);
    return canonical && isSingleItemPrimary(canonical) ? 1 : 0.3;
  }

  return overlap;
}

/** True when two labels describe the same real food item (e.g. croissant with cheese vs jam topping). */
export function isSameFoodItem(a: string, b: string): boolean {
  const na = normalizeFoodName(a);
  const nb = normalizeFoodName(b);
  if (na === nb) return true;

  const ca = canonicalPrimaryToken(a);
  const cb = canonicalPrimaryToken(b);
  if (!ca || !cb) return false;

  const tokensA = contentTokens(a);
  const tokensB = contentTokens(b);

  // Distinct placements of the same countable fruit (e.g. two strawberries in frame).
  if (
    tokensA.length === 1 &&
    tokensB.length === 1 &&
    tokensA[0] === tokensB[0] &&
    ca === cb &&
    !isSingleItemPrimary(ca)
  ) {
    return false;
  }

  if (ca === cb) {
    if (namesMultipleDistinctFoods(a) || namesMultipleDistinctFoods(b)) return false;
    if (isSingleItemPrimary(ca)) {
      if (!isPastrySingleItem(ca) && hasConflictingWithClause(a, b)) return false;
      return true;
    }
    if (isSimpleLabel(a) && isSimpleLabel(b)) return true;
    if (tokensA.length > 1 || tokensB.length > 1) return true;
  }

  if (blockedByPrepositionGuard(a, b)) return false;

  return jaccardTokenOverlap(a, b) >= 0.55;
}

const MAIN_DISH_TERMS = ["pasta", "penne", "spaghetti", "pizza", "rice", "steak", "salmon", "chicken", "burger"];

/** Full-plate entree visible in photo — allow reranker to accept with 1-model agreement if highly relevant */
export function isMainDish(foodType: string): boolean {
  const n = normalizeFoodName(foodType);
  return MAIN_DISH_TERMS.some((t) => n.includes(t));
}
