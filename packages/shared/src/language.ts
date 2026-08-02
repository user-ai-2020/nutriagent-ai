import francModule from "franc-min";

const franc = francModule as unknown as (text: string, options?: { minLength?: number }) => string;

export type ResponseLanguage = "he" | "en" | "ru";

export const SUPPORTED_RESPONSE_LANGUAGES: readonly ResponseLanguage[] = ["he", "en", "ru"] as const;

export function getDefaultResponseLanguage(): ResponseLanguage {
  const env = process.env.DEFAULT_RESPONSE_LANGUAGE?.toLowerCase();
  if (env === "en" || env === "ru" || env === "he") return env;
  return "en";
}

/** Detect he/en/ru from user text; falls back to DEFAULT_RESPONSE_LANGUAGE. */
export function detectTextLanguage(text: string): ResponseLanguage {
  const trimmed = text.trim();
  if (!trimmed) return getDefaultResponseLanguage();

  // Precedence 1: Hebrew script short-circuit — before franc-min
  if (/[\u0590-\u05FF]/.test(trimmed)) return "he";

  // Precedence 2: Cyrillic script short-circuit (Russian) — before franc-min
  if (/[\u0400-\u04FF]/.test(trimmed)) return "ru";

  // Precedence 3: obvious Latin-only text
  if (/^[a-z0-9\s.,!?'"()\-:;]+$/i.test(trimmed) && /[a-z]/i.test(trimmed)) {
    return "en";
  }

  // Precedence 4: franc-min for longer/mixed text without Hebrew/Cyrillic script
  const code = franc(trimmed, { minLength: 3 });
  if (code === "heb") return "he";
  if (code === "rus") return "ru";
  if (code === "eng") return "en";

  return getDefaultResponseLanguage();
}

export function resolveResponseLanguage(
  userText: string,
  profilePreferred?: string | null
): ResponseLanguage {
  const normalized = normalizePreferredLanguage(profilePreferred);
  if (normalized) return normalized;
  return detectTextLanguage(userText);
}

/** Coerce stored/API values to a supported preference, or null if unset/invalid. */
export function normalizePreferredLanguage(value?: string | null): ResponseLanguage | null {
  if (value === "he" || value === "en" || value === "ru") return value;
  return null;
}

export const PREFERRED_LANGUAGE_STORAGE_KEY = "preferredLanguage";

/**
 * System-prompt block for RAG / Text2SQL / Nutrition answer agents.
 * Strong MUST-only language enforcement (Task language hardening).
 */
export function responseLanguageInstruction(lang: ResponseLanguage): string {
  if (lang === "he") {
    return (
      "CRITICAL LANGUAGE RULE: You MUST respond ONLY in Hebrew (עברית). " +
      "Do not mix languages, regardless of the source content language. " +
      "YOU MUST TRANSLATE all meal types and food names into Hebrew. " +
      "ענה תמיד בעברית תקינה בלבד, גם אם המקורות/הקונטקסט באנגלית, רוסית או כל שפה אחרת. " +
      "תרגם מונחים תזונתיים/רפואיים לעברית מקובלת, ושמור שמות מדעיים/מספרים כפי שהם."
    );
  }
  if (lang === "ru") {
    return (
      "CRITICAL LANGUAGE RULE: You MUST respond ONLY in Russian (русский язык). " +
      "Do not mix languages, regardless of the source content language. " +
      "YOU MUST TRANSLATE all meal types and food names into Russian. " +
      "Всегда отвечай только на русском языке, даже если источники на английском, иврите или любом другом языке. " +
      "Переводи термины питания/медицины на русский; числа и научные названия оставляй как есть. " +
      // Machine-translated replies were coming back with agreement errors
      // (e.g. «сбалансированное перекус» instead of «сбалансированный перекус»).
      "Пиши грамматически правильно: соблюдай род, число и падеж, согласуй прилагательные с существительными. " +
      "Формулируй естественно, как носитель языка, а не дословным переводом с английского."
    );
  }
  return (
    "CRITICAL LANGUAGE RULE: You MUST respond ONLY in English. " +
    "Do not mix languages, regardless of the source content language. " +
    "Always respond in clear English only. " +
    "If sources are in Hebrew, Russian, Bulgarian, or any other language, YOU MUST TRANSLATE all meal types and food names into English."
  );
}
