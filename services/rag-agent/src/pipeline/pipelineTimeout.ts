import { RAG_FETCH_TIMEOUT_MS, RAG_PIPELINE_TIMEOUT_MS } from "../config/ragConstants.js";

export class PipelineTimeoutError extends Error {
  constructor(ms = RAG_PIPELINE_TIMEOUT_MS) {
    super(`RAG pipeline exceeded ${ms}ms wall-clock limit`);
    this.name = "PipelineTimeoutError";
  }
}

/** Wall-clock cap for an entire /query pipeline run (spec 4.4 — avoids hung external fetches). */
export async function withPipelineTimeout<T>(
  promise: Promise<T>,
  timeoutMs = RAG_PIPELINE_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PipelineTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = RAG_FETCH_TIMEOUT_MS
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
