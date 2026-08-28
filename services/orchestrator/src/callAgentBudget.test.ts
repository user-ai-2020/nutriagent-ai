import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { callAgentWithTimeout } from "./utils.js";

/**
 * Regression guard for the retry budget.
 *
 * `callAgentWithTimeout` gave every retry a fresh `timeoutMs`, so with the
 * defaults (15s, maxRetries = 2) a dead agent burned 15 + 1 + 15 + 2 + 15 = 48s
 * before throwing — more than three times the budget the caller asked for, and
 * far past the frontend's patience. AGENTS.md rule 3 requires agent latency to
 * stay under the frontend timeout, so all attempts now share one deadline.
 */
describe("callAgentWithTimeout total budget", () => {
  let server: http.Server;
  let url: string;

  before(async () => {
    // A server that accepts the connection and then never answers, which is the
    // failure mode that actually hurt: not a refused connection, a hung one.
    server = http.createServer(() => {
      /* deliberately never responds */
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no server address");
    url = `http://127.0.0.1:${address.port}/hang`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("gives up within the shared deadline instead of once per attempt", async () => {
    const perAttemptMs = 300;
    const started = Date.now();

    await assert.rejects(() => callAgentWithTimeout(url, {}, perAttemptMs, 2));

    const elapsed = Date.now() - started;
    // Old behaviour: ~3 x 300ms of waiting plus 1500ms of backoff. New behaviour
    // caps the whole thing at AGENT_TOTAL_BUDGET_FACTOR (2) x perAttemptMs, with
    // a little slack for scheduling.
    assert.ok(
      elapsed < perAttemptMs * 2 + 400,
      `expected all attempts to finish within the shared budget, took ${elapsed}ms`
    );
  });

  it("still reports the failure rather than resolving with a partial result", async () => {
    await assert.rejects(
      () => callAgentWithTimeout(url, {}, 200, 1),
      (err: unknown) => err instanceof Error && /timed out|budget/i.test(err.message)
    );
  });
});
