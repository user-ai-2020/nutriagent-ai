import { prisma } from "@nutriagent/db";
import { CitationSource, MealImageInput, MultiModelMealAnalysis, VisionAnalyzeResponse, VisionFoodItem, ChatIntent } from "@nutriagent/shared";

export const VISION_URL = process.env.VISION_AGENT_URL || "http://localhost:3002";
export const NUTRITION_URL = process.env.NUTRITION_AGENT_URL || "http://localhost:3003";
export const RAG_URL = process.env.RAG_AGENT_URL || "http://localhost:3004";
export const TEXT2SQL_URL = process.env.TEXT2SQL_AGENT_URL || "http://localhost:3005";
export const GRAPHDB_URL = process.env.GRAPHDB_AGENT_URL || "http://localhost:3006";

export const CHAT_AGENT_TIMEOUT_MS = Number(process.env.CHAT_AGENT_TIMEOUT_MS || 15_000);

/** Keep citation pills to short titles — never full RAG article bodies. */
export function citationLabel(raw: CitationSource): string {
  if (!raw) return "";
  if (typeof raw === "object") return (raw as any).title || "";
  let trimmed = String(raw).trim();
  if (trimmed.startsWith("http")) return trimmed.split("/")[2] ?? trimmed;
  const sep = trimmed.indexOf(": ");
  if (sep > 0 && sep < 160 && trimmed.length - sep > 100) {
    return trimmed.slice(0, sep);
  }
  if (trimmed.length > 160) return `${trimmed.slice(0, 157)}…`;
  return trimmed;
}

export function uniqueCitationSources(labels: CitationSource[]): CitationSource[] {
  const seen = new Set<string>();
  const out: CitationSource[] = [];
  for (const raw of labels) {
    if (typeof raw === "object") {
      const label = raw.title;
      if (!label || seen.has(label)) continue;
      seen.add(label);
      out.push(raw);
    } else {
      const label = citationLabel(raw);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

export function rerankerPanelLabel(visionResult: VisionAnalyzeResponse): string {
  const model = visionResult.rerankModel ?? "cohere/rerank-4-fast";
  switch (visionResult.fusionMethod) {
    case "single_model_only":
      return `Reranker consensus (${model})`;
    case "single_model_fallback":
      return `Consensus unavailable — showing ${visionResult.fallbackModelLabel ?? "one model"}`;
    case "cluster_no_rerank":
      return "Reranker result (Cohere unavailable)";
    case "empty_pool_fallback":
      return "Best available result — limited model data";
    default:
      return `Reranker consensus (${model})`;
  }
}

export async function callAgentWithTimeout<T>(
  url: string,
  body: unknown,
  timeoutMs: number,
  maxRetries = 2
): Promise<T> {
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response | undefined;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`${url}: [${res.status}] ${await res.text()}`);
      }
      return await (res.json() as Promise<T>);
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      const is5xx = res && res.status >= 500 && res.status < 600;
      const isNetworkError = !res && !isTimeout;
      
      if (attempt < maxRetries && (isTimeout || is5xx || isNetworkError)) {
        attempt++;
        const backoff = Math.pow(2, attempt) * 500;
        console.warn(`[Retry ${attempt}/${maxRetries}] ${url} failed. Retrying in ${backoff}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      
      if (isTimeout) {
        throw new Error(`${url}: timed out after ${timeoutMs}ms (attempted ${attempt + 1} times)`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Intent Routing Priority:
 * 1. Vision (meal_analysis): Triggers if an image is attached.
 * 2. Text2SQL (history_query): Triggers on personal history/logs (e.g. "how many calories did I eat").
 *    Takes precedence over generic factual queries to avoid misrouting personal queries.
 * 3. Question (question): Objective fact-lookup (e.g. "what is keto diet", "how many calories in apple").
 * 4. General Chat (general_chat): Fallback for subjective advice, recommendations, or greetings.
 */
export function classifyIntent(message: string, hasImage: boolean): ChatIntent {
  const lower = message.toLowerCase();
  if (hasImage) return "meal_analysis"; // 1. Vision

  // 2. Text2SQL (History query - checking personal logs)
  if (
    lower.includes("history") ||
    lower.includes("average") ||
    lower.includes("היום") ||
    lower.includes("שבוע") ||
    lower.includes("אכלתי") ||
    lower.includes("אתמול") ||
    lower.includes("yesterday") ||
    lower.includes("today") ||
    lower.includes("вчера") ||
    lower.includes("сегодня") ||
    lower.includes("история") ||
    lower.includes("статистика") ||
    lower.includes("ел ") ||
    lower.includes("ела ") ||
    (lower.includes("how many") && (lower.includes("i ") || lower.includes("my "))) ||
    (lower.includes("כמה") && lower.includes("אכלתי")) ||
    (lower.includes("сколько") && lower.includes("я")) ||
    lower.includes("did i eat") ||
    lower.includes("have i eaten") ||
    lower.includes("violate my allerg") ||
    lower.includes("my diet compliant") ||
    lower.includes("did i consume") ||
    lower.includes("אכלתי משהו עם") ||
    lower.includes("האם אכלתי") ||
    lower.includes("я ел что-то") ||
    lower.includes("я ела что-то") ||
    lower.includes("between") ||
    lower.includes("from ")
  ) {
    return "history_query";
  }

  // 3. Question (Objective fact lookup)
  // Re-ordered before General Chat, with stricter keywords
  if (
    lower.includes("what is") ||
    (lower.includes("how many") && lower.includes("calories in")) ||
    (lower.includes("protein in")) ||
    (lower.includes("מה זה")) ||
    (lower.includes("כמה קלוריות ב")) ||
    (lower.includes("כמה חלבון ב")) ||
    (lower.includes("что такое")) ||
    (lower.includes("сколько калорий в")) ||
    (lower.includes("калорий в")) ||
    (lower.includes("what is") && lower.includes("diet")) ||
    (lower.includes("symptoms")) ||
    (lower.includes("allergy") && !lower.includes("my ")) ||
    (lower.includes("אלרגיה")) ||
    (lower.includes("аллергия")) ||
    (lower.includes("disease")) ||
    (lower.includes("מחלה")) ||
    (lower.includes("болезнь"))
  ) {
    return "question";
  }

  // 4. General Chat / Advice (Subjective, Recommendations, Fallback)
  return "general_chat";
}

/**
 * Determines whether a question's answer can be cached globally (userId = null)
 * or must be scoped to the individual user (userId = <actual id>).
 *
 * SAFER-BY-DEFAULT: we do NOT assume a query is non-personal unless it contains
 * a personal pronoun. Instead we ONLY set userId=null when the query clearly
 * matches one of the objective-fact patterns below. Everything else defaults to
 * user-scoped, trading some cache-hit rate for a real privacy guarantee.
 *
 * Why this matters: substring checks like includes("my") or includes("i ") have
 * false negatives — e.g. "our family has a history of diabetes" is clearly
 * personal/medical context but contains neither "my" nor "i ". Under the old
 * heuristic those answers would have been cached as globally readable.
 *
 * Allowlist patterns (objective facts, safe to cache globally):
 *  - Nutrient-in-food queries: "how many calories in X", "protein in X"
 *  - Diet-definition lookups: "what is a keto diet"
 *  - General medical fact lookups: "what causes X", "what are the symptoms of X"
 *  - Plain what-is lookups with no personal/family/third-person pronoun
 *
 * Personal-context signals that always force user-scoped:
 *  - First-person pronouns (my, I, our, we, me, us, mine)
 *  - Third-person pronouns (his, her, their, he's, she's, they're)
 *    — catches e.g. "what is his cholesterol level", "what is her blood type"
 *  - Possessive proper-noun pattern (apostrophe-s: "bob's", "john's")
 *    — catches named-individual queries before they reach the allowlist
 *  - Family/relational nouns (family, kid, child, children, son, daughter,
 *    husband, wife, partner, baby, infant)
 */
export function isObjectiveFact(message: string): boolean {
  // Fast-reject: any personal, third-person, or family signal → always user-scoped
  const personalSignals =
    /\b(my|our|we|me|us|mine|his|her|their|he's|she's|they're|family|kid|child|children|son|daughter|husband|wife|partner|baby|infant)\b|\bI\b|'s\s+\w/i;
  if (personalSignals.test(message)) return false;

  const lower = message.toLowerCase();

  // Objective allowlist — only these patterns qualify for global (userId=null) caching
  const objectivePatterns: RegExp[] = [
    // Nutrient-in-food: "how many calories in an apple", "how much protein in chicken"
    /^(how many|how much)\s+.+\s+(calorie|protein|carb|fat|sugar|fibre|fiber|vitamin|mineral)/i,
    // Calories/macros in something: "calories in avocado", "protein in lentils"
    /\b(calories|protein|carbs|fat|sugar|fibre|fiber)\s+in\b/i,
    // Diet definition: "what is a keto diet", "what is the mediterranean diet"
    /^what\s+is\s+(a|an|the)\s+.+\s+diet\b/i,
    // General what-is (generic concept): "what is diabetes", "what is gluten"
    // NOTE: personalSignals above pre-rejects third-person forms like "what is his X"
    // and possessives like "what is bob's X" before this pattern is ever reached.
    /^what\s+is\s+(a|an|the)?\s*[a-z]/i,
    // What causes / symptoms of: "what causes celiac disease", "what are the symptoms of X"
    /^what\s+(causes|are\s+the\s+symptoms\s+of|is\s+the\s+treatment\s+for)/i,
    // How many X in Y (generic): "how many grams of sugar in a banana"
    /^how\s+many\s+/i,
  ];

  return objectivePatterns.some((re) => re.test(lower));
}

export function inferMealType(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 22) return "dinner";
  return "snack";
}

export async function saveMeal(
  userId: number,
  items: Array<VisionFoodItem & { nutrition: { calories: number; protein: number; fat: number; carbs: number; sugar: number } }>,
  imageUrl?: string,
  mealImage?: MealImageInput,
  visionModelVersion?: string
): Promise<number> {
  const mealDatetime = new Date();
  const meal = await prisma.meal.create({
    data: {
      userId,
      mealDatetime,
      mealType: inferMealType(mealDatetime),
      source: "home",
      imageUrl,
      items: {
        create: items.map((item) => ({
          foodType: item.foodType,
          estimatedQuantity: item.estimatedQuantity,
          visionConfidence: item.visionConfidence,
          nutritionValues: {
            create: item.nutrition,
          },
        })),
      },
      ...(mealImage
        ? {
            images: {
              create: {
                id: mealImage.id,
                userId,
                storageKey: mealImage.storageKey,
                width: mealImage.width,
                height: mealImage.height,
                fileSizeBytes: mealImage.fileSizeBytes,
                contentHash: mealImage.contentHash,
                capturedAt: new Date(mealImage.capturedAt),
                recognizedAt: new Date(),
                visionModelVersion,
              },
            },
          }
        : {}),
    },
  });
  return meal.mealId;
}
