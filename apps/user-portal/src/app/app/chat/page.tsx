"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CITATION_SOURCE_I18N_KEY, normalizeCitationSource } from "@nutriagent/shared/citation-sources";
import { localizeFoodDisplayName } from "@nutriagent/shared/foodDisplayName";
import { api, apiBaseUrl, apiChat, CHAT_API_TIMEOUT_MS } from "@/lib/api";
import { Profile } from "@/lib/profile";
import { muted } from "@/lib/ui";
import { CameraIcon, HistoryIcon, SendIcon } from "@/components/icons";
import { MultiModelMealCards } from "@/components/MultiModelMealCards";
import { FlowerMacro, NutritionFlower } from "@/components/NutritionFlower";
import { NutritionHistoryChart, NutritionHistoryData } from "@/components/NutritionHistoryChart";
import { useProfile, useInvalidateMealData } from "@/hooks/queries";
import { useLanguage } from "@/lib/language";
import { resizeImage } from "@/lib/imageUtils";
import { PlusIcon } from "@/components/icons";

import { Nutrition, MealAnalysis, Msg } from "@/types/chatTypes";

const GOAL_FAT = 70;
const GOAL_CARBS = 250;
const GOAL_SUGAR = 50;

function mealReplyWithoutDescription(reply: string, mealDescription?: string): string {
  if (!mealDescription) return reply;
  return reply.replace(`${mealDescription}\n\n`, "").replace(`${mealDescription}\n`, "");
}

/**
 * Rebuilds a meal-analysis message from its structured data in the CURRENT UI
 * language. The stored `reply` string is frozen in whatever language was active
 * when the AI produced it, so a chat reopened after switching languages would
 * otherwise show yesterday's language. Everything here is templated (item list,
 * totals, item lines), so it re-renders exactly — only agent-authored warnings and
 * clinical tips stay in their original language, since they are free text.
 * Returns null when there isn't enough structured data (older stored messages).
 */
function localizedMealText(
  msg: {
    items?: Array<{ foodType: string; estimatedQuantity: string; nutrition?: Nutrition }>;
    totalNutrition?: Nutrition;
    warnings?: string[];
    tips?: string[];
  },
  t: (key: string, opts?: Record<string, unknown>) => string,
  lang: string
): string | null {
  const items = msg.items ?? [];
  if (!items.length || !msg.totalNutrition) return null;

  const itemList = items
    .map((i) => `${localizeFoodDisplayName(i.foodType, lang)} (${i.estimatedQuantity})`)
    .join(", ");
  const n = msg.totalNutrition;

  return [
    t("chat.mealAnalyzedTitle"),
    "",
    items.length === 1
      ? t("chat.mealDescriptionSingle", { items: itemList })
      : t("chat.mealDescriptionMultiple", { count: items.length, items: itemList }),
    "",
    t("chat.mealTotals", {
      kcal: Math.round(n.calories),
      protein: Math.round(n.protein),
      carbs: Math.round(n.carbs),
      fat: Math.round(n.fat),
    }),
    "",
    t("chat.seeDetectionBelow"),
    "",
    ...items.map((i) =>
      t("chat.mealItemLine", {
        food: localizeFoodDisplayName(i.foodType, lang),
        qty: i.estimatedQuantity,
        kcal: Math.round(i.nutrition?.calories ?? 0),
      })
    ),
    ...(msg.warnings?.length ? ["", ...msg.warnings.map((w) => `⚠️ ${w}`)] : []),
    ...(msg.tips?.length ? ["", ...msg.tips.map((r) => `💡 ${r}`)] : []),
  ].join("\n");
}

function ragReplyBody(text: string): string {
  const markers = ["📚 Clinical Glass Box - Sources:", "📚 Sources:"];
  let cut = text.length;
  for (const marker of markers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) cut = Math.min(cut, idx);
  }
  return cut < text.length ? text.slice(0, cut).trimEnd() : text;
}

// `import type` so this is erased at compile time — a value import of the shared
// barrel would drag sharp / @google-cloud/storage into the browser bundle.
import type { CitationSource } from "@nutriagent/shared/types";

/**
 * Always returns a string label — never an object. A citation arriving as
 * { title, url } (web/RAG sources) rendered directly as a React child throws
 * "Objects are not valid as a React child", which crashes the whole chat page,
 * so every branch here is coerced to a primitive defensively.
 */
function formatSourceLabel(
  src: CitationSource,
  t: (key: string) => string
): { label: string; url?: string } {
  if (src && typeof src === "object") {
    const { title, url } = src as { title?: unknown; url?: unknown };
    const safeUrl = typeof url === "string" && url ? url : undefined;
    const safeTitle = typeof title === "string" && title ? title : safeUrl;
    return { label: safeTitle ?? "", url: safeUrl };
  }
  if (typeof src !== "string") return { label: String(src ?? "") };

  const id = normalizeCitationSource(src);
  const i18nKey = CITATION_SOURCE_I18N_KEY[id];
  return { label: i18nKey ? t(`chat.sourceLabels.${i18nKey}`) : src };
}

interface ChatSessionSummary {
  id: number;
  createdAt: string;
  messageCount: number;
  preview: string | null;
}

/** Stored chat_history row. `analysis` carries the structured payload behind an
 *  assistant turn so a reopened chat re-renders meal cards and charts. */
interface StoredChatMessage {
  messageId: number;
  role: string;
  content: string;
  sources?: CitationSource[] | null;
  analysis?: {
    multiModelMealAnalysis?: any;
    mealAnalysis?: MealAnalysis;
    nutritionHistory?: NutritionHistoryData;
    itemsDetected?: boolean;
  } | null;
}

/** Rebuild a rendered chat message from a persisted row. Mirrors the branching
 *  used for a live response so history looks identical to the original turn. */
function storedMessageToMsg(m: StoredChatMessage, fallbackName: string): Msg {
  if (m.role === "user") {
    return { kind: "text", from: "user", text: m.content, messageId: m.messageId };
  }

  const analysis = m.analysis ?? undefined;
  const sources = m.sources ?? undefined;

  if (analysis?.multiModelMealAnalysis) {
    const mm = analysis.multiModelMealAnalysis;
    return {
      kind: "multiModel",
      text: m.content,
      mealDescription: mm.mealDescription,
      panels: mm.panels ?? [],
      rerankerScores: mm.rerankerScores ?? [],
      fusionMethod: mm.fusionMethod,
      fallbackModelLabel: mm.fallbackModelLabel,
      sources,
      items: mm.items,
      totalNutrition: mm.totalNutrition,
      warnings: mm.warnings,
      tips: mm.tips,
      imageUrl: mm.imageUrl,
    };
  }

  if (analysis?.mealAnalysis) {
    const confidences = analysis.mealAnalysis.items.map((i) => i.visionConfidence ?? 0);
    return {
      kind: "card",
      mealName: analysis.mealAnalysis.items[0]?.foodType ?? fallbackName,
      analysis: analysis.mealAnalysis,
      recommendation: m.content.split("\n")[0],
      matchPct: confidences.length
        ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100)
        : 0,
    };
  }

  if (analysis?.nutritionHistory) {
    return { kind: "history", text: m.content, data: analysis.nutritionHistory, sources };
  }

  if (sources?.length) {
    return { kind: "rag", text: m.content, sources, messageId: m.messageId };
  }

  return { kind: "text", from: "agent", text: m.content, messageId: m.messageId };
}

function SourceTag({ src, t }: { src: CitationSource; t: any }) {
  const { label, url } = formatSourceLabel(src, t);
  if (!label) return null;
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="tag tag-outline" style={{ textDecoration: "none" }}>
        {label}
      </a>
    );
  }
  return <span className="tag tag-outline">{label}</span>;
}

export default function ChatPage() {
  const { t } = useTranslation();
  const { preferredLanguage } = useLanguage();
  const [messages, setMessages] = useState<Msg[]>([]);
  // Messages already translated into a given language, so a second switch back and
  // forth doesn't re-request them.
  const translatedRef = useRef<Record<string, Set<number>>>({});
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: profileData } = useProfile();
  const profile: Profile = profileData || {};
  const invalidateMealData = useInvalidateMealData();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sessionId, setSessionId] = useState<number | undefined>(undefined);
  const [pendingClarification, setPendingClarification] = useState<string | null>(null);
  // Graph thread of the paused run — each message gets its own thread, so the
  // resume must target this id rather than the session id.
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const goalCalories = profile.dietGoals?.dailyCalories || 2200;
  const goalProtein = profile.dietGoals?.proteinGrams || 130;

  function macrosOf(n: Nutrition): FlowerMacro[] {
    const pct = (value: number, goal: number) => Math.min(100, Math.round((value / goal) * 100));
    return [
      { colorId: "protein", label: t("nutrients.protein"), value: `${Math.round(n.protein)}g`, pct: pct(n.protein, goalProtein) },
      { colorId: "carbs", label: t("nutrients.carbs"), value: `${Math.round(n.carbs)}g`, pct: pct(n.carbs, GOAL_CARBS) },
      { colorId: "fat", label: t("nutrients.fat"), value: `${Math.round(n.fat)}g`, pct: pct(n.fat, GOAL_FAT) },
      { colorId: "sugar", label: t("nutrients.sugar"), value: `${Math.round(n.sugar)}g`, pct: pct(n.sugar, GOAL_SUGAR) },
    ];
  }

  async function handleNewChat() {
    try {
      const res = await apiChat<{ id: number }>("/api/chat/session", { method: "POST" });
      setSessionId(res.id);
      setMessages([]);
      // Drop any half-finished clarification from the previous chat.
      setPendingClarification(null);
      setPendingThreadId(null);
    } catch (err) {
      console.warn("Failed to create new chat session", err);
    }
  }

  // Translate stored messages whenever the active language changes. Meal results
  // re-render locally from structured data, but free-form replies (advice, RAG
  // answers) are frozen text — they need the model. Each message is translated at
  // most once per language; the server caches the result on the row too.
  useEffect(() => {
    const seen = (translatedRef.current[preferredLanguage] ??= new Set<number>());
    const pending = messages
      .map((m) => ("messageId" in m ? m.messageId : undefined))
      .filter((id): id is number => typeof id === "number" && !seen.has(id));

    if (!pending.length) return;
    pending.forEach((id) => seen.add(id));

    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ translations: Record<string, string> }>("/api/chat/translate", {
          method: "POST",
          body: JSON.stringify({ messageIds: pending, targetLanguage: preferredLanguage }),
        });
        if (cancelled) return;

        const map = res.translations ?? {};
        if (!Object.keys(map).length) return;

        setMessages((prev) =>
          prev.map((m) => {
            const id = "messageId" in m ? m.messageId : undefined;
            const translated = id !== undefined ? map[String(id)] : undefined;
            return translated ? ({ ...m, text: translated } as Msg) : m;
          })
        );
      } catch (err) {
        console.warn("Could not translate chat history", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [preferredLanguage, messages]);

  async function toggleHistory() {
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await api<{ sessions: ChatSessionSummary[] }>("/api/chat/sessions");
      setSessions(res.sessions ?? []);
    } catch (err) {
      console.warn("Failed to load chat sessions", err);
      setSessions([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openSession(id: number) {
    setHistoryOpen(false);
    setBusy(true);
    try {
      const res = await api<{ messages: StoredChatMessage[] }>(
        `/api/chat/history?sessionId=${id}&limit=100`
      );
      const restored: Msg[] = (res.messages ?? []).map((m) =>
        storedMessageToMsg(m, t("mealAnalysis.loggedMeal"))
      );
      setMessages(restored);
      setSessionId(id);
      // A restored chat has no paused run attached to it.
      setPendingClarification(null);
      setPendingThreadId(null);
    } catch (err) {
      console.warn("Failed to open chat session", err);
    } finally {
      setBusy(false);
    }
  }

  async function send(text?: string) {
    const message = (text ?? draft).trim() || (file ? t("chat.analyzeMeal") : "");
    if (!message || busy) return;

    const pending: Msg[] = [];
    if (file) pending.push({ kind: "image", from: "user", url: URL.createObjectURL(file) });
    pending.push({ kind: "text", from: "user", text: message });
    setMessages((m) => [...m, ...pending, { kind: "typing" }]);
    setDraft("");
    setBusy(true);

    try {
      let data: {
        reply: string;
        itemsDetected?: boolean;
        sources?: CitationSource[];
        mealAnalysis?: MealAnalysis;
        mealId?: number;
        nutritionHistory?: NutritionHistoryData;
        multiModelMealAnalysis?: {
          mealDescription?: string;
          panels: Array<{
            modelId: string;
            modelLabel: string;
            items: Array<{ foodType: string; estimatedQuantity: string; visionConfidence: number; nutrition: Nutrition }>;
            totalNutrition: Nutrition;
            error?: string;
          }>;
          rerankerScores: Array<{
            foodType: string;
            estimatedQuantity: string;
            score: number;
            modelAgreement: number;
            avgConfidence: number;
          }>;
          fusionMethod?: "full" | "cluster_no_rerank" | "single_model_only" | "single_model_fallback" | "empty_pool_fallback";
          fallbackModelLabel?: string;
          items?: Array<{ foodType: string; estimatedQuantity: string; nutrition?: Nutrition }>;
          totalNutrition?: Nutrition;
          warnings?: string[];
          tips?: string[];
          imageUrl?: string;
        };
      };

      if (pendingClarification) {
        setPendingClarification(null);
        const resumeThreadId = pendingThreadId;
        setPendingThreadId(null);
        data = await apiChat("/api/chat/resume", {
          method: "POST",
          body: JSON.stringify({ answer: message, sessionId, threadId: resumeThreadId }),
        });
      } else if (file) {
        const resizedBlob = await resizeImage(file);
        const form = new FormData();
        form.append("message", message);
        form.append("image", resizedBlob, file.name);
        if (sessionId) form.append("sessionId", String(sessionId));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CHAT_API_TIMEOUT_MS);
        let res: Response;
        try {
          res = await fetch(`${apiBaseUrl()}/api/chat/message`, {
            method: "POST",
            body: form,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        data = await res.json();
        if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
        setFile(null);
      } else {
        const payload: Record<string, any> = { message };
        if (sessionId) payload.sessionId = sessionId;
        data = await apiChat("/api/chat/message", { method: "POST", body: JSON.stringify(payload) });
      }

      if (data.mealId) {
        localStorage.setItem("selectedMealId", String(data.mealId));
        invalidateMealData();
      }

      const next: Msg[] = [];
      
      if ((data as any).intent === "clarify_vision") {
        setPendingClarification((data as any).question);
        setPendingThreadId((data as any).threadId ?? null);
        next.push({ kind: "text", from: "agent", text: (data as any).question });
      } else if (data.itemsDetected === false && data.multiModelMealAnalysis) {
        next.push({
          kind: "multiModel",
          text: data.reply,
          mealDescription: data.multiModelMealAnalysis.mealDescription,
          panels: data.multiModelMealAnalysis.panels,
          rerankerScores: data.multiModelMealAnalysis.rerankerScores,
          fusionMethod: data.multiModelMealAnalysis.fusionMethod,
          fallbackModelLabel: data.multiModelMealAnalysis.fallbackModelLabel,
          sources: data.sources,
          items: data.multiModelMealAnalysis.items,
          totalNutrition: data.multiModelMealAnalysis.totalNutrition,
          warnings: data.multiModelMealAnalysis.warnings,
          tips: data.multiModelMealAnalysis.tips,
          imageUrl: data.multiModelMealAnalysis.imageUrl,
        });
      } else if (data.multiModelMealAnalysis) {
        next.push({
          kind: "multiModel",
          text: data.reply,
          mealDescription: data.multiModelMealAnalysis.mealDescription,
          panels: data.multiModelMealAnalysis.panels,
          rerankerScores: data.multiModelMealAnalysis.rerankerScores,
          fusionMethod: data.multiModelMealAnalysis.fusionMethod,
          fallbackModelLabel: data.multiModelMealAnalysis.fallbackModelLabel,
          sources: data.sources,
          items: data.multiModelMealAnalysis.items,
          totalNutrition: data.multiModelMealAnalysis.totalNutrition,
          warnings: data.multiModelMealAnalysis.warnings,
          tips: data.multiModelMealAnalysis.tips,
          imageUrl: data.multiModelMealAnalysis.imageUrl,
        });
      } else if (data.mealAnalysis) {
        const confidences = data.mealAnalysis.items.map((i) => i.visionConfidence ?? 0);
        next.push({
          kind: "card",
          mealName: data.mealAnalysis.items[0]?.foodType ?? t("mealAnalysis.loggedMeal"),
          analysis: data.mealAnalysis,
          recommendation: data.reply.split("\n")[0],
          matchPct: confidences.length
            ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100)
            : 0,
        });
      } else if (data.nutritionHistory) {
        next.push({ kind: "history", text: data.reply, data: data.nutritionHistory, sources: data.sources });
      } else if (data.sources?.length) {
        next.push({ kind: "rag", text: data.reply, sources: data.sources });
      } else {
        next.push({ kind: "text", from: "agent", text: data.reply });
      }

      setMessages((m) => [...m.filter((x) => x.kind !== "typing"), ...next]);
    } catch (err) {
      const raw = err instanceof Error ? err.message : t("chat.somethingWrong");
      const text = (() => {
        if (raw === "fetch failed") return t("chat.servicesUnavailable");
        if (raw.includes("text2sql-agent") || raw.includes("Text2SQL")) {
          return t("chat.historyUnavailable");
        }
        if (
          raw.includes("OpenRouter") ||
          raw.includes("User not found") ||
          raw.includes("invalid_api_key")
        ) {
          return t("chat.aiModelUnavailable");
        }
        if (raw.includes("Orchestrator")) return t("chat.servicesUnavailable");
        return raw;
      })();
      setMessages((m) => [
        ...m.filter((x) => x.kind !== "typing"),
        { kind: "text", from: "agent", text },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="na-chat-root" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ marginBottom: "var(--space-3)", paddingLeft: "var(--space-4)", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 22, margin: "0 0 2px" }}>{t("chat.title")}</h2>
          <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>{t("chat.subtitle")}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
          <button
            className="btn btn-secondary"
            onClick={toggleHistory}
            aria-expanded={historyOpen}
            aria-haspopup="listbox"
            style={{ fontSize: 13, padding: "8px 12px", display: "flex", alignItems: "center", gap: 6 }}
          >
            <HistoryIcon size={14} />
            {t("chat.history")}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleNewChat}
            style={{ fontSize: 13, padding: "8px 12px", display: "flex", alignItems: "center", gap: 6 }}
          >
            <PlusIcon size={14} />
            {t("chat.newChat", "New Chat")}
          </button>

          {historyOpen && (
            <>
              {/* Click-away layer so the panel closes on an outside click. */}
              <div
                onClick={() => setHistoryOpen(false)}
                style={{ position: "fixed", inset: 0, zIndex: 40 }}
              />
              <div
                role="listbox"
                aria-label={t("chat.historyTitle")}
                className="card elev-sm"
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  insetInlineEnd: 0,
                  width: 320,
                  maxHeight: 360,
                  overflowY: "auto",
                  zIndex: 41,
                  padding: "var(--space-2)",
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.6, padding: "4px 8px 8px" }}>
                  {t("chat.historyTitle")}
                </div>

                {historyLoading ? (
                  <div style={{ fontSize: 13, padding: "8px" }}>…</div>
                ) : sessions.length === 0 ? (
                  <div style={{ fontSize: 13, padding: "8px", opacity: 0.7 }}>
                    {t("chat.historyEmpty")}
                  </div>
                ) : (
                  sessions.map((s) => (
                    <button
                      key={s.id}
                      role="option"
                      aria-selected={s.id === sessionId}
                      onClick={() => openSession(s.id)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "start",
                        background: s.id === sessionId ? "var(--color-surface-2)" : "transparent",
                        border: "none",
                        borderRadius: "var(--radius-md)",
                        padding: "8px",
                        cursor: "pointer",
                        color: "inherit",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.preview || t("chat.historyUntitled")}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
                        {new Date(s.createdAt).toLocaleString()} ·{" "}
                        {t("chat.historyMessageCount", { n: s.messageCount })}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div
        className="na-chat-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          overflowY: "auto",
          paddingRight: 2,
          paddingBottom: "var(--space-4)",
        }}
      >
        {messages.length === 0 && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                maxWidth: "82%",
                background: "var(--color-surface)",
                padding: "10px 14px",
                borderRadius: "var(--radius-lg)",
                fontSize: 14,
                lineHeight: 1.55,
              }}
            >
              {t("chat.emptyGreeting")}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "from" in msg && msg.from === "user" ? "flex-end" : "flex-start",
              animation: "na-in .25s ease both",
            }}
          >
            {msg.kind === "text" && msg.from === "user" && (
              <div
                style={{
                  maxWidth: "78%",
                  background: "var(--color-accent)",
                  color: "var(--color-bg)",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-lg)",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {msg.text}
              </div>
            )}

            {msg.kind === "text" && msg.from === "agent" && (
              <div
                dir="auto"
                style={{
                  maxWidth: "82%",
                  background: "var(--color-surface)",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-lg)",
                  fontSize: 14,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {msg.text}
              </div>
            )}

            {msg.kind === "image" && (
              <div style={{ maxWidth: 220, width: "70%", aspectRatio: "4 / 3" }}>
                <div className="na-photo-slot" style={{ borderRadius: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={msg.url} alt="Meal photo" />
                </div>
              </div>
            )}

            {msg.kind === "typing" && (
              <div
                style={{
                  background: "var(--color-surface)",
                  padding: "10px 16px",
                  borderRadius: "var(--radius-lg)",
                  display: "flex",
                  gap: 4,
                }}
              >
                {[0, 0.15, 0.3].map((delay) => (
                  <span
                    key={delay}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--color-accent)",
                      display: "inline-block",
                      animation: `na-dot 1.1s ease ${delay}s infinite`,
                    }}
                  />
                ))}
              </div>
            )}

            {msg.kind === "rag" && (
              <div style={{ maxWidth: "82%", display: "flex", flexDirection: "column", gap: 8 }}>
                <div
                  dir="auto"
                  style={{
                    background: "var(--color-surface)",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-lg)",
                    fontSize: 14,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {ragReplyBody(msg.text)}
                </div>
                <div className="chat-source-tags">
                  {msg.sources.slice(0, 4).map((src, idx) => (
                    <SourceTag key={idx} src={src} t={t} />
                  ))}
                </div>
              </div>
            )}

            {msg.kind === "card" && (
              <div className="card elev-sm" style={{ maxWidth: 360, width: "90%" }}>
                <div style={{ marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: 11.5,
                      padding: "6px 14px",
                      borderRadius: 999,
                      background: "var(--color-accent-100)",
                      color: "var(--color-accent-700)",
                    }}
                  >
                    {t("chat.matchPercent", { pct: msg.matchPct })}
                  </span>
                </div>
                <div className="card-title" style={{ marginBottom: 2 }}>
                  {localizeFoodDisplayName(msg.mealName, preferredLanguage) || msg.mealName}
                </div>
                <div style={{ fontSize: 11.5, color: muted(), marginBottom: 10 }}>
                  {t("chat.identifiedFromPhoto")}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
                  {msg.analysis.items.map((item) => (
                    <span
                      key={item.foodType}
                      style={{
                        fontSize: 11.5,
                        whiteSpace: "nowrap",
                        padding: "6px 13px",
                        borderRadius: 999,
                        background: "var(--color-neutral-200)",
                      }}
                    >
                      {localizeFoodDisplayName(item.foodType, preferredLanguage)} · {item.estimatedQuantity}
                    </span>
                  ))}
                </div>
                <NutritionFlower
                  calories={msg.analysis.totalNutrition.calories}
                  goalCalories={goalCalories}
                  macros={macrosOf(msg.analysis.totalNutrition)}
                />
                {msg.recommendation && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                      paddingTop: 12,
                      borderTop: "1px solid var(--color-divider)",
                    }}
                  >
                    <span style={{ color: "var(--color-accent)" }}>✓</span>
                    <span>{msg.recommendation}</span>
                  </div>
                )}
              </div>
            )}

            {msg.kind === "multiModel" && (
              <div style={{ maxWidth: "95%", display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                  dir="auto"
                  style={{
                    background: "var(--color-surface)",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-lg)",
                    fontSize: 14,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {(() => {
                    // Prefer the locale-rendered version so switching language also
                    // updates messages already on screen / restored from history.
                    const localized = localizedMealText(msg, t, preferredLanguage);
                    if (localized) return localized;
                    return (
                      <>
                        {msg.mealDescription ? (
                          <p
                            style={{
                              margin: "0 0 10px",
                              paddingBottom: 10,
                              borderBottom: "1px solid var(--color-divider)",
                              color: "var(--color-text, inherit)",
                            }}
                          >
                            {msg.mealDescription}
                          </p>
                        ) : null}
                        {mealReplyWithoutDescription(msg.text, msg.mealDescription)}
                      </>
                    );
                  })()}
                </div>

                {msg.imageUrl ? (
                  <img
                    src={msg.imageUrl}
                    alt={t("chat.mealPhotoAlt")}
                    style={{
                      maxWidth: 360,
                      width: "100%",
                      borderRadius: "var(--radius-lg)",
                      display: "block",
                    }}
                  />
                ) : null}
                <MultiModelMealCards
                  panels={msg.panels}
                  rerankerScores={msg.rerankerScores}
                  goalCalories={goalCalories}
                  goalProtein={goalProtein}
                  fusionMethod={msg.fusionMethod}
                  fallbackModelLabel={msg.fallbackModelLabel}
                />
                {msg.sources?.length ? (
                  <div className="chat-source-tags">
                    {msg.sources.slice(0, 5).map((src, idx) => (
                      <SourceTag key={idx} src={src} t={t} />
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {msg.kind === "history" && (
              <div style={{ maxWidth: "92%", display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                  dir="auto"
                  style={{
                    background: "var(--color-surface)",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-lg)",
                    fontSize: 14,
                    lineHeight: 1.55,
                  }}
                >
                  {msg.text}
                </div>
                <NutritionHistoryChart data={msg.data} goalCalories={goalCalories} />
                {msg.sources?.length ? (
                  <div className="chat-source-tags">
                    {msg.sources.slice(0, 3).map((src, idx) => (
                      <SourceTag key={idx} src={src} t={t} />
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div
        className="na-chat-composer"
        style={{
          marginTop: "var(--space-3)",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          position: "relative",
        }}
      >
        {/* Fixed 96px attach strip overlays above the composer — no layout shift */}
        <div
          className="na-chat-attach-slot"
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            right: 0,
            height: 96,
            minHeight: 96,
            marginBottom: 8,
            boxSizing: "border-box",
            visibility: file ? "visible" : "hidden",
            pointerEvents: file ? "auto" : "none",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderRadius: "var(--radius-lg)",
            background: "var(--color-accent-100)",
            border: "1px solid var(--color-accent-200, #b7dfc9)",
            zIndex: 2,
          }}
          aria-hidden={!file}
        >
          <div className="na-photo-slot" style={{ width: 96, height: 72, borderRadius: 10, flexShrink: 0 }}>
            {filePreview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={filePreview} alt="Meal preview" width={96} height={72} style={{ width: 96, height: 72, objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", background: "var(--color-neutral-200)" }} />
            )}
          </div>
          {file ? (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  className="tag tag-accent"
                  style={{ fontSize: 14, padding: "8px 14px", display: "inline-block", marginBottom: 4 }}
                >
                  {t("chat.photoReady")}
                </span>
                <div style={{ fontSize: 13, color: muted(), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file.name}
                </div>
              </div>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 13, flexShrink: 0 }} onClick={() => setFile(null)}>
                {t("common.remove")}
              </button>
            </>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["chat.quickReplyEatNow", "chat.quickReplyYesterday"] as const).map((key) => (
            <button
              key={key}
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12.5 }}
              onClick={() => send(t(key))}
              disabled={busy}
            >
              {t(key)}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button
            type="button"
            className="btn btn-primary btn-icon"
            aria-label={t("chat.logMealPhoto")}
            onClick={() => fileRef.current?.click()}
          >
            <CameraIcon />
          </button>
          <input
            className="input"
            placeholder={t("chat.placeholder")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <button
            type="button"
            className="btn btn-primary btn-icon"
            aria-label={t("common.send")}
            onClick={() => send()}
            disabled={busy}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
