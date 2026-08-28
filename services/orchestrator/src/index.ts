import "./loadEnv";
import express from "express";
import { OrchestratorRequest, startServer } from "@nutriagent/shared";
import { checkpointerReady, orchestratorGraph } from "./graph";

const app = express();
app.use(express.json({ limit: "15mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok", service: "orchestrator" }));

app.post("/process", async (req, res) => {
  try {
    const body = req.body as OrchestratorRequest & { imageUrl?: string; imageMime?: string; imageBase64?: string; sessionId?: number; };

    // A checkpointed graph RESUMES whatever is saved under thread_id. Keying the
    // thread on sessionId alone meant every message in a session reused one
    // thread, so after the first completed run the graph replayed that finished
    // state and returned its old response verbatim instead of processing the new
    // message. Each /process call therefore gets its own thread; continuity for
    // interrupt -> /resume is carried by returning this id to the caller.
    const threadId = `${body.sessionId ?? "anon"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const config = { configurable: { thread_id: threadId } };
    const finalState = await orchestratorGraph.invoke({ request: body }, config);

    // Check for interrupt in the graph state
    if (config) {
      const state = await orchestratorGraph.getState(config);
      if (state.next && state.next.length > 0 && state.tasks && state.tasks.length > 0 && state.tasks[0].interrupts && state.tasks[0].interrupts.length > 0) {
        // Only the question and the thread id are needed to resume. The full
        // `state` was being serialised into every clarification response, and it
        // carries state.values.request.imageBase64 — the entire uploaded photo,
        // re-encoded and shipped back on the wire, plus the user's health profile.
        return res.json({
          __interrupt__: true,
          interruptValue: state.tasks[0].interrupts[0].value,
          threadId,
        });
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

    const threadId = String(thread_id);
    const config = { configurable: { thread_id: threadId } };
    const finalState = await orchestratorGraph.invoke(new Command({ resume: answer }), config);

    // After resume, check if it's interrupted again — echo threadId back so a
    // second clarification round can resume the same thread.
    const state = await orchestratorGraph.getState(config);
    if (state.next && state.next.length > 0 && state.tasks && state.tasks.length > 0 && state.tasks[0].interrupts && state.tasks[0].interrupts.length > 0) {
      // See /process above — never echo the full graph state back to the caller.
      return res.json({
        __interrupt__: true,
        interruptValue: state.tasks[0].interrupts[0].value,
        threadId,
      });
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

// Don't accept traffic until the LangGraph checkpoint tables exist — otherwise
// the first request can beat setup() and fail on a missing `checkpoints` table.
checkpointerReady
  .then(() => {
    startServer(app, PORT, "Orchestrator");
  })
  .catch((err) => {
    console.error(
      "FATAL: could not create LangGraph checkpoint tables — orchestrator cannot " +
        "serve meal analysis (interrupt/resume needs them). Check DATABASE_URL and " +
        "that Postgres is reachable.",
      err
    );
    process.exit(1);
  });
