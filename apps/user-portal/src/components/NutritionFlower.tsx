"use client";

import { useTranslation } from "react-i18next";

export interface FlowerMacro {
  /** Stable, language-independent id used only for color lookup — never displayed. */
  colorId: "carbs" | "protein" | "fat" | "satFat" | "fiber" | "sodium" | "sugar";
  label: string;
  value: string;
  pct: number;
}

const RING_COLOR: Record<FlowerMacro["colorId"], string> = {
  carbs: "#4a90d9",
  protein: "#6b6b6b",
  fat: "#d6437e",
  satFat: "#3fa15c",
  fiber: "#2f9d95",
  sodium: "#d98a3d",
  sugar: "#d98a3d",
};

const FALLBACK_COLORS = ["#6b6b6b", "#3fa15c", "#d98a3d", "#2f9d95", "#d6437e", "#4a90d9"];

/** The handoff's hand-tuned hexagon: six satellites at exact 60 degree intervals. */
const SIX_UP: Array<{ left: number; top: number }> = [
  { left: 150, top: 42 },
  { left: 243.5, top: 96 },
  { left: 243.5, top: 204 },
  { left: 150, top: 258 },
  { left: 56.5, top: 204 },
  { left: 56.5, top: 96 },
];

/** Fewer nutrients still spread evenly around the same envelope. */
function ringPositions(count: number) {
  if (count === 6) return SIX_UP;
  const cx = 150;
  const cy = 158;
  const rx = 93.5;
  const ry = 98;
  return Array.from({ length: count }, (_, i) => {
    const theta = (i * 2 * Math.PI) / count;
    return { left: cx + rx * Math.sin(theta), top: cy - ry * Math.cos(theta) };
  });
}

const RING_R = 32;
const RING_D = RING_R * 2 + 12;
const RING_CXY = RING_R + 6;
const RING_CIRC = Math.round(2 * Math.PI * RING_R);
const ENERGY_CIRC = 276;

const centered: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};

export function NutritionFlower({
  calories,
  goalCalories,
  macros,
}: {
  calories: number;
  goalCalories: number;
  macros: FlowerMacro[];
}) {
  const { t } = useTranslation();
  const energyPct = Math.min(100, Math.round((calories / Math.max(goalCalories, 1)) * 100));
  const positions = ringPositions(macros.length);

  return (
    <div style={{ position: "relative", width: 300, height: 320, margin: "0 auto 16px" }}>
      {macros.map((mac, i) => {
        const pos = positions[i];
        const pct = Math.min(100, Math.max(0, Math.round(mac.pct)));
        const color = RING_COLOR[mac.colorId] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
        return (
          <div key={mac.colorId}>
            <div style={{ position: "absolute", left: pos.left, top: pos.top, transform: "translate(-50%,-50%)" }}>
              <svg width={RING_D} height={RING_D} viewBox={`0 0 ${RING_D} ${RING_D}`} style={{ display: "block" }}>
                <circle cx={RING_CXY} cy={RING_CXY} r={RING_R} fill="none" stroke="var(--color-divider)" strokeWidth="6" />
                <circle
                  cx={RING_CXY}
                  cy={RING_CXY}
                  r={RING_R}
                  fill="none"
                  stroke={color}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={Math.round(RING_CIRC * (1 - pct / 100))}
                  style={{ transformOrigin: "center", transform: "rotate(-90deg)" }}
                />
              </svg>
              <div style={centered}>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 15, lineHeight: 1.1 }}>
                  {mac.value}
                </span>
                <span style={{ fontSize: 9.5, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
                  {pct}%
                </span>
              </div>
            </div>
            <div
              style={{
                position: "absolute",
                left: pos.left,
                top: pos.top + 50,
                transform: "translate(-50%,-50%)",
                fontSize: 11,
                whiteSpace: "nowrap",
              }}
            >
              {mac.label}
            </div>
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: 150,
          top: 162,
          transform: "translate(-50%,-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: 130,
        }}
      >
        <div style={{ position: "relative" }}>
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-divider)" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={ENERGY_CIRC}
              strokeDashoffset={Math.round(ENERGY_CIRC * (1 - energyPct / 100))}
              style={{ transformOrigin: "center", transform: "rotate(-90deg)" }}
            />
          </svg>
          <div style={centered}>
            <span style={{ fontSize: 12, color: "color-mix(in srgb, var(--color-text) 60%, transparent)" }}>
              {t("nutrients.calories")}
            </span>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 26, lineHeight: 1.1 }}>
              {Math.round(calories)}
            </span>
            <span style={{ fontSize: 10.5, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
              kcal · {energyPct}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
