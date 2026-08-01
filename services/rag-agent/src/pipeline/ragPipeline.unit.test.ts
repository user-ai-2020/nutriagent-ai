import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MATCH_SCORE_THRESHOLD } from "../search/hybridSearch.js";
import { buildTimedOutRagResponse, passesMatchGate, runRagPipeline } from "./ragPipeline.js";
import type { HybridSearchHit } from "../search/hybridSearch.js";
import { RAG_EMBEDDING_DIMENSIONS } from "@nutriagent/shared";
import { MAX_FALLBACK_ROUNDS, WEAK_MATCH_DISCLAIMER } from "../config/ragConstants.js";

function mockHit(overrides: Partial<HybridSearchHit> & { chunkId: string }): HybridSearchHit {
  return {
    documentId: "doc",
    content: "content",
    chunkIndex: 0,
    rrfScore: 0.01,
    vectorSimilarity: 0.1,
    keywordScore: 0,
    matchScore: 10,
    title: "Title",
    sourceUrl: "https://www.nih.gov/a",
    sourceDomain: "www.nih.gov",
    publishedDate: null,
    fetchedAt: new Date(),
    ...overrides,
  };
}

describe("passesMatchGate", () => {
  it("passes at threshold and fails below", () => {
    assert.equal(passesMatchGate([mockHit({ chunkId: "a", matchScore: MATCH_SCORE_THRESHOLD })]), true);
    assert.equal(passesMatchGate([mockHit({ chunkId: "b", matchScore: MATCH_SCORE_THRESHOLD - 1 })]), false);
    assert.equal(passesMatchGate([]), false);
  });
});

describe("runRagPipeline", () => {
  it("skips fallback when match gate passes on first search", async () => {
    let searchCalls = 0;
    let ingestCalls = 0;

    const result = await runRagPipeline(
      { question: "daily protein", enableWebFallback: true },
      {
        getSettings: async () => ({
          openRouterApiKey: "k",
          chatModel: "c",
          visionModel1: "v1",
          visionModel2: "v2",
          routerModel: "r",
          ragModel: "rag",
          text2sqlModel: "t",
          graphdbModel: "g",
        }),
        extractKeywords: async () => "protein",
        embedQuery: async () => [new Array(RAG_EMBEDDING_DIMENSIONS).fill(0.1)],
        embed: async (texts) => texts.map(() => new Array(RAG_EMBEDDING_DIMENSIONS).fill(0.2)),
        hybridSearchFn: async () => [mockHit({ chunkId: "good", matchScore: 92 })],
        searchTrusted: async () => {
          searchCalls += 1;
          return [];
        },
        ingest: async () => {
          ingestCalls += 1;
          return { documentId: "d", skipped: false };
        },
        generateAnswer: async ({ weakMatch }) => (weakMatch ? "weak" : "strong answer"),
      }
    );

    assert.equal(result.usedWebFallback, false);
    assert.equal(result.fallbackRounds, 0);
    assert.equal(searchCalls, 0);
    assert.equal(ingestCalls, 0);
    assert.equal(result.matchScore, 92);
    assert.equal(result.answer, "strong answer");
  });

  it("runs fallback up to max rounds when gate keeps failing", async () => {
    let hybridCalls = 0;
    let searchCalls = 0;
    let ingestCalls = 0;

    const result = await runRagPipeline(
      { question: "כמה חלבון?", enableWebFallback: true, maxFallbackRounds: MAX_FALLBACK_ROUNDS },
      {
        getSettings: async () => ({
          openRouterApiKey: "k",
          chatModel: "c",
          visionModel1: "v1",
          visionModel2: "v2",
          routerModel: "r",
          ragModel: "rag",
          text2sqlModel: "t",
          graphdbModel: "g",
        }),
        extractKeywords: async () => "protein intake",
        embedQuery: async () => [new Array(RAG_EMBEDDING_DIMENSIONS).fill(0.1)],
        embed: async (texts) => texts.map(() => new Array(RAG_EMBEDDING_DIMENSIONS).fill(0.2)),
        hybridSearchFn: async () => {
          hybridCalls += 1;
          return [mockHit({ chunkId: `hit-${hybridCalls}`, matchScore: 25 })];
        },
        searchTrusted: async () => {
          searchCalls += 1;
          return [{ url: "https://www.nih.gov/article", title: "NIH", domain: "www.nih.gov" }];
        },
        ingest: async () => {
          ingestCalls += 1;
          return { documentId: "new", skipped: false };
        },
        generateAnswer: async ({ weakMatch }) =>
          weakMatch ? `${WEAK_MATCH_DISCLAIMER}\n\nPartial info.` : "ok",
      }
    );

    assert.equal(result.usedWebFallback, true);
    assert.equal(result.fallbackRounds, MAX_FALLBACK_ROUNDS);
    assert.equal(searchCalls, MAX_FALLBACK_ROUNDS, "must not run a third fallback search");
    assert.ok(ingestCalls >= 1);
    assert.equal(hybridCalls, 1 + MAX_FALLBACK_ROUNDS);
    assert.ok(result.matchScore < MATCH_SCORE_THRESHOLD);
    assert.match(result.answer, new RegExp(WEAK_MATCH_DISCLAIMER.slice(0, 12)));
  });

  it("terminates with disclaimer when all trusted searches return zero links", async () => {
    let searchCalls = 0;

    const result = await runRagPipeline(
      { question: "vitamin D", enableWebFallback: true, maxFallbackRounds: 2 },
      {
        getSettings: async () => ({
          openRouterApiKey: "k",
          chatModel: "c",
          visionModel1: "v1",
          visionModel2: "v2",
          routerModel: "r",
          ragModel: "rag",
          text2sqlModel: "t",
          graphdbModel: "g",
        }),
        extractKeywords: async () => "vitamin d",
        embedQuery: async () => [new Array(RAG_EMBEDDING_DIMENSIONS).fill(0.05)],
        embed: async (texts) => texts.map(() => new Array(RAG_EMBEDDING_DIMENSIONS).fill(0.05)),
        hybridSearchFn: async () => [mockHit({ chunkId: "weak", matchScore: 15 })],
        searchTrusted: async () => {
          searchCalls += 1;
          return [];
        },
        ingest: async () => {
          throw new Error("ingest must not run when search returns no links");
        },
        generateAnswer: async ({ weakMatch, hits }) => {
          assert.equal(weakMatch, true);
          assert.ok(hits.length >= 0);
          return `${WEAK_MATCH_DISCLAIMER}\n\nNo new sources found.`;
        },
      }
    );

    assert.equal(searchCalls, 2);
    assert.equal(result.fallbackRounds, 2);
    assert.match(result.answer, /לא נמצא מקור/);
  });
});

describe("buildTimedOutRagResponse", () => {
  it("returns the weak-match disclaimer with empty/zeroed fields, not a raw error shape", () => {
    const result = buildTimedOutRagResponse();

    assert.equal(result.answer, WEAK_MATCH_DISCLAIMER);
    assert.equal(result.matchScore, 0);
    assert.equal(result.usedWebFallback, false);
    assert.equal(result.fallbackRounds, 0);
    assert.deepEqual(result.sources, []);
    assert.deepEqual(result.context, []);
    // Same RagQueryResponse shape the client already knows how to render for a
    // weak match — no separate "error" field the UI would need special-casing for.
    assert.ok(!("error" in result));
  });
});
