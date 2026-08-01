import {
  readAuthTokenCookieClient,
  writeAuthTokenCookieClient,
} from "@nutriagent/shared/authCookie";

/** Browser uses same-origin paths; Next middleware proxies to the API gateway. */
export function apiBaseUrl(): string {
  if (typeof window !== "undefined") return "";
  return process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";
}

/** @deprecated prefer apiBaseUrl() — kept for image URL joins in a few pages */
export const API_URL = apiBaseUrl();

const API_TIMEOUT_MS = 15_000;
/** Chat/meal scans can legitimately take longer than dashboard calls. */
export const CHAT_API_TIMEOUT_MS = 60_000;

const LEGACY_TOKEN_KEY = "user_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const fromCookie = readAuthTokenCookieClient();
  if (fromCookie) return fromCookie;
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacy) {
    writeAuthTokenCookieClient(legacy);
    return legacy;
  }
  return null;
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  writeAuthTokenCookieClient(token);
  if (token) localStorage.setItem(LEGACY_TOKEN_KEY, token);
  else localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs: number = API_TIMEOUT_MS
): Promise<T> {
  const token = getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    const base = apiBaseUrl();
    res = await fetch(`${base}${path}`, {
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
    throw new Error(
      timedOut
        ? `Server did not respond in time. Refresh http://127.0.0.1:3008 and ensure docker compose is up.`
        : `Cannot reach the API. Open http://127.0.0.1:3008 and ensure docker compose is up.`
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

/** Longer timeout for /api/chat/message (orchestrator + optional vision). */
export function apiChat<T>(path: string, options: RequestInit = {}): Promise<T> {
  return api<T>(path, options, CHAT_API_TIMEOUT_MS);
}
