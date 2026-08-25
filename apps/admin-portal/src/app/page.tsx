"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";

type Gate = "checking" | "form";

function userPortalUrl(): string {
  if (typeof window === "undefined") return "http://localhost:3008";
  return `${window.location.protocol}//${window.location.hostname}:3008`;
}

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("admin@nutriagent.ai");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [switchNotice, setSwitchNotice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gate, setGate] = useState<Gate>("checking");

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const me = await api<{ role: string }>("/api/auth/me");
        if (cancelled) return;
        if (me.role === "Admin") {
          router.replace("/dashboard");
          return;
        }
        // User-portal session is shared via cookie — clear it so admin can sign in here.
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
        if (!cancelled) {
          setSwitchNotice(true);
          setGate("form");
        }
      } catch {
        if (!cancelled) setGate("form");
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/logout", { method: "POST" }).catch(() => {});
      const data = await api<{ user: { role: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (data.user.role !== "Admin") {
        setError(t("auth.adminAccessRequired"));
        return;
      }
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
        {switchNotice ? (
          <p
            className="note"
            style={{
              fontSize: 12.5,
              margin: "0 0 var(--space-3)",
              padding: "10px 12px",
              borderRadius: 8,
              background: "color-mix(in srgb, var(--color-accent-1-700, #2D6A4F) 8%, transparent)",
            }}
          >
            {t("admin.switchFromUserHint")}
          </p>
        ) : null}
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
        <p className="note" style={{ fontSize: 11.5, opacity: 0.55, margin: "var(--space-2) 0 0" }}>
          <a href={userPortalUrl()}>{t("admin.goToUserPortal")}</a>
        </p>
      </form>
    </div>
  );
}
