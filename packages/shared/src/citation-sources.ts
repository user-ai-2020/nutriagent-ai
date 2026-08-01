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
};

export function normalizeCitationSource(raw: string): string {
  return LEGACY_ALIASES[raw] ?? raw;
}

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
