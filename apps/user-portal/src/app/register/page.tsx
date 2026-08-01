"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await register(name, email, password);
      router.replace("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.registrationFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-8) var(--space-4)",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: 30, marginBottom: 6 }}>{t("common.appNameFull")}</h1>
        <p style={{ fontSize: 14, opacity: 0.65, margin: 0 }}>{t("auth.registerTagline")}</p>
      </div>

      <form
        className="card elev-md"
        style={{ width: "min(360px,90vw)", padding: "var(--space-4)" }}
        onSubmit={onSubmit}
      >
        <div className="card-kicker">{t("auth.createAccount")}</div>
        <div className="field">
          <label htmlFor="rg-name">{t("common.fullName")}</label>
          <input
            className="input"
            id="rg-name"
            placeholder="Maya Cohen"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="rg-email">{t("common.email")}</label>
          <input
            className="input"
            id="rg-email"
            type="email"
            placeholder="maya.cohen@nutriagent.ai"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="rg-pass">{t("common.password")}</label>
          <input
            className="input"
            id="rg-pass"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        {error && (
          <p style={{ fontSize: 12.5, color: "var(--color-accent-2-700)", margin: "0 0 var(--space-2)" }}>{error}</p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? t("auth.creatingAccount") : t("auth.createAccount")}
        </button>
        <p className="note" style={{ fontSize: 11.5, opacity: 0.55, margin: "var(--space-2) 0 0" }}>
          {t("auth.alreadyRegistered")} <Link href="/">{t("auth.backToSignIn")}</Link>
        </p>
      </form>
    </div>
  );
}
