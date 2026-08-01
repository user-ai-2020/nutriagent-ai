/**
 * Full NutriAgent diagnostic — run: node scripts/diagnose-app.mjs
 */
const API = process.env.API_URL || "http://localhost:3000";
const USER_PORTAL = process.env.USER_PORTAL_URL || "http://localhost:3008";
const ADMIN_PORTAL = process.env.ADMIN_PORTAL_URL || "http://localhost:3007";

const results = [];

function record(area, test, status, detail = "") {
  results.push({ area, test, status, detail });
  const icon = status === "pass" ? "✓" : status === "warn" ? "!" : "✗";
  console.log(`${icon} [${area}] ${test}${detail ? ` — ${detail}` : ""}`);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

async function login(email, password) {
  const { ok, body } = await fetchJson(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!ok) throw new Error(body?.error || "login failed");
  return body.token;
}

async function apiGet(path, token) {
  return fetchJson(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

async function apiPost(path, token, data) {
  return fetchJson(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// 1x1 red JPEG
const TINY_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

async function testHealth() {
  const services = [
    ["API Gateway", `${API}/health`],
    ["Orchestrator", "http://localhost:3001/health"],
    ["Vision Agent", "http://localhost:3002/health"],
    ["Nutrition Agent", "http://localhost:3003/health"],
    ["RAG Agent", "http://localhost:3004/health"],
    ["Text2SQL Agent", "http://localhost:3005/health"],
    ["GraphDB Agent", "http://localhost:3006/health"],
  ];
  for (const [name, url] of services) {
    try {
      const { ok, body } = await fetchJson(url);
      record("Health", name, ok ? "pass" : "fail", ok ? body?.status || body?.service : JSON.stringify(body));
    } catch (e) {
      record("Health", name, "fail", e.message);
    }
  }
}

async function testPortals() {
  for (const [name, base] of [
    ["User Portal /", USER_PORTAL],
    ["User Portal /app/chat", `${USER_PORTAL}/app/chat`],
    ["User Portal /register", `${USER_PORTAL}/register`],
    ["Admin Portal /", ADMIN_PORTAL],
    ["Admin Portal /users", `${ADMIN_PORTAL}/users`],
    ["Admin Portal /llm", `${ADMIN_PORTAL}/llm`],
  ]) {
    try {
      const res = await fetch(base);
      record("Portal", name, res.ok ? "pass" : "fail", `HTTP ${res.status}`);
    } catch (e) {
      record("Portal", name, "fail", e.message);
    }
  }
}

async function testAuth() {
  const bad = await fetchJson(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "bad@test.com", password: "wrong" }),
  });
  record("Auth", "Invalid login rejected", !bad.ok ? "pass" : "fail");

  try {
    const userToken = await login("user@nutriagent.ai", "user123");
    record("Auth", "User login", userToken ? "pass" : "fail");
    const adminToken = await login("admin@nutriagent.ai", "admin123");
    record("Auth", "Admin login", adminToken ? "pass" : "fail");
    return { userToken, adminToken };
  } catch (e) {
    record("Auth", "Demo login", "fail", e.message);
    return { userToken: null, adminToken: null };
  }
}

async function testUserApi(token) {
  if (!token) return;

  const profile = await apiGet("/api/profile", token);
  record("Profile", "GET /api/profile", profile.ok ? "pass" : "fail", profile.ok ? `diet=${profile.body?.dietType}` : profile.body?.error);

  const dash = await apiGet("/api/dashboard", token);
  record(
    "Dashboard",
    "GET /api/dashboard",
    dash.ok ? "pass" : "fail",
    dash.ok ? `${dash.body?.todayTotals?.calories ?? 0} kcal today, ${dash.body?.mealCount ?? 0} meals` : dash.body?.error
  );

  const meals = await apiGet("/api/meals", token);
  record("Meals", "GET /api/meals", meals.ok ? "pass" : "fail", meals.ok ? `${meals.body?.length ?? 0} meals` : meals.body?.error);

  if (meals.ok && meals.body?.[0]) {
    const meal = await apiGet(`/api/meals/${meals.body[0].mealId}`, token);
    record("Meals", "GET /api/meals/:id", meal.ok ? "pass" : "fail");
  }

  const history = await apiGet("/api/chat/history", token);
  record("Chat", "GET /api/chat/history", history.ok ? "pass" : "fail", history.ok ? `${history.body?.length ?? 0} messages` : history.body?.error);
}

async function testChatIntents(token) {
  if (!token) return;
  const prompts = [
    ["What should I eat now?", "nutrition_advice"],
    ["What did I eat yesterday?", "history_query"],
    ["How many calories did I eat today?", "history_query"],
    ["What is a balanced diet?", "nutrition_advice"],
  ];

  for (const [message, expectedIntent] of prompts) {
    const start = Date.now();
    const { ok, body } = await apiPost("/api/chat/message", token, { message });
    const ms = Date.now() - start;
    if (!ok) {
      record("Chat", `"${message.slice(0, 30)}…"`, "fail", body?.error || "error");
      continue;
    }
    const intentOk = body.intent === expectedIntent;
    const hasReply = Boolean(body.reply?.trim());
    const status = intentOk && hasReply ? "pass" : intentOk || hasReply ? "warn" : "fail";
    record(
      "Chat",
      `"${message.slice(0, 35)}"`,
      status,
      `intent=${body.intent} (exp ${expectedIntent}), ${ms}ms, reply=${body.reply?.slice(0, 60)}…`
    );
  }
}

async function testMealUpload(token) {
  if (!token) return;
  const buf = Buffer.from(TINY_JPEG_B64, "base64");
  const form = new FormData();
  form.append("message", "Analyze this meal");
  form.append("image", new Blob([buf], { type: "image/jpeg" }), "test-meal.jpg");

  const start = Date.now();
  try {
    const res = await fetch(`${API}/api/chat/message`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    const ms = Date.now() - start;
    if (!res.ok) {
      record("Meal scan", "Photo upload + analyze", "fail", `${body?.error || res.status} (${ms}ms)`);
      return;
    }
    const hasMeal = Boolean(body.mealId || body.multiModelMealAnalysis || body.mealAnalysis);
    record(
      "Meal scan",
      "Photo upload + analyze",
      hasMeal ? "pass" : "warn",
      `intent=${body.intent}, mealId=${body.mealId ?? "none"}, ${ms}ms`
    );
  } catch (e) {
    record("Meal scan", "Photo upload + analyze", "fail", e.message);
  }
}

async function testAdmin(adminToken) {
  if (!adminToken) return;

  for (const [label, path] of [
    ["GET /api/admin/users", "/api/admin/users"],
    ["GET /api/admin/stats", "/api/admin/stats"],
    ["GET /api/admin/audit-logs", "/api/admin/audit-logs?limit=5"],
    ["GET /api/admin/llm", "/api/admin/llm"],
  ]) {
    const { ok, body } = await apiGet(path, adminToken);
    record("Admin", label, ok ? "pass" : "fail", ok ? JSON.stringify(body).slice(0, 80) : body?.error);
  }

  const userDenied = await apiGet("/api/admin/users", await login("user@nutriagent.ai", "user123"));
  record("Admin", "User blocked from admin routes", !userDenied.ok ? "pass" : "fail");
}

async function testOpenRouter() {
  const { ok, body } = await fetchJson("http://localhost:3003/advise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "test protein needs",
      profile: { dietType: "balanced", healthRestrictions: [], allergies: [] },
    }),
  });
  const isMock = body?.reply?.includes("personalized nutrition guidance based on your goals");
  record(
    "OpenRouter",
    "Nutrition LLM",
    isMock ? "warn" : ok ? "pass" : "fail",
    isMock ? "Falling back to mock — API key likely invalid" : body?.reply?.slice(0, 60)
  );
}

async function main() {
  console.log("\n=== NutriAgent Full Diagnostic ===\n");
  await testHealth();
  await testPortals();
  const { userToken, adminToken } = await testAuth();
  await testUserApi(userToken);
  await testChatIntents(userToken);
  await testMealUpload(userToken);
  await testAdmin(adminToken);
  await testOpenRouter();

  const pass = results.filter((r) => r.status === "pass").length;
  const warn = results.filter((r) => r.status === "warn").length;
  const fail = results.filter((r) => r.status === "fail").length;
  console.log(`\n=== Summary: ${pass} pass, ${warn} warn, ${fail} fail ===\n`);

  if (fail > 0 || warn > 0) {
    console.log("Issues:");
    for (const r of results.filter((x) => x.status !== "pass")) {
      console.log(`  [${r.status}] ${r.area} / ${r.test}: ${r.detail}`);
    }
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
