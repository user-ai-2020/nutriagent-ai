import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StateGraph, Annotation, START, END, Command } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from "pg";
import { visionClusterCheckNode, OrchestratorState } from "./graph.js";

// Ensure tests use the host-mapped port for local execution
process.env.DATABASE_URL = "postgresql://nutriagent:nutriagent@127.0.0.1:5433/nutriagent";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const checkpointer = new PostgresSaver(pool);

const builder = new StateGraph(OrchestratorState)
  .addNode("visionClusterCheck", visionClusterCheckNode)
  .addEdge(START, "visionClusterCheck")
  .addEdge("visionClusterCheck", END);

const graph = builder.compile({ checkpointer });

describe("visionClusterCheckNode", () => {
  it("does not interrupt if single item with high confidence", async () => {
    const thread_id = "test-single-high-" + Date.now();
    const config = { configurable: { thread_id } };

    const initialState = {
      request: { userId: 1, message: "" },
      visionResult: {
        rerankedItems: [
          { foodType: "pizza", estimatedQuantity: "1 slice", visionConfidence: 0.95 },
        ],
      },
    };

    const result = await graph.invoke(initialState as any, config);
    const state = await graph.getState(config);

    // It should have completed successfully without an interrupt
    assert.deepEqual(state.next, []);
  });

  it("interrupts if single item with low confidence", async () => {
    const thread_id = "test-single-low-" + Date.now();
    const config = { configurable: { thread_id } };

    const initialState = {
      request: { userId: 1, message: "" },
      visionResult: {
        rerankedItems: [
          { foodType: "unknown blob", estimatedQuantity: "1 serving", visionConfidence: 0.3 },
        ],
      },
    };

    const result = await graph.invoke(initialState as any, config);
    const state = await graph.getState(config);

    // It should be interrupted
    assert.ok(state.next.length > 0);
    assert.ok(state.tasks[0]?.interrupts?.length > 0);
  });

  it("interrupts if multiple items", async () => {
    const thread_id = "test-multiple-" + Date.now();
    const config = { configurable: { thread_id } };

    const initialState = {
      request: { userId: 1, message: "" },
      visionResult: {
        rerankedItems: [
          { foodType: "pizza", estimatedQuantity: "1 slice", visionConfidence: 0.95 },
          { foodType: "coke", estimatedQuantity: "1 cup", visionConfidence: 0.8 },
        ],
      },
    };

    const result = await graph.invoke(initialState as any, config);
    const state = await graph.getState(config);

    // It should be interrupted
    assert.ok(state.next.length > 0);
    assert.ok(state.tasks[0]?.interrupts?.length > 0);
  });
});
