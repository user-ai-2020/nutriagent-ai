import { openRouterChat, resolveResponseLanguage, responseLanguageInstruction } from "@nutriagent/shared";
import type { HybridSearchHit } from "../search/hybridSearch.js";
import { WEAK_MATCH_DISCLAIMER } from "../config/ragConstants.js";
import type { ResponseLanguage } from "@nutriagent/shared";

export interface RagSourceCitation {
  title: string;
  url: string;
  publishedDate: string | null;
  fetchedAt: string;
}

export function hitsToSources(hits: HybridSearchHit[]): RagSourceCitation[] {
  const seen = new Set<string>();
  const sources: RagSourceCitation[] = [];
  for (const hit of hits) {
    if (seen.has(hit.sourceUrl)) continue;
    seen.add(hit.sourceUrl);
    sources.push({
      title: hit.title,
      url: hit.sourceUrl,
      publishedDate: hit.publishedDate?.toISOString() ?? null,
      fetchedAt: hit.fetchedAt.toISOString(),
    });
  }
  return sources;
}

export function hitsToContext(hits: HybridSearchHit[]): string[] {
  return hits.map((h) => `${h.title}: ${h.content}`);
}

export async function generateRagAnswer(params: {
  question: string;
  hits: HybridSearchHit[];
  weakMatch: boolean;
  apiKey?: string | null;
  model?: string;
  responseLanguage?: ResponseLanguage;
  preferredLanguage?: string | null;
}): Promise<string> {
  const context = params.hits.map((h, i) => `[${i + 1}] ${h.title} (${h.sourceUrl})\n${h.content}`).join("\n\n");

  const lang =
    params.responseLanguage ??
    resolveResponseLanguage(params.question, params.preferredLanguage ?? null);

  const system = [
    "You are a nutrition assistant. Answer using ONLY the provided sources.",
    "Cite source titles inline.",
    responseLanguageInstruction(lang),
  ].join(" ");

  const user = params.weakMatch
    ? `${WEAK_MATCH_DISCLAIMER}\n\nQuestion: ${params.question}\n\nSources:\n${context}`
    : `Question: ${params.question}\n\nSources:\n${context}`;

  const answer = await openRouterChat({
    apiKey: params.apiKey,
    model: params.model,
    maxTokens: 700,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  if (params.weakMatch && answer && !answer.includes(WEAK_MATCH_DISCLAIMER.slice(0, 12))) {
    return `${WEAK_MATCH_DISCLAIMER}\n\n${answer}`;
  }

  return answer ?? WEAK_MATCH_DISCLAIMER;
}
