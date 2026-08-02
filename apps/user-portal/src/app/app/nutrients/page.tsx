"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { muted, serif } from "@/lib/ui";
import { Segmented } from "@/components/Segmented";
import { toDateKey, useDashboard, useMeal } from "@/hooks/queries";

interface Totals {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  sugar: number;
}

interface Dash {
  totals: Totals;
  todayTotals: Totals;
  mealCount?: number;
  goals: { dailyCalories?: number; proteinGrams?: number; carbsGrams?: number; fatGrams?: number };
  dailyBreakdown: Array<{ date: string; calories: number; protein: number; fat: number; carbs: number }>;
}

interface Meal {
  mealId: number;
  items: Array<{ nutritionValues?: Totals | null }>;
}

type Scope = "meal" | "day" | "period";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const EMPTY: Totals = { calories: 0, protein: 0, fat: 0, carbs: 0, sugar: 0 };
const GOAL_FAT = 70;
const GOAL_CARBS = 250;

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekSunday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function last7(daily: Dash["dailyBreakdown"]) {
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const today = new Date();
  const weekStart = startOfWeekSunday(today);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const key = localDateKey(d);
    const entry = byDate.get(key);
    return {
      dow: DOW[d.getDay()],
      calories: entry?.calories ?? 0,
      protein: entry?.protein ?? 0,
      fat: entry?.fat ?? 0,
      carbs: entry?.carbs ?? 0,
    };
  });
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const points = values
    .map((v, i) => `${(i / Math.max(values.length - 1, 1)) * 90},${28 - (v / max) * 24}`)
    .join(" ");
  return (
    <svg width="100%" height="30" viewBox="0 0 90 30" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MiniBars({ values, colors }: { values: number[]; colors: string[] }) {
  const max = Math.max(...values, 1);
  return (
    <svg width="100%" height="30" viewBox="0 0 90 30" preserveAspectRatio="none">
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * 28);
        return (
          <rect
            key={i}
            x={i * 13}
            y={30 - h}
            width="9"
            height={h}
            rx="2"
            fill={colors[i % colors.length]}
          />
        );
      })}
    </svg>
  );
}

function NutrientCard({
  label,
  value,
  unit,
  badge,
  badgeTitle,
  children,
}: {
  label: string;
  value: number;
  unit: string;
  badge?: string;
  /** Explains what the badge percentage is measured against (daily vs weekly goal). */
  badgeTitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ gap: 6, padding: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: muted(60) }}>{label}</span>
        {badge && (
          <span
            title={badgeTitle}
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              background: "var(--color-accent-100)",
              color: "var(--color-accent-700)",
              padding: "2px 8px",
              borderRadius: 10,
              cursor: badgeTitle ? "help" : undefined,
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <div style={serif(22)}>
        {Math.round(value)} <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.6 }}>{unit}</span>
      </div>
      {children}
    </div>
  );
}

export default function NutrientsPage() {
  const { t } = useTranslation();
  const SCOPES = [
    { value: "meal" as const, label: t("nutrients.scopeMeal") },
    { value: "day" as const, label: t("nutrients.scopeDay") },
    { value: "period" as const, label: t("nutrients.scopePeriod") },
  ];
  const [scope, setScope] = useState<Scope>("day");
  const [mealTotals, setMealTotals] = useState<Totals>(EMPTY);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMealId, setSelectedMealId] = useState<number | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("selectedMealId");
    if (id) setSelectedMealId(Number(id));
  }, []);

  // useDashboard takes (dateKey, period) — passing "week" alone sent it as the
  // date and the API answered 400 "Invalid date; use YYYY-MM-DD".
  const { data, error, isFetching } = useDashboard(toDateKey(), "week");
  const { data: mealData } = useMeal(selectedMealId);

  useEffect(() => {
    if (error) {
      setLoadError(error instanceof Error ? error.message : t("nutrients.loadFailed"));
    } else {
      setLoadError(null);
    }
  }, [error, t]);

  useEffect(() => {
    if (data && selectedMealId) {
      const todayEmpty = data.todayTotals.calories === 0 && (data.mealCount ?? 0) === 0;
      if (todayEmpty) setScope("meal");
    }
  }, [data, selectedMealId]);

  useEffect(() => {
    if (mealData) {
      setMealTotals(
        (mealData.items.reduce as any)((acc: Totals, item: any) => {
          const n = item.nutritionValues;
          if (!n) return acc;
          return {
            calories: acc.calories + n.calories,
            protein: acc.protein + n.protein,
            fat: acc.fat + n.fat,
            carbs: acc.carbs + n.carbs,
            sugar: acc.sugar + n.sugar,
          };
        }, EMPTY)
      );
    }
  }, [mealData]);

  if (loadError) {
    return (
      <div style={{ padding: "var(--space-4)", color: "var(--color-accent-2-700, #b42318)" }}>
        <p style={{ margin: "0 0 8px" }}>{loadError}</p>
        <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
          {t("common.retry")}
        </button>
      </div>
    );
  }

  if (!data) return <div style={{ padding: "var(--space-8)", opacity: 0.6 }}>{t("common.loading")}</div>;

  const week = last7(data.dailyBreakdown);
  const totals = scope === "meal" ? mealTotals : scope === "day" ? data.todayTotals : data.totals;
  const goalCalories = data.goals.dailyCalories || 2200;
  const goalProtein = data.goals.proteinGrams || 130;
  const scopeGoalCalories = scope === "period" ? goalCalories * 7 : goalCalories;
  const caloriePct = Math.min(100, Math.round((totals.calories / scopeGoalCalories) * 100));

  const proteinKcal = totals.protein * 4;
  const fatKcal = totals.fat * 9;
  const carbKcal = totals.carbs * 4;
  const macroTotal = proteinKcal + fatKcal + carbKcal;
  const hasMacroData = macroTotal > 0;
  const pProtein = hasMacroData ? Math.round((proteinKcal / macroTotal) * 100) : 0;
  const pFat = hasMacroData ? Math.round((fatKcal / macroTotal) * 100) : 0;
  const pCarbs = hasMacroData ? Math.max(0, 100 - pProtein - pFat) : 0;
  const donut = hasMacroData
    ? `conic-gradient(#d6006c 0% ${pProtein}%, #f2a33c ${pProtein}% ${pProtein + pFat}%, #f2c94c ${
        pProtein + pFat
      }% 100%)`
    : "var(--color-divider)";

  const weeklyAvg = Math.round(week.reduce((a, d) => a + d.calories, 0) / 7);
  const weeklyDiff = weeklyAvg - goalCalories;
  const maxWeek = Math.max(...week.map((d) => d.calories), 1);
  const bars = week.map((d, i) => {
    const h = Math.round((d.calories / maxWeek) * 110);
    return { x: 6 + i * 39, y: 130 - h, h };
  });
  const goalY = 130 - Math.min(110, Math.round((goalCalories / maxWeek) * 110));
  const goalPoints = bars.map((b) => `${b.x + 13},${goalY}`).join(" ");

  return (
    <div style={{ width: "100%" }}>
      <h2 style={{ fontSize: 22, margin: "0 0 var(--space-3)" }}>{t("nav.nutrients")}</h2>
      <Segmented options={SCOPES} value={scope} onChange={setScope} style={{ marginBottom: "var(--space-5)" }} />

      <div className="na-nutrient-grid">
        <NutrientCard
          label={t("nutrients.calories")}
          value={totals.calories}
          unit="kcal"
          badge={`${caloriePct}%`}
          // The same kcal reads as a very different % depending on scope (a meal
          // against one day vs a week against seven), so spell out the denominator.
          badgeTitle={
            scope === "period"
              ? t("nutrients.percentOfWeeklyGoal", { pct: caloriePct, goal: scopeGoalCalories })
              : t("nutrients.percentOfDailyGoal", { pct: caloriePct, goal: scopeGoalCalories })
          }
        >
          <Sparkline values={week.map((d) => d.calories)} color="#2e9e5b" />
        </NutrientCard>

        <NutrientCard label={t("nutrients.carbs")} value={totals.carbs} unit="g">
          <MiniBars values={week.map((d) => d.carbs)} colors={["#f2a33c"]} />
        </NutrientCard>

        <NutrientCard label={t("nutrients.protein")} value={totals.protein} unit="g">
          <MiniBars values={week.map((d) => d.protein)} colors={["#e0575c"]} />
        </NutrientCard>

        <NutrientCard label={t("nutrients.fatAndSugar")} value={totals.fat} unit="g">
          <MiniBars
            values={week.map((d) => d.fat)}
            colors={["#2e9e5b", "#f2a33c", "#e0575c", "#6a9be8", "#d6006c", "#f2c94c", "#2e9e5b"]}
          />
        </NutrientCard>
      </div>

      <div className="card elev-sm" style={{ padding: "var(--space-4)", marginBottom: "var(--space-5)" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 2 }}>
          <div>
            <div style={{ fontSize: 11, color: muted() }}>{t("nutrients.averageIntake")}</div>
            <div style={serif(24)}>
              {weeklyAvg} <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.6 }}>kcal</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: muted() }}>{t("nutrients.difference")}</div>
            <div style={serif(16, { color: weeklyDiff > 0 ? "#e0575c" : "var(--color-accent-700)" })}>
              {weeklyDiff >= 0 ? "+" : ""}
              {weeklyDiff} kcal
            </div>
          </div>
        </div>

        <svg width="100%" height="150" viewBox="0 0 280 150" style={{ marginTop: 8 }}>
          {[20, 70, 120].map((y) => (
            <line key={y} x1="0" y1={y} x2="280" y2={y} stroke="var(--color-divider)" />
          ))}
          <g fill="#6a9be8">
            {bars.map((b, i) => (
              <rect key={i} x={b.x} y={b.y} width="26" height={b.h} rx="4" />
            ))}
          </g>
          <polyline points={goalPoints} fill="none" stroke="#e0575c" strokeWidth="2.5" strokeDasharray="4 3" />
          {bars.map((b, i) => (
            <circle key={i} cx={b.x + 13} cy={goalY} r="3.5" fill="#e0575c" />
          ))}
        </svg>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: muted(), marginTop: 4 }}>
          {week.map((d, i) => (
            <span key={i} style={{ flex: 1, textAlign: "center" }}>
              {d.dow}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", gap: 14, fontSize: 11.5, marginTop: 10 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 9, height: 9, background: "#6a9be8", borderRadius: 2, display: "inline-block" }} />
            {t("nutrients.intake")}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 9, height: 9, background: "#e0575c", borderRadius: "50%", display: "inline-block" }} />
            {t("nutrients.goalTdee")}
          </span>
        </div>
      </div>

      <div className="card elev-sm" style={{ padding: "var(--space-4)" }}>
        <div style={serif(15, { marginBottom: 12 })}>{t("nutrients.macroAnalysis")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-5)", flexWrap: "wrap" }}>
          <div
            style={{
              width: 140,
              height: 140,
              borderRadius: "50%",
              flex: "none",
              background: donut,
              opacity: hasMacroData ? 1 : 0.35,
            }}
          />
          <div
            style={{
              flex: 1,
              minWidth: 160,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontSize: 13,
            }}
          >
            {hasMacroData ? (
              [
                { label: t("nutrients.protein"), color: "#d6006c", grams: totals.protein, pct: pProtein, goal: goalProtein },
                { label: t("nutrients.fat"), color: "#f2a33c", grams: totals.fat, pct: pFat, goal: GOAL_FAT },
                { label: t("nutrients.carbs"), color: "#f2c94c", grams: totals.carbs, pct: pCarbs, goal: GOAL_CARBS },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: row.color,
                        display: "inline-block",
                      }}
                    />
                    {row.label}
                  </span>
                  <b style={{ fontFamily: "var(--font-heading)" }}>
                    {Math.round(row.grams)} g · {row.pct}%
                  </b>
                </div>
              ))
            ) : (
              <p style={{ margin: 0, color: muted(), lineHeight: 1.5 }}>{t("nutrients.noMacroData")}</p>
            )}
          </div>
        </div>
        <p
          style={{
            fontSize: 12,
            color: muted(),
            margin: "12px 0 0",
            paddingTop: 10,
            borderTop: "1px solid var(--color-divider)",
          }}
        >
          {hasMacroData ? (
            <>
              {t("nutrients.macroFormula")}{" "}
              <b style={{ color: "var(--color-text)" }}>{Math.round(macroTotal)} kcal</b>
            </>
          ) : (
            <>{t("nutrients.macroFormulaHint")}</>
          )}
        </p>
      </div>
    </div>
  );
}
