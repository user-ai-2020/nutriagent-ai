"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { AuditIcon, LlmIcon, OverviewIcon, UsersIcon } from "./icons";

const LINK_KEYS = [
  { href: "/dashboard", labelKey: "admin.overview", Icon: OverviewIcon },
  { href: "/users", labelKey: "admin.users", Icon: UsersIcon },
  { href: "/audit-logs", labelKey: "admin.auditLog", Icon: AuditIcon },
  { href: "/llm", labelKey: "admin.llm", Icon: LlmIcon },
] as const;

type AuthState = "loading" | "admin" | "unauthenticated";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>("loading");

  useEffect(() => {
    api<{ role: string }>("/api/auth/me")
      .then(async (me) => {
        if (me.role !== "Admin") {
          await api("/api/auth/logout", { method: "POST" }).catch(() => {});
          router.replace("/");
          return;
        }
        setAuthState("admin");
      })
      .catch(async () => {
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
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
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" }).catch(() => {});
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
