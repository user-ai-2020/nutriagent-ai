import { useEffect, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import i18n from "@/lib/i18n";

/** Syncs i18next to Task 6 AuthContext preferredLanguage — I18nManager unchanged. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { preferredLanguage, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (i18n.language !== preferredLanguage) {
      void i18n.changeLanguage(preferredLanguage);
    }
  }, [preferredLanguage, loading]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
