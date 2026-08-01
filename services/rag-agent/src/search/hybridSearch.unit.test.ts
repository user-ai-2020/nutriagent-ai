import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KEYWORD_RANK_SATURATION,
  MATCH_SCORE_THRESHOLD,
  computeMatchScore,
  formatEmbeddingVector,
  normalizeKeywordScore,
} from "./hybridSearch.js";
import { RAG_EMBEDDING_DIMENSIONS } from "@nutriagent/shared";

describe("computeMatchScore", () => {
  it("returns 100 for strong dual signals (high cosine + saturated ts_rank)", () => {
    assert.equal(computeMatchScore(1, KEYWORD_RANK_SATURATION), 100);
  });

  it("returns vector-only score when keyword leg did not match", () => {
    assert.equal(computeMatchScore(0.85, 0), 85);
  });

  it("returns keyword-only score when vector similarity is zero", () => {
    assert.equal(computeMatchScore(0, KEYWORD_RANK_SATURATION * 0.5), 50);
  });

  it("returns 0 when both absolute signals are zero", () => {
    assert.equal(computeMatchScore(0, 0), 0);
  });

  it("does not penalize strong vector when keyword ts_rank is weak but non-zero", () => {
    assert.equal(computeMatchScore(1, KEYWORD_RANK_SATURATION * 0.04), 100);
  });

  it("stays below gate for weak vector-only match despite being sole candidate", () => {
    assert.ok(computeMatchScore(0.05, 0) < MATCH_SCORE_THRESHOLD);
  });

  it("boosts dual moderate signals above either alone", () => {
    const vectorOnly = computeMatchScore(0.8, 0);
    const dual = computeMatchScore(0.8, KEYWORD_RANK_SATURATION * 0.5);
    assert.ok(dual > vectorOnly);
    assert.equal(dual, 90);
  });
});

describe("normalizeKeywordScore", () => {
  it("saturates at 1 when ts_rank reaches KEYWORD_RANK_SATURATION", () => {
    assert.equal(normalizeKeywordScore(KEYWORD_RANK_SATURATION), 1);
    assert.equal(normalizeKeywordScore(KEYWORD_RANK_SATURATION * 2), 1);
  });
});

describe("formatEmbeddingVector", () => {
  it("formats a vector literal matching DB dimension", () => {
    const values = Array.from({ length: RAG_EMBEDDING_DIMENSIONS }, (_, i) => i * 0.001);
    const literal = formatEmbeddingVector(values);
    assert.match(literal, /^\[[\d.,]+\]$/);
    assert.equal(literal.split(",").length, RAG_EMBEDDING_DIMENSIONS);
  });

  it("throws when embedding length mismatches RAG_EMBEDDING_DIMENSIONS", () => {
    assert.throws(() => formatEmbeddingVector([0.1, 0.2]), /does not match RAG_EMBEDDING_DIMENSIONS/);
  });
});
