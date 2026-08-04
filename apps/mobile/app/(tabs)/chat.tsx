import { useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { localizeFoodDisplayName, localizeMealTitle } from "@nutriagent/shared/foodDisplayName";
import { useAuth } from "@/context/AuthContext";
import { API_URL, api } from "@/lib/api";
import { setSelectedMealId } from "@/lib/selectedMeal";
import { CameraIcon, GalleryIcon, SendIcon } from "@/components/Icons";
import { FlowerMacro, NutritionFlower } from "@/components/NutritionFlower";
import { Card, IconButton, Kicker, Tag } from "@/components/ui";
import { colors, fonts, radius, serif, space, textMuted } from "@/theme/tokens";
import type { CitationSource } from "@nutriagent/shared/types";

/**
 * Citations arrive as either a plain string or a { title, url } object (web/RAG
 * sources). Rendering the object form directly as a child throws
 * "Objects are not valid as a React child" and crashes the chat screen, so
 * always reduce a source to a display string first.
 */
function sourceLabel(src: CitationSource): string {
  if (src && typeof src === "object") {
    const { title, url } = src as { title?: unknown; url?: unknown };
    if (typeof title === "string" && title) return title;
    if (typeof url === "string" && url) return url;
    return "";
  }
  return typeof src === "string" ? src : String(src ?? "");
}

interface Nutrition {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  sugar: number;
}

interface MealAnalysis {
  totalNutrition: Nutrition;
  items: Array<{ foodType: string; estimatedQuantity: string; visionConfidence?: number }>;
}

interface Message {
  role: string;
  content: string;
  sources?: CitationSource[];
  mealAnalysis?: MealAnalysis;
  mealId?: number;
  imageUri?: string;
}

const GOAL_CALORIES = 2200;
const GOAL_PROTEIN = 130;
const GOAL_FAT = 70;
const GOAL_CARBS = 250;
const GOAL_SUGAR = 50;

const QUICK_REPLY_KEYS = ["chat.quickReplyEatNow", "chat.quickReplyYesterday"] as const;

function macrosOf(n: Nutrition): FlowerMacro[] {
  const pct = (value: number, goal: number) => Math.min(100, Math.round((value / goal) * 100));
  return [
    { label: "Protein", value: `${Math.round(n.protein)}g`, pct: pct(n.protein, GOAL_PROTEIN) },
    { label: "Carbs", value: `${Math.round(n.carbs)}g`, pct: pct(n.carbs, GOAL_CARBS) },
    { label: "Fat", value: `${Math.round(n.fat)}g`, pct: pct(n.fat, GOAL_FAT) },
    { label: "Sugar", value: `${Math.round(n.sugar)}g`, pct: pct(n.sugar, GOAL_SUGAR) },
  ];
}

export default function ChatScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  async function pickImage(useCamera: boolean) {
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("system.permissionTitle"), t("system.permissionCamera"));
      return;
    }
    const res = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (!res.canceled && res.assets[0]) setPendingImage(res.assets[0].uri);
  }

  async function sendMessage(preset?: string) {
    const text = (preset ?? input).trim() || (pendingImage ? t("chat.analyzeMeal") : "");
    if (!text || !token || loading) return;

    const imageUri = pendingImage;
    setInput("");
    setPendingImage(null);
    setMessages((prev) => [...prev, { role: "user", content: text, imageUri: imageUri ?? undefined }]);
    setLoading(true);

    try {
      let data: Message & { reply: string; sources: CitationSource[]; mealId?: number };
      if (imageUri) {
        const form = new FormData();
        form.append("message", text);
        form.append("image", { uri: imageUri, name: "meal.jpg", type: "image/jpeg" } as unknown as Blob);
        const res = await fetch(`${API_URL}/api/chat/message`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        data = await res.json();
        if (!res.ok) throw new Error((data as { error?: string }).error || "Failed");
      } else {
        data = await api("/api/chat/message", token, {
          method: "POST",
          body: JSON.stringify({ message: text }),
        });
      }

      if (data.mealId) setSelectedMealId(data.mealId);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          sources: data.sources,
          mealAnalysis: data.mealAnalysis,
          mealId: data.mealId,
        },
      ]);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Error sending message";
      const content =
        raw === "fetch failed" || raw.includes("Orchestrator")
          ? t("chat.servicesUnavailable")
          : raw;
      setMessages((prev) => [...prev, { role: "assistant", content }]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd(), 100);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_: Message, i: number) => String(i)}
        contentContainerStyle={styles.list}
        renderItem={({ item }: { item: Message }) => {
          const isUser = item.role === "user";
          const confidences = item.mealAnalysis?.items.map((i) => i.visionConfidence ?? 0) ?? [];
          const matchPct = confidences.length
            ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100)
            : 0;

          return (
            <View style={{ marginBottom: space[3] }}>
              {item.imageUri ? (
                <Image source={{ uri: item.imageUri }} style={styles.sentPhoto} />
              ) : null}

              <View style={[styles.bubble, isUser ? styles.userBubble : styles.agentBubble]}>
                <Text style={[styles.bubbleText, isUser && styles.userText]}>{item.content}</Text>
              </View>

              {item.sources?.length ? (
                <View style={styles.sourceRow}>
                  {item.sources.slice(0, 3).map((s, idx) => {
                    const label = sourceLabel(s);
                    if (!label) return null;
                    return (
                      <Tag key={idx} variant="outline">
                        {label}
                      </Tag>
                    );
                  })}
                </View>
              ) : null}

              {item.mealAnalysis ? (
                <Card style={styles.mealCard}>
                  <View style={styles.matchPill}>
                    <Text style={styles.matchText}>{matchPct}% match</Text>
                  </View>
                  <Text style={serif(16, { lineHeight: 20 })}>
                    {localizeMealTitle(
                      item.mealAnalysis.items.map((i) => i.foodType),
                      lang
                    ) || item.mealAnalysis.items[0]?.foodType || "Logged meal"}
                  </Text>
                  <Kicker>Identified from photo</Kicker>
                  <View style={styles.itemPills}>
                    {item.mealAnalysis.items.map((i) => (
                      <View key={i.foodType} style={styles.itemPill}>
                        <Text style={styles.itemPillText}>
                          {localizeFoodDisplayName(i.foodType, lang)} · {i.estimatedQuantity}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <NutritionFlower
                    calories={item.mealAnalysis.totalNutrition.calories}
                    goalCalories={GOAL_CALORIES}
                    macros={macrosOf(item.mealAnalysis.totalNutrition)}
                  />
                </Card>
              ) : null}
            </View>
          );
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={serif(22)}>{t("chat.title")}</Text>
            <Text style={styles.headerSub}>{t("chat.subtitle")}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.bubble, styles.agentBubble]}>
            <Text style={styles.bubbleText}>{t("chat.emptyGreeting")}</Text>
          </View>
        }
      />

      <View style={styles.composerWrap}>
        {pendingImage ? (
          <View style={styles.previewRow}>
            <Image source={{ uri: pendingImage }} style={styles.preview} />
            <View style={{ flex: 1 }}>
              <Text style={styles.previewLabel}>{t("chat.photoReady")}</Text>
            </View>
            <TouchableOpacity onPress={() => setPendingImage(null)}>
              <Text style={styles.removePreview}>{t("common.remove")}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.quickRow}>
          {QUICK_REPLY_KEYS.map((key) => (
            <TouchableOpacity key={key} style={styles.quickBtn} onPress={() => sendMessage(t(key))} disabled={loading}>
              <Text style={styles.quickText}>{t(key)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.composer}>
          <IconButton onPress={() => pickImage(true)}>
            <CameraIcon color={colors.bg} />
          </IconButton>
          <IconButton variant="secondary" onPress={() => pickImage(false)}>
            <GalleryIcon color={colors.text} />
          </IconButton>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={t("chat.placeholder")}
            placeholderTextColor={textMuted[50]}
            multiline
          />
          <IconButton onPress={() => sendMessage()} disabled={loading}>
            <SendIcon color={colors.bg} />
          </IconButton>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space[5], flexGrow: 1 },

  header: { marginBottom: space[3] },
  headerSub: { fontFamily: fonts.body, fontSize: 13, color: textMuted[60], marginTop: 2 },

  bubble: { maxWidth: "88%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.accent },
  agentBubble: { alignSelf: "flex-start", backgroundColor: colors.surface },
  bubbleText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text },
  userText: { color: colors.bg },

  sentPhoto: { width: 200, height: 150, borderRadius: 10, alignSelf: "flex-end", marginBottom: 6 },
  sourceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },

  mealCard: { marginTop: space[2], alignSelf: "flex-start", width: "100%" },
  matchPill: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent100,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  matchText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.accent700 },
  itemPills: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: space[4] },
  itemPill: { backgroundColor: colors.neutral200, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 6 },
  itemPillText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.text },

  composerWrap: {
    padding: space[3],
    gap: space[2],
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  previewRow: { flexDirection: "row", alignItems: "center", gap: space[3], padding: space[3], borderRadius: radius.lg, backgroundColor: colors.accent100 },
  preview: { width: 96, height: 72, borderRadius: 10 },
  previewLabel: { fontFamily: fonts.body, fontSize: 14, fontWeight: "700", color: colors.accent700, marginBottom: 4 },
  removePreview: { fontFamily: fonts.body, fontSize: 13, color: colors.accent2700 },

  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickBtn: {
    borderWidth: 1.5,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.text },

  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: 9,
    maxHeight: 100,
  },
});
