"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { applyRestrictions, DIET_TYPES, RESTRICTIONS, RestrictionId } from "@/lib/profile";

const STEPS = 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [calories, setCalories] = useState(2200);
  const [protein, setProtein] = useState(130);
  const [restrictions, setRestrictions] = useState<RestrictionId[]>([]);
  const [dietType, setDietType] = useState<string>("balanced");
  const [busy, setBusy] = useState(false);

  function toggle(id: RestrictionId) {
    setRestrictions((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function finish() {
    setBusy(true);
    try {
      await api("/api/profile", {
        method: "PUT",
        body: JSON.stringify(
          applyRestrictions(
            { dietGoals: { dailyCalories: calories, proteinGrams: protein }, dietType },
            restrictions
          )
        ),
      });
      router.replace("/app/chat");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "var(--space-8) var(--space-4)",
      }}
    >
      <div style={{ width: "min(480px,92vw)" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "var(--space-1)",
          }}
        >
          <h2 style={{ fontSize: 22, margin: 0 }}>Set up your profile</h2>
          <span style={{ fontSize: 12, opacity: 0.55 }}>
            Step {step + 1} of {STEPS}
          </span>
        </div>
        <div
          style={{
            height: 2,
            background: "var(--color-divider)",
            borderRadius: 2,
            marginBottom: "var(--space-6)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              background: "var(--color-accent)",
              width: `${Math.round(((step + 1) / STEPS) * 100)}%`,
            }}
          />
        </div>

        {step === 0 && (
          <>
            <h3 style={{ fontSize: 16, marginBottom: "var(--space-3)" }}>Daily diet goals</h3>
            <div className="field">
              <label htmlFor="ob-cal">Calorie goal (kcal/day)</label>
              <input
                className="input"
                id="ob-cal"
                type="number"
                value={calories}
                onChange={(e) => setCalories(Number(e.target.value) || 0)}
              />
            </div>
            <div className="field">
              <label htmlFor="ob-pro">Protein goal (g/day)</label>
              <input
                className="input"
                id="ob-pro"
                type="number"
                value={protein}
                onChange={(e) => setProtein(Number(e.target.value) || 0)}
              />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h3 style={{ fontSize: 16, marginBottom: "var(--space-1)" }}>Health restrictions &amp; allergies</h3>
            <p className="note" style={{ fontSize: 12.5, opacity: 0.6, margin: "0 0 var(--space-3)" }}>
              Tap any that apply — the agent filters recommendations against these.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
              {RESTRICTIONS.map((r) => {
                const on = restrictions.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`pill${on ? " is-on" : ""}`}
                    onClick={() => toggle(r.id)}
                  >
                    {r.label}
                    {on ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3 style={{ fontSize: 16, marginBottom: "var(--space-3)" }}>Diet type</h3>
            <div className="stack" style={{ display: "grid", gap: "var(--space-1)" }}>
              {DIET_TYPES.map((d) => (
                <label className="radio" key={d.id}>
                  <input
                    type="radio"
                    name="ob-diet"
                    checked={dietType === d.id}
                    onChange={() => setDietType(d.id)}
                  />
                  <span className="dot" />
                  {d.label}
                </label>
              ))}
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-6)" }}>
          {step === 0 ? (
            <span />
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
          {step < STEPS - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>
              Continue
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={finish} disabled={busy}>
              {busy ? "Saving…" : "Finish setup"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
