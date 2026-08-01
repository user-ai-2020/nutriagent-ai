import { VisionFoodItem } from "./types";

function normalizeItems(raw: unknown[]): VisionFoodItem[] {
  return raw.map((entry) => {
    const item = entry as Record<string, unknown>;
    return {
      foodType: String(item.foodType ?? item.name ?? item.food ?? "Unknown"),
      estimatedQuantity: String(item.estimatedQuantity ?? item.quantity ?? "100g"),
      visionConfidence: Math.min(1, Math.max(0, Number(item.visionConfidence ?? item.confidence) || 0.7)),
    };
  });
}

/** Best-effort parse for vision model JSON (handles markdown fences and truncated arrays). */
export function parseVisionJson(content: string): VisionFoodItem[] {
  let cleaned = content.replace(/```json\n?|\n?```/g, "").trim();

  const attempts = [
    cleaned,
    cleaned.slice(cleaned.indexOf("[")),
    cleaned.slice(cleaned.indexOf("[")).replace(/,\s*\{[^}]*$/, ""),
  ];

  for (let attempt of attempts) {
    if (!attempt.includes("[")) continue;
    if (!attempt.endsWith("]")) attempt = `${attempt}]`;
    try {
      const parsed = JSON.parse(attempt) as unknown;
      if (Array.isArray(parsed) && parsed.length) return normalizeItems(parsed);
    } catch {
      /* try next */
    }
  }

  const objectMatches = [...cleaned.matchAll(/\{[^{}]*"foodType"[^{}]*\}/g)];
  if (objectMatches.length) {
    try {
      return normalizeItems(objectMatches.map((m) => JSON.parse(m[0])));
    } catch {
      /* fall through */
    }
  }

  throw new Error("Vision model returned invalid JSON — could not extract food items.");
}
