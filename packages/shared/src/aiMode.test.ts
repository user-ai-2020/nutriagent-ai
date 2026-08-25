import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAiStatus } from "./aiMode";

describe("resolveAiStatus", () => {
  it("prefers env key over database", () => {
    assert.deepEqual(
      resolveAiStatus({ envKey: "sk-or-v1-env", storedKey: "sk-or-v1-db" }),
      { mode: "live", hasApiKey: true, apiKeySource: "env" }
    );
  });

  it("uses database key when env is empty", () => {
    assert.deepEqual(resolveAiStatus({ envKey: "", storedKey: "sk-or-v1-db" }), {
      mode: "live",
      hasApiKey: true,
      apiKeySource: "database",
    });
  });

  it("returns mock when no key is configured", () => {
    assert.deepEqual(resolveAiStatus({ envKey: null, storedKey: null }), {
      mode: "mock",
      hasApiKey: false,
      apiKeySource: "none",
    });
  });
});
