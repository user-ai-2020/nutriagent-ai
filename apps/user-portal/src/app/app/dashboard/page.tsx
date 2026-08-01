"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { muted, serif } from "@/lib/ui";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

interface Dash {
  date?: string;
  calorieBudget: { goal: number; consumed: number; remaining: number; percent: number };
  mealTypeBreakdown: { breakfast: number; lunch: number; dinner: number; snack: number };
  steps: { today: number; goal: number };
  totals: { calories: number; protein: number; fat: number; carbs: number };
  todayTotals: { calories: number; protein: number; fat: number; carbs: number };
  goals: { dailyCalories?: number; proteinGrams?: number };
  mealCount: number;
}

const DIAL_CIRC = 326.7;
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Israel / ISO-style display week: Sunday → Saturday */
function startOfWeekSunday(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return startOfDay(x);
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function greeting(t: (key: string) => string) {
  const hour = new Date().getHours();
  if (hour < 12) return t("dashboard.greetingMorning");
  if (hour < 18) return t("dashboard.greetingAfternoon");
  return t("dashboard.greetingEvening");
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDayLabel(date: Date, today: Date, t: (key: string) => string): string {
  if (localDateKey(date) === localDateKey(today)) return t("dashboard.today");
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function formatWeekRange(weekStart: Date, weekEnd: Date): string {
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  if (sameMonth) {
    return `${weekStart.toLocaleDateString(undefined, { month: "short" })} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
  }
  return `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function StatColumn({
  align,
  rows,
  className,
}: {
  align: "right" | "left";
  rows: Array<{ label: string; value: string }>;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", textAlign: align }}
    >
      {rows.map((row) => (
        <div key={row.label}>
          <div style={{ fontSize: 11, letterSpacing: "0.04em", color: muted(60) }}>{row.label}</div>
          <div style={serif(22, { color: "var(--color-accent)" })}>{row.value}</div>
        </div>
      ))}
    </div>
  );
}

const navBtnStyle: CSSProperties = {
  width: 34,
  height: 34,
  flex: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-divider)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  cursor: "pointer",
};

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState<Dash | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [weekStart, setWeekStart] = useState(() => startOfWeekSunday(new Date()));
  const [refreshing, setRefreshing] = useState(false);

  const today = useMemo(() => startOfDay(new Date()), []);
  const currentWeekStart = useMemo(() => startOfWeekSunday(today), [today]);
  const selectedKey = localDateKey(selectedDate);
  const isToday = selectedKey === localDateKey(today);
  const weekEnd = addDays(weekStart, 6);
  const canGoNext = weekStart.getTime() < currentWeekStart.getTime();
  const onCurrentWeek = weekStart.getTime() === currentWeekStart.getTime();

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    api<Dash>(`/api/dashboard?period=week&date=${selectedKey}`)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedKey]);

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        const isFuture = date.getTime() > today.getTime();
        return {
          dow: DOW[date.getDay()],
          day: date.getDate(),
          date,
          dateKey: localDateKey(date),
          active: localDateKey(date) === selectedKey,
          isFuture,
        };
      }),
    [weekStart, selectedKey, today]
  );

  function shiftWeek(deltaWeeks: number) {
    setWeekStart((prev) => addDays(prev, deltaWeeks * 7));
    setSelectedDate((prev) => {
      const next = addDays(prev, deltaWeeks * 7);
      return next.getTime() > today.getTime() ? today : next;
    });
  }

  function jumpToDate(isoDate: string) {
    if (!isoDate) return;
    const picked = startOfDay(new Date(`${isoDate}T00:00:00`));
    if (picked.getTime() > today.getTime()) return;
    setSelectedDate(picked);
    setWeekStart(startOfWeekSunday(picked));
  }

  function goToToday() {
    setSelectedDate(today);
    setWeekStart(currentWeekStart);
  }

  if (!data) return <div style={{ padding: "var(--space-8)", opacity: 0.6 }}>{t("common.loading")}</div>;

  const left = Math.max(0, Math.round(data.calorieBudget.remaining));
  const percent = data.calorieBudget.percent;
  const proteinGoal = data.goals.proteinGrams || 130;
  const proteinLeft = Math.max(0, Math.round(proteinGoal - data.todayTotals.protein));

  const advice = [
    {
      kicker: t("dashboard.adviceProteinKicker"),
      title: isToday ? t("dashboard.adviceProteinForDay") : t("dashboard.adviceProteinThatDay"),
      body: proteinLeft
        ? t("dashboard.adviceProteinUnderTarget", { grams: proteinLeft })
        : t("dashboard.adviceProteinTargetReached"),
    },
    {
      kicker: t("dashboard.adviceHowToKicker"),
      title: t("dashboard.adviceHowToPlateProtein"),
      body: t("dashboard.adviceHowToPlateProteinBody"),
    },
    {
      kicker: t("dashboard.adviceBudgetKicker"),
      title: left ? t("dashboard.adviceBudgetAvailable") : t("dashboard.adviceBudgetReached"),
      body: left
        ? t("dashboard.adviceBudgetAvailableBody", { left })
        : isToday
          ? t("dashboard.adviceBudgetMetToday")
          : t("dashboard.adviceBudgetUsedThatDay"),
    },
  ];

  return (
    <div style={{ width: "100%", opacity: refreshing ? 0.72 : 1, transition: "opacity 0.15s" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--space-4)",
        }}
      >
        <div>
          <div style={serif(22, { lineHeight: 1.15 })}>
            {isToday ? `${greeting(t)}, ${user?.name?.split(" ")[0] ?? "there"} 👋` : formatDayLabel(selectedDate, today, t)}
          </div>
          <span style={{ fontSize: 12.5, color: "var(--color-accent-700)" }}>
            {isToday
              ? left
                ? t("dashboard.onTrack", { left })
                : t("dashboard.budgetReachedShort")
              : t(data.mealCount === 1 ? "dashboard.kcalLoggedMealsOne" : "dashboard.kcalLoggedMealsOther", {
                  kcal: Math.round(data.todayTotals.calories),
                  count: data.mealCount,
                })}
          </span>
        </div>
        <span
          style={{
            width: 42,
            height: 42,
            flex: "none",
            borderRadius: "50%",
            background: "var(--color-accent-100)",
            color: "var(--color-accent-700)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...serif(16),
          }}
        >
          {initials(user?.name ?? "NA")}
        </span>
      </div>

      <div className="na-dashboard-budget-card card elev-md">
        <div style={{ textAlign: "center", marginBottom: "var(--space-1)" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: muted(50) }}>
            {t("dashboard.calorieBudget")}
          </div>
          <div style={serif(24, { color: "var(--color-accent-700)", lineHeight: 1.1 })}>{data.calorieBudget.goal}</div>
        </div>

        <div className="na-dashboard-budget-grid">
          <StatColumn
            className="na-stat-col na-stat-col-side"
            align="right"
            rows={[
              { label: t("dashboard.steps"), value: isToday ? data.steps.today.toLocaleString() : "—" },
              { label: t("dashboard.protein"), value: `${Math.round(data.todayTotals.protein)}g` },
              { label: t("dashboard.meals"), value: String(data.mealCount) },
            ]}
          />

          <div className="na-dashboard-dial">
            <svg width="176" height="176" viewBox="0 0 120 120" className="na-dashboard-dial-svg">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-neutral-200)" strokeWidth="9" />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={DIAL_CIRC}
                strokeDashoffset={Math.round(DIAL_CIRC * (1 - percent / 100))}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span className="na-dashboard-dial-value" style={serif(38, { lineHeight: 1, color: "var(--color-accent)" })}>
                {left}
              </span>
              <span style={{ fontSize: 13, color: muted(), marginTop: 2 }}>{t("dashboard.left")}</span>
            </div>
          </div>

          <StatColumn
            className="na-stat-col na-stat-col-meals"
            align="left"
            rows={[
              { label: t("dashboard.breakfast"), value: String(Math.round(data.mealTypeBreakdown.breakfast)) },
              { label: t("dashboard.lunch"), value: String(Math.round(data.mealTypeBreakdown.lunch)) },
              { label: t("dashboard.dinner"), value: String(Math.round(data.mealTypeBreakdown.dinner)) },
              { label: t("dashboard.snacks"), value: String(Math.round(data.mealTypeBreakdown.snack)) },
            ]}
          />
        </div>

        <div
          style={{
            textAlign: "center",
            marginTop: "var(--space-4)",
            paddingTop: "var(--space-4)",
            borderTop: "1px solid var(--color-divider)",
          }}
        >
          <Link href="/app/summary" style={{ fontSize: 14, fontWeight: 600 }}>
            {t("dashboard.viewAllMeals")}
          </Link>
        </div>
      </div>

      <div style={{ marginTop: "var(--space-4)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <button type="button" aria-label={t("dashboard.previousWeek")} onClick={() => shiftWeek(-1)} style={navBtnStyle}>
            <ChevronLeftIcon />
          </button>

          <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{formatWeekRange(weekStart, weekEnd)}</div>
            {!onCurrentWeek && (
              <button
                type="button"
                onClick={goToToday}
                style={{
                  marginTop: 4,
                  padding: 0,
                  border: "none",
                  background: "none",
                  color: "var(--color-accent-700)",
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t("dashboard.backToToday")}
              </button>
            )}
          </div>

          <button
            type="button"
            aria-label={t("dashboard.nextWeek")}
            disabled={!canGoNext}
            onClick={() => shiftWeek(1)}
            style={{
              ...navBtnStyle,
              opacity: canGoNext ? 1 : 0.35,
              cursor: canGoNext ? "pointer" : "not-allowed",
            }}
          >
            <ChevronRightIcon />
          </button>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            padding: "8px 10px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-divider)",
            background: "var(--color-surface)",
            fontSize: 12.5,
            color: muted(70),
          }}
        >
          <CalendarIcon />
          <span style={{ flex: "none" }}>{t("dashboard.jumpToDate")}</span>
          <input
            type="date"
            value={selectedKey}
            max={localDateKey(today)}
            onChange={(e) => jumpToDate(e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              border: "none",
              background: "transparent",
              color: "var(--color-text)",
              font: "inherit",
              fontSize: 13,
              fontWeight: 600,
            }}
          />
        </label>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
          {weekDays.map((d) => (
            <button
              key={d.dateKey}
              type="button"
              aria-label={`${d.dow} ${d.day}${d.active ? ", selected" : ""}${d.isFuture ? ", future" : ""}`}
              aria-pressed={d.active}
              disabled={d.isFuture}
              onClick={() => setSelectedDate(d.date)}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "8px 0",
                borderRadius: "var(--radius-md)",
                background: d.active ? "var(--color-accent)" : "transparent",
                color: d.active ? "var(--color-bg)" : d.isFuture ? muted(40) : "var(--color-text)",
                border: "none",
                cursor: d.isFuture ? "not-allowed" : "pointer",
                font: "inherit",
                opacity: d.isFuture ? 0.45 : 1,
              }}
            >
              <div style={{ fontSize: 11, opacity: d.active ? 1 : 0.7 }}>{d.dow}</div>
              <div style={{ fontSize: 15, fontWeight: d.active ? 700 : 400, fontFamily: "var(--font-heading)" }}>
                {d.day}
              </div>
            </button>
          ))}
        </div>
      </div>

      <h3 style={{ fontSize: 15, margin: "var(--space-5) 0 var(--space-3)" }}>
        {isToday ? t("dashboard.myDailyAdvice") : t("dashboard.dailyAdvice")}
      </h3>
      <div className="na-scroll-x">
        {advice.map((c) => (
          <div key={c.title} className="card elev-sm" style={{ minWidth: 180, maxWidth: 180, flex: "none" }}>
            <div className="card-kicker">{c.kicker}</div>
            <div style={serif(15, { lineHeight: 1.25, marginBottom: 4 })}>{c.title}</div>
            <p className="card-body" style={{ opacity: 0.65, fontSize: 12.5, margin: 0 }}>
              {c.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
