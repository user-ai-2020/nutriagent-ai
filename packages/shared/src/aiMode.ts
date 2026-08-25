export type AiMode = "mock" | "live";
export type ApiKeySource = "env" | "database" | "none";

export interface AiStatus {
  /** Whether OpenRouter is configured (env wins over Admin DB). */
  mode: AiMode;
  hasApiKey: boolean;
  apiKeySource: ApiKeySource;
}

/** Same resolution order as vision-agent: Docker `.env` overrides Admin-stored key. */
export function resolveAiStatus(params: {
  envKey?: string | null;
  storedKey?: string | null;
}): AiStatus {
  const envKey = params.envKey?.trim();
  if (envKey) {
    return { mode: "live", hasApiKey: true, apiKeySource: "env" };
  }
  const storedKey = params.storedKey?.trim();
  if (storedKey) {
    return { mode: "live", hasApiKey: true, apiKeySource: "database" };
  }
  return { mode: "mock", hasApiKey: false, apiKeySource: "none" };
}
