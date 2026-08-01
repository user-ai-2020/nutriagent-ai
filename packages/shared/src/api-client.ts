import {
  readAuthTokenCookieClient,
  writeAuthTokenCookieClient,
} from "./authCookie";

/**
 * Read auth token: check cookie first, then localStorage legacy key.
 * Migrates legacy localStorage tokens to cookie on read.
 */
export function getAuthToken(legacyStorageKey: string): string | null {
  if (typeof globalThis === "undefined" || !(globalThis as any).window) return null;
  const fromCookie = readAuthTokenCookieClient();
  if (fromCookie) return fromCookie;
  const legacy = localStorage.getItem(legacyStorageKey);
  if (legacy) {
    writeAuthTokenCookieClient(legacy);
    return legacy;
  }
  return null;
}

/**
 * Write auth token to cookie + localStorage (legacy compat).
 * Pass null to clear.
 */
export function setAuthToken(token: string | null, legacyStorageKey: string): void {
  if (typeof globalThis === "undefined" || !(globalThis as any).window) return;
  writeAuthTokenCookieClient(token);
  if (token) localStorage.setItem(legacyStorageKey, token);
  else localStorage.removeItem(legacyStorageKey);
}

export interface ApiFetchConfig {
  baseUrl: string;
  timeoutMs?: number;
  /** If provided, token is read from this key and sent as Bearer header */
  tokenKey?: string;
}

/**
 * Generic authenticated fetch wrapper with timeout support.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  config: ApiFetchConfig
): Promise<T> {
  const { baseUrl, timeoutMs = 15_000, tokenKey } = config;
  const token = tokenKey ? getAuthToken(tokenKey) : null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    throw new Error(timedOut ? "error_timeout" : "error_network_unreachable");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({ error: res.statusText }))) as any;
    throw new Error(errBody.error || "error_api_failed");
  }
  return res.json() as Promise<T>;
}
