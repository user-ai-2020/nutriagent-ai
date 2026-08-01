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
    
    const config = { configurable: { thread_id: String(body.sessionId || Date.now()) } };
    const finalState = await orchestratorGraph.invoke({ request: body }, config);
    
    // Check for interrupt in the graph state
    if (config) {
      const state = await orchestratorGraph.getState(config);
      if (state.next && state.next.length > 0 && state.tasks && state.tasks.length > 0 && state.tasks[0].interrupts && state.tasks[0].interrupts.length > 0) {
        return res.json({ __interrupt__: true, interruptValue: state.tasks[0].interrupts[0].value, state });
      }
    }

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

import { Command } from "@langchain/langgraph";

app.post("/resume", async (req, res) => {
  try {
    const { thread_id, answer } = req.body;
    if (!thread_id) return res.status(400).json({ error: "Missing thread_id" });

    const config = { configurable: { thread_id: String(thread_id) } };
    const finalState = await orchestratorGraph.invoke(new Command({ resume: answer }), config);

    // After resume, check if it's interrupted again
    const state = await orchestratorGraph.getState(config);
    if (state.next && state.next.length > 0 && state.tasks && state.tasks.length > 0 && state.tasks[0].interrupts && state.tasks[0].interrupts.length > 0) {
      return res.json({ __interrupt__: true, interruptValue: state.tasks[0].interrupts[0].value, state });
    }

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
