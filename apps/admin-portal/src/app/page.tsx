"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { api, getToken, setToken } from "@/lib/api";

type Gate = "checking" | "form" | "denied";

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("admin@nutriagent.ai");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [gate, setGate] = useState<Gate>("checking");

  useEffect(() => {
    let cancelled = false;

    async function reuseSharedSession() {
      const token = getToken();
      if (!token) {
        if (!cancelled) setGate("form");
        return;
      }
      try {
        const me = await api<{ role: string }>("/api/auth/me");
        if (cancelled) return;
        if (me.role === "Admin") {
          router.replace("/dashboard");
          return;
        }
        setGate("denied");
      } catch {
        setToken(null);
        if (!cancelled) setGate("form");
      }
    }

    void reuseSharedSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api<{ token: string; user: { role: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (data.user.role !== "Admin") {
        setError(t("auth.adminAccessRequired"));
        return;
      }
      setToken(data.token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (gate === "checking") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", opacity: 0.6 }}>
        {t("common.loading")}
      </div>
    );
  }

  if (gate === "denied") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-8)",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 24, margin: "0 0 var(--space-2)" }}>{t("auth.adminAccessRequired")}</h1>
        <p className="note" style={{ maxWidth: 420, margin: "0 0 var(--space-4)" }}>
          {t("admin.accessDeniedHint")}
        </p>
        <a href="http://127.0.0.1:3008" className="btn btn-primary">
          {t("admin.goToUserPortal")}
        </a>
      </div>
    );
  }

  return (
    <div
      style={{
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
        <p style={{ fontSize: 14, opacity: 0.65, margin: 0 }}>{t("admin.portalTagline")}</p>
      </div>

      <form
        className="card elev-md"
        style={{ width: "min(360px,90vw)", padding: "var(--space-4)" }}
        onSubmit={handleSubmit}
      >
        <div className="card-kicker">{t("auth.signIn")}</div>
        <div className="field">
          <label htmlFor="ad-user">{t("common.email")}</label>
          <input
            className="input"
            id="ad-user"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="ad-pass">{t("common.password")}</label>
          <input
            className="input"
            id="ad-pass"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p style={{ fontSize: 12.5, color: "var(--color-accent-2-700)", margin: "0 0 var(--space-2)" }}>{error}</p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? t("auth.signingIn") : t("auth.signIn")}
        </button>
        <p className="note" style={{ fontSize: 11.5, opacity: 0.55, margin: "var(--space-2) 0 0" }}>
          {t("admin.signInNote")}
        </p>
      </form>
    </div>
  );
}
