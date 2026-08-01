#!/usr/bin/env node
/**
 * On-demand NutriAgent functional diagnostics (no automatic / interval runs).
 *
 * Usage:
 *   node scripts/diagnostics.mjs --once     # run checks now, exit 1 if unhealthy
 *   node scripts/diagnostics.mjs --serve    # HTTP server; checks run only on POST /diagnostics/run
 *
 * Serve mode:
 *   GET  /diagnostics/status  — last completed report (or null before first run)
 *   POST /diagnostics/run     — run all checks now, return JSON report
 *   GET  /health              — server up (does not run checks)
 *
 * Env: API_URL, DATABASE_URL, REDIS_URL, agent URLs,
 *      DIAGNOSTIC_FAILURE_THRESHOLD (default 2), DIAGNOSTIC_FETCH_TIMEOUT_MS (default 10000),
 *      DIAGNOSTIC_PORT (default 3099), DIAGNOSTIC_DISABLED=true to no-op runs.
 */
import http from "node:http";
import {
  createFailureTracker,
  evaluateResults,
  runAllChecks,
} from "./lib/diagnosticChecks.mjs";

const PORT = Number(process.env.DIAGNOSTIC_PORT || 3099);
const ONCE = process.argv.includes("--once");
const SERVE = process.argv.includes("--serve");

let lastReport = null;
let runInProgress = false;
const tracker = createFailureTracker();

function envConfig() {
  return {
    API_URL: process.env.API_URL || "http://localhost:3000",
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
    ORCHESTRATOR_URL: process.env.ORCHESTRATOR_URL,
    RAG_AGENT_URL: process.env.RAG_AGENT_URL,
    TEXT2SQL_AGENT_URL: process.env.TEXT2SQL_AGENT_URL,
    VISION_AGENT_URL: process.env.VISION_AGENT_URL,
    NUTRITION_AGENT_URL: process.env.NUTRITION_AGENT_URL,
    GRAPHDB_AGENT_URL: process.env.GRAPHDB_AGENT_URL,
  };
}

function logLine(report) {
  for (const check of report.checks) {
    const payload = {
      timestamp: report.timestamp,
      check: check.name,
      pass: check.pass,
      flagged: check.flagged,
      consecutiveFailures: check.consecutiveFailures,
      latencyMs: check.latencyMs,
      error: check.error,
      detail: check.detail,
    };
    console.log(JSON.stringify(payload));
  }
  console.log(
    JSON.stringify({
      timestamp: report.timestamp,
      event: "summary",
      healthy: report.healthy,
      flaggedChecks: report.checks.filter((c) => c.flagged).map((c) => c.name),
    })
  );
}

async function runCycle() {
  if (process.env.DIAGNOSTIC_DISABLED === "true") {
    lastReport = { healthy: true, checks: [], timestamp: new Date().toISOString(), disabled: true };
    return lastReport;
  }
  const results = await runAllChecks(envConfig());
  lastReport = evaluateResults(results, tracker);
  logLine(lastReport);
  return lastReport;
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function startServer() {
  const server = http.createServer((req, res) => {
    const path = req.url?.split("?")[0];

    if (path === "/health" && req.method === "GET") {
      jsonResponse(res, 200, { status: "ok", service: "diagnostic-monitor", lastRun: lastReport?.timestamp ?? null });
      return;
    }

    if (path === "/diagnostics/status" && req.method === "GET") {
      jsonResponse(res, 200, lastReport ?? { healthy: null, checks: [], timestamp: null });
      return;
    }

    if (path === "/diagnostics/run" && req.method === "POST") {
      if (runInProgress) {
        jsonResponse(res, 409, { error: "A diagnostic run is already in progress" });
        return;
      }
      runInProgress = true;
      runCycle()
        .then((report) => jsonResponse(res, 200, report))
        .catch((err) => jsonResponse(res, 500, { error: String(err) }))
        .finally(() => {
          runInProgress = false;
        });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(PORT, () => {
    console.log(
      JSON.stringify({
        event: "diagnostics-server",
        port: PORT,
        mode: "on-demand",
        trigger: "POST /diagnostics/run",
      })
    );
  });
}

function printUsage() {
  console.error(`Usage:
  node scripts/diagnostics.mjs --once   Run checks once and exit
  node scripts/diagnostics.mjs --serve  Listen for POST /diagnostics/run (no automatic runs)`);
}

async function main() {
  if (ONCE && SERVE) {
    console.error("Use either --once or --serve, not both.");
    process.exit(1);
  }
  if (!ONCE && !SERVE) {
    printUsage();
    process.exit(1);
  }

  if (SERVE) {
    startServer();
    return;
  }

  await runCycle();
  process.exit(lastReport?.healthy ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
