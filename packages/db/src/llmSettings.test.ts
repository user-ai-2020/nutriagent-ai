import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

describe("resolveOpenRouterApiKey via getLlmSettings", () => {
  const original = process.env.OPENROUTER_API_KEY;

  afterEach(() => {
    if (original === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = original;
  });

  it("prefers OPENROUTER_API_KEY env over stored DB value when env is set", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-env-key";
    const { getLlmSettings } = await import("./llmSettings.js");
    const prisma = (await import("./client.js")).prisma;

    const originalFind = prisma.llmSettings.findUnique;
    // Prisma's delegate returns a PrismaPromise, not a plain Promise, so the stub
    // has to be cast through unknown — casting only the returned object leaves the
    // function type incompatible and fails `tsc`.
    prisma.llmSettings.findUnique = (async () => ({
      id: 1,
      openRouterApiKey: "sk-or-stale-db-key",
      chatModel: "openai/gpt-4o",
      visionModel1: "openai/gpt-4o",
      visionModel2: "google/gemini-2.0-flash-001",
      routerModel: "openai/gpt-4o-mini",
      ragModel: "openai/gpt-4o-mini",
      text2sqlModel: "openai/gpt-4o-mini",
      graphdbModel: "openai/gpt-4o-mini",
    })) as unknown as typeof prisma.llmSettings.findUnique;

    try {
      const settings = await getLlmSettings();
      assert.equal(settings.openRouterApiKey, "sk-or-env-key");
    } finally {
      prisma.llmSettings.findUnique = originalFind;
    }
  });
});
