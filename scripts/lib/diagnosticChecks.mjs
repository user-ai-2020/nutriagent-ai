/**
 * Shared diagnostic check implementations — imported by diagnostics.mjs and unit tests.
 */

export const DEFAULT_FAILURE_THRESHOLD = Number(process.env.DIAGNOSTIC_FAILURE_THRESHOLD || 2);
/** Per-request HTTP timeout — fail fast instead of hanging on platform default (~30s). */
export const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.DIAGNOSTIC_FETCH_TIMEOUT_MS || 10_000);

export function createFailureTracker(threshold = DEFAULT_FAILURE_THRESHOLD) {
  const streaks = new Map();
  return {
    record(name, passed) {
      const prev = streaks.get(name) ?? 0;
      const next = passed ? 0 : prev + 1;
      streaks.set(name, next);
      return { consecutiveFailures: next, flagged: !passed && next >= threshold };
    },
    get(name) {
      return streaks.get(name) ?? 0;
    },
  };
}

export async function fetchWithTimeout(url, opts = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, opts = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(url, opts, timeoutMs);
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return {
      ok: res.ok,
      status: res.status,
      body,
      latencyMs: Date.now() - start,
      error: res.ok ? undefined : typeof body === "object" ? body?.error : String(body),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: null,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkPostgres(apiUrl, loginFn, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const start = Date.now();
  try {
    const api = apiUrl || "http://localhost:3000";
    const login =
      loginFn ??
      (async () => {
        const res = await fetchWithTimeout(
          `${api}/api/auth/login`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "user@nutriagent.ai", password: "user123" }),
          },
          timeoutMs
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "login failed");
        return body.token;
      });
    const token = await login();
    const res = await fetchWithTimeout(
      `${api}/api/meals?limit=1`,
      { headers: { Authorization: `Bearer ${token}` } },
      timeoutMs
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return { name: "postgres", pass: true, latencyMs: Date.now() - start, detail: "meals query ok" };
  } catch (err) {
    return {
      name: "postgres",
      pass: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkRedis(apiUrl, adminLoginFn, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const start = Date.now();
  try {
    const api = apiUrl || "http://localhost:3000";
    const login =
      adminLoginFn ??
      (async () => {
        const res = await fetchWithTimeout(
          `${api}/api/auth/login`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "admin@nutriagent.ai", password: "admin123" }),
          },
          timeoutMs
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "admin login failed");
        return body.token;
      });
    const token = await login();
    const res = await fetchWithTimeout(
      `${api}/api/admin/audit-logs?limit=1`,
      { headers: { Authorization: `Bearer ${token}` } },
      timeoutMs
    );
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return {
      name: "redis",
      pass: true,
      latencyMs: Date.now() - start,
      detail: `audit source=${body.source ?? "postgres"}`,
    };
  } catch (err) {
    return {
      name: "redis",
      pass: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Build health/functional checks that do not call OpenRouter or other paid LLM APIs. */
export function buildServiceChecks(env) {
  const api = env.API_URL || "http://localhost:3000";
  return [
    {
      name: "api-gateway-health",
      run: () => fetchJson(`${api}/health`),
    },
    {
      name: "api-gateway-db",
      run: async () => {
        const login = await fetchJson(`${api}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "user@nutriagent.ai", password: "user123" }),
        });
        if (!login.ok) return login;
        return fetchJson(`${api}/api/dashboard`, {
          headers: { Authorization: `Bearer ${login.body.token}` },
        });
      },
    },
    {
      name: "vision-analyze-mock",
      run: () =>
        fetchJson(`${env.VISION_AGENT_URL || "http://localhost:3002"}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "salad" }),
        }),
    },
    {
      name: "graphdb-recommend",
      run: () =>
        fetchJson(`${env.GRAPHDB_AGENT_URL || "http://localhost:3006"}/recommend`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile: { dietType: "balanced", healthRestrictions: [], allergies: [] },
            foodQuery: "chicken",
          }),
        }),
    },
    {
      name: "admin-role-guard",
      run: async () => {
        const login = await fetchJson(`${api}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "user@nutriagent.ai", password: "user123" }),
        });
        if (!login.ok) return login;
        const denied = await fetchJson(`${api}/api/admin/users`, {
          headers: { Authorization: `Bearer ${login.body.token}` },
        });
        return {
          ok: denied.status === 403,
          status: denied.status,
          body: denied.body,
          latencyMs: denied.latencyMs,
          error: denied.status === 403 ? undefined : `Expected 403, got ${denied.status}`,
        };
      },
    },
  ];
}

export async function runAllChecks(env, deps = {}) {
  const results = [];
  results.push(await checkPostgres(env.API_URL || "http://localhost:3000", deps.postgresLogin));
  results.push(await checkRedis(env.API_URL || "http://localhost:3000", deps.adminLogin));

  for (const check of buildServiceChecks(env)) {
    const start = Date.now();
    const raw = await check.run();
    const pass = raw.ok === true;
    results.push({
      name: check.name,
      pass,
      latencyMs: raw.latencyMs ?? Date.now() - start,
      error: pass ? undefined : raw.error || `HTTP ${raw.status}`,
      detail: pass && raw.body ? summarizeBody(raw.body) : undefined,
    });
  }
  return results;
}

function summarizeBody(body) {
  if (Array.isArray(body)) return `${body.length} items`;
  if (body && typeof body === "object") {
    if ("rowCount" in body) return `rowCount=${body.rowCount}`;
    if ("sources" in body) return `sources=${body.sources?.length ?? 0}`;
    if ("intent" in body) return `intent=${body.intent}`;
    if ("status" in body) return String(body.status);
  }
  return undefined;
}

export function evaluateResults(results, tracker) {
  const evaluated = results.map((r) => {
    const { consecutiveFailures, flagged } = tracker.record(r.name, r.pass);
    return { ...r, consecutiveFailures, flagged };
  });
  const healthy = evaluated.every((r) => !r.flagged);
  return { healthy, checks: evaluated, timestamp: new Date().toISOString() };
}
