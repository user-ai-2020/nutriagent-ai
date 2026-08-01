import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { API_URL, api } from "@/lib/api";
import { setSelectedMealId } from "@/lib/selectedMeal";
import { Input, Screen, Segmented, Tag } from "@/components/ui";
import { colors, fonts, radius, serif, space, textMuted } from "@/theme/tokens";

interface Meal {
  mealId: number;
  mealDatetime: string;
  mealType: string;
  imageUrl?: string;
  items: Array<{ foodType: string; nutritionValues?: { calories: number } | null }>;
}

type Range = "day" | "week" | "month";

const RANGES = [
  { value: "day" as const, label: "Day" },
  { value: "week" as const, label: "Week" },
  { value: "month" as const, label: "Month" },
];

function dayLabel(iso: string) {
  const date = new Date(iso);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(date)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function SummaryScreen() {
  const { token } = useAuth();
  const [range, setRange] = useState<Range>("week");
  const [query, setQuery] = useState("");
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    const now = new Date();
    const from = new Date(now);
    if (range === "day") from.setHours(0, 0, 0, 0);
    else if (range === "week") from.setDate(from.getDate() - 7);
    else from.setMonth(from.getMonth() - 1);

    const params = new URLSearchParams({ from: from.toISOString(), to: now.toISOString() });
    if (query.trim()) params.set("q", query.trim());

    api<Meal[]>(`/api/meals?${params}`, token)
      .then(setMeals)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, range, query]);

  useFocusEffect(useCallback(() => load(), [load]));

  function openMeal(mealId: number) {
    setSelectedMealId(mealId);
    router.push("/(tabs)/meal-analysis");
  }

  return (
    <Screen style={{ padding: space[5] }}>
      <Text style={[serif(22), { marginBottom: space[3] }]}>Summary &amp; Foods</Text>

      <View style={styles.filters}>
        <Segmented options={RANGES} value={range} onChange={setRange} />
        <Input
          placeholder="Search foods…"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={load}
          returnKeyType="search"
          style={{ maxWidth: 220 }}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
      ) : (
        <FlatList
          data={meals}
          keyExtractor={(m) => String(m.mealId)}
          contentContainerStyle={{ gap: space[2], paddingBottom: space[8] }}
          ListEmptyComponent={<Text style={styles.empty}>No meals in this range yet — snap one from Chat.</Text>}
          renderItem={({ item }) => {
            const calories = item.items.reduce((s, i) => s + (i.nutritionValues?.calories || 0), 0);
            const name = item.items.map((i) => i.foodType).join(", ") || "Logged meal";
            const uri = item.imageUrl
              ? item.imageUrl.startsWith("http")
                ? item.imageUrl
                : `${API_URL}${item.imageUrl}`
              : null;

            return (
              <TouchableOpacity style={styles.row} onPress={() => openMeal(item.mealId)} activeOpacity={0.7}>
                {uri ? (
                  <Image source={{ uri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Text style={styles.thumbText}>Meal</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {name}
                  </Text>
                  <View style={styles.rowMeta}>
                    <Tag>{item.mealType}</Tag>
                    <Text style={styles.rowTime}>
                      {dayLabel(item.mealDatetime)} ·{" "}
                      {new Date(item.mealDatetime).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                </View>
                <Text style={styles.rowCals}>{Math.round(calories)} kcal</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { gap: space[2], marginBottom: space[4] },
  empty: { fontFamily: fonts.body, fontSize: 12.5, color: textMuted[55], marginTop: 40, textAlign: "center" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    padding: space[2],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  thumb: { width: 52, height: 52, borderRadius: 8 },
  thumbEmpty: {
    backgroundColor: colors.neutral100,
    borderWidth: 1,
    borderColor: colors.neutral300,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbText: { fontFamily: fonts.body, fontSize: 9.5, color: textMuted[50] },
  rowTitle: { fontFamily: fonts.body, fontSize: 14.5, fontWeight: "600", color: colors.text },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  rowTime: { fontFamily: fonts.body, fontSize: 11.5, color: textMuted[55] },
  rowCals: { fontFamily: fonts.body, fontSize: 14, fontWeight: "600", color: colors.text },
});
