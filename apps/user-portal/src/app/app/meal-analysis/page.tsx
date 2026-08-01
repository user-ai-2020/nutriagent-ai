"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { apiBaseUrl, api } from "@/lib/api";
import { CheckIcon, CloseIcon, PencilIcon } from "@/components/icons";
import { useMeal, useEditMealItem } from "@/hooks/queries";

interface Item {
  itemId: number;
  foodType: string;
  estimatedQuantity: string;
  visionConfidence?: number | null;
  nutritionValues?: { calories: number; protein: number; fat: number; carbs: number } | null;
}

interface Meal {
  mealId: number;
  mealDatetime: string;
  mealType: string;
  imageUrl?: string | null;
  items: Item[];
}

export default function MealAnalysisPage() {
  const { t } = useTranslation();
  const [selectedMealId, setSelectedMealId] = useState<number | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("selectedMealId");
    if (id) {
      setSelectedMealId(Number(id));
    } else {
      api<Meal[]>("/api/meals").then(meals => {
        if (meals[0]) {
          localStorage.setItem("selectedMealId", String(meals[0].mealId));
          setSelectedMealId(meals[0].mealId);
        } else {
          setSelectedMealId(0);
        }
      }).catch(() => setSelectedMealId(0));
    }
  }, []);

  const { data: meal, isFetching } = useMeal(selectedMealId && selectedMealId > 0 ? selectedMealId : null);
  const editMutation = useEditMealItem(selectedMealId || 0);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [corrected, setCorrected] = useState<number[]>([]);
  const [titleExpanded, setTitleExpanded] = useState(false);

  function saveEdit(item: Item) {
    if (!meal || !selectedMealId) return;
    editMutation.mutate(
      { itemId: item.itemId, foodType: draftName.trim() || item.foodType },
      {
        onSuccess: () => {
          setCorrected((prev) => [...new Set([...prev, item.itemId])]);
          setEditingId(null);
        }
      }
    );
  }

  if (selectedMealId === null || isFetching) return <div style={{ padding: "var(--space-8)", opacity: 0.6 }}>{t("common.loading")}</div>;

  if (!meal) {
    return (
      <div className="na-screen">
        <h2 style={{ fontSize: 22, margin: "0 0 var(--space-2)" }}>{t("mealAnalysis.title")}</h2>
        <p className="note">{t("mealAnalysis.empty")}</p>
      </div>
    );
  }

  const date = new Date(meal.mealDatetime);
  const src = meal.imageUrl
    ? meal.imageUrl.startsWith("http")
      ? meal.imageUrl
      : `${apiBaseUrl()}${meal.imageUrl}`
    : null;
  const name = meal.items.map((i: any) => i.foodType).join(", ") || t("mealAnalysis.loggedMeal");
  const titleLong = name.length > 56 || meal.items.length > 2;

  return (
    <div className="na-screen">
      <Link href="/app/summary" style={{ fontSize: 13, display: "inline-block", marginBottom: "var(--space-3)" }}>
        {t("mealAnalysis.backToSummary")}
      </Link>

      <div className="na-analysis-grid">
        <div className="na-analysis-photo">
          <div className="na-photo-slot">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={t("mealAnalysis.photoAlt")} />
            ) : (
              t("mealAnalysis.photoPlaceholder")
            )}
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div className="na-meal-title-wrap">
            <h2
              className={`na-meal-title${titleLong && !titleExpanded ? " is-clamped" : ""}`}
              title={name}
            >
              {name}
            </h2>
            {titleLong && (
              <button
                type="button"
                className="btn btn-ghost na-meal-title-toggle"
                onClick={() => setTitleExpanded((v) => !v)}
              >
                {titleExpanded ? t("mealAnalysis.showLessTitle") : t("mealAnalysis.showFullTitle")}
              </button>
            )}
          </div>
          <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 var(--space-4)", textTransform: "capitalize" }}>
            {meal.mealType} · {date.toLocaleDateString()} ·{" "}
            {date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </p>

          <div className="card-kicker" style={{ marginBottom: 6 }}>
            {t("mealAnalysis.visionAgentItems")}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {meal.items.map((item: any) => {
              const matchPct = Math.round((item.visionConfidence ?? 0) * 100);
              return (
                <div
                  key={item.itemId}
                  style={{
                    padding: "var(--space-2) 0",
                    borderBottom: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
                  }}
                >
                  {editingId === item.itemId ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        className="input"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-icon"
                        aria-label={t("common.save")}
                        onClick={() => saveEdit(item)}
                      >
                        <CheckIcon />
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-icon"
                        aria-label={t("common.cancel")}
                        onClick={() => setEditingId(null)}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  ) : (
                    <div className="na-meal-item-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          {item.foodType}
                          {corrected.includes(item.itemId) && (
                            <span className="tag tag-accent-2" style={{ marginLeft: 6, fontSize: 9.5 }}>
                              {t("mealAnalysis.corrected")}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.6 }}>
                          {item.estimatedQuantity}
                          {item.nutritionValues
                            ? ` · ${Math.round(item.nutritionValues.calories)} kcal`
                            : ""}
                        </div>
                      </div>
                      <div className="na-match-score">
                        <div className="na-match-score-bar">
                          <div
                            className="na-match-score-bar-fill"
                            style={{ width: `${matchPct}%` }}
                          />
                        </div>
                        <div className="na-match-score-label">
                          {t("mealAnalysis.matchScore", { pct: matchPct })}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        aria-label={t("common.edit")}
                        onClick={() => {
                          setEditingId(item.itemId);
                          setDraftName(item.foodType);
                        }}
                      >
                        <PencilIcon />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
