import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, fonts, ringColors, serif, textMuted } from "@/theme/tokens";

export interface FlowerMacro {
  label: string;
  value: string;
  pct: number;
}

/** The handoff's hand-tuned hexagon: six satellites at exact 60 degree intervals. */
const SIX_UP = [
  { left: 150, top: 42 },
  { left: 243.5, top: 96 },
  { left: 243.5, top: 204 },
  { left: 150, top: 258 },
  { left: 56.5, top: 204 },
  { left: 56.5, top: 96 },
];

function ringPositions(count: number) {
  if (count === 6) return SIX_UP;
  return Array.from({ length: count }, (_, i) => {
    const theta = (i * 2 * Math.PI) / count;
    return { left: 150 + 93.5 * Math.sin(theta), top: 158 - 98 * Math.cos(theta) };
  });
}

const RING_R = 32;
const RING_D = RING_R * 2 + 12;
const RING_CXY = RING_R + 6;
const RING_CIRC = Math.round(2 * Math.PI * RING_R);
const ENERGY_CIRC = 276;
const FALLBACK = ["#6b6b6b", "#3fa15c", "#d98a3d", "#2f9d95", "#d6437e", "#4a90d9"];

export function NutritionFlower({
  calories,
  goalCalories,
  macros,
}: {
  calories: number;
  goalCalories: number;
  macros: FlowerMacro[];
}) {
  const energyPct = Math.min(100, Math.round((calories / Math.max(goalCalories, 1)) * 100));
  const positions = ringPositions(macros.length);

  return (
    <View style={{ width: 300, height: 320, alignSelf: "center", marginBottom: 16 }}>
      {macros.map((mac, i) => {
        const pos = positions[i];
        const pct = Math.min(100, Math.max(0, Math.round(mac.pct)));
        const color = ringColors[mac.label] ?? FALLBACK[i % FALLBACK.length];
        return (
          <View key={mac.label}>
            <View
              style={{
                position: "absolute",
                left: pos.left - RING_D / 2,
                top: pos.top - RING_D / 2,
                width: RING_D,
                height: RING_D,
              }}
            >
              <Svg width={RING_D} height={RING_D} viewBox={`0 0 ${RING_D} ${RING_D}`}>
                <Circle cx={RING_CXY} cy={RING_CXY} r={RING_R} fill="none" stroke={colors.divider} strokeWidth={6} />
                <Circle
                  cx={RING_CXY}
                  cy={RING_CXY}
                  r={RING_R}
                  fill="none"
                  stroke={color}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={Math.round(RING_CIRC * (1 - pct / 100))}
                  transform={`rotate(-90 ${RING_CXY} ${RING_CXY})`}
                />
              </Svg>
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={serif(15, { lineHeight: 17 })}>{mac.value}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 9.5, color: textMuted[55] }}>{pct}%</Text>
              </View>
            </View>
            <View style={{ position: "absolute", left: pos.left - 50, top: pos.top + 42, width: 100 }}>
              <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.text, textAlign: "center" }}>
                {mac.label}
              </Text>
            </View>
          </View>
        );
      })}

      <View style={{ position: "absolute", left: 100, top: 112, width: 100, height: 100 }}>
        <Svg width={100} height={100} viewBox="0 0 100 100">
          <Circle cx={50} cy={50} r={44} fill="none" stroke={colors.divider} strokeWidth={8} />
          <Circle
            cx={50}
            cy={50}
            r={44}
            fill="none"
            stroke={colors.accent}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={ENERGY_CIRC}
            strokeDashoffset={Math.round(ENERGY_CIRC * (1 - energyPct / 100))}
            transform="rotate(-90 50 50)"
          />
        </Svg>
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: fonts.body, fontSize: 12, color: textMuted[60] }}>Energy</Text>
          <Text style={serif(26, { lineHeight: 29 })}>{Math.round(calories)}</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 10.5, color: textMuted[55] }}>
            kcal · {energyPct}%
          </Text>
        </View>
      </View>
    </View>
  );
}
