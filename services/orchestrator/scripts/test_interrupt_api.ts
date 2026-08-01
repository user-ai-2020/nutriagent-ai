import { interrupt, NodeInterrupt } from '@langchain/langgraph';

try {
  throw new NodeInterrupt("test1");
} catch (e: any) {
  console.log("NodeInterrupt:", e.message, e.name);
}

try {
  interrupt("test2");
} catch (e: any) {
  console.log("interrupt():", e.message, e.name);
}
