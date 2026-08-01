const { callAgentWithTimeout, CHAT_AGENT_TIMEOUT_MS } = require("./dist/utils");

console.log("CHAT_AGENT_TIMEOUT_MS=", CHAT_AGENT_TIMEOUT_MS);
const t0 = Date.now();
callAgentWithTimeout("http://127.0.0.1:9999/analyze", { probe: true }, CHAT_AGENT_TIMEOUT_MS)
  .then((r) => {
    console.log("UNEXPECTED_OK after", Date.now() - t0, "ms", r);
  })
  .catch((e) => {
    console.log("CAUGHT after", Date.now() - t0, "ms ::", e && e.message);
  })
  .finally(() => process.exit(0));
