import {
  FusionMethod,
  MultiModelMealAnalysis,
  OrchestratorResponse,
  UserProfileData,
  VisionAnalyzeResponse,
  VisionFoodItem,
  VisionModelResult,
} from "@nutriagent/shared";
import { enTranslations, heTranslations, ruTranslations } from "@nutriagent/shared";

const ZERO_NUTRITION = { calories: 0, protein: 0, fat: 0, carbs: 0, sugar: 0 };

/** Labels that mean "no real food was identified" — must never be saved as meal items. */
const PLACEHOLDER_FOOD_RE =
  /^(nothing|none|n\/?a|unknown|item|null|undefined|empty|no food(?: items?)?(?:\s+visible)?|unidentifiable(?:\s+or\s+no\s+food(?:\s+visible)?)?|no items?(?:\s+detected)?)$/i;

export function isPlaceholderFoodType(foodType: string | null | undefined): boolean {
  const t = (foodType ?? "").trim();
  if (!t) return true;
  return PLACEHOLDER_FOOD_RE.test(t);
}

export function filterRealFoodItems<T extends { foodType: string }>(items: T[]): T[] {
  return items.filter((item) => !isPlaceholderFoodType(item.foodType));
}

function uiStrings(preferredLanguage?: UserProfileData["preferredLanguage"]) {
  if (preferredLanguage === "he") return heTranslations;
  if (preferredLanguage === "ru") return ruTranslations;
  return enTranslations;
}

/** True when reranker fusion produced no real food items (valid empty detection, not a crash). */
export function isEmptyVisionDetection(vision: VisionAnalyzeResponse): boolean {
  return filterRealFoodItems(vision.rerankedItems).length === 0;
}

export function noFoodDetectedMessage(preferredLanguage?: UserProfileData["preferredLanguage"]): string {
  return uiStrings(preferredLanguage).chat.noFoodDetected;
}

function formatDetectedItems(items: VisionFoodItem[]): string {
  return items.map((item) => `${item.foodType} (${item.estimatedQuantity})`).join(", ");
}

/** Brief chat-friendly explanation of fused vision results. */
export function buildMealDescription(params: {
  items: VisionFoodItem[];
  fusionMethod?: FusionMethod;
  preferredLanguage?: UserProfileData["preferredLanguage"];
}): string {
  const { items, fusionMethod, preferredLanguage } = params;
  if (!items.length) return "";

  const strings = uiStrings(preferredLanguage);
  const itemList = formatDetectedItems(items);
  const lines = [
    items.length === 1
      ? strings.chat.mealDescriptionSingle.replace("{{items}}", itemList)
      : strings.chat.mealDescriptionMultiple
          .replace("{{count}}", String(items.length))
          .replace("{{items}}", itemList),
  ];

  if (fusionMethod === "single_model_fallback") {
    lines.push(strings.chat.mealDescriptionDisagreement);
  }

  return lines.join("\n");
}

function rerankerPanelLabel(visionResult: VisionAnalyzeResponse): string {
  const model = visionResult.rerankModel ?? "cohere/rerank-4-fast";
  switch (visionResult.fusionMethod) {
    case "single_model_only":
      return `Reranker consensus (${model})`;
    case "single_model_fallback":
      return `Consensus unavailable — showing ${visionResult.fallbackModelLabel ?? "one model"}`;
    case "cluster_no_rerank":
      return "Reranker result (Cohere unavailable)";
    case "empty_pool_fallback":
      return "No food items detected";
    default:
      return `Reranker consensus (${model})`;
  }
}

function panelError(mr: VisionModelResult): string {
  return mr.error ?? "No items detected";
}

export function buildEmptyVisionPanels(vision: VisionAnalyzeResponse): MultiModelMealAnalysis["panels"] {
  const panels: MultiModelMealAnalysis["panels"] = vision.modelResults.map((mr) => ({
    modelId: mr.modelId,
    modelLabel: mr.modelLabel,
    items: [],
    totalNutrition: { ...ZERO_NUTRITION },
    error: panelError(mr),
  }));

  panels.push({
    modelId: "reranker",
    modelLabel: rerankerPanelLabel(vision),
    items: [],
    totalNutrition: { ...ZERO_NUTRITION },
    error: "No items detected",
  });

  return panels;
}

export function buildNoFoodDetectedResponse(params: {
  vision: VisionAnalyzeResponse;
  ragSourceLabels: string[];
  agentPath: string[];
  preferredLanguage?: UserProfileData["preferredLanguage"];
}): OrchestratorResponse {
  const { vision, ragSourceLabels, agentPath, preferredLanguage } = params;
  const sources = [...new Set(ragSourceLabels)];
  const panels = buildEmptyVisionPanels(vision);

  const multiModelMealAnalysis: MultiModelMealAnalysis = {
    items: [],
    totalNutrition: { ...ZERO_NUTRITION },
    summary: noFoodDetectedMessage(preferredLanguage),
    sources,
    panels,
    rerankerScores: vision.rerankerScores,
    rerankModel: vision.rerankModel,
    fusionMethod: vision.fusionMethod,
    fallbackModelLabel: vision.fallbackModelLabel,
  };

  return {
    intent: "meal_analysis",
    itemsDetected: false,
    reply: noFoodDetectedMessage(preferredLanguage),
    multiModelMealAnalysis,
    sources,
    agentPath,
  };
}
