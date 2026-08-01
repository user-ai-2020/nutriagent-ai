import { prisma } from "@nutriagent/db";
import { getLlmSettings } from "@nutriagent/db";
import { MAX_FALLBACK_ROUNDS } from "../config/ragConstants.js";
import { createOpenRouterEmbedder, type EmbedFn } from "../embedding/embedText.js";
import { ingestArticle } from "../ingest/ingestDocument.js";
import { searchTrustedSources, type SearchResultLink } from "../fallback/trustedSearch.js";
import { extractSearchKeywords } from "./extractKeywords.js";
import {
  generateRagAnswer,
  hitsToContext,
  hitsToSources,
  type RagSourceCitation,
} from "./generateAnswer.js";
import {
  hybridSearch,
  MATCH_SCORE_THRESHOLD,
  type HybridSearchHit,
} from "../search/hybridSearch.js";
import { withPipelineTimeout } from "./pipelineTimeout.js";
import { fetchWithTimeout } from "./pipelineTimeout.js";

/** Adapts fetchWithTimeout to the standard fetch signature expected by ingest/search helpers. */
const ingestFetch: typeof fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return fetchWithTimeout(url, init);
}) as typeof fetch;

export interface RagQueryResponse {
  answer: string;
  matchScore: number;
  sources: RagSourceCitation[];
  usedWebFallback: boolean;
  context: string[];
  keywords: string;
  fallbackRounds: number;
}

export interface RagPipelineOptions {
  question: string;
  topK?: number;
  enableWebFallback?: boolean;
  maxFallbackRounds?: number;
  preferredLanguage?: string | null;
}

export interface RagPipelineDeps {
  embed: EmbedFn;
  embedQuery: EmbedFn;
  hybridSearchFn: typeof hybridSearch;
  searchTrusted: (keywords: string) => Promise<SearchResultLink[]>;
  ingest: typeof ingestArticle;
  extractKeywords: typeof extractSearchKeywords;
  generateAnswer: typeof generateRagAnswer;
  getSettings: typeof getLlmSettings;
}

function defaultDeps(): RagPipelineDeps {
  return {
    embed: createOpenRouterEmbedder(),
    embedQuery: createOpenRouterEmbedder(),
    hybridSearchFn: hybridSearch,
    searchTrusted: searchTrustedSources,
    ingest: ingestArticle,
    extractKeywords: extractSearchKeywords,
    generateAnswer: generateRagAnswer,
    getSettings: getLlmSettings,
  };
}

export function passesMatchGate(hits: HybridSearchHit[]): boolean {
  if (hits.length === 0) return false;
  return hits[0]!.matchScore >= MATCH_SCORE_THRESHOLD;
}

export async function runRagPipeline(
  options: RagPipelineOptions,
  partialDeps: Partial<RagPipelineDeps> = {}
): Promise<RagQueryResponse> {
  return withPipelineTimeout(runRagPipelineInner(options, partialDeps));
}

async function runRagPipelineInner(
  options: RagPipelineOptions,
  partialDeps: Partial<RagPipelineDeps> = {}
): Promise<RagQueryResponse> {
  const deps = { ...defaultDeps(), ...partialDeps };
  const topK = options.topK ?? 5;
  const enableWebFallback = options.enableWebFallback ?? true;
  const maxFallbackRounds = options.maxFallbackRounds ?? MAX_FALLBACK_ROUNDS;

  const settings = await deps.getSettings();
  const apiKey = settings.openRouterApiKey;
  const ragModel = settings.ragModel;

  const keywords = await deps.extractKeywords(options.question, apiKey, ragModel);
  const [queryEmbedding] = await deps.embedQuery([options.question]);

  let hits = await deps.hybridSearchFn(prisma, {
    queryText: keywords,
    queryEmbedding,
    limit: topK,
  });

  let usedWebFallback = false;
  let fallbackRounds = 0;

  while (!passesMatchGate(hits) && enableWebFallback && fallbackRounds < maxFallbackRounds) {
    fallbackRounds += 1;
    usedWebFallback = true;

    const links = await deps.searchTrusted(keywords);
    for (const link of links.slice(0, 3)) {
      try {
        await deps.ingest(
          { url: link.url },
          { embed: deps.embed, fetchImpl: ingestFetch }
        );
      } catch (err) {
        console.warn(`RAG ingest failed for ${link.url}:`, err);
      }
    }

    hits = await deps.hybridSearchFn(prisma, {
      queryText: keywords,
      queryEmbedding,
      limit: topK,
    });
  }

  const matchScore = hits[0]?.matchScore ?? 0;
  const weakMatch = !passesMatchGate(hits);
  const answer = await deps.generateAnswer({
    question: options.question,
    hits,
    weakMatch,
    apiKey,
    model: ragModel,
    preferredLanguage: options.preferredLanguage,
  });

  return {
    answer,
    matchScore,
    sources: hitsToSources(hits),
    usedWebFallback,
    context: hitsToContext(hits),
    keywords,
    fallbackRounds,
  };
}
