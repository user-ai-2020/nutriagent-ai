"use client";

import { useEffect, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { useLanguage } from "./language";

/** Syncs i18next to Task 6 LanguageProvider — no separate language state. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { preferredLanguage, ready } = useLanguage();

  useEffect(() => {
    if (!ready) return;
    if (i18n.language !== preferredLanguage) {
      void i18n.changeLanguage(preferredLanguage);
    }
  }, [preferredLanguage, ready]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
