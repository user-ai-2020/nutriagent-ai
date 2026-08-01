import {
  FusionMethod,
  RerankerFoodScore,
  RerankerFusionTrace,
  VisionFoodItem,
  VisionModelResult,
  isMainDish,
  isSameFoodItem,
  isSingleModelVisionPipeline,
  openRouterRerank,
  parseQuantityGrams,
} from "@nutriagent/shared";

const RERANK_QUERY =
  "Distinct food and drink items actually visible in this single meal photo. Exactly ONE entry per physical item — if one croissant is visible, output one croissant (not separate cheese/jam/topping variants). " +
  "For assembled dishes (cheeseburger, hamburger, sandwich, wrap, shakshuka, pizza slice), keep ONE entry for the whole dish — do NOT list bun, patty, cheese, lettuce, tomato, or sauce as separate items. " +
  "Merge synonyms (strawberries = strawberry). Only one drink if a cup is visible.";

const MIN_RELEVANCE = 0.4;
const DRINK_TERMS = ["tea", "coffee", "milk", "cream", "juice", "latte", "cappuccino", "espresso", "drink"];

function normalizeFood(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Merge byte-identical labels within one model before cross-model clustering (rule 1 only). */
function dedupeFoodItems(items: VisionFoodItem[]): VisionFoodItem[] {
  const merged: VisionFoodItem[] = [];

  for (const item of items) {
    const normNew = normalizeFood(item.foodType);
    const matchIdx = merged.findIndex(
      (existing) => normalizeFood(existing.foodType) === normNew
    );
    if (matchIdx === -1) {
      merged.push({ ...item });
      continue;
    }

    const existing = merged[matchIdx]!;
    const gramsExisting = parseQuantityGrams(existing.estimatedQuantity, existing.foodType);
    const gramsNew = parseQuantityGrams(item.estimatedQuantity, item.foodType);

    merged[matchIdx] = {
      foodType:
        existing.visionConfidence >= item.visionConfidence
          ? existing.foodType
          : item.foodType,
      estimatedQuantity: `${gramsExisting + gramsNew}g`,
      visionConfidence: Math.max(existing.visionConfidence, item.visionConfidence),
    };
  }

  return merged;
}

function isDrink(foodType: string): boolean {
  const f = normalizeFood(foodType);
  return DRINK_TERMS.some((d) => f.includes(d));
}

function countModelAgreement(foodType: string, modelResults: VisionModelResult[]): number {
  let count = 0;
  for (const mr of modelResults) {
    if (mr.error || !mr.items.length) continue;
    if (mr.items.some((i) => isSameFoodItem(i.foodType, foodType))) count++;
  }
  return count;
}

function medianItemCount(modelResults: VisionModelResult[]): number {
  const counts = modelResults.filter((m) => !m.error && m.items.length).map((m) => m.items.length);
  if (!counts.length) return 4;
  counts.sort((a, b) => a - b);
  return counts[Math.floor(counts.length / 2)];
}

interface Candidate {
  item: VisionFoodItem;
  modelId: string;
  modelLabel: string;
  sourceIndex: number;
}

type RerankFn = typeof openRouterRerank;

function candidateDocument(candidate: Candidate): string {
  return `${candidate.item.foodType} (${candidate.item.estimatedQuantity}) — ${candidate.modelLabel}, confidence ${candidate.item.visionConfidence.toFixed(2)}`;
}

function pickCanonicalLabel(
  members: Candidate[],
  memberCohereScores: Map<number, number> | null
): string {
  const ranked = [...members].sort((a, b) => {
    if (memberCohereScores) {
      const scoreA = memberCohereScores.get(a.sourceIndex) ?? 0;
      const scoreB = memberCohereScores.get(b.sourceIndex) ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
    } else if (b.item.visionConfidence !== a.item.visionConfidence) {
      return b.item.visionConfidence - a.item.visionConfidence;
    }
    return a.item.foodType.length - b.item.foodType.length;
  });
  return ranked[0]!.item.foodType;
}

interface FoodCluster {
  members: Candidate[];
  modelIds: Set<string>;
}

function clusterCandidates(candidates: Candidate[]): FoodCluster[] {
  const clusters: FoodCluster[] = [];

  for (const candidate of candidates) {
    const cluster = clusters.find((existing) =>
      existing.members.some((member) =>
        isSameFoodItem(member.item.foodType, candidate.item.foodType)
      )
    );

    if (cluster) {
      cluster.members.push(candidate);
      cluster.modelIds.add(candidate.modelId);
    } else {
      clusters.push({
        members: [candidate],
        modelIds: new Set([candidate.modelId]),
      });
    }
  }

  return clusters;
}

function medianGrams(members: Candidate[]): number {
  const grams = members
    .map((m) => parseQuantityGrams(m.item.estimatedQuantity, m.item.foodType))
    .sort((a, b) => a - b);
  const mid = Math.floor(grams.length / 2);
  if (grams.length % 2 === 0) {
    return Math.round((grams[mid - 1]! + grams[mid]!) / 2);
  }
  return grams[mid]!;
}

function clusterAgreement(cluster: FoodCluster): number {
  return cluster.modelIds.size;
}

function clusterDocument(cluster: FoodCluster, memberCohereScores: Map<number, number> | null): string {
  const label = pickCanonicalLabel(cluster.members, memberCohereScores);
  const grams = medianGrams(cluster.members);
  const models = [...cluster.modelIds].length;
  const avgConf =
    cluster.members.reduce((sum, m) => sum + m.item.visionConfidence, 0) / cluster.members.length;
  return `${label} (~${grams}g, ${models} models, confidence ${avgConf.toFixed(2)})`;
}

function logFusionTrace(trace: RerankerFusionTrace): void {
  console.info("[reranker]", JSON.stringify(trace));
}

function resolvePathAFusionMethod(
  modelResults: VisionModelResult[],
  cohereFailed: boolean,
  cohereCalled: boolean
): FusionMethod {
  if (isSingleModelVisionPipeline(modelResults.length)) {
    return "single_model_only";
  }
  return cohereFailed || !cohereCalled ? "cluster_no_rerank" : "full";
}

function modelAgreementScore(model: VisionModelResult, modelResults: VisionModelResult[]): number {
  return model.items.reduce(
    (sum, item) => sum + countModelAgreement(item.foodType, modelResults),
    0
  );
}

/** Cohere rerank + multi-model cluster consensus — avoids inflating calories */
export async function rerankVisionResults(
  modelResults: VisionModelResult[],
  apiKey?: string | null,
  options?: { rerank?: RerankFn }
): Promise<{
  items: VisionFoodItem[];
  scores: RerankerFoodScore[];
  rerankModel: string;
  fusionMethod: FusionMethod;
  fallbackModelId?: string;
  fallbackModelLabel?: string;
}> {
  const rerankModel = process.env.OPENROUTER_RERANK_MODEL || "cohere/rerank-4-fast";
  const rerankFn = options?.rerank ?? openRouterRerank;
  const successful = modelResults.filter((m) => !m.error && m.items.length);
  const maxClusters = medianItemCount(modelResults);
  const minAgreement = successful.length >= 2 ? 2 : 1;

  const candidates: Candidate[] = [];
  let sourceIndex = 0;
  for (const mr of modelResults) {
    if (mr.error) continue;
    for (const item of dedupeFoodItems(mr.items)) {
      candidates.push({ item, modelId: mr.modelId, modelLabel: mr.modelLabel, sourceIndex });
      sourceIndex++;
    }
  }

  if (!candidates.length) {
    const fallback = dedupeFoodItems(modelResults.find((m) => m.items.length)?.items ?? []);
    logFusionTrace({
      pathFired: "C",
      fusionMethod: "empty_pool_fallback",
      reason: "no_candidates_all_models_empty_or_errored",
      details: {
        cohereCalled: false,
        cohereFailed: false,
        cohereHitCount: 0,
        cohereHitsAboveThreshold: 0,
        candidatesTotal: 0,
        mergeLoopAccepted: fallback.length,
        mergeLoopRejected: {
          belowRelevance: 0,
          belowAgreement: 0,
          duplicate: 0,
          drinkCap: 0,
        },
      },
    });
    return { items: fallback, scores: [], rerankModel, fusionMethod: "empty_pool_fallback" };
  }

  const clusters = clusterCandidates(candidates);

  let ranked: Array<{ index: number; relevance_score: number }> = [];
  let memberCohereScores: Map<number, number> | null = null;
  let cohereCalled = false;
  let cohereFailed = false;

  try {
    cohereCalled = true;
    const candidateRanked = await rerankFn({
      apiKey,
      query: RERANK_QUERY,
      documents: candidates.map(candidateDocument),
      topN: candidates.length,
      model: rerankModel,
    });
    memberCohereScores = new Map(
      candidateRanked.map((hit) => [hit.index, hit.relevance_score])
    );

    ranked = await rerankFn({
      apiKey,
      query: RERANK_QUERY,
      documents: clusters.map((cluster) => clusterDocument(cluster, memberCohereScores)),
      topN: clusters.length,
      model: rerankModel,
    });
  } catch (err) {
    cohereFailed = true;
    memberCohereScores = null;
    console.warn("Cohere rerank failed, falling back to agreement sort:", err);
    ranked = clusters
      .map((cluster, index) => ({
        index,
        relevance_score: clusterAgreement(cluster) / Math.max(successful.length, 1),
      }))
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .map((r, i) => ({ ...r, relevance_score: 1 - i * 0.05 }));
  }

  const items: VisionFoodItem[] = [];
  const scores: RerankerFoodScore[] = [];
  let hasDrink = false;
  const rejected = {
    belowRelevance: 0,
    belowAgreement: 0,
    duplicate: 0,
    drinkCap: 0,
  };
  let cohereHitsAboveThreshold = 0;

  for (const hit of ranked) {
    if (hit.relevance_score >= MIN_RELEVANCE) cohereHitsAboveThreshold++;
    if (items.length >= maxClusters) break;

    const cluster = clusters[hit.index]!;
    const agreement = clusterAgreement(cluster);
    const canonicalLabel = pickCanonicalLabel(cluster.members, memberCohereScores);

    const passesRelevance =
      hit.relevance_score >= MIN_RELEVANCE || agreement >= minAgreement;
    if (!passesRelevance) {
      const strongMainDish = isMainDish(canonicalLabel) && hit.relevance_score >= 0.85;
      if (!strongMainDish) {
        rejected.belowRelevance++;
        continue;
      }
    }

    if (agreement < minAgreement) {
      const strongMainDish = isMainDish(canonicalLabel) && hit.relevance_score >= 0.85;
      if (!strongMainDish) {
        rejected.belowAgreement++;
        continue;
      }
    }

    const duplicate = items.some((i) => isSameFoodItem(i.foodType, canonicalLabel));
    if (duplicate) {
      rejected.duplicate++;
      continue;
    }

    if (isDrink(canonicalLabel)) {
      if (hasDrink) {
        rejected.drinkCap++;
        continue;
      }
      hasDrink = true;
    }

    const fusedGrams = medianGrams(cluster.members);
    const avgMemberConfidence =
      cluster.members.reduce((sum, m) => sum + m.item.visionConfidence, 0) / cluster.members.length;
    const blendedConfidence =
      Math.round(
        (hit.relevance_score * 0.5 +
          (agreement / Math.max(successful.length, 1)) * 0.35 +
          avgMemberConfidence * 0.15) *
          100
      ) / 100;

    items.push({
      foodType: canonicalLabel,
      estimatedQuantity: `${fusedGrams}g`,
      visionConfidence: Math.min(1, blendedConfidence),
    });

    scores.push({
      foodType: canonicalLabel,
      estimatedQuantity: `${fusedGrams}g`,
      score: Math.round(hit.relevance_score * 1000) / 1000,
      modelAgreement: agreement,
      avgConfidence: avgMemberConfidence,
    });
  }

  if (items.length) {
    const fusionMethod = resolvePathAFusionMethod(modelResults, cohereFailed, cohereCalled);
    logFusionTrace({
      pathFired: "A",
      fusionMethod,
      reason:
        fusionMethod === "full"
          ? `cluster_fusion_accepted_${items.length}`
          : fusionMethod === "single_model_only"
            ? `single_model_rerank_accepted_${items.length}`
            : `cohere_failed_cluster_agreement_accepted_${items.length}`,
      details: {
        cohereCalled,
        cohereFailed,
        cohereHitCount: ranked.length,
        cohereHitsAboveThreshold,
        candidatesTotal: candidates.length,
        mergeLoopAccepted: items.length,
        mergeLoopRejected: rejected,
      },
    });
    return { items, scores, rerankModel, fusionMethod };
  }

  if (successful.length) {
    const byAgreement = [...successful].sort(
      (a, b) => modelAgreementScore(b, modelResults) - modelAgreementScore(a, modelResults)
    );
    const best = byAgreement[0]!;
    const fallbackItems = dedupeFoodItems(best.items).slice(0, maxClusters);
    const fusionMethod: FusionMethod = isSingleModelVisionPipeline(modelResults.length)
      ? "single_model_only"
      : "single_model_fallback";
    logFusionTrace({
      pathFired: "B",
      fusionMethod,
      reason:
        fusionMethod === "single_model_only"
          ? "single_model_vision_passthrough_rerank_filters_rejected_all"
          : rejected.belowRelevance === ranked.length
            ? "all_clusters_below_relevance_0.4"
            : "all_clusters_failed_agreement_or_caps",
      details: {
        cohereCalled,
        cohereFailed,
        cohereHitCount: ranked.length,
        cohereHitsAboveThreshold,
        candidatesTotal: candidates.length,
        mergeLoopAccepted: 0,
        mergeLoopRejected: rejected,
        singleModelFallbackModelId: best.modelId,
        singleModelFallbackReason:
          rejected.belowRelevance === ranked.length
            ? "all_clusters_below_relevance_0.4"
            : "all_clusters_failed_agreement_or_caps",
      },
    });
    return {
      items: fallbackItems,
      scores: fallbackItems.map((i) => ({
        foodType: i.foodType,
        estimatedQuantity: i.estimatedQuantity,
        score: i.visionConfidence,
        modelAgreement: countModelAgreement(i.foodType, modelResults),
        avgConfidence: i.visionConfidence,
      })),
      rerankModel,
      fusionMethod,
      ...(fusionMethod === "single_model_fallback"
        ? { fallbackModelId: best.modelId, fallbackModelLabel: best.modelLabel }
        : {}),
    };
  }

  return { items: [], scores: [], rerankModel, fusionMethod: "empty_pool_fallback" };
}
