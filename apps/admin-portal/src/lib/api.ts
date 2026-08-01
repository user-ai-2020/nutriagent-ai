/** Browser uses same-origin paths; middleware proxies to the API gateway. */
function apiBaseUrl(): string {
  if (typeof window !== "undefined") return "";
  return process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";
}

/** @deprecated — use relative paths via apiBaseUrl() */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3000";

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = apiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}
