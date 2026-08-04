"use client";

import { useTranslation } from "react-i18next";
import { localizeFoodDisplayName } from "@nutriagent/shared/foodDisplayName";
import { FlowerMacro, NutritionFlower } from "@/components/NutritionFlower";
import { muted, serif } from "@/lib/ui";

interface Nutrition {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  sugar: number;
}

interface Panel {
  modelId: string;
  modelLabel: string;
  items: Array<{ foodType: string; estimatedQuantity: string; visionConfidence: number; nutrition: Nutrition }>;
  totalNutrition: Nutrition;
  error?: string;
}

interface RerankerScore {
  foodType: string;
  estimatedQuantity: string;
  score: number;
  modelAgreement: number;
  avgConfidence: number;
}

type FusionMethod = "full" | "cluster_no_rerank" | "single_model_only" | "single_model_fallback" | "empty_pool_fallback";

/** Spread above this ratio of mean triggers a disagreement warning (45%). */
const FUSION_SPREAD_WARNING_RATIO = 0.45;

const GOAL_FAT = 70;
const GOAL_CARBS = 250;
const GOAL_SUGAR = 50;

function macrosOf(n: Nutrition, goalProtein: number, t: (key: string) => string): FlowerMacro[] {
  const pct = (value: number, goal: number) => Math.min(100, Math.round((value / goal) * 100));
  return [
    { colorId: "protein", label: t("nutrients.protein"), value: `${Math.round(n.protein)}g`, pct: pct(n.protein, goalProtein) },
    { colorId: "carbs", label: t("nutrients.carbs"), value: `${Math.round(n.carbs)}g`, pct: pct(n.carbs, GOAL_CARBS) },
    { colorId: "fat", label: t("nutrients.fat"), value: `${Math.round(n.fat)}g`, pct: pct(n.fat, GOAL_FAT) },
    { colorId: "sugar", label: t("nutrients.sugar"), value: `${Math.round(n.sugar)}g`, pct: pct(n.sugar, GOAL_SUGAR) },
  ];
}

function visionPanels(panels: Panel[]): Panel[] {
  return panels.filter((p) => p.modelId !== "reranker" && !p.error && p.items.length > 0);
}

function nutritionTotalsMatch(a: Nutrition, b: Nutrition): boolean {
  return (
    Math.round(a.calories) === Math.round(b.calories) &&
    Math.round(a.protein) === Math.round(b.protein) &&
    Math.round(a.carbs) === Math.round(b.carbs) &&
    Math.round(a.fat) === Math.round(b.fat)
  );
}

/**
 * In single_model_only, vision + reranker panels often show identical numbers.
 * Keep one panel only when totals match; leave multi-panel layouts untouched otherwise.
 */
function panelsForDisplay(panels: Panel[], fusionMethod: FusionMethod): Panel[] {
  if (fusionMethod !== "single_model_only") return panels;
  const vision = panels.filter((p) => p.modelId !== "reranker");
  const reranker = panels.find((p) => p.modelId === "reranker");
  if (vision.length === 1 && reranker && nutritionTotalsMatch(vision[0]!.totalNutrition, reranker.totalNutrition)) {
    return [reranker];
  }
  return panels;
}

function computeCrossModelStats(panels: Panel[]) {
  const vision = visionPanels(panels);
  if (vision.length < 2) return null;

  const cals = vision.map((p) => p.totalNutrition.calories);
  const min = Math.min(...cals);
  const max = Math.max(...cals);
  const meanCalories = Math.round(cals.reduce((a, b) => a + b, 0) / cals.length);
  const spreadRatio = meanCalories > 0 ? (max - min) / meanCalories : 0;

  const avg = (key: keyof Nutrition) =>
    Math.round(vision.reduce((s, p) => s + p.totalNutrition[key], 0) / vision.length);

  return {
    count: vision.length,
    mean: {
      calories: meanCalories,
      protein: avg("protein"),
      carbs: avg("carbs"),
      fat: avg("fat"),
      sugar: avg("sugar"),
    },
    minCalories: min,
    maxCalories: max,
    showSpreadWarning: spreadRatio > FUSION_SPREAD_WARNING_RATIO,
  };
}

function fusionSubheader(
  t: (key: string, opts?: Record<string, unknown>) => string,
  fusionMethod?: FusionMethod,
  fallbackModelLabel?: string,
  visionPanelCount = 1
): string {
  switch (fusionMethod) {
    case "single_model_only":
      return t("chat.fusionSingleModelOnly");
    case "single_model_fallback":
      if (visionPanelCount <= 1) {
        return t("chat.fusionSingleModelOnly");
      }
      return t("chat.fusionSingleModel", { model: fallbackModelLabel ?? t("chat.fusionOneModel") });
    case "cluster_no_rerank":
      return t("chat.fusionClusterNoRerank");
    case "empty_pool_fallback":
      return t("chat.fusionEmptyPool");
    default:
      return t("chat.fusionFull");
  }
}

function rerankerPanelDisplayLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  fusionMethod: FusionMethod | undefined,
  fallbackModelLabel: string | undefined,
  serverLabel: string,
  visionPanelCount: number
): string {
  if (fusionMethod === "single_model_only") {
    return t("chat.rerankerPanelSingleModel");
  }
  if (fusionMethod === "single_model_fallback") {
    if (visionPanelCount <= 1) {
      return t("chat.rerankerPanelSingleModel");
    }
    return t("chat.rerankerPanelMultiModelFallback", {
      model: fallbackModelLabel ?? t("chat.fusionOneModel"),
    });
  }
  return serverLabel;
}

function PanelCard({
  panel,
  goalCalories,
  goalProtein,
  highlight,
  degraded,
}: {
  panel: Panel;
  goalCalories: number;
  goalProtein: number;
  highlight?: boolean;
  degraded?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const avgConf = panel.items.length
    ? Math.round(
        (panel.items.reduce((s, i) => s + (i.visionConfidence ?? 0), 0) / panel.items.length) * 100
      )
    : 0;

  return (
    <div
      className="card elev-sm"
      style={{
        padding: "var(--space-3)",
        border: highlight ? "2px solid var(--color-accent)" : undefined,
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <span
          title={degraded ? t("chat.rerankerCouldNotMerge") : undefined}
          style={{
            fontSize: 11,
            padding: "5px 12px",
            borderRadius: 999,
            background: degraded
              ? "color-mix(in srgb, var(--color-accent-2-700, #b42318) 12%, var(--color-surface))"
              : highlight
                ? "var(--color-accent)"
                : "var(--color-accent-100)",
            color: degraded
              ? "var(--color-accent-2-700, #b42318)"
              : highlight
                ? "var(--color-bg)"
                : "var(--color-accent-700)",
            fontWeight: 700,
          }}
        >
          {panel.modelLabel}
        </span>
      </div>

      {panel.error ? (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-accent-2-700, #b42318)",
            margin: "0 0 8px",
            lineHeight: 1.45,
          }}
        >
          {panel.error}
        </p>
      ) : panel.items.length === 0 ? (
        <p style={{ fontSize: 13, color: muted(), margin: "0 0 8px" }}>{t("chat.noItemsDetected")}</p>
      ) : (
        <>
          <div style={{ fontSize: 11.5, color: muted(), marginBottom: 8 }}>
            {t(panel.items.length === 1 ? "chat.itemsAvgConfidenceOne" : "chat.itemsAvgConfidenceOther", {
              count: panel.items.length,
              avgConf,
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {panel.items.map((item, idx) => (
              <span
                key={`${panel.modelId}-${idx}-${item.foodType}-${item.estimatedQuantity}`}
                className="tag tag-outline"
                style={{ fontSize: 11 }}
              >
                {localizeFoodDisplayName(item.foodType, lang)}
              </span>
            ))}
          </div>
          <NutritionFlower
            calories={panel.totalNutrition.calories}
            goalCalories={goalCalories}
            macros={macrosOf(panel.totalNutrition, goalProtein, t)}
          />
        </>
      )}
    </div>
  );
}

export function MultiModelMealCards({
  panels,
  rerankerScores,
  goalCalories,
  goalProtein,
  fusionMethod = "full",
  fallbackModelLabel,
}: {
  panels: Panel[];
  rerankerScores: RerankerScore[];
  goalCalories: number;
  goalProtein: number;
  fusionMethod?: FusionMethod;
  fallbackModelLabel?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const displayPanels = panelsForDisplay(panels, fusionMethod);
  const visionPanelCount = panels.filter((p) => p.modelId !== "reranker").length;
  const showRerankerScores =
    fusionMethod === "full" ||
    fusionMethod === "single_model_only" ||
    fusionMethod === "cluster_no_rerank";
  const isDegraded =
    fusionMethod === "empty_pool_fallback" ||
    (fusionMethod === "single_model_fallback" && visionPanelCount > 1);
  const highlightConsensus =
    fusionMethod === "full" || fusionMethod === "single_model_only" || fusionMethod === "cluster_no_rerank";
  const crossModelStats =
    fusionMethod === "single_model_fallback" ? computeCrossModelStats(panels) : null;

  return (
    <div style={{ maxWidth: 720, width: "100%", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div>
        <div style={serif(16, { marginBottom: 4 })}>{t("chat.visionModelComparison")}</div>
        <p style={{ fontSize: 13, color: muted(), margin: 0 }}>
          {fusionSubheader(t, fusionMethod, fallbackModelLabel, visionPanelCount)}
        </p>
      </div>

      {crossModelStats ? (
        <div
          className="card elev-sm"
          style={{
            padding: "var(--space-3)",
            border: crossModelStats.showSpreadWarning
              ? "1px solid color-mix(in srgb, var(--color-accent-2-700, #b42318) 35%, transparent)"
              : undefined,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: muted(60), marginBottom: 6 }}>
            {t("chat.fusionModelMeanTitle")}
          </div>
          <p style={{ fontSize: 13.5, margin: "0 0 10px", lineHeight: 1.45 }}>
            {t("chat.fusionModelMeanValues", {
              kcal: crossModelStats.mean.calories,
              protein: crossModelStats.mean.protein,
              carbs: crossModelStats.mean.carbs,
              fat: crossModelStats.mean.fat,
              count: crossModelStats.count,
            })}
          </p>
          <NutritionFlower
            calories={crossModelStats.mean.calories}
            goalCalories={goalCalories}
            macros={macrosOf(crossModelStats.mean, goalProtein, t)}
          />
          {crossModelStats.showSpreadWarning ? (
            <p
              style={{
                fontSize: 13,
                color: "var(--color-accent-2-700, #b42318)",
                margin: "10px 0 0",
                lineHeight: 1.45,
              }}
            >
              {t("chat.fusionNutritionSpreadWarning", {
                min: crossModelStats.minCalories,
                max: crossModelStats.maxCalories,
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "var(--space-3)",
        }}
      >
        {displayPanels.map((panel) => (
          <PanelCard
            key={panel.modelId}
            panel={{
              ...panel,
              modelLabel:
                panel.modelId === "reranker"
                  ? rerankerPanelDisplayLabel(
                      t,
                      fusionMethod,
                      fallbackModelLabel,
                      panel.modelLabel,
                      visionPanelCount
                    )
                  : panel.modelLabel,
            }}
            goalCalories={goalCalories}
            goalProtein={goalProtein}
            highlight={panel.modelId === "reranker" && highlightConsensus}
            degraded={panel.modelId === "reranker" && isDegraded}
          />
        ))}
      </div>

      {showRerankerScores && rerankerScores.length > 0 && (
        <div className="card elev-sm" style={{ padding: "var(--space-3)" }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: muted(60),
              marginBottom: 10,
            }}
          >
            {fusionMethod === "cluster_no_rerank" ? t("chat.clusterAgreement") : t("chat.cohereRerankerScores")}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {rerankerScores.map((s, idx) => (
              <div
                key={`${s.foodType}-${s.estimatedQuantity}-${idx}`}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    fusionMethod === "full" || fusionMethod === "single_model_only"
                      ? "1fr auto auto auto"
                      : "1fr auto auto",
                  gap: 12,
                  fontSize: 12.5,
                  alignItems: "center",
                }}
              >
                <span>{localizeFoodDisplayName(s.foodType, lang)}</span>
                <span className="tag tag-outline">{t("chat.modelsAgreement", { count: s.modelAgreement, total: visionPanelCount })}</span>
                <span style={{ color: muted() }}>{t("chat.confShort", { pct: Math.round(s.avgConfidence * 100) })}</span>
                {fusionMethod === "full" || fusionMethod === "single_model_only" ? (
                  <strong>{s.score.toFixed(2)}</strong>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
