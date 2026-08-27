import { Annotation, StateGraph, END, START, interrupt, Command } from "@langchain/langgraph";
import {
  ChatIntent,
  CITATION_SOURCES,
  MultiModelMealAnalysis,
  OrchestratorRequest,
  OrchestratorResponse,
  VisionAnalyzeResponse,
  VisionFoodItem,
  openRouterEmbed,
  openRouterChat,
  outOfScopeReply,
  resolveResponseLanguage,
  responseLanguageInstruction,
  scopeGuardrailInstruction,
  isClearlyOutOfScope,
  isScopeRefusalReply,
} from "@nutriagent/shared";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from "pg";
import {
  callAgentWithTimeout,
  CHAT_AGENT_TIMEOUT_MS,
  classifyIntent,
  GRAPHDB_URL,
  isObjectiveFact,
  NUTRITION_URL,
  RAG_URL,
  saveMeal,
  TEXT2SQL_URL,
  uniqueCitationSources,
  VISION_URL,
  rerankerPanelLabel,
} from "./utils";
import { buildMealDescription, buildNoFoodDetectedResponse, filterRealFoodItems, isEmptyVisionDetection } from "./mealAnalysis";
import { buildVisionModelVersion } from "@nutriagent/shared";
import { prisma, getCachedLlmSettings } from "@nutriagent/db";

type NutritionCalc = {
  items: Array<VisionFoodItem & { nutrition: { calories: number; protein: number; fat: number; carbs: number; sugar: number } }>;
  totalNutrition: { calories: number; protein: number; fat: number; carbs: number; sugar: number };
  summary: string;
  sources: string[];
  warnings: string[];
};

type RagRetrieveResult = { context: string[]; sources: string[]; matchScore?: number };

/**
 * Below this top-item vision confidence the meal photo is treated as ambiguous and
 * the graph interrupts to ask the user a clarifying question (spec: "confidence < 40%").
 */
const VISION_CLARIFY_CONFIDENCE = Number(process.env.VISION_CLARIFY_CONFIDENCE ?? 0.4);

export const OrchestratorState = Annotation.Root({
  request: Annotation<OrchestratorRequest & { imageUrl?: string; imageMime?: string; imageBase64?: string }>(),
  intent: Annotation<ChatIntent>(),
  agentPath: Annotation<string[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => ["Router/Orchestrator"],
  }),
  sources: Annotation<string[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
  }),
  ragResult: Annotation<RagRetrieveResult>(),
  visionResult: Annotation<VisionAnalyzeResponse>(),
  rerankerCalc: Annotation<NutritionCalc>(),
  panelCalcs: Annotation<Array<{ mr: any; calc: NutritionCalc | null }>>(),
  graphRecommendations: Annotation<string[]>(),
  mealId: Annotation<number>(),
  questionEmbedding: Annotation<number[]>(),
  actionLogId: Annotation<number>(),
  response: Annotation<OrchestratorResponse>(),
});

async function classifyIntentNode(state: typeof OrchestratorState.State) {
  console.log("classifyIntentNode start");
  const intent = classifyIntent(state.request.message, Boolean(state.request.imageBase64));
  return { intent };
}

async function outOfScopeNode(state: typeof OrchestratorState.State) {
  const lang = resolveResponseLanguage(
    state.request.message,
    state.request.profile?.preferredLanguage ?? null
  );
  const response: OrchestratorResponse = {
    intent: "out_of_scope",
    reply: outOfScopeReply(lang),
    sources: [],
    agentPath: ["Scope Guardrail"],
  };
  return { response, agentPath: ["Scope Guardrail"] };
}

async function enforceChatCapNode(state: typeof OrchestratorState.State) {
  console.log("enforceChatCapNode start");
  if (!state.request.userId) return {};
  
  const sessions = await prisma.chatSession.findMany({
    where: { userId: state.request.userId },
    orderBy: { createdAt: "asc" },
  });
  
  if (sessions.length > 5) {
    const toDelete = sessions.slice(0, sessions.length - 5);
    for (const session of toDelete) {
      await prisma.chatSession.delete({ where: { id: session.id } });
    }
  }
  
  return {};
}

const createUserActionLogNode = async (state: typeof OrchestratorState.State) => {
  console.log("createUserActionLogNode start");
  const log = await prisma.userActionLog.create({
    data: {
      userId: state.request.userId,
      actionType: "ORCHESTRATOR_GRAPH_EXECUTION",
      status: "pending",
      requestSummary: {
        message: state.request.message,
        hasImage: !!state.request.imageBase64,
        mealId: state.request.mealId,
      },
    },
  });
  return { actionLogId: log.id };
};

const finishUserActionLogNode = async (state: typeof OrchestratorState.State) => {
  if (state.actionLogId) {
    await prisma.userActionLog.update({
      where: { id: state.actionLogId },
      data: { status: "completed" },
    });
  }
  return {};
};

// ---------------------------------------------------------------------------
// BRANCH 1: QUESTION (Fact Lookup)
// ---------------------------------------------------------------------------

async function questionEmbedNode(state: typeof OrchestratorState.State) {
  const settings = await getCachedLlmSettings();
  const [embedding] = await openRouterEmbed({
    input: state.request.message,
    apiKey: settings.openRouterApiKey,
  });
  return { questionEmbedding: embedding };
}

async function questionCacheCheckNode(state: typeof OrchestratorState.State) {
  if (!state.questionEmbedding) return {};

  const embeddingLiteral = `[${state.questionEmbedding.join(",")}]`;

  const matches = await prisma.$queryRaw<Array<{ answer: string; similarity: number }>>`
    SELECT answer, 1 - (embedding <=> ${embeddingLiteral}::vector) AS similarity
    FROM cached_answers
    WHERE user_id IS NULL OR user_id = ${state.request.userId || null}
    ORDER BY embedding <=> ${embeddingLiteral}::vector
    LIMIT 1;
  `;

  if (matches.length > 0 && matches[0].similarity > 0.85) {
    const response: OrchestratorResponse = {
      intent: state.intent,
      reply: matches[0].answer,
      sources: ["Cache"],
      agentPath: state.agentPath.concat(["Router (Cache Hit)"]),
    };
    return { response, agentPath: ["Router (Cache Hit)"] };
  }

  return { agentPath: ["Router (Cache Miss)"] };
}

async function questionSearchNode(state: typeof OrchestratorState.State) {
  const [ragResult, graphResult] = await Promise.all([
    callAgentWithTimeout<RagRetrieveResult>(
      `${RAG_URL}/retrieve`,
      {
        query: state.request.message,
        topK: 3,
        profile: state.request.profile,
        enableWebFallback: true,
      },
      CHAT_AGENT_TIMEOUT_MS
    ).catch((err) => {
      console.warn("Question: RAG retrieve failed:", err);
      return { context: [], sources: [] };
    }),
    callAgentWithTimeout<{ recommendations: string[]; safeFoods: string[] }>(
      `${GRAPHDB_URL}/recommend`,
      {
        foodQuery: state.request.message,
        profile: state.request.profile,
      },
      CHAT_AGENT_TIMEOUT_MS
    ).catch((err) => {
      console.warn("Question: GraphDB recommend failed:", err);
      return { recommendations: [], safeFoods: [] };
    }),
  ]);

  const sourcesUpdate = [...ragResult.sources];
  if (graphResult.recommendations.length > 0) {
    sourcesUpdate.push(CITATION_SOURCES.CLINICAL_GRAPH);
  }

  return {
    ragResult,
    graphRecommendations: graphResult.recommendations,
    sources: sourcesUpdate,
    agentPath: ["Web Search", "GraphDB Lookup"],
  };
}

export async function questionRagNode(state: typeof OrchestratorState.State) {
  const settings = await getCachedLlmSettings();
  const contextText = [
    ...state.ragResult.context,
    ...(state.graphRecommendations.length > 0 ? ["Clinical DB matches:", ...state.graphRecommendations] : []),
  ].join("\n\n");

  const lang = resolveResponseLanguage(state.request.message, state.request.profile?.preferredLanguage ?? null);
  const systemPrompt = `You are an objective nutrition and health assistant. 
${scopeGuardrailInstruction()}
Answer the user's factual question based ONLY on the provided context. 
If the context contains no relevant information, state that you do not have enough information to answer. 
Always cite sources inline (e.g., "According to [Source Title], ...").
${responseLanguageInstruction(lang)}`;

  const userPrompt = `Context:\n${contextText}\n\nQuestion: ${state.request.message}`;

  let reply = await openRouterChat({
    apiKey: settings.openRouterApiKey,
    model: settings.ragModel || "openai/gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const refused =
    isClearlyOutOfScope(state.request.message) || isScopeRefusalReply(reply || "");

  // Post-generation claim verification: prompt-level + pattern-matching check
  // This catches "no citations at all" for substantive answers, but does NOT do deep semantic fact-checking
  // (i.e. it doesn't catch "cited but subtly wrong"). Skip for scope refusals — they are not claims.
  const isSubstantive = reply && reply.length > 100;
  const hasCitations = reply && reply.includes("[");

  if (!refused && isSubstantive && !hasCitations) {
    const retryPrompt = "Your previous answer did not include inline citations. Rewrite it, citing the specific source for each factual claim, or state that you don't have enough information.";
    reply = await openRouterChat({
      apiKey: settings.openRouterApiKey,
      model: settings.ragModel || "openai/gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
        { role: "assistant", content: reply! },
        { role: "user", content: retryPrompt }
      ],
    });

    if (reply && reply.length > 100 && !reply.includes("[")) {
      reply += "\n\nNote: this answer could not be fully verified against sources.";
    }
  }

  const response: OrchestratorResponse = {
    intent: refused ? "out_of_scope" : state.intent,
    reply: reply || "I could not generate an answer.",
    sources: refused ? [] : uniqueCitationSources(state.sources),
    agentPath: state.agentPath.concat([refused ? "Scope Guardrail" : "RAG Generator"]),
  };

  return { response, agentPath: [refused ? "Scope Guardrail" : "RAG Generator"] };
}

async function questionCacheSaveNode(state: typeof OrchestratorState.State) {
  if (state.response?.intent === "out_of_scope" || isScopeRefusalReply(state.response?.reply || "")) {
    return {};
  }
  if (state.questionEmbedding && state.response?.reply) {
    // Use safer-by-default scoping: only cache globally (userId=null) when the
    // question clearly matches an objective-fact pattern. See isObjectiveFact()
    // in utils.ts for the full rationale and allowlist.
    const userId = isObjectiveFact(state.request.message)
      ? null
      : (state.request.userId || null);

    // If we can't determine a valid userId for a non-objective query, skip
    // caching rather than falling back to null (which would expose it globally).
    if (!isObjectiveFact(state.request.message) && !state.request.userId) {
      return {};
    }

    try {
      const embeddingLiteral = `[${state.questionEmbedding.join(",")}]`;
      await prisma.$executeRaw`
        INSERT INTO cached_answers (user_id, question, answer, embedding)
        VALUES (
          ${userId},
          ${state.request.message},
          ${state.response.reply},
          ${embeddingLiteral}::vector
        );
      `;
    } catch (err) {
      console.warn("Failed to save to cached_answers", err);
    }
  }
  return {};
}


// ---------------------------------------------------------------------------
// BRANCH 2: VISION (Meal Analysis)
// ---------------------------------------------------------------------------

async function visionAnalyzeNode(state: typeof OrchestratorState.State) {
  console.log("visionAnalyzeNode start");
  const visionResult = await callAgentWithTimeout<VisionAnalyzeResponse>(
    `${VISION_URL}/analyze`,
    {
      imageBase64: state.request.imageBase64,
      imageMime: state.request.imageMime,
      message: state.request.message,
      ragContext: [], // Not using RAG in vision branch for now
    },
    CHAT_AGENT_TIMEOUT_MS
  );
  
  const agentPathUpdate = [
    "Vision Agent (Gemini 2.5 Flash)",
    `Vision Reranker (${visionResult.rerankModel ?? "cohere/rerank-4-fast"})`
  ];
  
  const sourcesUpdate = visionResult.modelResults.map((m) => m.modelLabel);
  
  if (isEmptyVisionDetection(visionResult)) {
    const response = buildNoFoodDetectedResponse({
      vision: visionResult,
      ragSourceLabels: state.sources.concat(sourcesUpdate),
      agentPath: state.agentPath.concat(agentPathUpdate),
      preferredLanguage: state.request.profile?.preferredLanguage,
    });
    return { visionResult, agentPath: agentPathUpdate, sources: sourcesUpdate, response };
  }
  
  const realRerankedItems = filterRealFoodItems(visionResult.rerankedItems);
  visionResult.rerankedItems = realRerankedItems;
  visionResult.modelResults = visionResult.modelResults.map((mr) => ({
    ...mr,
    items: filterRealFoodItems(mr.items),
  }));
  
  return { visionResult, agentPath: agentPathUpdate, sources: sourcesUpdate };
}

export async function visionClusterCheckNode(
  state: typeof OrchestratorState.State
) {
  const { rerankedItems } = state.visionResult;
  if (!rerankedItems || rerankedItems.length === 0) return {};

  const topConfidence = rerankedItems[0].visionConfidence ?? 1.0;
  const isLowConfidence = topConfidence < VISION_CLARIFY_CONFIDENCE;

  // Only genuinely uncertain photos pause to ask. A previous `rerankedItems.length >= 2`
  // trigger fired on almost every real photo (a plate virtually always has 2+ items),
  // so every meal stopped for a clarifying question before showing any analysis.
  // A crowded plate is not the same as an ambiguous one — the spec's trigger is
  // "2+ distinct meals", which item count does not measure. Set
  // VISION_CLARIFY_MAX_ITEMS to re-enable an item-count trigger for busy photos.
  const maxItems = Number(process.env.VISION_CLARIFY_MAX_ITEMS ?? 0);
  const hasTooManyItems = maxItems > 0 && rerankedItems.length >= maxItems;

  if (isLowConfidence || hasTooManyItems) {
    let conditionMessage = isLowConfidence
      ? "I wasn't completely sure what this was."
      : "I noticed multiple items in this photo.";

    // Interrupt and wait for user's clarification
    const answer = interrupt(`I need some clarification: ${conditionMessage} What time did you eat this? Was it just this item, or something else too?`);

    if (answer && typeof answer === "string") {
      const candidateNames = rerankedItems.map(i => i.foodType).join(", ");
      const originalDate = state.request.mealImage?.capturedAt || new Date().toISOString();
      const systemPrompt = `You are an AI assistant analyzing a user's clarification about a meal photo.
The original photo was detected to contain the following candidate items: ${candidateNames}.
The user was asked to clarify what they ate and when.
The user answered: "${answer}"

Instructions:
1. Determine which of the candidate items the user actually ate/wants to keep. Return their exact names in 'itemsToKeep' array, or 'all' if they ate everything or didn't specify.
2. Determine if the user specified a time (e.g., "around 7pm", "yesterday morning"). If so, return it as an ISO8601 string in 'mealDatetime'. Assume the original photo date ${originalDate.split('T')[0]} if only a time is provided. If they didn't specify a time, return null.

Respond ONLY with raw JSON matching this schema exactly (no markdown formatting):
{ "itemsToKeep": ["item1", "item2"] | "all", "mealDatetime": "YYYY-MM-DDTHH:mm:ssZ" | null }`;

      try {
        const settings = await getCachedLlmSettings();
        const llmResponse = await openRouterChat({
          apiKey: settings.openRouterApiKey,
          model: "google/gemini-2.5-flash",
          messages: [{ role: "system", content: systemPrompt }]
        });

        if (llmResponse) {
          const parsed = JSON.parse(llmResponse.replace(/```json|```/g, '').trim());
          
          let updatedItems = rerankedItems;
          if (Array.isArray(parsed.itemsToKeep)) {
            updatedItems = rerankedItems.filter(i => parsed.itemsToKeep.includes(i.foodType));
            if (updatedItems.length === 0) updatedItems = rerankedItems; // fallback if no match
          }

          let updatedMealImage = state.request.mealImage;
          if (parsed.mealDatetime && updatedMealImage) {
            updatedMealImage = { ...updatedMealImage, capturedAt: parsed.mealDatetime };
          }

          const newVisionResult = { ...state.visionResult, rerankedItems: updatedItems };
          return { visionResult: newVisionResult, request: { ...state.request, mealImage: updatedMealImage } };
        }
      } catch (err) {
        console.warn("visionClusterCheckNode: LLM parse failed", err);
      }
    }
  }

  return {};
}

async function nutritionCalculateNode(state: typeof OrchestratorState.State) {
  async function calc(items: VisionFoodItem[]): Promise<NutritionCalc | null> {
    if (!items.length) return null;
    return callAgentWithTimeout<NutritionCalc>(`${NUTRITION_URL}/calculate`, {
      items,
      profile: state.request.profile,
      ragContext: [],
    }, CHAT_AGENT_TIMEOUT_MS);
  }

  const panelCalcs = await Promise.all(
    state.visionResult.modelResults.map(async (mr) => ({
      mr,
      calc: mr.items.length ? await calc(mr.items) : null,
    }))
  );

  const rerankerCalc = await calc(state.visionResult.rerankedItems);
  if (!rerankerCalc) {
    throw new Error("Nutrition agent returned no data for non-empty vision items");
  }

  return {
    rerankerCalc,
    panelCalcs,
    agentPath: ["Nutrition Agent"],
    sources: rerankerCalc.sources,
  };
}

async function graphdbMealNode(state: typeof OrchestratorState.State) {
  if (!state.rerankerCalc?.items?.length) return {};
  
  const foodQuery = state.rerankerCalc.items.map((i) => i.foodType).join(", ");
  const graphResult = await callAgentWithTimeout<{ recommendations: string[]; safeFoods: string[] }>(
    `${GRAPHDB_URL}/recommend`,
    { profile: state.request.profile, foodQuery },
    CHAT_AGENT_TIMEOUT_MS
  ).catch((err) => {
    console.warn("Vision: GraphDB recommend failed:", err);
    return { recommendations: [], safeFoods: [] };
  });

  const sourcesUpdate = graphResult.recommendations.length > 0 ? [CITATION_SOURCES.CLINICAL_GRAPH] : [];

  return {
    graphRecommendations: graphResult.recommendations,
    agentPath: ["GraphDB Agent"],
    sources: sourcesUpdate,
  };
}

async function saveMealNode(state: typeof OrchestratorState.State) {
  const mealId = await saveMeal(
    state.request.userId,
    state.rerankerCalc.items,
    state.request.imageUrl ?? state.request.mealImage?.displayUrl,
    state.request.mealImage,
    buildVisionModelVersion(state.visionResult),
    {
      mealDatetime: state.request.mealDatetime,
      mealType: state.request.mealType,
    }
  );
  
  const panels: MultiModelMealAnalysis["panels"] = state.panelCalcs.map(({ mr, calc: c }) => ({
    modelId: mr.modelId,
    modelLabel: mr.modelLabel,
    items: c?.items ?? [],
    totalNutrition: c?.totalNutrition ?? { calories: 0, protein: 0, fat: 0, carbs: 0, sugar: 0 },
    error: mr.error ?? (c ? undefined : "No items detected"),
  }));

  panels.push({
    modelId: "reranker",
    modelLabel: rerankerPanelLabel(state.visionResult),
    items: state.rerankerCalc.items,
    totalNutrition: state.rerankerCalc.totalNutrition,
  });

  const mealDescription = buildMealDescription({
    items: state.visionResult.rerankedItems,
    fusionMethod: state.visionResult.fusionMethod,
    preferredLanguage: state.request.profile?.preferredLanguage,
  });

  const multiModelMealAnalysis: MultiModelMealAnalysis = {
    items: state.rerankerCalc.items,
    totalNutrition: state.rerankerCalc.totalNutrition,
    summary: state.rerankerCalc.summary,
    mealDescription,
    visionUsedMock: Boolean(state.visionResult.usedMockVision),
    sources: uniqueCitationSources(state.sources),
    panels,
    rerankerScores: state.visionResult.rerankerScores,
    rerankModel: state.visionResult.rerankModel,
    fusionMethod: state.visionResult.fusionMethod,
    fallbackModelLabel: state.visionResult.fallbackModelLabel,
    // Structured pieces the client needs to re-render this message in whatever
    // language is active later (the `reply` string below is frozen in the language
    // it was generated in), plus the photo so history can show its thumbnail.
    imageUrl: state.request.imageUrl ?? state.request.mealImage?.displayUrl,
    warnings: state.rerankerCalc.warnings,
    tips: state.graphRecommendations ?? [],
  };

  const isHe = state.request.profile?.preferredLanguage === "he";
  const isRu = state.request.profile?.preferredLanguage === "ru";
  
  const msgAnalyzed = isHe ? "✅ הארוחה נותחה על ידי Gemini 2.5 Flash + מדרג מחדש!" : isRu ? "✅ Прием пищи проанализирован Gemini 2.5 Flash + reranker!" : "✅ Meal analyzed by Gemini 2.5 Flash + reranker!";
  const msgSeeDetection = isHe ? "ראו את זיהוי Gemini ותוצאות הדירוג למטה." : isRu ? "Результаты распознавания Gemini и ранжирования ниже." : "See Gemini detection and reranker result below.";
  
  const reply = [
    msgAnalyzed,
    "",
    mealDescription,
    "",
    state.rerankerCalc.summary,
    "",
    msgSeeDetection,
    "",
    ...state.rerankerCalc.items.map(
      (i) => `• ${i.foodType} (${i.estimatedQuantity}): ${i.nutrition.calories} kcal`
    ),
    "",
    ...(state.rerankerCalc.warnings.length ? state.rerankerCalc.warnings.map((w) => `⚠️ ${w}`) : []),
    ...(state.graphRecommendations?.length ? state.graphRecommendations.map((r) => `💡 ${r}`) : []),
  ].join("\n");

  const response: OrchestratorResponse = {
    intent: state.intent,
    reply,
    mealId,
    mealAnalysis: {
      items: state.rerankerCalc.items,
      totalNutrition: state.rerankerCalc.totalNutrition,
      sources: uniqueCitationSources(state.sources),
      summary: state.rerankerCalc.summary,
    },
    multiModelMealAnalysis,
    sources: uniqueCitationSources(state.sources),
    agentPath: state.agentPath,
  };
  
  return { mealId, response };
}


// ---------------------------------------------------------------------------
// BRANCH 3: TEXT2SQL (History Query)
// ---------------------------------------------------------------------------

/**
 * The user asked a question about their own data; if the SQL path fails we owe
 * them a sentence, not a stack trace. This used to reject, which failed the whole
 * graph run and surfaced as a bare "Internal server error" in the chat bubble —
 * the same non-degradation pattern already fixed on the RAG and GraphDB nodes.
 */
function historyUnavailableReply(lang: ReturnType<typeof resolveResponseLanguage>): string {
  // Deliberately says "your data", not "meal history": this path also serves
  // steps and exercise questions, and telling someone who asked about steps that
  // their *meal* history failed is a small lie that sends them debugging the
  // wrong thing.
  if (lang === "he") {
    return "לא הצלחתי לשלוף את הנתונים שלך כרגע. אפשר לנסות שוב עוד רגע, או לנסח את השאלה אחרת.";
  }
  if (lang === "ru") {
    return "Не удалось получить ваши данные. Попробуйте ещё раз через минуту или сформулируйте вопрос иначе.";
  }
  return "I couldn't retrieve your data just now. Please try again in a moment, or try rephrasing the question.";
}

async function text2sqlNode(state: typeof OrchestratorState.State) {
  const historyResult = await callAgentWithTimeout<{ answer: string; rowCount: number }>(
    `${TEXT2SQL_URL}/query`,
    {
      userId: state.request.userId,
      question: state.request.message,
      preferredLanguage: state.request.profile?.preferredLanguage,
    },
    CHAT_AGENT_TIMEOUT_MS
  ).catch((err) => {
    console.warn("History: Text2SQL query failed, replying with a fallback:", err);
    const lang = resolveResponseLanguage(
      state.request.message,
      state.request.profile?.preferredLanguage ?? null
    );
    return { answer: historyUnavailableReply(lang), rowCount: 0 };
  });

  const sourcesUpdate = [CITATION_SOURCES.MEAL_HISTORY];

  const response: OrchestratorResponse = {
    intent: state.intent,
    reply: historyResult.answer,
    sources: uniqueCitationSources(state.sources.concat(sourcesUpdate)),
    agentPath: state.agentPath.concat(["Text2SQL Agent"]),
  };
  
  return { response, agentPath: ["Text2SQL Agent"], sources: sourcesUpdate };
}


// ---------------------------------------------------------------------------
// BRANCH 4: GENERAL CHAT (Conversational / Advice)
// ---------------------------------------------------------------------------

async function ragRetrieveGeneralNode(state: typeof OrchestratorState.State) {
  let ragResult: RagRetrieveResult = { context: [], sources: [] };
  let agentPathUpdate: string[] = [];
  try {
    ragResult = await callAgentWithTimeout<RagRetrieveResult>(
      `${RAG_URL}/retrieve`,
      {
        query: state.request.message,
        topK: 3,
        profile: state.request.profile,
        // No web fallback for general chat by default (can be changed if desired)
      },
      CHAT_AGENT_TIMEOUT_MS
    );
    if (ragResult.sources.length) {
      agentPathUpdate.push("RAG Agent (/retrieve)");
    }
  } catch (err) {
    console.warn("General: RAG retrieve failed, continuing without context:", err);
  }
  return { ragResult, agentPath: agentPathUpdate, sources: ragResult.sources };
}

async function graphdbAdviceNode(state: typeof OrchestratorState.State) {
  // GraphDB adds clinical safety tips on top of the answer — useful, but not
  // required to reply. An unreachable/erroring agent used to reject here, failing
  // the whole graph run so the user saw "AI services are unavailable" instead of
  // advice. Degrade to no tips, matching graphdbMealNode on the vision path.
  const graphResult = await callAgentWithTimeout<{ recommendations: string[]; safeFoods: string[] }>(
    `${GRAPHDB_URL}/recommend`,
    { profile: state.request.profile, foodQuery: state.request.message },
    CHAT_AGENT_TIMEOUT_MS
  ).catch((err) => {
    console.warn("General: GraphDB recommend failed, continuing without tips:", err);
    return { recommendations: [], safeFoods: [] };
  });

  const agentPathUpdate = graphResult.recommendations.length > 0 ? ["GraphDB Agent"] : [];
  return { graphRecommendations: graphResult.recommendations, agentPath: agentPathUpdate };
}

async function nutritionAdviseNode(state: typeof OrchestratorState.State) {
  const adviceResult = await callAgentWithTimeout<{ reply: string; sources: string[] }>(
    `${NUTRITION_URL}/advise`, 
    {
      message: state.request.message,
      profile: state.request.profile,
      context: [...(state.ragResult?.context ?? []), ...(state.graphRecommendations ?? [])],
    }, 
    CHAT_AGENT_TIMEOUT_MS
  );
  
  const refused =
    isClearlyOutOfScope(state.request.message) || isScopeRefusalReply(adviceResult.reply || "");

  if (refused) {
    const response: OrchestratorResponse = {
      intent: "out_of_scope",
      reply: adviceResult.reply,
      sources: [],
      agentPath: state.agentPath.concat(["Scope Guardrail"]),
    };
    return { response, agentPath: ["Scope Guardrail"], sources: [] };
  }

  // Only cite the clinical graph when it actually contributed — it may have been
  // unreachable, and citing a source that fed nothing into the answer is misleading.
  const sourcesUpdate = state.graphRecommendations?.length
    ? adviceResult.sources.concat([CITATION_SOURCES.CLINICAL_GRAPH])
    : adviceResult.sources;


  const isHe = state.request.profile?.preferredLanguage === "he";
  const isRu = state.request.profile?.preferredLanguage === "ru";
  const msgSafeChoices = isHe ? "בחירות בטוחות לפי הפרופיל שלך:" : isRu ? "Безопасные варианты согласно вашему профилю:" : "Safe choices based on your profile:";

  const reply = [
    adviceResult.reply,
    "",
    ...(state.graphRecommendations?.length
      ? [msgSafeChoices, ...state.graphRecommendations.map((r) => `• ${r}`)]
      : []),
  ].join("\n");
  
  const response: OrchestratorResponse = {
    intent: state.intent,
    reply,
    sources: uniqueCitationSources(state.sources.concat(sourcesUpdate)),
    agentPath: state.agentPath.concat(["Nutrition Agent"]),
  };
  
  return { response, agentPath: ["Nutrition Agent"], sources: sourcesUpdate };
}

// ---------------------------------------------------------------------------
// WORKFLOW COMPILATION
// ---------------------------------------------------------------------------

const workflow = new StateGraph(OrchestratorState)
  .addNode("enforceChatCap", enforceChatCapNode)
  .addNode("createUserActionLog", createUserActionLogNode)
  .addNode("finishUserActionLog", finishUserActionLogNode)
  .addNode("classifyIntent", classifyIntentNode)
  .addNode("outOfScope", outOfScopeNode)
  
  // Branch 1: Question
  .addNode("questionEmbed", questionEmbedNode)
  .addNode("questionCacheCheck", questionCacheCheckNode)
  .addNode("questionSearch", questionSearchNode)
  .addNode("questionRag", questionRagNode)
  .addNode("questionCacheSave", questionCacheSaveNode)

  // Branch 2: Vision
  .addNode("visionAnalyze", visionAnalyzeNode)
  .addNode("visionClusterCheck", visionClusterCheckNode)
  .addNode("nutritionCalculate", nutritionCalculateNode)
  .addNode("graphdbMeal", graphdbMealNode)
  .addNode("saveMeal", saveMealNode)

  // Branch 3: Text2SQL
  .addNode("text2sql", text2sqlNode)

  // Branch 4: General Chat
  .addNode("ragRetrieveGeneral", ragRetrieveGeneralNode)
  .addNode("graphdbAdvice", graphdbAdviceNode)
  .addNode("nutritionAdvise", nutritionAdviseNode)
  
  .addEdge(START, "enforceChatCap")
  .addEdge("enforceChatCap", "createUserActionLog")
  .addEdge("createUserActionLog", "classifyIntent")
  .addConditionalEdges("classifyIntent", (state) => {
    switch (state.intent) {
      case "question": return "questionEmbed";
      case "meal_analysis": return "visionAnalyze";
      case "history_query": return "text2sql";
      case "out_of_scope": return "outOfScope";
      default: return "ragRetrieveGeneral";
    }
  })

  // Path 1
  .addEdge("questionEmbed", "questionCacheCheck")
  .addConditionalEdges("questionCacheCheck", (state) => {
    if (state.response) return "finishUserActionLog"; // Cache hit
    return "questionSearch";
  })
  .addEdge("questionSearch", "questionRag")
  .addEdge("questionRag", "questionCacheSave")
  .addEdge("questionCacheSave", "finishUserActionLog")

  // Path 2
  .addConditionalEdges("visionAnalyze", (state) => {
    if (state.response) return "finishUserActionLog"; // No food detected
    return "visionClusterCheck";
  })
  .addEdge("visionClusterCheck", "nutritionCalculate")
  .addEdge("nutritionCalculate", "graphdbMeal")
  .addEdge("graphdbMeal", "saveMeal")
  .addEdge("saveMeal", "finishUserActionLog")
  
  // Path 3
  .addEdge("text2sql", "finishUserActionLog")
  
  // Path 4
  .addEdge("ragRetrieveGeneral", "graphdbAdvice")
  .addEdge("graphdbAdvice", "nutritionAdvise")
  .addEdge("nutritionAdvise", "finishUserActionLog")
  .addEdge("outOfScope", "finishUserActionLog")
  .addEdge("finishUserActionLog", END);

// Setup checkpointer
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
export const checkpointer = new PostgresSaver(pool);

/**
 * `setup()` creates the LangGraph checkpoint tables (public.checkpoints etc.).
 * It is async, so firing it off unawaited raced the HTTP server: a request that
 * arrived first failed with `relation "public.checkpoints" does not exist`, and
 * because the old code only warned, the service looked healthy while every
 * interrupt/resume broke. Exported so index.ts can await it before listening.
 */
export const checkpointerReady: Promise<void> = checkpointer
  .setup()
  .then(() => undefined);

export const orchestratorGraph = workflow.compile({ checkpointer });
