import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  checkPostgres,
  checkRedis,
  createFailureTracker,
  evaluateResults,
  fetchJson,
} from "./lib/diagnosticChecks.mjs";

test("createFailureTracker requires N consecutive failures before flagging", () => {
  const tracker = createFailureTracker(2);
  let r = tracker.record("x", false);
  assert.equal(r.flagged, false);
  r = tracker.record("x", false);
  assert.equal(r.flagged, true);
  r = tracker.record("x", true);
  assert.equal(r.flagged, false);
  assert.equal(tracker.get("x"), 0);
});

test("evaluateResults marks unhealthy when any check is flagged", () => {
  const tracker = createFailureTracker(1);
  const report = evaluateResults(
    [
      { name: "a", pass: true, latencyMs: 1 },
      { name: "b", pass: false, latencyMs: 2, error: "down" },
    ],
    tracker
  );
  assert.equal(report.healthy, false);
  assert.equal(report.checks[1].flagged, true);
});

test("checkPostgres uses injected loginFn", async () => {
  let called = false;
  const r = await checkPostgres("http://api", async () => {
    called = true;
    return "token";
  });
  assert.equal(called, true);
  assert.equal(r.pass, false);
});

test("checkRedis uses injected adminLoginFn", async () => {
  let called = false;
  const r = await checkRedis("http://api", async () => {
    called = true;
    return "token";
  });
  assert.equal(called, true);
  assert.equal(r.pass, false);
});

test("checkPostgres surfaces DB errors", async () => {
  const r = await checkPostgres("http://api", async () => {
    throw new Error("connection refused");
  });
  assert.equal(r.pass, false);
  assert.match(r.error, /connection refused/);
});

test("fetchJson fails fast on hung requests", async () => {
  const server = http.createServer(() => {
    /* accept connection, never respond */
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const start = Date.now();
    const r = await fetchJson(`http://127.0.0.1:${port}/hang`, {}, 200);
    const elapsed = Date.now() - start;
    assert.equal(r.ok, false);
    assert.match(r.error, /timed out after 200ms/);
    assert.ok(elapsed < 800, `expected fast fail, took ${elapsed}ms`);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
