import "./loadEnv";
import express from "express";
import { prisma } from "@nutriagent/db";
import {
  ChatIntent,
  CITATION_SOURCES,
  MealImageInput,
  MultiModelMealAnalysis,
  OrchestratorRequest,
  OrchestratorResponse,
  UserProfileData,
  VisionAnalyzeResponse,
  VisionFoodItem,
  buildVisionModelVersion,
} from "@nutriagent/shared";
import {
  buildMealDescription,
  buildNoFoodDetectedResponse,
  filterRealFoodItems,
  isEmptyVisionDetection,
} from "./mealAnalysis";

const app = express();
app.use(express.json({ limit: "15mb" }));

const VISION_URL = process.env.VISION_AGENT_URL || "http://localhost:3002";
const NUTRITION_URL = process.env.NUTRITION_AGENT_URL || "http://localhost:3003";
const RAG_URL = process.env.RAG_AGENT_URL || "http://localhost:3004";
const TEXT2SQL_URL = process.env.TEXT2SQL_AGENT_URL || "http://localhost:3005";
const GRAPHDB_URL = process.env.GRAPHDB_AGENT_URL || "http://localhost:3006";

/** Keep citation pills to short titles — never full RAG article bodies. */
function citationLabel(source: string): string {
  const trimmed = source.trim();
  const sep = trimmed.indexOf(": ");
  if (sep > 0 && sep < 160 && trimmed.length - sep > 100) {
    return trimmed.slice(0, sep);
  }
  if (trimmed.length > 160) return `${trimmed.slice(0, 157)}…`;
  return trimmed;
}

function uniqueCitationSources(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = citationLabel(raw);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
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
      return "Best available result — limited model data";
    default:
      return `Reranker consensus (${model})`;
  }
}

/** Interactive chat: cap per-agent calls so the UI gets a response within ~60s. */
const CHAT_AGENT_TIMEOUT_MS = Number(process.env.CHAT_AGENT_TIMEOUT_MS || 15_000);

async function callAgent<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function callAgentWithTimeout<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${url}: ${await res.text()}`);
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`${url}: timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function classifyIntent(message: string, hasImage: boolean): ChatIntent {
  const lower = message.toLowerCase();
  if (hasImage) return "meal_analysis";
  if (lower.includes("restaurant") || lower.includes("מסעדה") || lower.includes("menu")) {
    return "restaurant_recommendation";
  }
  if (
    lower.includes("what should i eat") ||
    lower.includes("what to eat") ||
    lower.includes("eat now") ||
    lower.includes("should i eat") ||
    lower.includes("מה לאכול") ||
    lower.includes("מה כדאי") ||
    (lower.includes("recommend") && lower.includes("eat")) ||
    (lower.includes("suggest") && (lower.includes("meal") || lower.includes("eat")))
  ) {
    return "nutrition_advice";
  }
  if (
    (lower.includes("calorie") ||
      lower.includes("protein") ||
      lower.includes("חלבון") ||
      lower.includes("diet") ||
      lower.includes("תזונה")) &&
    !lower.includes("אכלתי") &&
    !lower.includes("היום") &&
    !lower.includes("שבוע") &&
    !lower.includes("week") &&
    !lower.includes("yesterday") &&
    !lower.includes("today") &&
    !lower.includes("אתמול")
  ) {
    return "nutrition_advice";
  }
  if (
    lower.includes("how many") ||
    lower.includes("history") ||
    lower.includes("average") ||
    lower.includes("היום") ||
    lower.includes("שבוע") ||
    lower.includes("כמה") ||
    lower.includes("אכלתי") ||
    lower.includes("אתמול") ||
    lower.includes("yesterday") ||
    lower.includes("today") ||
    lower.includes("גרף") ||
    lower.includes("graph") ||
    lower.includes("chart")
  ) {
    return "history_query";
  }
  return "general_chat";
}

function inferMealType(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 22) return "dinner";
  return "snack";
}

async function saveMeal(
  userId: number,
  items: Array<VisionFoodItem & { nutrition: { calories: number; protein: number; fat: number; carbs: number; sugar: number } }>,
  imageUrl?: string,
  mealImage?: MealImageInput,
  visionModelVersion?: string
): Promise<number> {
  const mealDatetime = new Date();
  const meal = await prisma.meal.create({
    data: {
      userId,
      mealDatetime,
      mealType: inferMealType(mealDatetime),
      source: "home",
      imageUrl,
      items: {
        create: items.map((item) => ({
          foodType: item.foodType,
          estimatedQuantity: item.estimatedQuantity,
          visionConfidence: item.visionConfidence,
          nutritionValues: {
            create: item.nutrition,
          },
        })),
      },
      ...(mealImage
        ? {
            images: {
              create: {
                id: mealImage.id,
                userId,
                storageKey: mealImage.storageKey,
                width: mealImage.width,
                height: mealImage.height,
                fileSizeBytes: mealImage.fileSizeBytes,
                contentHash: mealImage.contentHash,
                capturedAt: new Date(mealImage.capturedAt),
                recognizedAt: new Date(),
                visionModelVersion,
              },
            },
          }
        : {}),
    },
  });
  return meal.mealId;
}

app.get("/health", (_req, res) => res.json({ status: "ok", service: "orchestrator" }));

app.post("/process", async (req, res) => {
  try {
    const body = req.body as OrchestratorRequest & { imageUrl?: string };
    const agentPath: string[] = ["Router/Orchestrator"];
    const sources: string[] = [];
    const intent = classifyIntent(body.message, Boolean(body.imageBase64));

    type RagRetrieveResult = { context: string[]; sources: string[]; matchScore?: number };

    let ragContext: string[] = [];
    let ragSourceLabels: string[] = [];

    // nutrition_advice uses the fast retrieve+advise path below (no /query web-fallback — can exceed 90s).

    let ragResult: RagRetrieveResult = { context: [], sources: [] };
    try {
      ragResult = await callAgentWithTimeout<RagRetrieveResult>(
        `${RAG_URL}/retrieve`,
        {
          query: body.message,
          topK: 3,
          profile: body.profile,
        },
        CHAT_AGENT_TIMEOUT_MS
      );
    } catch (err) {
      console.warn("RAG retrieve failed or timed out, continuing without KB context:", err);
    }
    ragContext = ragResult.context;
    ragSourceLabels = ragResult.sources;
    if (ragSourceLabels.length) {
      agentPath.push("RAG Agent + Reranker (/retrieve — hybrid KB, no web fallback)");
      sources.push(...ragSourceLabels);
    } else {
      agentPath.push("RAG Agent (/retrieve skipped or empty — advise-only)");
    }

    if (intent === "meal_analysis" && body.imageBase64) {
      const visionResult = await callAgent<VisionAnalyzeResponse>(`${VISION_URL}/analyze`, {
        imageBase64: body.imageBase64,
        imageMime: body.imageMime,
        message: body.message,
        ragContext: ragContext,
      });
      agentPath.push("Vision Agent (Gemini 2.5 Flash)");
      agentPath.push(`Vision Reranker (${visionResult.rerankModel ?? "cohere/rerank-4-fast"})`);
      sources.push(...visionResult.modelResults.map((m) => m.modelLabel));

      if (isEmptyVisionDetection(visionResult)) {
        res.json(
          buildNoFoodDetectedResponse({
            vision: visionResult,
            ragSourceLabels: sources,
            agentPath,
            preferredLanguage: body.profile?.preferredLanguage,
          })
        );
        return;
      }

      const realRerankedItems = filterRealFoodItems(visionResult.rerankedItems);
      // Keep response panels honest: drop placeholder labels the model may invent.
      visionResult.rerankedItems = realRerankedItems;
      visionResult.modelResults = visionResult.modelResults.map((mr) => ({
        ...mr,
        items: filterRealFoodItems(mr.items),
      }));

      type NutritionCalc = {
        items: Array<VisionFoodItem & { nutrition: { calories: number; protein: number; fat: number; carbs: number; sugar: number } }>;
        totalNutrition: { calories: number; protein: number; fat: number; carbs: number; sugar: number };
        summary: string;
        sources: string[];
        warnings: string[];
      };

      async function calc(items: VisionFoodItem[]): Promise<NutritionCalc | null> {
        if (!items.length) return null;
        return callAgent<NutritionCalc>(`${NUTRITION_URL}/calculate`, {
          items,
          profile: body.profile,
          ragContext: ragContext,
        });
      }

      const panelCalcs = await Promise.all(
        visionResult.modelResults.map(async (mr) => ({
          mr,
          calc: mr.items.length ? await calc(mr.items) : null,
        }))
      );

      const rerankerCalc = await calc(visionResult.rerankedItems);
      if (!rerankerCalc) {
        throw new Error("Nutrition agent returned no data for non-empty vision items");
      }

      agentPath.push("Nutrition Agent");
      sources.push(...rerankerCalc.sources);

      const graphResult = await callAgent<{ recommendations: string[] }>(`${GRAPHDB_URL}/recommend`, {
        profile: body.profile,
        foodQuery: visionResult.rerankedItems.map((i) => i.foodType).join(", "),
      });
      agentPath.push("GraphDB Agent");
      sources.push(CITATION_SOURCES.CLINICAL_GRAPH);

      const mealId = await saveMeal(
        body.userId,
        rerankerCalc.items,
        body.imageUrl ?? body.mealImage?.displayUrl,
        body.mealImage,
        buildVisionModelVersion(visionResult)
      );

      const panels: MultiModelMealAnalysis["panels"] = panelCalcs.map(({ mr, calc: c }) => ({
        modelId: mr.modelId,
        modelLabel: mr.modelLabel,
        items: c?.items ?? [],
        totalNutrition: c?.totalNutrition ?? { calories: 0, protein: 0, fat: 0, carbs: 0, sugar: 0 },
        error: mr.error ?? (c ? undefined : "No items detected"),
      }));

      panels.push({
        modelId: "reranker",
        modelLabel: rerankerPanelLabel(visionResult),
        items: rerankerCalc.items,
        totalNutrition: rerankerCalc.totalNutrition,
      });

      const mealDescription = buildMealDescription({
        items: visionResult.rerankedItems,
        fusionMethod: visionResult.fusionMethod,
        preferredLanguage: body.profile?.preferredLanguage,
      });

      const multiModelMealAnalysis: MultiModelMealAnalysis = {
        items: rerankerCalc.items,
        totalNutrition: rerankerCalc.totalNutrition,
        summary: rerankerCalc.summary,
        mealDescription,
        sources: uniqueCitationSources(sources),
        panels,
        rerankerScores: visionResult.rerankerScores,
        rerankModel: visionResult.rerankModel,
        fusionMethod: visionResult.fusionMethod,
        fallbackModelLabel: visionResult.fallbackModelLabel,
      };

      const reply = [
        "✅ Meal analyzed by Gemini 2.5 Flash + reranker!",
        "",
        mealDescription,
        "",
        rerankerCalc.summary,
        "",
        "See Gemini detection and reranker result below.",
        "",
        ...rerankerCalc.items.map(
          (i) => `• ${i.foodType} (${i.estimatedQuantity}): ${i.nutrition.calories} kcal`
        ),
        "",
        ...(rerankerCalc.warnings.length ? rerankerCalc.warnings.map((w) => `⚠️ ${w}`) : []),
        ...(graphResult.recommendations.length
          ? ["", "Clinical notes:", ...graphResult.recommendations.map((r) => `• ${r}`)]
          : []),
      ].join("\n");

      const response: OrchestratorResponse = {
        intent,
        reply,
        mealId,
        mealAnalysis: {
          items: rerankerCalc.items,
          totalNutrition: rerankerCalc.totalNutrition,
          sources: uniqueCitationSources(sources),
          summary: rerankerCalc.summary,
        },
        multiModelMealAnalysis,
        sources: uniqueCitationSources(sources),
        agentPath,
      };
      res.json(response);
      return;
    }

    if (intent === "history_query") {
      const historyResult = await callAgent<{ answer: string; rowCount: number }>(`${TEXT2SQL_URL}/query`, {
        userId: body.userId,
        question: body.message,
        preferredLanguage: body.profile?.preferredLanguage,
      });
      agentPath.push("Text2SQL Agent");

      res.json({
        intent,
        reply: historyResult.answer,
        sources: uniqueCitationSources([CITATION_SOURCES.MEAL_HISTORY, ...sources]),
        agentPath,
      } satisfies OrchestratorResponse);
      return;
    }

    const graphResult = await callAgent<{ recommendations: string[]; safeFoods: string[] }>(
      `${GRAPHDB_URL}/recommend`,
      { profile: body.profile, foodQuery: body.message }
    );
    agentPath.push("GraphDB Agent");

    const adviceResult = await callAgent<{ reply: string; sources: string[] }>(`${NUTRITION_URL}/advise`, {
      message: body.message,
      profile: body.profile,
      context: [...ragContext, ...graphResult.recommendations],
    });
    agentPath.push("Nutrition Agent");
    sources.push(...adviceResult.sources);

    const reply = [
      adviceResult.reply,
      "",
      ...(graphResult.recommendations.length
        ? ["Safe choices based on your profile:", ...graphResult.recommendations.map((r) => `• ${r}`)]
        : []),
    ].join("\n");

    res.json({
      intent,
      reply,
      sources: uniqueCitationSources([...sources, CITATION_SOURCES.CLINICAL_GRAPH]),
      agentPath,
    } satisfies OrchestratorResponse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Orchestrator error" });
  }
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => console.log(`Orchestrator on http://localhost:${PORT}`));
