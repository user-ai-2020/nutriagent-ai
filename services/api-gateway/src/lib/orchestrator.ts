import { OrchestratorRequest, OrchestratorResponse } from "@nutriagent/shared";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

/**
 * Wall-clock cap for a call into the orchestrator.
 *
 * Both calls below used bare `fetch` with no signal, so a wedged orchestrator
 * held the gateway request open forever: the browser gave up after its own 60s
 * (CHAT_API_TIMEOUT_MS in apps/user-portal/src/lib/api.ts) while the gateway
 * kept the express handler, its DB connection and the socket alive indefinitely.
 * Keep this just under the client's budget so the user gets a real error message
 * instead of a dead request.
 */
const ORCHESTRATOR_TIMEOUT_MS = Number(process.env.ORCHESTRATOR_TIMEOUT_MS || 55_000);

function orchestratorTimedOut(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  return name === "TimeoutError" || name === "AbortError";
}

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
      signal: AbortSignal.timeout(ORCHESTRATOR_TIMEOUT_MS),
    });
  } catch (err) {
    if (orchestratorTimedOut(err)) {
      throw new Error(
        `The analysis took longer than ${Math.round(ORCHESTRATOR_TIMEOUT_MS / 1000)}s and was cancelled. Please try again.`
      );
    }
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
      signal: AbortSignal.timeout(ORCHESTRATOR_TIMEOUT_MS),
    });
  } catch (err) {
    if (orchestratorTimedOut(err)) {
      throw new Error(
        `The analysis took longer than ${Math.round(ORCHESTRATOR_TIMEOUT_MS / 1000)}s and was cancelled. Please try again.`
      );
    }
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
