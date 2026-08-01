"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useViewportPreview } from "@/lib/viewportPreview";
import {
  AnalysisIcon,
  ChatIcon,
  DashboardIcon,
  FoodsIcon,
  NutrientsIcon,
  SettingsIcon,
} from "@/components/icons";

const NAV_KEYS = [
  { href: "/app/chat", labelKey: "nav.chat", shortKey: "nav.chatShort", Icon: ChatIcon },
  { href: "/app/dashboard", labelKey: "nav.dashboard", shortKey: "nav.dashboardShort", Icon: DashboardIcon },
  { href: "/app/summary", labelKey: "nav.summary", shortKey: "nav.summaryShort", Icon: FoodsIcon },
  { href: "/app/meal-analysis", labelKey: "nav.mealAnalysis", shortKey: "nav.mealAnalysisShort", Icon: AnalysisIcon },
  { href: "/app/nutrients", labelKey: "nav.nutrients", shortKey: "nav.nutrientsShort", Icon: NutrientsIcon },
  { href: "/app/settings", labelKey: "nav.settings", shortKey: "nav.settingsShort", Icon: SettingsIcon },
] as const;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, loading, logout } = useAuth();
  const { mode: viewportMode, setMode: setViewportMode } = useViewportPreview();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  // Drop legacy theme preference so old light themes never reappear.
  useEffect(() => {
    try {
      localStorage.removeItem("na_theme");
    } catch {
      /* ignore */
    }
  }, []);

  if (loading || !user) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", opacity: 0.6 }}>
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className={`na-shell${viewportMode === "mobile" ? " na-preview-mobile" : ""}`}>
      <aside className="na-sidebar">
        <div className="na-brand">{t("common.appName")}</div>
        {NAV_KEYS.map(({ href, labelKey, Icon }) => (
          <Link key={href} href={href} className={`na-nav-item${pathname === href ? " is-active" : ""}`}>
            <Icon />
            <span style={{ fontSize: 14 }}>{t(labelKey)}</span>
          </Link>
        ))}

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div className="card-kicker" style={{ padding: "0 var(--space-3)", marginTop: "var(--space-2)" }}>
            {t("common.viewMode")}
          </div>
          <div className="seg" style={{ margin: "0 var(--space-2)", flexWrap: "wrap" }} data-testid="viewport-toggle">
            <button
              type="button"
              className={`seg-opt${viewportMode === "desktop" ? " is-active" : ""}`}
              onClick={() => setViewportMode("desktop")}
              style={{ fontSize: 11.5, padding: "6px 10px" }}
            >
              {t("common.viewDesktop")}
            </button>
            <button
              type="button"
              className={`seg-opt${viewportMode === "mobile" ? " is-active" : ""}`}
              onClick={() => setViewportMode("mobile")}
              style={{ fontSize: 11.5, padding: "6px 10px" }}
            >
              {t("common.viewMobile")}
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ justifyContent: "flex-start", fontSize: 13 }}
            onClick={() => {
              logout();
              router.replace("/");
            }}
          >
            {t("common.logOutUser", { name: user.name })}
          </button>
        </div>
      </aside>

      <div className="na-main">
        {viewportMode === "mobile" && (
          <div className="na-preview-chrome">
            <span className="na-preview-chrome-label">{t("common.viewMobile")}</span>
            <div className="seg na-preview-seg" aria-label={t("common.viewMode")}>
              <button type="button" className="seg-opt" onClick={() => setViewportMode("desktop")}>
                {t("common.viewDesktop")}
              </button>
              <button type="button" className="seg-opt is-active" onClick={() => setViewportMode("mobile")}>
                {t("common.viewMobile")}
              </button>
            </div>
          </div>
        )}

        <div className="na-preview-stage">
          <div className="na-device-wrap">
            <div className="na-mobile-topbar">
              <span className="na-brand" style={{ margin: 0, padding: 0 }}>
                {t("common.appName")}
              </span>
            </div>
            <div className={`na-content na-viewport-${viewportMode}`}>
              <div className={`na-screen${pathname === "/app/chat" ? " na-screen--chat" : ""}`}>{children}</div>
            </div>

            <nav className="na-tabbar">
              {NAV_KEYS.map(({ href, shortKey, Icon }) => (
                <Link key={href} href={href} className={`na-tab-item${pathname === href ? " is-active" : ""}`}>
                  <Icon size={18} />
                  <span style={{ fontSize: 9.5 }}>{t(shortKey)}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
