import "./loadEnv";
import express from "express";
import { OrchestratorRequest } from "@nutriagent/shared";
import { orchestratorGraph } from "./graph";

const app = express();
app.use(express.json({ limit: "15mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok", service: "orchestrator" }));

app.post("/process", async (req, res) => {
  try {
    const body = req.body as OrchestratorRequest & { imageUrl?: string; imageMime?: string; imageBase64?: string; sessionId?: number; };
    
    // Invoke LangGraph workflow
    const config = body.sessionId ? { configurable: { thread_id: String(body.sessionId) } } : undefined;
    const finalState = await orchestratorGraph.invoke({ request: body }, config);
    
    if (finalState.response) {
      res.json(finalState.response);
    } else {
      throw new Error("Graph did not produce a response.");
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Orchestrator error" });
  }
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => console.log(`Orchestrator on http://localhost:${PORT}`));
