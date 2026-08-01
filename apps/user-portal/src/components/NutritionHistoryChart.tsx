"use client";

import { muted, serif } from "@/lib/ui";

interface NutritionHistoryMeal {
  mealId: number;
  datetime: string;
  mealType: string;
  items: string[];
  nutrition: { calories: number; protein: number; fat: number; carbs: number; sugar: number };
}

export interface NutritionHistoryData {
  period: "today" | "last_7_days" | "30_day_average" | "recent";
  mealCount: number;
  totals: { calories: number; protein: number; fat: number; carbs: number; sugar: number };
  meals?: NutritionHistoryMeal[];
  dailyBreakdown?: Array<{
    date: string;
    label: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  }>;
  avgDailyCalories?: number;
}

const MACRO_COLORS = {
  calories: "var(--color-accent)",
  protein: "#6b6b6b",
  carbs: "#4a90d9",
  fat: "#d6437e",
};

function periodTitle(period: NutritionHistoryData["period"]) {
  if (period === "today") return "Today's nutrition";
  if (period === "last_7_days") return "Last 7 days";
  if (period === "30_day_average") return "30-day average";
  return "Recent meals";
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "72px 1fr 44px", gap: 10, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: muted() }}>{label}</span>
      <div style={{ height: 10, borderRadius: 999, background: "var(--color-neutral-200)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export function NutritionHistoryChart({
  data,
  goalCalories = 2200,
}: {
  data: NutritionHistoryData;
  goalCalories?: number;
}) {
  const title = periodTitle(data.period);

  if (data.mealCount === 0) {
    return (
      <div className="card elev-sm" style={{ maxWidth: 420, padding: "var(--space-4)" }}>
        <div style={serif(18, { marginBottom: 6 })}>{title}</div>
        <p style={{ fontSize: 14, color: muted(), margin: 0 }}>No meals logged yet. Upload a meal photo to start.</p>
      </div>
    );
  }

  const maxMealCalories = Math.max(...(data.meals?.map((m) => m.nutrition.calories) ?? [0]), 1);
  const maxDailyCalories = Math.max(...(data.dailyBreakdown?.map((d) => d.calories) ?? [0]), goalCalories, 1);
  const macroMax = Math.max(data.totals.protein, data.totals.carbs, data.totals.fat, 1);

  return (
    <div className="card elev-sm" style={{ maxWidth: 420, width: "100%", padding: "var(--space-4)" }}>
      <div style={{ marginBottom: "var(--space-3)" }}>
        <div style={serif(18, { marginBottom: 4 })}>{title}</div>
        <div style={{ fontSize: 13, color: muted() }}>
          {data.mealCount} meal{data.mealCount === 1 ? "" : "s"} · {data.totals.calories} kcal total
        </div>
      </div>

      <div style={{ display: "grid", gap: 10, marginBottom: "var(--space-4)" }}>
        <Bar label="Calories" value={data.totals.calories} max={goalCalories} color={MACRO_COLORS.calories} />
        <Bar label="Protein" value={Math.round(data.totals.protein)} max={macroMax} color={MACRO_COLORS.protein} />
        <Bar label="Carbs" value={Math.round(data.totals.carbs)} max={macroMax} color={MACRO_COLORS.carbs} />
        <Bar label="Fat" value={Math.round(data.totals.fat)} max={macroMax} color={MACRO_COLORS.fat} />
      </div>

      {data.dailyBreakdown && data.dailyBreakdown.length > 0 && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: muted(60), marginBottom: 10 }}>
            Daily calories
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
            {data.dailyBreakdown.map((day) => {
              const pct = Math.max(8, Math.round((day.calories / maxDailyCalories) * 100));
              return (
                <div key={day.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 10, color: muted() }}>{day.calories}</div>
                  <div
                    style={{
                      width: "100%",
                      height: `${pct}%`,
                      minHeight: 8,
                      borderRadius: "8px 8px 4px 4px",
                      background: "var(--color-accent)",
                    }}
                  />
                  <div style={{ fontSize: 10, textAlign: "center", color: muted(), lineHeight: 1.2 }}>{day.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.meals && data.meals.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: muted(60), marginBottom: 10 }}>
            Meals today
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {data.meals.map((meal) => (
              <div key={meal.mealId}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{meal.mealType}</span>
                  <span style={{ fontSize: 12, color: muted() }}>
                    {new Date(meal.datetime).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <Bar label="kcal" value={meal.nutrition.calories} max={maxMealCalories} color={MACRO_COLORS.calories} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {meal.items.map((item) => (
                    <span key={item} className="tag tag-outline" style={{ fontSize: 11 }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.avgDailyCalories != null && (
        <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--color-divider)", fontSize: 14 }}>
          Average: <strong>{data.avgDailyCalories} kcal/day</strong>
        </div>
      )}
    </div>
  );
}
