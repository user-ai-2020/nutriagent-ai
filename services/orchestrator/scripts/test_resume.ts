import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Command } from "@langchain/langgraph";
import { NodeInterrupt } from "@langchain/langgraph";
import pg from "pg";

const TestState = Annotation.Root({
  status: Annotation<string>(),
  answer: Annotation<string>(),
});

const node1 = (state: typeof TestState.State) => {
  return { status: "paused_for_input" };
};

const node2 = (state: typeof TestState.State) => {
  // Langgraph 0.0.x / 1.x: you can also pass Command({ update: { answer: "pizza" }, resume: true })
  // But wait, the simplest way is to pass `null` to invoke() and just provide a Command,
  // or we update state via checkpointer?
  // Let's just check if we can read the resume payload.
  // Actually, if we just update the state first:
  if (!state.answer) {
    throw new NodeInterrupt("Please provide an answer");
  }
  return { status: "completed" };
};

const builder = new StateGraph(TestState)
  .addNode("node1", node1)
  .addNode("node2", node2)
  .addEdge(START, "node1")
  .addEdge("node1", "node2")
  .addEdge("node2", END);

async function run() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const checkpointer = new PostgresSaver(pool);
  
  const graph = builder.compile({ checkpointer });
  
  const thread_id = "test-thread-123";
  const config = { configurable: { thread_id } };
  
  console.log("Resuming graph in a separate process...");
  
  // Check state before resuming
  let state = await graph.getState(config);
  console.log("State before resume:", state.values);
  console.log("Tasks before resume:", JSON.stringify(state.tasks, null, 2));

  // Resume with Command
  const result = await graph.invoke(new Command({ resume: "pizza", update: { answer: "pizza" } }), config);
  
  console.log("Result after resume:", result);
  
  state = await graph.getState(config);
  console.log("Final State:", state.values);
  console.log("Final Tasks:", state.next);
  
  await pool.end();
}

run().catch(console.error);
