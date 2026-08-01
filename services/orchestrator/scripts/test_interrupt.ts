import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { interrupt } from "@langchain/langgraph/dist/setup";
import pg from "pg";

const TestState = Annotation.Root({
  status: Annotation<string>(),
  answer: Annotation<string>(),
});

const node1 = (state: typeof TestState.State) => {
  return { status: "paused_for_input" };
};

// we need to use a tool call or standard interrupt logic if @langchain/langgraph interrupt() is available.
// Let's check the installed version or just throw NodeInterrupt.
import { interrupt } from "@langchain/langgraph";

const node2 = (state: typeof TestState.State) => {
  // If we don't have the answer yet, we interrupt.
  if (!state.answer) {
    interrupt("Please provide an answer");
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
  
  console.log("Invoking graph for the first time...");
  
  const result = await graph.invoke({ status: "started", answer: "" }, config);
  
  console.log("Result:", result);
  
  // also get the state
  const state = await graph.getState(config);
  console.log("State values:", state.values);
  console.log("Next tasks:", state.next);
  console.log("Tasks:", JSON.stringify(state.tasks, null, 2));
  
  await pool.end();
}

run().catch(console.error);
