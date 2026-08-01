import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { API_URL, api } from "@/lib/api";
import { getSelectedMealId, setSelectedMealId } from "@/lib/selectedMeal";
import { CheckIcon, CloseIcon, PencilIcon } from "@/components/Icons";
import { IconButton, Input, Kicker, Screen, Tag } from "@/components/ui";
import { colors, fonts, radius, serif, space, textMuted } from "@/theme/tokens";

interface MealItem {
  itemId: number;
  foodType: string;
  estimatedQuantity: string;
  visionConfidence?: number | null;
  nutritionValues?: { calories: number; protein: number; fat: number; carbs: number; sugar: number } | null;
}

interface Meal {
  mealId: number;
  mealDatetime: string;
  mealType: string;
  imageUrl?: string | null;
  items: MealItem[];
}

export default function MealAnalysisScreen() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [meal, setMeal] = useState<Meal | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [corrected, setCorrected] = useState<number[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      let id = getSelectedMealId();
      if (!id) {
        const meals = await api<Meal[]>("/api/meals", token);
        if (meals[0]) {
          id = meals[0].mealId;
          setSelectedMealId(id);
        }
      }
      setMeal(id ? await api<Meal>(`/api/meals/${id}`, token) : null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  async function saveItem(item: MealItem) {
    if (!token || !meal) return;
    try {
      const updated = await api<Meal>(`/api/meals/${meal.mealId}/items/${item.itemId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ foodType: draft.trim() || item.foodType }),
      });
      setMeal(updated);
      setCorrected((prev) => [...new Set([...prev, item.itemId])]);
      setEditingId(null);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Update failed");
    }
  }

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </Screen>
    );
  }

  if (!meal) {
    return (
      <Screen style={[styles.center, { padding: space[6] }]}>
        <Text style={serif(20)}>Meal Analysis</Text>
        <Text style={styles.empty}>No meal selected — snap one from Chat or pick one in Summary &amp; Foods.</Text>
      </Screen>
    );
  }

  const date = new Date(meal.mealDatetime);
  const uri = meal.imageUrl
    ? meal.imageUrl.startsWith("http")
      ? meal.imageUrl
      : `${API_URL}${meal.imageUrl}`
    : null;
  const name = meal.items.map((i) => i.foodType).join(", ") || "Logged meal";

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      {uri ? (
        <Image source={{ uri }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoEmpty]}>
          <Text style={styles.photoText}>Meal photo / browse files</Text>
        </View>
      )}

      <Text style={serif(20, { marginBottom: 2 })}>{name}</Text>
      <Text style={styles.meta}>
        {meal.mealType} · {date.toLocaleDateString()} ·{" "}
        {date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
      </Text>

      <Kicker>Vision Agent · identified items</Kicker>

      {meal.items.map((item) => {
        const matchPct = Math.round((item.visionConfidence ?? 0) * 100);
        return (
          <View key={item.itemId} style={styles.itemRow}>
            {editingId === item.itemId ? (
              <View style={styles.editRow}>
                <Input value={draft} onChangeText={setDraft} style={{ flex: 1 }} autoFocus />
                <IconButton onPress={() => saveItem(item)}>
                  <CheckIcon color={colors.bg} />
                </IconButton>
                <IconButton variant="secondary" onPress={() => setEditingId(null)}>
                  <CloseIcon color={colors.text} />
                </IconButton>
              </View>
            ) : (
              <View style={styles.viewRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.itemName}>{item.foodType}</Text>
                    {corrected.includes(item.itemId) && <Tag variant="accent2">corrected</Tag>}
                  </View>
                  <Text style={styles.itemQty}>
                    {item.estimatedQuantity}
                    {item.nutritionValues ? ` · ${Math.round(item.nutritionValues.calories)} kcal` : ""}
                  </Text>
                </View>
                <View style={{ width: 70 }}>
                  <View style={styles.confBg}>
                    <View style={[styles.confFill, { width: `${matchPct}%` }]} />
                  </View>
                  <Text style={styles.confText}>{t("mealAnalysis.matchScore", { pct: matchPct })}</Text>
                </View>
                <IconButton
                  variant="ghost"
                  onPress={() => {
                    setEditingId(item.itemId);
                    setDraft(item.foodType);
                  }}
                >
                  <PencilIcon color={colors.text} />
                </IconButton>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center", alignItems: "center", gap: space[2] },
  content: { padding: space[5], paddingBottom: space[8] },
  empty: { fontFamily: fonts.body, fontSize: 13, color: textMuted[55], textAlign: "center", lineHeight: 20 },

  photo: { width: "100%", aspectRatio: 4 / 3, maxWidth: 280, borderRadius: radius.md, marginBottom: space[4] },
  photoEmpty: {
    backgroundColor: colors.neutral100,
    borderWidth: 1,
    borderColor: colors.neutral300,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  photoText: { fontFamily: fonts.body, fontSize: 11.5, color: textMuted[50] },
  meta: { fontFamily: fonts.body, fontSize: 13, color: textMuted[60], marginBottom: space[4] },

  itemRow: { paddingVertical: space[2], borderBottomWidth: 1, borderBottomColor: colors.divider },
  editRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  viewRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  itemName: { fontFamily: fonts.body, fontSize: 14, fontWeight: "600", color: colors.text },
  itemQty: { fontFamily: fonts.body, fontSize: 12, color: textMuted[60], marginTop: 2 },
  confBg: { height: 5, borderRadius: 3, backgroundColor: colors.divider, overflow: "hidden" },
  confFill: { height: "100%", backgroundColor: colors.accent },
  confText: { fontFamily: fonts.body, fontSize: 10.5, color: textMuted[60], textAlign: "right", marginTop: 2 },
});
