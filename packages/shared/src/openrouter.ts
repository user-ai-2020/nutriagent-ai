import { EMBEDDING_MODEL, RAG_EMBEDDING_DIMENSIONS } from "./rag-config";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function getOpenRouterKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY;
}

export function getOpenRouterModel(fallback = "openai/gpt-4o"): string {
  return process.env.OPENROUTER_MODEL || fallback;
}

export const OPENROUTER_RERANK_MODEL = process.env.OPENROUTER_RERANK_MODEL || "cohere/rerank-4-fast";

/**
 * Wall-clock cap for a single OpenRouter HTTP call.
 *
 * Every call here used bare `fetch` with no signal, so a hung OpenRouter socket
 * blocked the calling agent indefinitely. That defeats every timeout above it:
 * the orchestrator aborts its own request to the agent after
 * CHAT_AGENT_TIMEOUT_MS, but the agent process keeps the upstream socket open,
 * so retries stack sockets on a provider that is already not answering.
 * AGENTS.md rule 3 ("no unbounded external calls may block the UI") is exactly
 * this case. Keep the default below the orchestrator's per-agent budget.
 */
export const OPENROUTER_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 12_000);

/** Longer cap for vision/rerank calls, which legitimately take more time. */
export const OPENROUTER_VISION_TIMEOUT_MS = Number(
  process.env.OPENROUTER_VISION_TIMEOUT_MS || 30_000
);

function openRouterSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

/** Turns an aborted OpenRouter fetch into a message a user can act on. */
function rethrowOpenRouterFetchError(err: unknown, timeoutMs: number): never {
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    throw new Error(`OpenRouter did not respond within ${timeoutMs}ms — try again in a moment.`);
  }
  throw err;
}

/** Parse OpenRouter / API errors into short user-facing messages */
export function friendlyOpenRouterError(raw: string): string {
  const trimmed = raw.replace(/^OpenRouter error:\s*/i, "").trim();

  try {
    const json = JSON.parse(trimmed) as { error?: { message?: string }; message?: string };
    const msg = json.error?.message ?? json.message;
    if (msg) return shortenErrorMessage(msg);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const json = JSON.parse(match[0]) as { error?: { message?: string }; message?: string };
        const msg = json.error?.message ?? json.message;
        if (msg) return shortenErrorMessage(msg);
      } catch {
        /* fall through */
      }
    }
  }

  return shortenErrorMessage(trimmed);
}

function shortenErrorMessage(msg: string): string {
  if (msg.includes("Unterminated string") || msg.includes("invalid JSON")) {
    return "Vision model returned malformed JSON — retry or use a different photo.";
  }
  if (msg.includes("No endpoints found")) {
    return "Model unavailable on OpenRouter right now — check the model ID or try again later.";
  }
  if (msg.includes("image/jpeg") && msg.includes("webp")) {
    return "Image format was corrected automatically — please retry if this persists.";
  }
  if (
    msg.includes("invalid_api_key") ||
    msg.includes("Unauthorized") ||
    msg.includes("User not found")
  ) {
    return "OpenRouter API key is invalid or missing — update it in Admin → LLM settings.";
  }
  if (msg.includes("rate limit") || msg.includes("429")) {
    return "Rate limit reached — wait a moment and try again.";
  }
  return msg.length > 140 ? `${msg.slice(0, 137)}…` : msg;
}

export interface RerankResultItem {
  index: number;
  relevance_score: number;
  document?: { text?: string };
}

export async function openRouterRerank(params: {
  query: string;
  documents: string[];
  model?: string;
  topN?: number;
  apiKey?: string | null;
}): Promise<RerankResultItem[]> {
  const apiKey = params.apiKey || getOpenRouterKey();
  if (!apiKey || params.documents.length === 0) return [];

  const timeoutMs = OPENROUTER_VISION_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/rerank`, {
      signal: openRouterSignal(timeoutMs),
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_APP_URL || "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_NAME || "NutriAgent AI",
      },
      body: JSON.stringify({
        model: params.model || OPENROUTER_RERANK_MODEL,
        query: params.query,
        documents: params.documents,
        top_n: params.topN ?? params.documents.length,
      }),
    });
  } catch (err) {
    rethrowOpenRouterFetchError(err, timeoutMs);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(friendlyOpenRouterError(error));
  }

  const data = (await response.json()) as { results?: RerankResultItem[] };
  return data.results ?? [];
}

export async function openRouterChat(params: {
  messages: unknown[];
  model?: string;
  maxTokens?: number;
  apiKey?: string | null;
}): Promise<string | null> {
  const apiKey = params.apiKey || getOpenRouterKey();
  if (!apiKey) return null;

  // Vision prompts arrive here too (image parts in `messages`), so use the
  // longer cap when the payload carries an image.
  const hasImage = JSON.stringify(params.messages ?? []).includes("image_url");
  const timeoutMs = hasImage ? OPENROUTER_VISION_TIMEOUT_MS : OPENROUTER_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      signal: openRouterSignal(timeoutMs),
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_APP_URL || "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_NAME || "NutriAgent AI",
      },
      body: JSON.stringify({
        model: params.model || getOpenRouterModel(),
        messages: params.messages,
        max_tokens: params.maxTokens ?? 500,
      }),
    });
  } catch (err) {
    rethrowOpenRouterFetchError(err, timeoutMs);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(friendlyOpenRouterError(error));
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? null;
}

export async function openRouterEmbed(params: {
  input: string | string[];
  model?: string;
  dimensions?: number;
  apiKey?: string | null;
}): Promise<number[][]> {
  const apiKey = params.apiKey || getOpenRouterKey();
  if (!apiKey) throw new Error("OpenRouter API key is missing");

  const model = params.model || EMBEDDING_MODEL;
  const body: Record<string, unknown> = {
    model,
    input: params.input,
  };
  const dimensions = params.dimensions ?? RAG_EMBEDDING_DIMENSIONS;
  if (dimensions) {
    body.dimensions = dimensions;
  }

  const timeoutMs = OPENROUTER_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
      signal: openRouterSignal(timeoutMs),
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_APP_URL || "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_NAME || "NutriAgent AI",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    rethrowOpenRouterFetchError(err, timeoutMs);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(friendlyOpenRouterError(error));
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding?: number[]; index?: number }>;
  };
  const rows = data.data ?? [];
  return rows
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((row) => row.embedding ?? []);
}

export { EMBEDDING_MODEL, RAG_EMBEDDING_DIMENSIONS };

export interface OpenRouterKeyBalance {
  label: string;
  limit: number | null;
  limitRemaining: number | null;
  usage: number;
  usageDaily: number;
  usageMonthly: number;
  expiresAt: string | null;
  isFreeTier: boolean;
}

/** Live credit info from OpenRouter — admin-only; never return the raw key. */
export async function fetchOpenRouterKeyBalance(apiKey: string): Promise<OpenRouterKeyBalance> {
  const timeoutMs = OPENROUTER_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/auth/key`, {
      signal: openRouterSignal(timeoutMs),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_APP_URL || "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_APP_NAME || "NutriAgent AI",
      },
    });
  } catch (err) {
    rethrowOpenRouterFetchError(err, timeoutMs);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(friendlyOpenRouterError(error));
  }

  const json = (await response.json()) as {
    data?: {
      label?: string;
      limit?: number | null;
      limit_remaining?: number | null;
      usage?: number;
      usage_daily?: number;
      usage_weekly?: number;
      usage_monthly?: number;
      expires_at?: string | null;
      is_free_tier?: boolean;
    };
  };

  const d = json.data ?? {};
  return {
    label: d.label ?? "",
    limit: d.limit ?? null,
    limitRemaining: d.limit_remaining ?? null,
    usage: d.usage ?? 0,
    usageDaily: d.usage_daily ?? 0,
    usageMonthly: d.usage_monthly ?? 0,
    expiresAt: d.expires_at ?? null,
    isFreeTier: Boolean(d.is_free_tier),
  };
}
