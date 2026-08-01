"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { loadSavedLogin, persistSavedLogin } from "@/lib/savedLogin";

export default function LoginPage() {
  const { t } = useTranslation();
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = loadSavedLogin();
    setEmail(saved.email);
    setPassword(saved.password);
    setRemember(saved.remember);
  }, []);

  useEffect(() => {
    if (!loading && user) router.replace("/app/chat");
  }, [loading, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      persistSavedLogin(email, password, remember);
      router.replace("/app/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", opacity: 0.6 }}>
        {t("common.loading")}
      </div>
    );
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
        <p style={{ fontSize: 14, opacity: 0.65, margin: 0 }}>{t("common.tagline")}</p>
      </div>

      <form
        className="card elev-md"
        style={{ width: "min(360px,90vw)", padding: "var(--space-4)" }}
        onSubmit={onSubmit}
      >
        <div className="card-kicker">{t("auth.signIn")}</div>
        <div className="field">
          <label htmlFor="li-user">{t("common.username")}</label>
          <input
            className="input"
            id="li-user"
            type="email"
            placeholder="maya.cohen@nutriagent.ai"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="li-pass">{t("common.password")}</label>
          <input
            className="input"
            id="li-pass"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            marginBottom: "var(--space-3)",
            cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {t("auth.savePassword")}
        </label>
        {error && (
          <p style={{ fontSize: 12.5, color: "var(--color-accent-2-700)", margin: "0 0 var(--space-2)" }}>{error}</p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? t("auth.signingIn") : t("auth.signIn")}
        </button>
        <p className="note" style={{ fontSize: 11.5, opacity: 0.55, margin: "var(--space-2) 0 0" }}>
          {t("auth.noAccount")} <Link href="/register">{t("auth.createOne")}</Link> — {t("auth.mfaLater")}
        </p>
      </form>
    </div>
  );
}
