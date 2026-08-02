import { OrchestratorRequest, OrchestratorResponse } from "@nutriagent/shared";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

/** Reply shape when the graph pauses for a clarifying question. `threadId`
 *  identifies the paused run and MUST be echoed back to /resume — it is not the
 *  session id, because each message runs on its own graph thread. */
export interface ClarifyVisionResult {
  intent: "clarify_vision";
  question: string;
  threadId?: string;
}

export async function callOrchestrator(
  params: OrchestratorRequest & { imageUrl?: string; sessionId?: number }
): Promise<OrchestratorResponse | ClarifyVisionResult> {
  let res: Response;
  try {
    res = await fetch(`${ORCHESTRATOR_URL}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    throw new Error(
      `Orchestrator unavailable at ${ORCHESTRATOR_URL}. Start backend services with scripts/run.ps1`
    );
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Orchestrator error: ${text}`);
  }

  const result = await res.json() as any;
  if (isGraphInterrupted(result)) {
    return { intent: "clarify_vision", question: result.interruptValue, threadId: result.threadId };
  }
  return result as OrchestratorResponse;
}

export function isGraphInterrupted(result: any): boolean {
  return result && result.__interrupt__ === true && typeof result.interruptValue === "string";
}

export async function resumeOrchestrator(
  thread_id: string | number,
  answer: string
): Promise<OrchestratorResponse | ClarifyVisionResult> {
  let res: Response;
  try {
    res = await fetch(`${ORCHESTRATOR_URL}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id, answer }),
    });
  } catch {
    throw new Error(`Orchestrator unavailable at ${ORCHESTRATOR_URL}`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Orchestrator resume error: ${text}`);
  }

  const result = await res.json() as any;
  if (isGraphInterrupted(result)) {
    return { intent: "clarify_vision", question: result.interruptValue, threadId: result.threadId };
  }
  return result as OrchestratorResponse;
}
