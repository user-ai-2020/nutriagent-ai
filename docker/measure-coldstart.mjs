import { execSync } from "node:child_process";

const services = [
  { container: "nuitriagentai-vision-agent-1", port: 3002 },
  { container: "nuitriagentai-graphdb-agent-1", port: 3006 },
  { container: "nuitriagentai-nutrition-agent-1", port: 3003 },
  { container: "nuitriagentai-rag-agent-1", port: 3004 },
  { container: "nuitriagentai-text2sql-agent-1", port: 3005 },
  { container: "nuitriagentai-orchestrator-1", port: 3001 },
  { container: "nuitriagentai-api-gateway-1", port: 3000 },
  { container: "nuitriagentai-user-portal-1", port: 3008 },
  { container: "nuitriagentai-admin-portal-1", port: 3007 },
];

async function pollHealth(port, deadlineMs) {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return Date.now() - start;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return -1;
}

const results = [];
for (const svc of services) {
  execSync(`docker restart ${svc.container}`, { stdio: "ignore" });
  const restartedAt = Date.now();
  const ms = await pollHealth(svc.port, 60000);
  results.push({ container: svc.container, msToHealthy: ms });
  console.log(`${svc.container}: ${ms}ms to first 200 on /health`);
}

console.log("\n--- SUMMARY ---");
console.log(JSON.stringify(results, null, 2));
