"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { useViewportPreview } from "@/lib/viewportPreview";
import { useProfile, useUpdateProfile } from "@/hooks/queries";
// Subpath import, NOT the "@nutriagent/shared" barrel: the barrel re-exports
// sharp and @google-cloud/storage, which webpack then tries to bundle for the
// browser and the build dies on fs/net/child_process.
import { calculateBodyMetrics, hasCompleteBodyMetrics } from "@nutriagent/shared/nutrition-targets";
import {
  applyRestrictions,
  DIET_TYPES,
  Profile,
  RESTRICTIONS,
  RestrictionId,
  selectedRestrictions,
} from "@/lib/profile";

function MetricRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  );
}

const BMI_CATEGORY_KEY: Record<string, string> = {
  underweight: "settings.bmiUnderweight",
  normal: "settings.bmiNormal",
  overweight: "settings.bmiOverweight",
  obese: "settings.bmiObese",
};

export function SettingsClient() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { preferredLanguage, setPreferredLanguage } = useLanguage();
  const { mode: viewportMode, setMode: setViewportMode } = useViewportPreview();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [restrictions, setRestrictions] = useState<RestrictionId[]>([]);
  const [saved, setSaved] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);
  const { data: profileData } = useProfile();
  const updateProfile = useUpdateProfile();

  useEffect(() => {
    if (profileData) {
      setProfile(profileData);
      setRestrictions(selectedRestrictions(profileData));
    }
  }, [profileData]);

  function toggle(id: RestrictionId) {
    setRestrictions((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function save() {
    if (!profile) return;
    const payload = applyRestrictions(profile, restrictions);
    updateProfile.mutate(payload as Record<string, unknown>, {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2200);
      }
    });
  }

  if (!profile) return <div style={{ padding: "var(--space-8)", opacity: 0.6 }}>{t("common.loading")}</div>;

  // Recomputed as the user edits, so the targets update live before saving.
  const metrics = hasCompleteBodyMetrics(profile)
    ? calculateBodyMetrics({
        weightKg: profile.weight!,
        heightCm: profile.height!,
        age: profile.age!,
        sex: profile.sex!,
        activityLevel: profile.activityLevel ?? "moderate",
        goal: profile.fitnessGoal ?? "maintain",
      })
    : null;
  const bmiCategoryKey = metrics ? BMI_CATEGORY_KEY[metrics.bmiCategory] : "settings.bmiNormal";

  return (
    <div className="na-screen">
      <h2 style={{ fontSize: 22, margin: "0 0 var(--space-5)" }}>{t("settings.title")}</h2>

      {/* No inline margin: the column sits at the inline-start edge, so it follows the
          reading direction — left in English/Russian, right in Hebrew. */}
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

        <h3 style={{ fontSize: 15, marginBottom: "var(--space-2)" }}>{t("settings.bodyTitle")}</h3>
        <p className="note" style={{ margin: "0 0 var(--space-3)" }}>{t("settings.bodyHint")}</p>

        <div className="field">
          <label htmlFor="st-weight">{t("settings.weight")}</label>
          <input
            className="input"
            id="st-weight"
            type="number"
            min={20}
            max={400}
            value={profile.weight ?? ""}
            onChange={(e) =>
              setProfile({ ...profile, weight: Number(e.target.value) || undefined })
            }
          />
        </div>

        <div className="field">
          <label htmlFor="st-height">{t("settings.height")}</label>
          <input
            className="input"
            id="st-height"
            type="number"
            min={80}
            max={250}
            value={profile.height ?? ""}
            onChange={(e) =>
              setProfile({ ...profile, height: Number(e.target.value) || undefined })
            }
          />
        </div>

        <div className="field">
          <label htmlFor="st-age">{t("settings.age")}</label>
          <input
            className="input"
            id="st-age"
            type="number"
            min={10}
            max={120}
            value={profile.age ?? ""}
            onChange={(e) => setProfile({ ...profile, age: Number(e.target.value) || undefined })}
          />
        </div>

        <div className="field">
          <label htmlFor="st-sex">{t("settings.sex")}</label>
          <select
            className="input"
            id="st-sex"
            value={profile.sex ?? ""}
            onChange={(e) =>
              setProfile({ ...profile, sex: (e.target.value || undefined) as Profile["sex"] })
            }
          >
            <option value="">—</option>
            <option value="female">{t("settings.sexFemale")}</option>
            <option value="male">{t("settings.sexMale")}</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="st-activity">{t("settings.activityLevel")}</label>
          <select
            className="input"
            id="st-activity"
            value={profile.activityLevel ?? "moderate"}
            onChange={(e) =>
              setProfile({
                ...profile,
                activityLevel: e.target.value as Profile["activityLevel"],
              })
            }
          >
            <option value="sedentary">{t("settings.activitySedentary")}</option>
            <option value="light">{t("settings.activityLight")}</option>
            <option value="moderate">{t("settings.activityModerate")}</option>
            <option value="active">{t("settings.activityActive")}</option>
            <option value="very_active">{t("settings.activityVeryActive")}</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="st-goal">{t("settings.fitnessGoal")}</label>
          <select
            className="input"
            id="st-goal"
            value={profile.fitnessGoal ?? "maintain"}
            onChange={(e) =>
              setProfile({ ...profile, fitnessGoal: e.target.value as Profile["fitnessGoal"] })
            }
          >
            <option value="lose_fat">{t("settings.goalLoseFat")}</option>
            <option value="maintain">{t("settings.goalMaintain")}</option>
            <option value="build_muscle">{t("settings.goalBuildMuscle")}</option>
          </select>
        </div>

        {metrics ? (
          <div
            className="card"
            style={{ padding: "var(--space-3)", gap: 6, margin: "0 0 var(--space-4)" }}
          >
            {/* The end result, stated plainly — derived from the actual calorie
                delta, so a deficit clamped to the safe floor reads as maintenance
                rather than promising weight loss it no longer produces. */}
            <div
              style={{
                paddingBottom: 8,
                marginBottom: 4,
                borderBottom: "1px solid var(--color-divider)",
              }}
            >
              <div style={{ fontSize: 11.5, opacity: 0.6 }}>{t("settings.outcomeTitle")}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-accent)" }}>
                {metrics.weightDirection === "lose"
                  ? t("settings.outcomeLose", { kg: Math.abs(metrics.weeklyWeightChangeKg) })
                  : metrics.weightDirection === "gain"
                    ? t("settings.outcomeGain", { kg: Math.abs(metrics.weeklyWeightChangeKg) })
                    : t("settings.outcomeMaintain")}
              </div>
            </div>

            <MetricRow label={t("settings.bmi")} value={`${metrics.bmi} · ${t(bmiCategoryKey)}`} />
            <MetricRow label={t("settings.bmr")} value={`${metrics.bmr} kcal`} />
            <MetricRow label={t("settings.tdee")} value={`${metrics.tdee} kcal`} />
            <MetricRow
              label={t("settings.recommendedCalories")}
              value={`${metrics.targetCalories} kcal`}
              strong
            />
            <MetricRow
              label={t("settings.recommendedProtein")}
              value={`${metrics.targetProteinGrams} g`}
              strong
            />

            <p className="note" style={{ margin: "6px 0 0" }}>
              {metrics.calorieDelta > 0
                ? t("settings.eatMore", { kcal: Math.abs(metrics.calorieDelta) })
                : metrics.calorieDelta < 0
                  ? t("settings.eatLess", { kcal: Math.abs(metrics.calorieDelta) })
                  : t("settings.eatSame")}
            </p>

            {metrics.clampedToSafeMinimum && (
              <p className="note" style={{ margin: "4px 0 0", color: "var(--color-warning, #f2a33c)" }}>
                {/* If the floor pushed the target at or above TDEE, a "lose fat" goal
                    can't deliver loss at all — say that outright instead of leaving a
                    confusing "gain weight" outcome next to a cutting goal. */}
                {metrics.targetCalories >= metrics.tdee
                  ? t("settings.safeMinimumAboveBurn")
                  : t("settings.safeMinimumNote")}
              </p>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 8, alignSelf: "flex-start", fontSize: 13 }}
              onClick={() =>
                setProfile({
                  ...profile,
                  dietGoals: {
                    ...profile.dietGoals,
                    dailyCalories: metrics.targetCalories,
                    proteinGrams: metrics.targetProteinGrams,
                  },
                })
              }
            >
              {t("settings.applyTargets")}
            </button>

            <p className="note" style={{ margin: "8px 0 0", fontSize: 11, opacity: 0.7 }}>
              {t("settings.methodNote")}
            </p>
          </div>
        ) : (
          <p className="note" style={{ margin: "0 0 var(--space-4)" }}>
            {t("settings.targetsIncomplete")}
          </p>
        )}

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
