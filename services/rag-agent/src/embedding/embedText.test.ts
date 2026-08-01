import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMBEDDING_MODEL, RAG_EMBEDDING_DIMENSIONS } from "@nutriagent/shared";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("embedding configuration", () => {
  it("uses multilingual embedding model id (Task 5)", () => {
    assert.match(EMBEDDING_MODEL, /multilingual-e5-large|EMBEDDING_MODEL/);
    assert.equal(RAG_EMBEDDING_DIMENSIONS, 1024);
  });

  it("createOpenRouterEmbedder passes EMBEDDING_MODEL to openRouterEmbed", () => {
    const file = readFileSync(path.resolve(import.meta.dirname, "embedText.ts"), "utf8");
    assert.match(file, /model:\s*EMBEDDING_MODEL/);
    assert.match(file, /openRouterEmbed/);
  });
});
