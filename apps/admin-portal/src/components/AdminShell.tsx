"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { api, getToken, setToken } from "@/lib/api";
import { AuditIcon, LlmIcon, OverviewIcon, UsersIcon } from "./icons";

const LINK_KEYS = [
  { href: "/dashboard", labelKey: "admin.overview", Icon: OverviewIcon },
  { href: "/users", labelKey: "admin.users", Icon: UsersIcon },
  { href: "/audit-logs", labelKey: "admin.auditLog", Icon: AuditIcon },
  { href: "/llm", labelKey: "admin.llm", Icon: LlmIcon },
] as const;

type AuthState = "loading" | "admin" | "denied" | "unauthenticated";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>("loading");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/");
      return;
    }

    api<{ role: string }>("/api/auth/me")
      .then((me) => {
        if (me.role !== "Admin") {
          // Keep shared cookie — User sessions from :3008 must not be wiped.
          setAuthState("denied");
          return;
        }
        setAuthState("admin");
      })
      .catch(() => {
        setToken(null);
        setAuthState("unauthenticated");
        router.replace("/");
      });
  }, [router]);

  if (authState === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", opacity: 0.6 }}>
        {t("common.loading")}
      </div>
    );
  }

  if (authState === "denied") {
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
        <Link href="http://127.0.0.1:3008" className="btn btn-primary">
          {t("admin.goToUserPortal")}
        </Link>
      </div>
    );
  }

  if (authState !== "admin") {
    return null;
  }

  return (
    <div className="na-shell">
      <aside className="na-sidebar na-sidebar--admin">
        <div className="na-brand" style={{ fontSize: 16 }}>
          {t("admin.portalTitle")}
        </div>
        {LINK_KEYS.map(({ href, labelKey, Icon }) => (
          <Link key={href} href={href} className={`na-nav-item${pathname === href ? " is-active" : ""}`}>
            <Icon />
            <span className="na-nav-label" style={{ fontSize: 14 }}>
              {t(labelKey)}
            </span>
          </Link>
        ))}

        <div
          className="na-sidebar-footer"
          style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            style={{ justifyContent: "flex-start", fontSize: 13 }}
            onClick={() => {
              setToken(null);
              router.replace("/");
            }}
          >
            {t("common.logOut")}
          </button>
        </div>
      </aside>

      <div className="na-main">
        <div className="na-content">{children}</div>
      </div>
    </div>
  );
}
