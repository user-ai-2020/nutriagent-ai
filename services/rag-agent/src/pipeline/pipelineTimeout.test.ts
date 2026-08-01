import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withPipelineTimeout, PipelineTimeoutError } from "./pipelineTimeout.js";

describe("withPipelineTimeout", () => {
  it("resolves normally when the wrapped promise finishes before the wall-clock cap", async () => {
    const result = await withPipelineTimeout(Promise.resolve("ok"), 20);
    assert.equal(result, "ok");
  });

  it("rejects with PipelineTimeoutError when the wrapped promise exceeds the wall-clock cap", async () => {
    // A promise that never settles on its own; unref'd so it can't keep the test
    // process alive after the timeout race is decided.
    const neverResolves = new Promise<never>(() => {
      const timer = setTimeout(() => {}, 24 * 60 * 60 * 1000);
      timer.unref();
    });

    await assert.rejects(() => withPipelineTimeout(neverResolves, 20), PipelineTimeoutError);
  });
});
