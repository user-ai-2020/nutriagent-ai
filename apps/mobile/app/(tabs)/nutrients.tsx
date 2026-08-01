import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import Svg, { Circle, Line, Polyline, Rect } from "react-native-svg";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Card, Screen, Segmented } from "@/components/ui";
import { colors, fonts, serif, space, textMuted } from "@/theme/tokens";

interface Totals {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  sugar: number;
}

interface NutrientsData {
  totals: Totals;
  todayTotals: Totals;
  goals: { dailyCalories?: number; proteinGrams?: number };
  dailyBreakdown: Array<{ date: string; calories: number; protein: number; fat: number; carbs: number }>;
}

type Scope = "day" | "period";

const SCOPES = [
  { value: "day" as const, label: "Today" },
  { value: "period" as const, label: "This week" },
];

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function last7(daily: NutrientsData["dailyBreakdown"]) {
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const entry = byDate.get(d.toISOString().slice(0, 10));
    return {
      dow: DOW[d.getDay()],
      calories: entry?.calories ?? 0,
      protein: entry?.protein ?? 0,
      fat: entry?.fat ?? 0,
      carbs: entry?.carbs ?? 0,
    };
  });
}

function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <Svg width="100%" height={30} viewBox="0 0 90 30">
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * 28);
        return <Rect key={i} x={i * 13} y={30 - h} width={9} height={h} rx={2} fill={color} />;
      })}
    </Svg>
  );
}

function NutrientCard({
  label,
  value,
  unit,
  children,
}: {
  label: string;
  value: number;
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <Card style={{ flex: 1, minWidth: 150, gap: 6, padding: space[3] }}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={serif(22)}>
        {Math.round(value)} <Text style={styles.cardUnit}>{unit}</Text>
      </Text>
      {children}
    </Card>
  );
}

export default function NutrientsScreen() {
  const { token } = useAuth();
  const [scope, setScope] = useState<Scope>("day");
  const [data, setData] = useState<NutrientsData | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      setLoading(true);
      api<NutrientsData>("/api/dashboard?period=week", token)
        .then(setData)
        .catch(console.error)
        .finally(() => setLoading(false));
    }, [token])
  );

  if (loading || !data) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </Screen>
    );
  }

  const week = last7(data.dailyBreakdown);
  const totals = scope === "day" ? data.todayTotals : data.totals;
  const goalCalories = data.goals.dailyCalories || 2200;

  const proteinKcal = totals.protein * 4;
  const fatKcal = totals.fat * 9;
  const carbKcal = totals.carbs * 4;
  const macroTotal = Math.max(1, proteinKcal + fatKcal + carbKcal);
  const pProtein = Math.round((proteinKcal / macroTotal) * 100);
  const pFat = Math.round((fatKcal / macroTotal) * 100);
  const pCarbs = Math.max(0, 100 - pProtein - pFat);

  const weeklyAvg = Math.round(week.reduce((a, d) => a + d.calories, 0) / 7);
  const weeklyDiff = weeklyAvg - goalCalories;
  const maxWeek = Math.max(...week.map((d) => d.calories), 1);
  const bars = week.map((d, i) => {
    const h = Math.round((d.calories / maxWeek) * 110);
    return { x: 6 + i * 39, y: 130 - h, h };
  });
  const goalY = 130 - Math.min(110, Math.round((goalCalories / maxWeek) * 110));

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={[serif(22), { marginBottom: space[3] }]}>Calories &amp; Nutrients</Text>
      <Segmented options={SCOPES} value={scope} onChange={setScope} style={{ marginBottom: space[5] }} />

      <View style={styles.grid}>
        <NutrientCard label="Calories" value={totals.calories} unit="kcal">
          <MiniBars values={week.map((d) => d.calories)} color="#2e9e5b" />
        </NutrientCard>
        <NutrientCard label="Carbs" value={totals.carbs} unit="g">
          <MiniBars values={week.map((d) => d.carbs)} color="#f2a33c" />
        </NutrientCard>
      </View>
      <View style={styles.grid}>
        <NutrientCard label="Protein" value={totals.protein} unit="g">
          <MiniBars values={week.map((d) => d.protein)} color="#e0575c" />
        </NutrientCard>
        <NutrientCard label="Fat & sugar" value={totals.fat} unit="g">
          <MiniBars values={week.map((d) => d.fat)} color="#6a9be8" />
        </NutrientCard>
      </View>

      <Card style={{ marginTop: space[4] }}>
        <View style={styles.between}>
          <View>
            <Text style={styles.smallLabel}>Average intake</Text>
            <Text style={serif(24)}>
              {weeklyAvg} <Text style={styles.cardUnit}>kcal</Text>
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.smallLabel}>Difference</Text>
            <Text style={serif(16, { color: weeklyDiff > 0 ? "#e0575c" : colors.accent700 })}>
              {weeklyDiff >= 0 ? "+" : ""}
              {weeklyDiff} kcal
            </Text>
          </View>
        </View>

        <Svg width="100%" height={150} viewBox="0 0 280 150">
          {[20, 70, 120].map((y) => (
            <Line key={y} x1={0} y1={y} x2={280} y2={y} stroke={colors.divider} />
          ))}
          {bars.map((b, i) => (
            <Rect key={i} x={b.x} y={b.y} width={26} height={b.h} rx={4} fill="#6a9be8" />
          ))}
          <Polyline
            points={bars.map((b) => `${b.x + 13},${goalY}`).join(" ")}
            fill="none"
            stroke="#e0575c"
            strokeWidth={2.5}
            strokeDasharray="4 3"
          />
          {bars.map((b, i) => (
            <Circle key={i} cx={b.x + 13} cy={goalY} r={3.5} fill="#e0575c" />
          ))}
        </Svg>

        <View style={{ flexDirection: "row" }}>
          {week.map((d, i) => (
            <Text key={i} style={styles.dowLabel}>
              {d.dow}
            </Text>
          ))}
        </View>
      </Card>

      <Card style={{ marginTop: space[4] }}>
        <Text style={serif(15)}>Macro analysis</Text>
        {[
          { label: "Protein", color: "#d6006c", grams: totals.protein, pct: pProtein },
          { label: "Fat", color: "#f2a33c", grams: totals.fat, pct: pFat },
          { label: "Carbs", color: "#f2c94c", grams: totals.carbs, pct: pCarbs },
        ].map((row) => (
          <View key={row.label} style={styles.macroRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={[styles.dot, { backgroundColor: row.color }]} />
              <Text style={styles.macroLabel}>{row.label}</Text>
            </View>
            <Text style={[serif(13), { fontWeight: "600" }]}>
              {Math.round(row.grams)} g · {row.pct}%
            </Text>
          </View>
        ))}
        <View style={styles.macroBar}>
          <View style={{ width: `${pProtein}%`, backgroundColor: "#d6006c" }} />
          <View style={{ width: `${pFat}%`, backgroundColor: "#f2a33c" }} />
          <View style={{ width: `${pCarbs}%`, backgroundColor: "#f2c94c" }} />
        </View>
        <Text style={styles.formula}>
          Total = Protein × 4 + Fat × 9 + Carbs × 4 = {Math.round(macroTotal)} kcal
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center", alignItems: "center" },
  content: { padding: space[5], paddingBottom: space[8] },
  grid: { flexDirection: "row", gap: space[3], marginBottom: space[3] },
  cardLabel: { fontFamily: fonts.body, fontSize: 12, color: textMuted[60] },
  cardUnit: { fontFamily: fonts.body, fontSize: 12, fontWeight: "400", color: textMuted[60] },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  smallLabel: { fontFamily: fonts.body, fontSize: 11, color: textMuted[55] },
  dowLabel: { flex: 1, textAlign: "center", fontFamily: fonts.body, fontSize: 10.5, color: textMuted[55] },
  macroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  macroLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
  dot: { width: 10, height: 10, borderRadius: 5 },
  macroBar: { flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", marginTop: space[2] },
  formula: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: textMuted[55],
    paddingTop: space[2],
    marginTop: space[2],
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
