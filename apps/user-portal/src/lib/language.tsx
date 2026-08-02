"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import {
  readLanguageCookieClient,
  syncDocumentDirection,
  writeLanguageCookieClient,
  type ResponseLanguage,
} from "./languageCookie";

const STORAGE_CACHE_KEY = "user_preferred_language";

function readCachedLanguage(): ResponseLanguage | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_CACHE_KEY);
  return raw === "he" || raw === "en" || raw === "ru" ? raw : null;
}

function writeCachedLanguage(lang: ResponseLanguage): void {
  localStorage.setItem(STORAGE_CACHE_KEY, lang);
}

function persistLanguagePreference(lang: ResponseLanguage): void {
  writeLanguageCookieClient(lang);
  writeCachedLanguage(lang);
  syncDocumentDirection(lang);
}

interface LanguageContextValue {
  preferredLanguage: ResponseLanguage;
  setPreferredLanguage: (lang: ResponseLanguage) => Promise<void>;
  ready: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [preferredLanguage, setPreferredLanguageState] = useState<ResponseLanguage>("en");
  const [ready, setReady] = useState(false);

  const bootstrap = useCallback(async () => {
    let lang: ResponseLanguage =
      readLanguageCookieClient() ?? readCachedLanguage() ?? "en";

    if (user) {
      try {
        const me = await api<{ profile?: { preferredLanguage?: string | null } }>("/api/auth/me");
        const fromProfile = me.profile?.preferredLanguage;
        if (fromProfile === "he" || fromProfile === "en" || fromProfile === "ru") {
          lang = fromProfile;
        } else {
          // No stored preference yet (e.g. a user who just registered, or picked a
          // language on the pre-auth login screen) — persist the current choice as
          // their profile's initial preferredLanguage instead of leaving it client-only.
          try {
            await api("/api/users/me/language", {
              method: "PATCH",
              body: JSON.stringify({ preferredLanguage: lang }),
            });
          } catch {
            /* best-effort; keep going with the client-side value */
          }
        }
      } catch {
        /* keep cookie/cache/default */
      }
    }

    persistLanguagePreference(lang);
    setPreferredLanguageState(lang);
    setReady(true);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void bootstrap();
  }, [authLoading, bootstrap]);

  async function setPreferredLanguage(lang: ResponseLanguage) {
    // Pre-auth (login/register screens): no profile exists yet, so only persist the
    // cookie/local choice — it is picked up automatically once the user signs in (see
    // bootstrap above), and saved to their profile at that point.
    if (user) {
      await api<{ preferredLanguage: ResponseLanguage }>("/api/users/me/language", {
        method: "PATCH",
        body: JSON.stringify({ preferredLanguage: lang }),
      });
    }
    // persistLanguagePreference already calls syncDocumentDirection, so <html lang/dir>
    // and the cookie are updated synchronously and i18next re-renders the tree with the
    // new strings. router.refresh() used to run here as well, re-fetching the RSC payload
    // and remounting everything — a visible flash/reflow of the whole app for a change
    // the client had already applied. The cookie still drives SSR on the next full load.
    persistLanguagePreference(lang);
    setPreferredLanguageState(lang);
  }

  return (
    <LanguageContext.Provider value={{ preferredLanguage, setPreferredLanguage, ready }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

export type { ResponseLanguage };
