import { Router } from "express";
import { prisma } from "@nutriagent/db";
import { UserProfileData, openRouterRerank } from "@nutriagent/shared";
import { buildTimedOutRagResponse, runRagPipeline } from "./pipeline/ragPipeline.js";
import { hybridSearch, MATCH_SCORE_THRESHOLD } from "./search/hybridSearch.js";
import { createOpenRouterEmbedder } from "./embedding/embedText.js";
import { extractSearchKeywords } from "./pipeline/extractKeywords.js";
import { hitsToContext } from "./pipeline/generateAnswer.js";
import { getCachedLlmSettings } from "@nutriagent/db";
import { PipelineTimeoutError } from "./pipeline/pipelineTimeout.js";

export const ragRouter = Router();

function scoreRelevance(query: string, content: string, title: string): number {
  const q = query.toLowerCase().split(/\s+/);
  const text = `${title} ${content}`.toLowerCase();
  let score = 0;
  for (const word of q) {
    if (word.length > 2 && text.includes(word)) score += 1;
  }
  return score;
}

function docMatchesProfile(
  doc: { title: string; content: string; category: string | null },
  profile?: UserProfileData
): boolean {
  const category = (doc.category ?? "general").toLowerCase();
  if (category === "nutrition" || category === "general") return true;

  const text = `${doc.title} ${doc.content}`.toLowerCase();

  if (category === "health") {
    const restrictions = profile?.healthRestrictions ?? [];
    if (restrictions.length === 0) return false;
    return restrictions.some((r) => text.includes(r.toLowerCase()));
  }

  if (category === "allergy") {
    const allergies = profile?.allergies ?? [];
    if (allergies.length === 0) return false;
    return allergies.some((a) => text.includes(a.toLowerCase()));
  }

  return true;
}

async function legacyKnowledgeRetrieve(
  query: string,
  topK: number,
  profile?: UserProfileData
): Promise<{ documents: unknown[]; sources: string[]; context: string[] }> {
  const docs = await prisma.knowledgeDocument.findMany();
  const eligible = docs.filter((doc) => docMatchesProfile(doc, profile));

  let pool = eligible
    .map((doc) => ({
      title: doc.title,
      content: doc.content,
      category: doc.category,
      score: scoreRelevance(query, doc.content, doc.title),
    }))
    .filter((d) => d.score > 0);

  if (pool.length === 0 && eligible.length > 0) {
    pool = eligible
      .filter((doc) => {
        const category = (doc.category ?? "general").toLowerCase();
        return category === "nutrition" || category === "general";
      })
      .slice(0, topK * 2)
      .map((doc) => ({
        title: doc.title,
        content: doc.content,
        category: doc.category,
        score: 0.1,
      }));
  }

  const documents = pool.map((d) => `${d.title}: ${d.content}`);
  let ranked = pool;

  if (documents.length > 0 && process.env.OPENROUTER_API_KEY) {
    try {
      const hits = await openRouterRerank({
        query,
        documents,
        topN: topK,
      });
      ranked = hits.map((hit) => ({ ...pool[hit.index], score: hit.relevance_score }));
    } catch (err) {
      console.warn("RAG Cohere rerank failed, using keyword order:", err);
      ranked = pool.sort((a, b) => b.score - a.score).slice(0, topK);
    }
  } else {
    ranked = pool.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  return {
    documents: ranked,
    sources: ranked.map((d) => d.title),
    context: ranked.map((d) => `${d.title}: ${d.content}`),
  };
}

/** Full RAG pipeline with 80% gate + whitelisted web fallback (spec 4.1–4.3). */
ragRouter.post("/query", async (req, res) => {
  try {
    const { question, topK, enableWebFallback, maxFallbackRounds, profile } = req.body as {
      question: string;
      topK?: number;
      enableWebFallback?: boolean;
      maxFallbackRounds?: number;
      profile?: UserProfileData;
    };

    if (!question?.trim()) {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const result = await runRagPipeline({
      question: question.trim(),
      topK,
      enableWebFallback,
      maxFallbackRounds,
      preferredLanguage: profile?.preferredLanguage,
    });

    res.json(result);
  } catch (err) {
    if (err instanceof PipelineTimeoutError) {
      // Wall-clock cap tripped (LLM + search + scrape took too long) — degrade to the
      // same weak-match disclaimer used for a low-confidence hybrid-search result,
      // instead of surfacing a raw 500 to the client.
      console.warn("RAG /query exceeded pipeline timeout, returning weak-match disclaimer:", err);
      res.json(buildTimedOutRagResponse());
      return;
    }

    console.error("RAG /query failed:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "RAG query failed" });
  }
});

/**
 * Orchestrator context endpoint — hybrid search over rag_chunks when available;
 * skips web fallback by default (fast path). Falls back to legacy knowledge_documents.
 */
ragRouter.post("/retrieve", async (req, res) => {
  const { query, topK = 3, profile, enableWebFallback = false } = req.body as {
    query: string;
    topK?: number;
    profile?: UserProfileData;
    enableWebFallback?: boolean;
  };

  if (!query?.trim()) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  try {
    const readyCount = await prisma.ragDocument.count({ where: { status: "ready" } });

    if (readyCount > 0 && process.env.OPENROUTER_API_KEY) {
      if (enableWebFallback) {
        const result = await runRagPipeline({
          question: query,
          topK,
          enableWebFallback: true,
        });
        res.json({
          documents: result.context,
          sources: result.sources.map((s) => ({ title: s.title, url: s.url })),
          context: result.context,
          matchScore: result.matchScore,
        });
        return;
      }

      const settings = await getCachedLlmSettings();
      const keywords = await extractSearchKeywords(query, settings.openRouterApiKey, settings.ragModel);
      const [queryEmbedding] = await createOpenRouterEmbedder(settings.openRouterApiKey)([query]);
      const hits = await hybridSearch(prisma, {
        queryText: keywords,
        queryEmbedding,
        limit: topK,
      });

      if (hits.length > 0) {
        res.json({
          documents: hits,
          sources: hits.map((h) => ({ title: h.title, url: h.sourceUrl })),
          context: hitsToContext(hits),
          matchScore: hits[0]?.matchScore ?? 0,
          matchGate: MATCH_SCORE_THRESHOLD,
        });
        return;
      }
    }

    const legacy = await legacyKnowledgeRetrieve(query, topK, profile);
    res.json(legacy);
  } catch (err) {
    console.warn("RAG hybrid retrieve failed, using legacy:", err);
    const legacy = await legacyKnowledgeRetrieve(query, topK, profile);
    res.json(legacy);
  }
});
