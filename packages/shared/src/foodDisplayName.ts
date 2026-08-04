import type { ResponseLanguage } from "./language";

/**
 * Display-layer food name localization.
 * Canonical DB `food_type` stays English (nutrition matching / search).
 * UI tabs use this with the user's preferredLanguage.
 */

type Pair = { he: string; ru: string };

/** Longest phrases first — do not reorder without sorting usage. */
const PHRASE_MAP: Array<[string, Pair]> = [
  ["penne pasta with tomato sauce", { he: "פנה ברוטב עגבניות", ru: "пенне в томатном соусе" }],
  ["stack of pancakes", { he: "ערימת פנקייקים", ru: "стопка блинчиков" }],
  ["pancake stack", { he: "ערימת פנקייקים", ru: "стопка блинчиков" }],
  ["grilled chicken breast", { he: "חזה עוף בגריל", ru: "куриная грудка на гриле" }],
  ["chicken breast", { he: "חזה עוף", ru: "куриная грудка" }],
  ["steamed broccoli", { he: "ברוקולי מאודה", ru: "брокколи на пару" }],
  ["brown rice", { he: "אורז מלא", ru: "коричневый рис" }],
  ["white rice", { he: "אורז לבן", ru: "белый рис" }],
  ["mixed green salad", { he: "סלט ירוק מעורב", ru: "смешанный зелёный салат" }],
  ["green salad", { he: "סלט ירוק", ru: "зелёный салат" }],
  ["cherry tomatoes", { he: "עגבניות שרי", ru: "помидоры черри" }],
  ["tomato sauce", { he: "רוטב עגבניות", ru: "томатный соус" }],
  ["penne pasta", { he: "פסטה פנה", ru: "паста пенне" }],
  ["grilled salmon", { he: "סלמון בגריל", ru: "лосось на гриле" }],
  ["olive oil", { he: "שמן זית", ru: "оливковое масло" }],
  ["hot dog", { he: "נקניקייה", ru: "хот-дог" }],
  ["ice cream", { he: "גלידה", ru: "мороженое" }],
  ["french fries", { he: "צ'יפס", ru: "картофель фри" }],
  ["mashed potatoes", { he: "פירה", ru: "картофельное пюре" }],
  ["sweet potato", { he: "בטטה", ru: "батат" }],
  ["peanut butter", { he: "חמאת בוטנים", ru: "арахисовая паста" }],
  ["orange juice", { he: "מיץ תפוזים", ru: "апельсиновый сок" }],
  ["apple juice", { he: "מיץ תפוחים", ru: "яблочный сок" }],
  ["greek yogurt", { he: "יוגורט יווני", ru: "греческий йогурт" }],
  ["cottage cheese", { he: "גבינת קוטג'", ru: "творог" }],
  ["cream cheese", { he: "גבינת שמנת", ru: "сливочный сыр" }],
  ["sour cream", { he: "שמנת חמוצה", ru: "сметана" }],
  ["whole wheat bread", { he: "לחם מלא", ru: "цельнозерновой хлеб" }],
  ["white bread", { he: "לחם לבן", ru: "белый хлеб" }],
  ["shakshuka", { he: "שקשוקה", ru: "шакшука" }],
  ["croissant", { he: "קרואסון", ru: "круассан" }],
  ["pancake", { he: "פנקייק", ru: "блинчик" }],
  ["pancakes", { he: "פנקייקים", ru: "блинчики" }],
  ["macaron", { he: "מקרון", ru: "макарон" }],
  ["spaghetti", { he: "ספגטי", ru: "спагетти" }],
  ["pasta", { he: "פסטה", ru: "паста" }],
  ["penne", { he: "פנה", ru: "пенне" }],
  ["pizza", { he: "פיצה", ru: "пицца" }],
  ["burger", { he: "המבורגר", ru: "бургер" }],
  ["hamburger", { he: "המבורגר", ru: "гамбургер" }],
  ["cheeseburger", { he: "צ'יזבורגר", ru: "чизбургер" }],
  ["sandwich", { he: "כריך", ru: "сэндвич" }],
  ["wrap", { he: "רפד", ru: "ролл" }],
  ["salad", { he: "סלט", ru: "салат" }],
  ["soup", { he: "מרק", ru: "суп" }],
  ["bread", { he: "לחם", ru: "хлеб" }],
  ["toast", { he: "טוסט", ru: "тост" }],
  ["bagel", { he: "בייגל", ru: "бейгл" }],
  ["muffin", { he: "מאפין", ru: "маффин" }],
  ["doughnut", { he: "סופגנייה", ru: "пончик" }],
  ["donut", { he: "סופגנייה", ru: "пончик" }],
  ["chicken", { he: "עוף", ru: "курица" }],
  ["beef", { he: "בקר", ru: "говядина" }],
  ["pork", { he: "חזיר", ru: "свинина" }],
  ["lamb", { he: "כבש", ru: "баранина" }],
  ["salmon", { he: "סלמון", ru: "лосось" }],
  ["tuna", { he: "טונה", ru: "тунец" }],
  ["fish", { he: "דג", ru: "рыба" }],
  ["egg", { he: "ביצה", ru: "яйцо" }],
  ["eggs", { he: "ביצים", ru: "яйца" }],
  ["cheese", { he: "גבינה", ru: "сыр" }],
  ["yogurt", { he: "יוגורט", ru: "йогурт" }],
  ["milk", { he: "חלב", ru: "молоко" }],
  ["butter", { he: "חמאה", ru: "масло" }],
  ["cream", { he: "שמנת", ru: "сливки" }],
  ["rice", { he: "אורז", ru: "рис" }],
  ["quinoa", { he: "קינואה", ru: "киноа" }],
  ["oats", { he: "שיבולת שועל", ru: "овёс" }],
  ["oatmeal", { he: "דייסת שיבולת שועל", ru: "овсянка" }],
  ["broccoli", { he: "ברוקולי", ru: "брокколи" }],
  ["spinach", { he: "תרד", ru: "шпинат" }],
  ["lettuce", { he: "חסה", ru: "салат-латук" }],
  ["cucumber", { he: "מלפפון", ru: "огурец" }],
  ["tomato", { he: "עגבנייה", ru: "помидор" }],
  ["tomatoes", { he: "עגבניות", ru: "помидоры" }],
  ["onion", { he: "בצל", ru: "лук" }],
  ["garlic", { he: "שום", ru: "чеснок" }],
  ["potato", { he: "תפוח אדמה", ru: "картофель" }],
  ["potatoes", { he: "תפוחי אדמה", ru: "картофель" }],
  ["carrot", { he: "גזר", ru: "морковь" }],
  ["apple", { he: "תפוח", ru: "яблоко" }],
  ["banana", { he: "בננה", ru: "банан" }],
  ["orange", { he: "תפוז", ru: "апельсин" }],
  ["strawberry", { he: "תות", ru: "клубника" }],
  ["strawberries", { he: "תותים", ru: "клубника" }],
  ["blueberry", { he: "אוכמניה", ru: "черника" }],
  ["blueberries", { he: "אוכמניות", ru: "черника" }],
  ["avocado", { he: "אבוקדו", ru: "авокадо" }],
  ["hummus", { he: "חומוס", ru: "хумус" }],
  ["falafel", { he: "פלאפל", ru: "фалафель" }],
  ["shawarma", { he: "שווארמה", ru: "шаурма" }],
  ["bacon", { he: "בייקון", ru: "бекон" }],
  ["sausage", { he: "נקניק", ru: "колбаса" }],
  ["ham", { he: "חזיר מעושן", ru: "ветчина" }],
  ["steak", { he: "סטייק", ru: "стейк" }],
  ["noodles", { he: "אטריות", ru: "лапша" }],
  ["couscous", { he: "קוסקוס", ru: "кус-кус" }],
  ["lentils", { he: "עדשים", ru: "чечевица" }],
  ["beans", { he: "שעועית", ru: "фасоль" }],
  ["tofu", { he: "טופו", ru: "тофу" }],
  ["nuts", { he: "אגוזים", ru: "орехи" }],
  ["almonds", { he: "שקד", ru: "миндаль" }],
  ["walnuts", { he: "אגוזי מלך", ru: "грецкие орехи" }],
  ["parsley", { he: "פטרוזיליה", ru: "петрушка" }],
  ["basil", { he: "בזיליקום", ru: "базилик" }],
  ["cilantro", { he: "כוסברה", ru: "кинза" }],
  ["herb", { he: "עשב תיבול", ru: "зелень" }],
  ["herbs", { he: "עשבי תיבול", ru: "зелень" }],
  ["syrup", { he: "סירופ", ru: "сироп" }],
  ["honey", { he: "דבש", ru: "мёд" }],
  ["sugar", { he: "סוכר", ru: "сахар" }],
  ["jam", { he: "ריבה", ru: "варенье" }],
  ["sauce", { he: "רוטב", ru: "соус" }],
  ["coffee", { he: "קפה", ru: "кофе" }],
  ["tea", { he: "תה", ru: "чай" }],
  ["water", { he: "מים", ru: "вода" }],
  ["soda", { he: "משקה מוגז", ru: "газировка" }],
  ["juice", { he: "מיץ", ru: "сок" }],
  ["wine", { he: "יין", ru: "вино" }],
  ["beer", { he: "בירה", ru: "пиво" }],
  ["chocolate", { he: "שוקולד", ru: "шоколад" }],
  ["cake", { he: "עוגה", ru: "торт" }],
  ["cookie", { he: "עוגייה", ru: "печенье" }],
  ["cookies", { he: "עוגיות", ru: "печенье" }],
  ["fries", { he: "צ'יפס", ru: "фри" }],
];

const CONNECTORS: Record<string, Pair> = {
  with: { he: "עם", ru: "с" },
  and: { he: "ו", ru: "и" },
  or: { he: "או", ru: "или" },
  of: { he: "של", ru: "из" },
  in: { he: "ב", ru: "в" },
  on: { he: "על", ru: "на" },
  the: { he: "", ru: "" },
  a: { he: "", ru: "" },
  an: { he: "", ru: "" },
};

const SORTED_PHRASES = [...PHRASE_MAP].sort((a, b) => b[0].length - a[0].length);

function pick(pair: Pair, lang: "he" | "ru"): string {
  return lang === "he" ? pair.he : pair.ru;
}

/**
 * Localize a single food label for display. English is returned unchanged.
 * Comma-separated compound titles are localized part by part.
 */
export function localizeFoodDisplayName(
  foodType: string | null | undefined,
  language: ResponseLanguage | string | null | undefined
): string {
  const raw = (foodType ?? "").trim();
  if (!raw) return "";
  const base = String(language ?? "en")
    .toLowerCase()
    .slice(0, 2);
  const lang = base === "he" || base === "ru" || base === "en" ? base : "en";
  if (lang === "en") return raw;

  // Multi-item title: "a, b, c"
  if (raw.includes(",")) {
    return raw
      .split(",")
      .map((part) => localizeFoodDisplayName(part.trim(), lang))
      .filter(Boolean)
      .join(lang === "he" ? ", " : ", ");
  }

  const lower = raw.toLowerCase().replace(/\s+/g, " ").trim();

  // Exact phrase
  for (const [en, pair] of SORTED_PHRASES) {
    if (lower === en) return pick(pair, lang);
  }

  // Greedy left-to-right longest phrase replacement on remaining text
  let remaining = lower;
  const out: string[] = [];
  while (remaining.length > 0) {
    let matched = false;
    for (const [en, pair] of SORTED_PHRASES) {
      if (remaining.startsWith(en)) {
        const next = remaining.slice(en.length);
        // Prefer word boundary after match
        if (next.length === 0 || next.startsWith(" ") || next.startsWith("-")) {
          out.push(pick(pair, lang));
          remaining = next.replace(/^\s+/, "");
          matched = true;
          break;
        }
      }
    }
    if (matched) continue;

    // One token (or skip connector)
    const space = remaining.indexOf(" ");
    const token = space === -1 ? remaining : remaining.slice(0, space);
    remaining = space === -1 ? "" : remaining.slice(space + 1);

    const conn = CONNECTORS[token];
    if (conn) {
      const c = pick(conn, lang);
      if (c) out.push(c);
      continue;
    }

    let tokenHit = false;
    for (const [en, pair] of SORTED_PHRASES) {
      if (token === en || token.replace(/s$/, "") === en || `${token}s` === en) {
        out.push(pick(pair, lang));
        tokenHit = true;
        break;
      }
    }
    if (!tokenHit) {
      // Keep unknown English token (brand/dish long-tail)
      out.push(token);
    }
  }

  const joined = out.join(" ").replace(/\s+/g, " ").trim();
  return joined || raw;
}

/** Join multiple food types into a localized meal title. */
export function localizeMealTitle(
  foodTypes: Array<string | null | undefined>,
  language: ResponseLanguage | string | null | undefined
): string {
  return foodTypes
    .map((f) => localizeFoodDisplayName(f, language))
    .filter(Boolean)
    .join(", ");
}
