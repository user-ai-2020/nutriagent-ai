"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLogSteps } from "@/hooks/queries";
import { muted, serif } from "@/lib/ui";

const QUICK_ADD = [500, 1000, 2000] as const;

/** Matches the API's sanity bound so the UI rejects before the round-trip. */
const MAX_STEPS = 200_000;

export function StepsCard({
  steps,
  goal,
  dateKey,
  editable,
}: {
  steps: number;
  goal: number;
  /** YYYY-MM-DD of the day being shown; the API upserts on (user, date). */
  dateKey: string;
  /** Future days cannot be logged. */
  editable: boolean;
}) {
  const { t } = useTranslation();
  const logSteps = useLogSteps();
  const [draft, setDraft] = useState(String(steps));

  // The dashboard query owns the value; re-sync whenever it changes underneath
  // us (day switched, mutation settled, another tab wrote). Without this the
  // input keeps showing a stale number after stepping to a different day.
  useEffect(() => {
    setDraft(String(steps));
  }, [steps, dateKey]);

  const safeGoal = goal > 0 ? goal : 8000;
  const percent = Math.min(Math.round((steps / safeGoal) * 100), 100);
  const remaining = Math.max(safeGoal - steps, 0);

  function commit(value: number) {
    const clamped = Math.max(0, Math.min(Math.round(value), MAX_STEPS));
    setDraft(String(clamped));
    if (clamped === steps) return;
    logSteps.mutate({ steps: clamped, date: dateKey });
  }

  return (
    <div className="card elev-md" style={{ marginTop: "var(--space-4)", padding: "var(--space-4)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: muted(50),
          }}
        >
          {t("dashboard.steps")}
        </span>
        <span style={{ fontSize: 12.5, color: muted(60) }}>
          {t("steps.goalLabel", { goal: safeGoal.toLocaleString() })}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
        <span style={serif(30, { color: "var(--color-accent)", lineHeight: 1.1 })}>
          {steps.toLocaleString()}
        </span>
        <span style={{ fontSize: 13, color: muted() }}>
          {remaining > 0
            ? t("steps.remaining", { remaining: remaining.toLocaleString() })
            : t("steps.goalReached")}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("dashboard.steps")}
        style={{
          height: 8,
          borderRadius: 999,
          background: "var(--color-neutral-200)",
          overflow: "hidden",
          marginTop: "var(--space-3)",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            borderRadius: 999,
            background: "var(--color-accent)",
            transition: "width 240ms ease",
          }}
        />
      </div>

      {editable && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            marginTop: "var(--space-4)",
          }}
        >
          {QUICK_ADD.map((amount) => (
            <button
              key={amount}
              type="button"
              className="btn btn-ghost"
              disabled={logSteps.isPending}
              onClick={() => commit(steps + amount)}
              style={{ padding: "6px 12px", fontSize: 13 }}
            >
              +{amount.toLocaleString()}
            </button>
          ))}

          <input
            type="number"
            min={0}
            max={MAX_STEPS}
            inputMode="numeric"
            aria-label={t("steps.setExact")}
            value={draft}
            disabled={logSteps.isPending}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(Number(draft) || 0)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            style={{
              width: 110,
              marginInlineStart: "auto",
              padding: "6px 10px",
              fontSize: 13,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-divider)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
            }}
          />
        </div>
      )}

      {logSteps.isError && (
        <div role="alert" style={{ marginTop: 8, fontSize: 12.5, color: "var(--color-danger, #c0392b)" }}>
          {t("steps.saveFailed")}
        </div>
      )}
    </div>
  );
}
