"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, getToken } from "./api";
import {
  readLanguageCookieClient,
  syncDocumentDirection,
  writeLanguageCookieClient,
  type ResponseLanguage,
} from "./languageCookie";

const STORAGE_CACHE_KEY = "admin_preferred_language";

function readCachedLanguage(): ResponseLanguage | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_CACHE_KEY);
  return raw === "he" || raw === "en" || raw === "ru" ? raw : null;
}

function writeCachedLanguage(lang: ResponseLanguage): void {
  sessionStorage.setItem(STORAGE_CACHE_KEY, lang);
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
  const router = useRouter();
  const pathname = usePathname();
  const [preferredLanguage, setPreferredLanguageState] = useState<ResponseLanguage>("en");
  const [ready, setReady] = useState(false);

  const bootstrap = useCallback(async () => {
    let lang: ResponseLanguage =
      readLanguageCookieClient() ?? readCachedLanguage() ?? "en";

    if (getToken()) {
      try {
        const me = await api<{ profile?: { preferredLanguage?: string | null } }>("/api/auth/me");
        const fromProfile = me.profile?.preferredLanguage;
        if (fromProfile === "he" || fromProfile === "en" || fromProfile === "ru") {
          lang = fromProfile;
        }
      } catch {
        /* keep cookie/cache/default */
      }
    }

    persistLanguagePreference(lang);
    setPreferredLanguageState(lang);
    setReady(true);
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [pathname, bootstrap]);

  async function setPreferredLanguage(lang: ResponseLanguage) {
    await api<{ preferredLanguage: ResponseLanguage }>("/api/users/me/language", {
      method: "PATCH",
      body: JSON.stringify({ preferredLanguage: lang }),
    });
    persistLanguagePreference(lang);
    setPreferredLanguageState(lang);
    router.refresh();
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
