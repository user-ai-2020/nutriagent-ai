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

// Type-only + subpath: keeps the server-only barrel out of the client bundle.
import type { CitationSource } from "@nutriagent/shared/types";
import { NutritionHistoryData } from "@/components/NutritionHistoryChart";

export type Msg =
  | { kind: "text"; from: "user" | "agent"; text: string; messageId?: number }
  | { kind: "image"; from: "user"; url: string }
  | { kind: "typing" }
  | { kind: "rag"; text: string; sources: CitationSource[]; messageId?: number }
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
      /** Structured payload used to re-render this message in the active language
       *  instead of showing `text`, which is frozen in the original language. */
      items?: Array<{ foodType: string; estimatedQuantity: string; nutrition?: Nutrition }>;
      totalNutrition?: Nutrition;
      warnings?: string[];
      tips?: string[];
      /** Meal photo, so a chat reopened from history still shows its thumbnail. */
      imageUrl?: string;
      /** Sample vision path — scan did not use live OpenRouter. */
      visionUsedMock?: boolean;
    };
