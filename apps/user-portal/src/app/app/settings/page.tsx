"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { useViewportPreview } from "@/lib/viewportPreview";
import {
  applyRestrictions,
  DIET_TYPES,
  Profile,
  RESTRICTIONS,
  RestrictionId,
  selectedRestrictions,
} from "@/lib/profile";

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { preferredLanguage, setPreferredLanguage } = useLanguage();
  const { mode: viewportMode, setMode: setViewportMode } = useViewportPreview();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [restrictions, setRestrictions] = useState<RestrictionId[]>([]);
  const [saved, setSaved] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);

  useEffect(() => {
    api<Profile>("/api/profile")
      .then((p) => {
        setProfile(p);
        setRestrictions(selectedRestrictions(p));
      })
      .catch(console.error);
  }, []);

  function toggle(id: RestrictionId) {
    setRestrictions((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function save() {
    if (!profile) return;
    const payload = applyRestrictions(profile, restrictions);
    await api("/api/profile", { method: "PUT", body: JSON.stringify(payload) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  if (!profile) return <div style={{ padding: "var(--space-8)", opacity: 0.6 }}>{t("common.loading")}</div>;

  return (
    <div className="na-screen">
      <h2 style={{ fontSize: 22, margin: "0 0 var(--space-5)" }}>{t("settings.title")}</h2>

      <div style={{ maxWidth: 420 }}>
        <p className="note" style={{ margin: "0 0 var(--space-5)" }}>
          {user?.name} · {user?.email}
        </p>

        <h3 style={{ fontSize: 15, marginBottom: "var(--space-2)" }}>{t("common.languageLabel")}</h3>
        <p className="note" style={{ margin: "0 0 var(--space-2)" }}>
          {t("settings.languageHint")}
        </p>
        <div className="seg" style={{ marginBottom: "var(--space-5)" }}>
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
              disabled={languageSaving}
              onClick={async () => {
                if (opt.id === preferredLanguage) return;
                setLanguageSaving(true);
                try {
                  await setPreferredLanguage(opt.id);
                } catch (err) {
                  console.error(err);
                } finally {
                  setLanguageSaving(false);
                }
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <h3 style={{ fontSize: 15, marginBottom: "var(--space-2)" }}>{t("common.viewMode")}</h3>
        <div className="seg" style={{ marginBottom: "var(--space-5)" }} data-testid="settings-viewport-toggle">
          {(
            [
              { id: "desktop" as const, label: t("common.viewDesktop") },
              { id: "mobile" as const, label: t("common.viewMobile") },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`seg-opt${viewportMode === opt.id ? " is-active" : ""}`}
              onClick={() => setViewportMode(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <h3 style={{ fontSize: 15, marginBottom: "var(--space-2)" }}>{t("settings.dietGoals")}</h3>
        <div className="field">
          <label htmlFor="st-cal">{t("settings.calorieGoal")}</label>
          <input
            className="input"
            id="st-cal"
            type="number"
            value={profile.dietGoals?.dailyCalories ?? ""}
            onChange={(e) =>
              setProfile({
                ...profile,
                dietGoals: { ...profile.dietGoals, dailyCalories: Number(e.target.value) || 0 },
              })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="st-pro">{t("settings.proteinGoal")}</label>
          <input
            className="input"
            id="st-pro"
            type="number"
            value={profile.dietGoals?.proteinGrams ?? ""}
            onChange={(e) =>
              setProfile({
                ...profile,
                dietGoals: { ...profile.dietGoals, proteinGrams: Number(e.target.value) || 0 },
              })
            }
          />
        </div>

        <h3 style={{ fontSize: 15, margin: "var(--space-5) 0 var(--space-2)" }}>{t("settings.restrictionsTitle")}</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {RESTRICTIONS.map((r) => {
            const on = restrictions.includes(r.id);
            return (
              <button key={r.id} type="button" className={`pill${on ? " is-on" : ""}`} onClick={() => toggle(r.id)}>
                {r.label}
                {on ? " ✓" : ""}
              </button>
            );
          })}
        </div>

        <h3 style={{ fontSize: 15, margin: "var(--space-5) 0 var(--space-2)" }}>{t("settings.dietTypeTitle")}</h3>
        <div style={{ display: "grid", gap: "var(--space-1)" }}>
          {DIET_TYPES.map((d) => (
            <label className="radio" key={d.id}>
              <input
                type="radio"
                name="st-diet"
                checked={profile.dietType === d.id}
                onChange={() => setProfile({ ...profile, dietType: d.id })}
              />
              <span className="dot" />
              {d.label}
            </label>
          ))}
        </div>

        <h3 style={{ fontSize: 15, margin: "var(--space-5) 0 var(--space-2)" }}>{t("settings.activityTitle")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          <div className="field">
            <label htmlFor="st-steps">{t("settings.todaySteps")}</label>
            <input
              className="input"
              id="st-steps"
              type="number"
              value={profile.todaySteps ?? 0}
              onChange={(e) => setProfile({ ...profile, todaySteps: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="field">
            <label htmlFor="st-steps-goal">{t("settings.stepsGoal")}</label>
            <input
              className="input"
              id="st-steps-goal"
              type="number"
              value={profile.dailyStepsGoal ?? 8000}
              onChange={(e) => setProfile({ ...profile, dailyStepsGoal: Number(e.target.value) || 8000 })}
            />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
          <button type="button" className="btn btn-primary" onClick={save}>
            {t("settings.saveChanges")}
          </button>
          {saved && <span className="tag tag-accent">{t("settings.saved")}</span>}
          <button
            type="button"
            className="btn btn-danger"
            style={{ marginLeft: "auto" }}
            onClick={() => {
              logout();
              router.replace("/");
            }}
          >
            {t("common.logOut")}
          </button>
        </div>
      </div>
    </div>
  );
}
