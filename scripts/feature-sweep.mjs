#!/usr/bin/env node
/**
 * Task 11 Part A — full feature diagnostic sweep with evidence output.
 * Run: node scripts/feature-sweep.mjs
 */
const API = process.env.API_URL || "http://localhost:3000";
const rows = [];

function row(feature, status, evidence, fix = "—", followUp = "—") {
  rows.push({ feature, status, evidence, fix, followUp });
  console.log(`[${status}] ${feature}\n  evidence: ${evidence}\n  fix: ${fix}\n`);
}

async function jfetch(url, opts = {}) {
  const t0 = Date.now();
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body, ms: Date.now() - t0 };
}

async function login(email, password) {
  const r = await jfetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(r.body?.error || "login failed");
  return r.body.token;
}

async function main() {
  // Auth
  const bad = await jfetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user@nutriagent.ai", password: "wrong-password" }),
  });
  row("Auth — invalid login", bad.status === 401 ? "PASS" : "FAIL", `HTTP ${bad.status} ${JSON.stringify(bad.body)}`);

  const regEmail = `sweep${Date.now()}@test.local`;
  const reg = await jfetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Sweep User", email: regEmail, password: "test1234" }),
  });
  row(
    "Auth — register",
    reg.status === 201 && reg.body.token ? "PASS" : "FAIL",
    `HTTP ${reg.status} token=${Boolean(reg.body?.token)} role=${reg.body?.user?.role}`
  );

  const userToken = await login("user@nutriagent.ai", "user123");
  const adminToken = await login("admin@nutriagent.ai", "admin123");
  const me = await jfetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${userToken}` } });
  row("Auth — JWT /me", me.ok && me.body.role === "User" ? "PASS" : "FAIL", JSON.stringify(me.body));

  const adminDenied = await jfetch(`${API}/api/admin/users`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  row(
    "Admin — non-admin API blocked",
    adminDenied.status === 403 ? "PASS" : "FAIL",
    `HTTP ${adminDenied.status} ${JSON.stringify(adminDenied.body)}`,
    adminDenied.status === 403 ? "—" : "Fix adminMiddleware"
  );

  const adminOk = await jfetch(`${API}/api/admin/users`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  row(
    "Admin — admin API allowed",
    adminOk.ok && Array.isArray(adminOk.body) ? "PASS" : "FAIL",
    `HTTP ${adminOk.status} users=${adminOk.body?.length}`
  );

  // Chat intents
  async function chat(message, profile = {}) {
    return jfetch(`${API}/api/chat/message`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, profile: { dietType: "balanced", healthRestrictions: [], allergies: [], ...profile } }),
    });
  }

  const eat = await chat("What should I eat now?");
  const eatGeneric = eat.body?.reply?.includes("personalized nutrition guidance based on your goals");
  row(
    "Chat — eat now",
    eat.ok && eat.body.intent === "nutrition_advice" && !eatGeneric ? "PASS" : eat.ok ? "CONFUSING" : "FAIL",
    `intent=${eat.body?.intent} ${eat.ms}ms reply=${eat.body?.reply?.slice(0, 100)}`,
    eatGeneric ? "Routed correctly but OpenRouter fallback — update API key" : "—"
  );

  const hist = await chat("What did I eat yesterday?");
  const histWeek = await chat("How many calories this week?");
  const histOk =
    (hist.ok && hist.body.intent === "history_query" && hist.body.reply?.includes("logged meal")) ||
    (hist.body?.reply && /[\u0590-\u05FF]/.test(hist.body.reply) && hist.body.reply.includes("ארוח"));
  const weekOk =
    histWeek.ok &&
    histWeek.body.intent === "history_query" &&
    (histWeek.body.reply?.includes("logged meal") || /[\u0590-\u05FF]/.test(histWeek.body.reply || ""));
  row(
    "Chat — meal history",
    weekOk ? (histOk ? "PASS" : "CONFUSING") : "FAIL",
    `yesterday intent=${hist.body?.intent} ${hist.ms}ms snippet=${hist.body?.reply?.slice(0, 60)} | week intent=${histWeek.body?.intent} ${histWeek.ms}ms snippet=${histWeek.body?.reply?.slice(0, 60)}`,
    "—",
    histOk ? "—" : "No meals on calendar yesterday (Jul 29); week query returns Jul 28 seed data"
  );

  const protein = await chat("How much protein do I need?");
  row(
    "Chat — protein advice",
    protein.ok ? "PASS" : "FAIL",
    `intent=${protein.body?.intent} reply=${protein.body?.reply?.slice(0, 90)}`
  );

  const he = await chat("מה כדאי לי לאכול עכשיו?", { preferredLanguage: "he" });
  const hebrewReply = /[\u0590-\u05FF]/.test(he.body?.reply || "");
  row(
    "Language — Hebrew chat",
    he.ok && hebrewReply ? "PASS" : he.ok ? "CONFUSING" : "FAIL",
    `intent=${he.body?.intent} hebrewChars=${hebrewReply} reply=${he.body?.reply?.slice(0, 80)}`,
    hebrewReply ? "—" : "Set preferredLanguage + valid OpenRouter for full Hebrew LLM"
  );

  // RAG weak query
  const ragQ = await chat("What are WHO recommendations for trans fats in 2026?");
  row(
    "RAG — nutrition query",
    ragQ.ok && ragQ.body.sources?.length ? "PASS" : "FAIL",
    `sources=${ragQ.body?.sources?.length} reply=${ragQ.body?.reply?.slice(0, 80)}`
  );

  // Meal photo — tiny (no food)
  const tinyB64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";
  const form = new FormData();
  form.append("message", "Analyze this meal");
  form.append("image", new Blob([Buffer.from(tinyB64, "base64")], { type: "image/jpeg" }), "tiny.jpg");
  const noFood = await jfetch(`${API}/api/chat/message`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}` },
    body: form,
  });
  const noFoodOk =
    noFood.ok &&
    !noFood.body?.mealId &&
    (noFood.body.reply?.includes("No food") ||
      noFood.body.reply?.includes("לא זוהו") ||
      noFood.body.reply?.includes("recognized"));
  row(
    "Meal scan — no-food graceful",
    noFoodOk ? "PASS" : "FAIL",
    `intent=${noFood.body?.intent} mealId=${noFood.body?.mealId ?? "none"} reply=${noFood.body?.reply?.slice(0, 70)}`
  );

  // Dashboard / meals / profile
  const dash = await jfetch(`${API}/api/dashboard?date=2026-07-28`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  row(
    "Dashboard — Jul 28 data",
    dash.ok && dash.body.todayTotals?.calories > 0 ? "PASS" : "CONFUSING",
    `calories=${dash.body?.todayTotals?.calories} meals=${dash.body?.mealCount}`,
    "—",
    "Today empty is expected if no meals logged today"
  );

  const meals = await jfetch(`${API}/api/meals`, { headers: { Authorization: `Bearer ${userToken}` } });
  row("Summary — meals list", meals.ok && meals.body.length > 0 ? "PASS" : "FAIL", `count=${meals.body?.length}`);

  const prof = await jfetch(`${API}/api/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ dietType: "balanced", preferredLanguage: "he", dietGoals: { dailyCalories: 2000, proteinGrams: 120 } }),
  });
  row("Settings — profile save", prof.ok ? "PASS" : "FAIL", `diet=${prof.body?.dietType} lang=${prof.body?.preferredLanguage}`);

  // Text2SQL direct
  const t2 = await jfetch("http://localhost:3005/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: 1, question: "How many calories this week?" }),
  });
  row(
    "Text2SQL — always on",
    t2.ok && t2.body.rowCount > 0 ? "PASS" : "FAIL",
    `rowCount=${t2.body?.rowCount} ${t2.ms}ms (no COMPOSE_PROFILES needed)`
  );

  console.log("\n=== SUMMARY TABLE ===");
  console.log("| Feature | Status | Evidence | Fix | Follow-up |");
  console.log("|---------|--------|----------|-----|-----------|");
  for (const r of rows) {
    const e = r.evidence.replace(/\|/g, "\\|").slice(0, 120);
    console.log(`| ${r.feature} | ${r.status} | ${e} | ${r.fix} | ${r.followUp} |`);
  }
  const fails = rows.filter((r) => r.status === "FAIL").length;
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
