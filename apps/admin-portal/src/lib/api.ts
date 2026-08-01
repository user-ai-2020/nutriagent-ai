import {
  readAuthTokenCookieClient,
  writeAuthTokenCookieClient,
} from "@nutriagent/shared/authCookie";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";

const LEGACY_TOKEN_KEY = "token";

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

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export { API_URL };
