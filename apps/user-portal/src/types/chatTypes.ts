export interface Nutrition {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  sugar: number;
}

export interface MealAnalysis {
  items: Array<{ foodType: string; estimatedQuantity: string; visionConfidence: number }>;
  totalNutrition: Nutrition;
}

import { CitationSource } from "@nutriagent/shared";
import { NutritionHistoryData } from "@/components/NutritionHistoryChart";

export type Msg =
  | { kind: "text"; from: "user" | "agent"; text: string }
  | { kind: "image"; from: "user"; url: string }
  | { kind: "typing" }
  | { kind: "rag"; text: string; sources: CitationSource[] }
  | {
      kind: "card";
      mealName: string;
      analysis: MealAnalysis;
      recommendation?: string;
      matchPct: number;
    }
  | { kind: "history"; text: string; data: NutritionHistoryData; sources?: CitationSource[] }
  | {
      kind: "multiModel";
      text: string;
      mealDescription?: string;
      panels: Array<{
        modelId: string;
        modelLabel: string;
        items: Array<{ foodType: string; estimatedQuantity: string; visionConfidence: number; nutrition: Nutrition }>;
        totalNutrition: Nutrition;
        error?: string;
      }>;
      rerankerScores: Array<{
        foodType: string;
        estimatedQuantity: string;
        score: number;
        modelAgreement: number;
        avgConfidence: number;
      }>;
      fusionMethod?: "full" | "cluster_no_rerank" | "single_model_only" | "single_model_fallback" | "empty_pool_fallback";
      fallbackModelLabel?: string;
      sources?: CitationSource[];
    };
