import { OrchestratorRequest, OrchestratorResponse } from "@nutriagent/shared";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3001";

export async function callOrchestrator(
  params: OrchestratorRequest & { imageUrl?: string }
): Promise<OrchestratorResponse> {
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

  return res.json() as Promise<OrchestratorResponse>;
}
