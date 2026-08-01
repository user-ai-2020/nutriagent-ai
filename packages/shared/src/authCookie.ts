/** Shared JWT cookie so user-portal (:3008) and admin-portal (:3007) share one sign-in. */

export const AUTH_TOKEN_COOKIE = "nutriagent_token";

/** Matches default JWT_EXPIRES_IN of 7d. */
export const AUTH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type BrowserDocument = { cookie: string };

function browserDocument(): BrowserDocument | null {
  const doc = (globalThis as { document?: BrowserDocument }).document;
  return doc ?? null;
}

export function readAuthTokenFromCookieString(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${AUTH_TOKEN_COOKIE}=([^;]*)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function buildAuthTokenCookie(token: string): string {
  return `${AUTH_TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${AUTH_TOKEN_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function buildClearAuthTokenCookie(): string {
  return `${AUTH_TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export function readAuthTokenCookieClient(): string | null {
  const doc = browserDocument();
  if (!doc) return null;
  return readAuthTokenFromCookieString(doc.cookie);
}

export function writeAuthTokenCookieClient(token: string | null): void {
  const doc = browserDocument();
  if (!doc) return;
  doc.cookie = token ? buildAuthTokenCookie(token) : buildClearAuthTokenCookie();
}
