import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Card, Kicker, Screen } from "@/components/ui";
import { colors, fonts, radius, serif, shadow, space, textMuted } from "@/theme/tokens";

interface DashboardData {
  calorieBudget: { goal: number; consumed: number; remaining: number; percent: number };
  mealTypeBreakdown: { breakfast: number; lunch: number; dinner: number; snack: number };
  steps: { today: number; goal: number };
  totals: { calories: number; protein: number; fat: number; carbs: number; sugar: number };
  todayTotals: { calories: number; protein: number; fat: number; carbs: number; sugar: number };
  goals: { dailyCalories?: number; proteinGrams?: number };
  mealCount: number;
}

const DIAL_CIRC = 326.7;
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function StatColumn({
  align,
  rows,
}: {
  align: "right" | "left";
  rows: Array<{ label: string; value: string; onPress?: () => void }>;
}) {
  return (
    <View style={{ flex: 1, gap: space[4] }}>
      {rows.map((row) => {
        const body = (
          <>
            <Text style={[styles.statLabel, { textAlign: align }]}>{row.label}</Text>
            <Text style={[serif(22, { color: colors.accent }), { textAlign: align }]}>{row.value}</Text>
          </>
        );
        if (row.onPress) {
          return (
            <Pressable key={row.label} onPress={row.onPress} accessibilityRole="button">
              {body}
            </Pressable>
          );
        }
        return <View key={row.label}>{body}</View>;
      })}
    </View>
  );
}

export default function DashboardScreen() {
  const { token, user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      setLoading(true);
      api<DashboardData>("/api/dashboard?period=week", token)
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

  const left = Math.max(0, Math.round(data.calorieBudget.remaining));
  const percent = data.calorieBudget.percent;
  const proteinLeft = Math.max(
    0,
    Math.round((data.goals.proteinGrams || 130) - data.todayTotals.protein)
  );

  const today = new Date();
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return { dow: DOW[d.getDay()], day: d.getDate(), active: i === 6 };
  });

  const advice = [
    {
      kicker: "Protein",
      title: "Protein for the day",
      body: proteinLeft
        ? `You're ${proteinLeft}g under target — add legumes, fish or dairy.`
        : "Target reached — keep portions steady at dinner.",
    },
    { kicker: "How-to", title: "How to plate protein", body: "Aim for a palm-sized portion at each meal." },
    {
      kicker: "Budget",
      title: left ? "Calories still available" : "Budget reached",
      body: left
        ? `${left} kcal left — a light, high-fibre meal fits best.`
        : "You've met today's budget. Hydrate and go easy on snacks.",
    },
  ];

  const initials = (user?.name ?? "NA")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.greetRow}>
        <View style={{ flex: 1 }}>
          <Text style={serif(22, { lineHeight: 26 })}>
            {greeting()}, {user?.name?.split(" ")[0] ?? "there"} 👋
          </Text>
          <Text style={styles.greetSub}>
            {left ? `You're on track — ${left} kcal left today.` : "Daily budget reached — nice work."}
          </Text>
        </View>
        <View style={styles.avatar}>
          <Text style={serif(16, { color: colors.accent700 })}>{initials}</Text>
        </View>
      </View>

      <View style={styles.budgetCard}>
        <View style={{ alignItems: "center", marginBottom: space[1] }}>
          <Kicker>Calorie budget</Kicker>
          <Text style={serif(24, { color: colors.accent700, lineHeight: 27 })}>{data.calorieBudget.goal}</Text>
        </View>

        <View style={styles.dialRow}>
          <StatColumn
            align="right"
            rows={[
              { label: "Steps", value: data.steps.today.toLocaleString() },
              { label: "Protein", value: `${Math.round(data.todayTotals.protein)}g` },
              { label: "Meals", value: String(data.mealCount) },
            ]}
          />

          <View style={styles.dial}>
            <Svg width={176} height={176} viewBox="0 0 120 120">
              <Circle cx={60} cy={60} r={52} fill="none" stroke={colors.neutral200} strokeWidth={9} />
              <Circle
                cx={60}
                cy={60}
                r={52}
                fill="none"
                stroke={colors.accent}
                strokeWidth={9}
                strokeLinecap="round"
                strokeDasharray={DIAL_CIRC}
                strokeDashoffset={Math.round(DIAL_CIRC * (1 - percent / 100))}
                transform="rotate(-90 60 60)"
              />
            </Svg>
            <View style={styles.dialCenter}>
              <Text style={serif(38, { color: colors.accent, lineHeight: 40 })}>{left}</Text>
              <Text style={styles.dialSub}>Left</Text>
            </View>
          </View>

          <StatColumn
            align="left"
            rows={(
              [
                ["breakfast", "Breakfast", data.mealTypeBreakdown.breakfast],
                ["lunch", "Lunch", data.mealTypeBreakdown.lunch],
                ["dinner", "Dinner", data.mealTypeBreakdown.dinner],
                ["snack", "Snacks", data.mealTypeBreakdown.snack],
              ] as const
            ).map(([mealType, label, kcal]) => ({
              label,
              value: String(Math.round(kcal)),
              onPress: () => {
                const d = new Date();
                const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                router.push(`/(tabs)/chat?mealType=${mealType}&date=${ymd}`);
              },
            }))}
          />
        </View>

        <Text style={styles.viewAll} onPress={() => router.push("/(tabs)/summary")}>
          View all meals →
        </Text>
      </View>

      <View style={styles.weekRow}>
        {week.map((d) => (
          <View key={`${d.dow}-${d.day}`} style={[styles.weekCell, d.active && styles.weekCellActive]}>
            <Text style={[styles.weekDow, d.active && styles.weekTextActive]}>{d.dow}</Text>
            <Text style={[styles.weekDay, d.active && styles.weekTextActive]}>{d.day}</Text>
          </View>
        ))}
      </View>

      <Text style={[serif(15), { marginTop: space[5], marginBottom: space[3] }]}>My daily advice</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[3] }}>
        {advice.map((c) => (
          <Card key={c.title} style={{ width: 180 }}>
            <Kicker>{c.kicker}</Kicker>
            <Text style={serif(15, { lineHeight: 19 })}>{c.title}</Text>
            <Text style={styles.adviceBody}>{c.body}</Text>
          </Card>
        ))}
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space[5], paddingBottom: space[8] },
  center: { justifyContent: "center", alignItems: "center" },

  greetRow: { flexDirection: "row", alignItems: "center", gap: space[3], marginBottom: space[4] },
  greetSub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.accent700, marginTop: 2 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent100,
    alignItems: "center",
    justifyContent: "center",
  },

  budgetCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space[4],
    paddingVertical: space[5],
    ...shadow.md,
  },
  dialRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  statLabel: { fontFamily: fonts.body, fontSize: 11, letterSpacing: 0.4, color: textMuted[60] },
  dial: { width: 176, height: 176 },
  dialCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  dialSub: { fontFamily: fonts.body, fontSize: 13, color: textMuted[55], marginTop: 2 },
  viewAll: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: "600",
    color: colors.accent,
    textAlign: "center",
    marginTop: space[4],
    paddingTop: space[4],
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },

  weekRow: { flexDirection: "row", gap: 2, marginTop: space[4] },
  weekCell: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: radius.md },
  weekCellActive: { backgroundColor: colors.accent },
  weekDow: { fontFamily: fonts.body, fontSize: 11, color: colors.text, opacity: 0.7 },
  weekDay: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
  weekTextActive: { color: colors.bg, opacity: 1 },

  adviceBody: { fontFamily: fonts.body, fontSize: 12.5, color: textMuted[60], lineHeight: 17 },
});
