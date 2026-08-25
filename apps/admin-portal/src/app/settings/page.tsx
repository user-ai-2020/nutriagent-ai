"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/language";

export default function AdminSettingsPage() {
  const { t } = useTranslation();
  const { preferredLanguage, setPreferredLanguage, ready } = useLanguage();
  const [languageSaving, setLanguageSaving] = useState(false);
  const [languageSaved, setLanguageSaved] = useState(false);

  const { data: me } = useQuery({
    queryKey: ["admin-me"],
    queryFn: () => api<{ name: string; email: string; role: string }>("/api/auth/me"),
  });

  async function onLanguageChange(lang: "he" | "en" | "ru") {
    if (lang === preferredLanguage || languageSaving) return;
    setLanguageSaving(true);
    setLanguageSaved(false);
    try {
      await setPreferredLanguage(lang);
      setLanguageSaved(true);
      setTimeout(() => setLanguageSaved(false), 2200);
    } finally {
      setLanguageSaving(false);
    }
  }

  return (
    <AdminShell>
      <h2 style={{ fontSize: 22, margin: "0 0 2px" }}>{t("admin.settings")}</h2>
      <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 var(--space-4)" }}>
        {t("admin.settingsHint")}
      </p>

      <div className="card elev-sm" style={{ maxWidth: 420, padding: "var(--space-4)" }}>
        {me ? (
          <p className="note" style={{ margin: "0 0 var(--space-4)" }}>
            {me.name} · {me.email}
          </p>
        ) : null}

        <h3 style={{ fontSize: 15, marginBottom: "var(--space-2)" }}>{t("common.languageLabel")}</h3>
        <p className="note" style={{ margin: "0 0 var(--space-2)" }}>
          {t("settings.languageHint")}
        </p>
        <div className="seg" style={{ marginBottom: "var(--space-3)" }} data-testid="admin-language-toggle">
          {(
            [
              { id: "he" as const, label: t("common.hebrew") },
              { id: "en" as const, label: t("common.english") },
              { id: "ru" as const, label: t("common.russian") },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`seg-opt${preferredLanguage === opt.id ? " is-active" : ""}`}
              disabled={!ready || languageSaving}
              onClick={() => onLanguageChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {languageSaving ? (
          <p className="note" style={{ margin: 0, fontSize: 12.5 }}>
            {t("common.loading")}
          </p>
        ) : languageSaved ? (
          <p className="note" style={{ margin: 0, fontSize: 12.5 }}>
            {t("settings.saved")}
          </p>
        ) : null}
      </div>
    </AdminShell>
  );
}
