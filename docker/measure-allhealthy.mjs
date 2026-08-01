import { execSync } from "node:child_process";

const expected = [
  "nuitriagentai-postgres-1",
  "nuitriagentai-redis-1",
  "nuitriagentai-vision-agent-1",
  "nuitriagentai-graphdb-agent-1",
  "nuitriagentai-nutrition-agent-1",
  "nuitriagentai-rag-agent-1",
  "nuitriagentai-text2sql-agent-1",
  "nuitriagentai-orchestrator-1",
  "nuitriagentai-api-gateway-1",
  "nuitriagentai-user-portal-1",
  "nuitriagentai-admin-portal-1",
];

function healthyNames() {
  const out = execSync(
    'docker ps --filter "health=healthy" --format "{{.Names}}"',
    { encoding: "utf8" }
  );
  return new Set(out.split("\n").map((s) => s.trim()).filter(Boolean));
}

const start = Date.now();
const seenAt = {};
while (Object.keys(seenAt).length < expected.length) {
  const healthy = healthyNames();
  for (const name of expected) {
    if (!seenAt[name] && healthy.has(name)) {
      seenAt[name] = Date.now() - start;
      console.log(`${name}: healthy at +${seenAt[name]}ms`);
    }
  }
  if (Date.now() - start > 120000) {
    console.error("TIMEOUT waiting for all services healthy");
    break;
  }
  await new Promise((r) => setTimeout(r, 100));
}

console.log(`\nALL_HEALTHY_AT_MS: ${Date.now() - start}`);
