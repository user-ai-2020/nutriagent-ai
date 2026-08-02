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

  it("does NOT interrupt for multiple confidently-identified items", async () => {
    // A plate with several items is normal, not ambiguous. Interrupting on item
    // count alone stopped virtually every real photo to ask a clarifying question
    // before showing any analysis; the spec's trigger is confidence (and "2+
    // distinct meals", which an item count does not measure).
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

    await graph.invoke(initialState as any, config);
    const state = await graph.getState(config);

    assert.deepEqual(state.next, []);
  });

  it("interrupts on many items when VISION_CLARIFY_MAX_ITEMS opts in", async () => {
    const previous = process.env.VISION_CLARIFY_MAX_ITEMS;
    process.env.VISION_CLARIFY_MAX_ITEMS = "2";
    try {
      const thread_id = "test-max-items-" + Date.now();
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

      await graph.invoke(initialState as any, config);
      const state = await graph.getState(config);

      assert.ok(state.next.length > 0);
      assert.ok(state.tasks[0]?.interrupts?.length > 0);
    } finally {
      if (previous === undefined) delete process.env.VISION_CLARIFY_MAX_ITEMS;
      else process.env.VISION_CLARIFY_MAX_ITEMS = previous;
    }
  });
});
