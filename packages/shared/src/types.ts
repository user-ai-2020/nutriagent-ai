export type UserRole = "User" | "Admin";

export interface JwtPayload {
  userId: number;
  email: string;
  role: UserRole;
}

export interface AuthUser {
  userId: number;
  email: string;
  name: string;
  role: UserRole;
}

export interface DietGoals {
  dailyCalories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
}

export interface UserProfileData {
  dietGoals: DietGoals;
  healthRestrictions: string[];
  allergies: string[];
  dietType?: string;
  weight?: number;
  height?: number;
  age?: number;
  /** Override auto language detection: `he` | `en` */
  preferredLanguage?: "he" | "en" | "ru";
}

export interface VisionFoodItem {
  foodType: string;
  estimatedQuantity: string;
  visionConfidence: number;
}

export interface MealImageInput {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  contentHash: string;
  capturedAt: string;
  displayUrl: string;
}

export interface NutritionData {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  sugar: number;
}

export type CitationSource = string | { title: string; url: string };

export interface MealAnalysisResult {
  items: Array<VisionFoodItem & { nutrition: NutritionData }>;
  totalNutrition: NutritionData;
  sources: CitationSource[];
  summary: string;
}

export interface RerankerFoodScore {
  foodType: string;
  estimatedQuantity: string;
  score: number;
  modelAgreement: number;
  avgConfidence: number;
}

export type FusionMethod =
  | "full"
  | "cluster_no_rerank"
  | "single_model_only"
  | "single_model_fallback"
  | "empty_pool_fallback";

export interface RerankerFusionTrace {
  pathFired: "A" | "B" | "C";
  fusionMethod: FusionMethod;
  reason: string;
  details: {
    cohereCalled: boolean;
    cohereFailed: boolean;
    cohereHitCount: number;
    cohereHitsAboveThreshold: number;
    candidatesTotal: number;
    mergeLoopAccepted: number;
    mergeLoopRejected: {
      belowRelevance: number;
      belowAgreement: number;
      duplicate: number;
      drinkCap: number;
    };
    singleModelFallbackModelId?: string;
    singleModelFallbackReason?: string;
  };
}

export interface VisionModelResult {
  modelId: string;
  modelLabel: string;
  items: VisionFoodItem[];
  error?: string;
}

export interface ModelMealPanel {
  modelId: string;
  modelLabel: string;
  items: Array<VisionFoodItem & { nutrition: NutritionData }>;
  totalNutrition: NutritionData;
  error?: string;
}

export interface MultiModelMealAnalysis {
  items: Array<VisionFoodItem & { nutrition: NutritionData }>;
  totalNutrition: NutritionData;
  summary: string;
  /** Short natural-language read of what vision detected in the photo. */
  mealDescription?: string;
  sources: CitationSource[];
  panels: ModelMealPanel[];
  rerankerScores: RerankerFoodScore[];
  rerankModel?: string;
  fusionMethod?: FusionMethod;
  fallbackModelLabel?: string;
  /** Stored meal photo, so a chat reopened from history can show its thumbnail. */
  imageUrl?: string;
  /** Nutrition-agent caveats (e.g. wide spread between models). */
  warnings?: string[];
  /** Clinical-graph safety tips for this meal. */
  tips?: string[];
}

export interface VisionAnalyzeResponse {
  modelResults: VisionModelResult[];
  rerankedItems: VisionFoodItem[];
  rerankerScores: RerankerFoodScore[];
  rerankModel?: string;
  fusionMethod?: FusionMethod;
  fallbackModelId?: string;
  fallbackModelLabel?: string;
}

export type ChatIntent =
  | "meal_analysis"
  | "nutrition_advice"
  | "restaurant_recommendation"
  | "history_query"
  | "question"
  | "general_chat";

export interface OrchestratorRequest {
  userId: number;
  message: string;
  imageBase64?: string;
  imageMime?: string;
  mealId?: number;
  profile?: UserProfileData;
  mealImage?: MealImageInput;
}

export interface OrchestratorResponse {
  intent: ChatIntent;
  reply: string;
  /** False when vision/reranker found no food items — no meal is saved. */
  itemsDetected?: boolean;
  mealAnalysis?: MealAnalysisResult;
  multiModelMealAnalysis?: MultiModelMealAnalysis;
  mealId?: number;
  nutritionHistory?: NutritionHistoryResult;
  sources: CitationSource[];
  agentPath: string[];
}

export interface NutritionHistoryMeal {
  mealId: number;
  datetime: string;
  mealType: string;
  items: string[];
  nutrition: NutritionData;
}

export interface NutritionHistoryResult {
  period: "today" | "last_7_days" | "30_day_average" | "recent";
  mealCount: number;
  totals: NutritionData;
  meals?: NutritionHistoryMeal[];
  dailyBreakdown?: Array<{
    date: string;
    label: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  }>;
  avgDailyCalories?: number;
}

export interface AuditLogEntry {
  logId?: number;
  userId?: number;
  actionType: string;
  details?: Record<string, unknown>;
  sourceIp?: string;
  timestamp: string;
}

export interface DashboardStats {
  period: "day" | "week" | "month";
  totals: NutritionData;
  goals: DietGoals;
  dailyBreakdown: Array<{
    date: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  }>;
  macroPercentages: {
    protein: number;
    fat: number;
    carbs: number;
  };
}
