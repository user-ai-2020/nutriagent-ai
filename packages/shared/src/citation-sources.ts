/** Stable citation IDs returned by agents and shown as chat source pills. */
export const CITATION_SOURCES = {
  USER_PROFILE: "user-profile",
  RAG_KB: "rag-knowledge-base",
  DRI_WHO: "dri-who",
  CLINICAL_GRAPH: "clinical-knowledge-graph",
  ISRAEL_FOOD_UNION: "israel-food-union",
  MEAL_HISTORY: "postgres-meal-history",
  NUTRITION_DB: "nutrition-database",
} as const;

const LEGACY_ALIASES: Record<string, string> = {
  "user-profile": CITATION_SOURCES.USER_PROFILE,
  "RAG knowledge base": CITATION_SOURCES.RAG_KB,
  "DRI/WHO": CITATION_SOURCES.DRI_WHO,
  "DRI/WHO guidelines": CITATION_SOURCES.DRI_WHO,
  "clinical-knowledge-graph": CITATION_SOURCES.CLINICAL_GRAPH,
  "nutrition-database": CITATION_SOURCES.NUTRITION_DB,
  "postgres-meal-history": CITATION_SOURCES.MEAL_HISTORY,
  "israel-food-union": CITATION_SOURCES.ISRAEL_FOOD_UNION,
};

/** Default public URLs for known citation IDs (user can open the source). */
export const CITATION_SOURCE_URLS: Record<string, string> = {
  [CITATION_SOURCES.ISRAEL_FOOD_UNION]:
    "https://www.health.gov.il/Subjects/FoodAndNutrition/Nutrition/Adequate_nutrition/Pages/default.aspx",
  [CITATION_SOURCES.DRI_WHO]: "https://www.who.int/news-room/fact-sheets/detail/healthy-diet",
  [CITATION_SOURCES.USER_PROFILE]: "",
  [CITATION_SOURCES.RAG_KB]: "",
  [CITATION_SOURCES.CLINICAL_GRAPH]: "",
  [CITATION_SOURCES.MEAL_HISTORY]: "",
  [CITATION_SOURCES.NUTRITION_DB]: "https://fdc.nal.usda.gov/",
};

/** i18n key suffix under `chat.sourceLabels.*` */
export const CITATION_SOURCE_I18N_KEY: Record<string, string> = {
  [CITATION_SOURCES.USER_PROFILE]: "userProfile",
  [CITATION_SOURCES.RAG_KB]: "ragKnowledgeBase",
  [CITATION_SOURCES.DRI_WHO]: "driWho",
  [CITATION_SOURCES.CLINICAL_GRAPH]: "clinicalGraph",
  [CITATION_SOURCES.ISRAEL_FOOD_UNION]: "israelFoodUnion",
  [CITATION_SOURCES.MEAL_HISTORY]: "mealHistory",
  [CITATION_SOURCES.NUTRITION_DB]: "nutritionDatabase",
};

/**
 * Map free-text document titles (any language) → stable citation id so the UI
 * can show a localized label + default URL (seed docs often lack source_url).
 */
const TITLE_TO_CITATION: Array<{ match: RegExp; id: string; titleKey?: string }> = [
  {
    match: /ארוחות\s*ביניים|balanced\s+(mid-?meal|snack)|איחוד\s*המזון|משרד\s*הבריאות|food\s*union|ministry\s*of\s*health/i,
    id: CITATION_SOURCES.ISRAEL_FOOD_UNION,
    titleKey: "balancedSnacksMoh",
  },
  {
    match: /balanced\s+diet\s+guidelines|DRI\s*\/?\s*WHO|WHO\/DRI|healthy\s+diet.*WHO/i,
    id: CITATION_SOURCES.DRI_WHO,
  },
  {
    match: /clinical\s+knowledge|גרף\s*ידע\s*קליני|клиническ/i,
    id: CITATION_SOURCES.CLINICAL_GRAPH,
  },
  {
    match: /meal\s+history|היסטוריית\s*ארוחות|истори(я|и)\s*при(ё|е)мов/i,
    id: CITATION_SOURCES.MEAL_HISTORY,
  },
  {
    match: /nutrition\s+database|מאגר\s*תזונה|база\s*данных\s*о\s*питании|USDA|FoodData/i,
    id: CITATION_SOURCES.NUTRITION_DB,
  },
];

export function normalizeCitationSource(raw: string): string {
  return LEGACY_ALIASES[raw] ?? raw;
}

/** Resolve free-text title or id string to a known citation id if possible. */
export function matchCitationId(raw: string): string | null {
  const normalized = normalizeCitationSource(raw.trim());
  if (CITATION_SOURCE_I18N_KEY[normalized]) return normalized;
  for (const row of TITLE_TO_CITATION) {
    if (row.match.test(raw)) return row.id;
  }
  return null;
}

function titleSpecificI18nKey(raw: string): string | null {
  for (const row of TITLE_TO_CITATION) {
    if (row.titleKey && row.match.test(raw)) return row.titleKey;
  }
  return null;
}

export type ResolvedCitation = { label: string; url?: string };

/**
 * Turn a citation (id string or { title, url }) into a UI label in the user's
 * language, with a clickable URL when one is known.
 */
export function resolveCitationDisplay(
  src: string | { title?: unknown; url?: unknown } | null | undefined,
  t: (key: string) => string
): ResolvedCitation {
  if (src == null) return { label: "" };

  if (typeof src === "object") {
    const rawTitle = typeof src.title === "string" ? src.title.trim() : "";
    const rawUrl = typeof src.url === "string" && src.url.trim() ? src.url.trim() : "";
    const titleKey = rawTitle ? titleSpecificI18nKey(rawTitle) : null;
    const id = rawTitle ? matchCitationId(rawTitle) : null;
    let label = rawTitle;
    if (titleKey) {
      label = t(`chat.sourceLabels.${titleKey}`);
    } else if (id && CITATION_SOURCE_I18N_KEY[id]) {
      label = t(`chat.sourceLabels.${CITATION_SOURCE_I18N_KEY[id]}`);
    }
    if (!label && rawUrl) label = rawUrl;
    const url = rawUrl || (id ? CITATION_SOURCE_URLS[id] || undefined : undefined) || undefined;
    return { label: label || "", url: url || undefined };
  }

  if (typeof src !== "string") return { label: String(src ?? "") };

  const titleKey = titleSpecificI18nKey(src);
  if (titleKey) {
    const id = matchCitationId(src);
    return {
      label: t(`chat.sourceLabels.${titleKey}`),
      url: (id && CITATION_SOURCE_URLS[id]) || undefined,
    };
  }

  const id = matchCitationId(src) ?? normalizeCitationSource(src);
  const i18nKey = CITATION_SOURCE_I18N_KEY[id];
  const label = i18nKey ? t(`chat.sourceLabels.${i18nKey}`) : src;
  const url = CITATION_SOURCE_URLS[id] || undefined;
  return { label, url: url || undefined };
}
