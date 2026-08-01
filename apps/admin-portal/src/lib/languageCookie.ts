export const PREFERRED_LANGUAGE_COOKIE = "preferredLanguage";

/** 1 year — matches typical “remember preference” UX */
export const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export type ResponseLanguage = "he" | "en" | "ru";

export function normalizePreferredLanguage(value?: string | null): ResponseLanguage | null {
  if (value === "he" || value === "en" || value === "ru") return value;
  return null;
}

export function languageFromCookieValue(value?: string | null): ResponseLanguage {
  return normalizePreferredLanguage(value) ?? "en";
}

export function htmlDirection(lang: ResponseLanguage): "rtl" | "ltr" {
  return lang === "he" ? "rtl" : "ltr";
}

/** Client-side: parse preferredLanguage from document.cookie */
export function readLanguageCookieClient(): ResponseLanguage | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${PREFERRED_LANGUAGE_COOKIE}=(he|en|ru)(?:;|$)`)
  );
  return normalizePreferredLanguage(match?.[1]);
}

/** Client-side: persist preference for SSR on next full navigation / hard refresh */
export function writeLanguageCookieClient(lang: ResponseLanguage): void {
  if (typeof document === "undefined") return;
  document.cookie = `${PREFERRED_LANGUAGE_COOKIE}=${lang}; path=/; max-age=${LANGUAGE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function syncDocumentDirection(lang: ResponseLanguage): void {
  if (typeof document === "undefined") return;
  const dir = htmlDirection(lang);
  if (document.documentElement.lang !== lang) document.documentElement.lang = lang;
  if (document.documentElement.dir !== dir) document.documentElement.dir = dir;
}
