import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@nutriagent/db";
import { hybridSearch } from "./hybridSearch.js";
import {
  basisVector,
  clearHybridTestChunks,
  seedHybridTestChunks,
  seedHebrewProteinChunk,
  seedSingleIrrelevantReadyDoc,
} from "./hybridSearch.fixtures.js";
import { MATCH_SCORE_THRESHOLD } from "./hybridSearch.js";

const dbAvailable = Boolean(process.env.DATABASE_URL);

describe("hybridSearch (integration)", { skip: !dbAvailable && "DATABASE_URL not set" }, () => {
  before(async () => {
    await seedHybridTestChunks();
  });

  after(async () => {
    await clearHybridTestChunks();
    await prisma.$disconnect();
  });

  it("ranks protein chunk first for protein keyword + matching embedding", async () => {
    const hits = await hybridSearch(prisma, {
      queryText: "protein intake",
      queryEmbedding: basisVector(1, 0),
      limit: 5,
    });

    assert.ok(hits.length >= 1);
    assert.equal(hits[0]!.chunkId, "hybrid-test-chunk-protein");
    assert.match(hits[0]!.content, /protein/i);
    assert.ok(hits[0]!.vectorSimilarity > 0.9);
    assert.ok(hits[0]!.keywordScore > 0);
    assert.ok(hits[0]!.matchScore >= MATCH_SCORE_THRESHOLD);
  });

  it("excludes chunks from non-ready documents", async () => {
    const hits = await hybridSearch(prisma, {
      queryText: "protein",
      queryEmbedding: basisVector(1, 0),
      limit: 10,
    });

    assert.ok(!hits.some((h) => h.chunkId === "hybrid-test-chunk-pending"));
  });

  it("boosts keyword match via RRF when vector alone would prefer another axis", async () => {
    const hits = await hybridSearch(prisma, {
      queryText: "steps cardiovascular",
      queryEmbedding: basisVector(1, 0),
      limit: 5,
    });

    assert.ok(hits.length >= 1);
    assert.equal(hits[0]!.chunkId, "hybrid-test-chunk-steps");
  });

  it("keyword evidence raises matchScore when vector similarity is moderate", async () => {
    const moderateQuery = basisVector(0.5, 0.5);

    const withKeyword = await hybridSearch(prisma, {
      queryText: "protein intake",
      queryEmbedding: moderateQuery,
      limit: 1,
    });
    const withoutKeyword = await hybridSearch(prisma, {
      queryText: "zzzznonexistentterm",
      queryEmbedding: moderateQuery,
      limit: 1,
    });

    assert.ok(withKeyword[0]!.keywordScore > 0);
    assert.equal(withoutKeyword[0]!.keywordScore, 0);
    assert.ok(withKeyword[0]!.matchScore > withoutKeyword[0]!.matchScore);
  });

  it("does not inflate matchScore for sole weak irrelevant hit in thin knowledge base", async () => {
    await seedSingleIrrelevantReadyDoc();

    const hits = await hybridSearch(prisma, {
      queryText: "quantum entanglement physics",
      queryEmbedding: basisVector(1, 0),
      limit: 1,
    });

    assert.equal(hits.length, 1);
    assert.equal(hits[0]!.chunkId, "hybrid-test-chunk-alone");
    assert.equal(hits[0]!.keywordScore, 0);
    assert.ok(
      hits[0]!.vectorSimilarity < 0.2,
      `expected low cosine similarity, got ${hits[0]!.vectorSimilarity}`
    );
    assert.ok(
      hits[0]!.matchScore < MATCH_SCORE_THRESHOLD,
      `thin KB must not pass ${MATCH_SCORE_THRESHOLD}% gate on weak match (got ${hits[0]!.matchScore})`
    );
  });

  it("finds Hebrew keyword matches with simple tsvector config", async () => {
    await seedHebrewProteinChunk();

    const hits = await hybridSearch(prisma, {
      queryText: "חלבון",
      queryEmbedding: basisVector(1, 0),
      limit: 3,
    });

    assert.ok(hits.length >= 1);
    assert.equal(hits[0]!.chunkId, "hybrid-test-chunk-hebrew");
    assert.ok(hits[0]!.keywordScore > 0);
    assert.ok(hits[0]!.matchScore > 0);
  });
});
