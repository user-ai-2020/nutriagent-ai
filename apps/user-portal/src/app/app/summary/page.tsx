"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { localizeMealTitle } from "@nutriagent/shared/foodDisplayName";
import { apiBaseUrl, api } from "@/lib/api";
import { Segmented } from "@/components/Segmented";
import { mealTypeLabel } from "@/lib/mealType";
import { useMeals } from "@/hooks/queries";
import { useMemo } from "react";

interface Meal {
  mealId: number;
  mealDatetime: string;
  mealType: string;
  imageUrl?: string | null;
  items: Array<{ foodType: string; nutritionValues?: { calories: number } | null }>;
}

type Range = "day" | "week" | "month";

function dayLabel(iso: string, t: (key: string, opts?: Record<string, unknown>) => string) {
  const date = new Date(iso);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(date)) / 86_400_000);
  if (diff === 0) return t("summary.today");
  if (diff === 1) return t("summary.yesterday");
  if (diff < 7) return t("summary.daysAgo", { count: diff });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function SummaryPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const [range, setRange] = useState<Range>("week");
  const [search, setSearch] = useState("");

  const RANGES = [
    { value: "day" as const, label: t("summary.rangeDay") },
    { value: "week" as const, label: t("summary.rangeWeek") },
    { value: "month" as const, label: t("summary.rangeMonth") },
  ];

  const paramsStr = useMemo(() => {
    const now = new Date();
    const from = new Date(now);
    if (range === "day") from.setHours(0, 0, 0, 0);
    else if (range === "week") from.setDate(from.getDate() - 7);
    else from.setMonth(from.getMonth() - 1);

    const p = new URLSearchParams({ from: from.toISOString(), to: now.toISOString() });
    if (search.trim()) p.set("q", search.trim());
    return p.toString();
  }, [range, search]);

  const { data: mealsData } = useMeals(paramsStr);
  const meals: Meal[] = mealsData || [];

  function open(mealId: number) {
    localStorage.setItem("selectedMealId", String(mealId));
    router.push("/app/meal-analysis");
  }

  return (
    <div className="na-screen">
      <h2 style={{ fontSize: 22, margin: "0 0 var(--space-3)" }}>{t("summary.title")}</h2>

      <div className="na-summary-toolbar">
        <Segmented options={RANGES} value={range} onChange={setRange} />
        <input
          className="input"
          placeholder={t("summary.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="na-meal-list">
        {meals.length === 0 && (
          <p className="note">{t("summary.empty")}</p>
        )}
        {meals.map((meal) => {
          const calories = meal.items.reduce((sum, item) => sum + (item.nutritionValues?.calories ?? 0), 0);
          const name =
            localizeMealTitle(
              meal.items.map((i) => i.foodType),
              lang
            ) || t("summary.loggedMeal");
          const src = meal.imageUrl
            ? meal.imageUrl.startsWith("http")
              ? meal.imageUrl
              : `${apiBaseUrl()}${meal.imageUrl}`
            : null;

          return (
            <button key={meal.mealId} type="button" className="na-row" onClick={() => open(meal.mealId)}>
              <div style={{ width: 52, height: 52, flex: "none" }}>
                <div className="na-photo-slot" style={{ borderRadius: 8, fontSize: 9.5 }}>
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" />
                  ) : (
                    t("summary.mealPhotoAlt")
                  )}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14.5,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {name}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                  <span className="tag tag-neutral">{mealTypeLabel(meal.mealType, t)}</span>
                  <span style={{ fontSize: 11.5, opacity: 0.55 }}>
                    {dayLabel(meal.mealDatetime, t)} · {timeLabel(meal.mealDatetime)}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, flex: "none" }}>
                {Math.round(calories)} {t("common.kcal")}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
