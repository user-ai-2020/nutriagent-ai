import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RateLimitError, checkRateLimit, resetRateLimits } from "./rateLimit.js";

describe("checkRateLimit", () => {
  it("throws after limit exceeded within one minute", () => {
    resetRateLimits();
    checkRateLimit("cdc.gov", 2);
    checkRateLimit("cdc.gov", 2);
    assert.throws(() => checkRateLimit("cdc.gov", 2), RateLimitError);
  });
});
