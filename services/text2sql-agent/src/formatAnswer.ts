import { getLlmSettings } from "@nutriagent/db";
import { openRouterChat, resolveResponseLanguage, responseLanguageInstruction } from "@nutriagent/shared";
import { formatHistoryRows, formatStepsRows } from "./formatHistoryRows";
import { matchHistoryTemplate } from "./historyTemplates";

function serializeRowsForPrompt(rows: Record<string, unknown>[]): string {
  const sample = rows.slice(0, 50);
  return JSON.stringify(sample, (_key, value) => {
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Date) return value.toISOString();
    return value;
  });
}

async function polishHistoryAnswer(params: {
  question: string;
  draft: string;
  lang: ReturnType<typeof resolveResponseLanguage>;
  apiKey: string;
  model: string;
}): Promise<string | null> {
  const { question, draft, lang, apiKey, model } = params;
  try {
    const content = await openRouterChat({
      apiKey,
      model,
      maxTokens: 900,
      messages: [
        {
          role: "system",
          content: [
            "You rewrite a meal-history answer for the user.",
            "Keep EVERY fact, calorie number, quantity, and meal count exactly as given.",
            "Do not invent meals or change totals.",
            "Translate ALL meal types (breakfast/lunch/dinner/snack) and ALL food item names into the target language.",
            "If the source text contains languages different from the target language, YOU MUST TRANSLATE all food items and meal types to the target language.",
            "If a food name is a placeholder like Nothing/unknown/no food, OMIT that item — never invent words like empty/nothing.",
            "Keep a clear readable list structure (meals + bullet items + total).",
            "Do not add markdown headings or English leftovers when the target language is not English.",
            responseLanguageInstruction(lang),
          ].join("\n"),
        },
        {
          role: "user",
          content: `User question: ${question}\n\nDraft answer to rewrite fully in the target language:\n${draft}`,
        },
      ],
    });
    return content?.trim() || null;
  } catch {
    return null;
  }
}

export async function formatAnswer(
  question: string,
  rows: Record<string, unknown>[],
  preferredLanguage?: string | null
): Promise<string> {
  const lang = resolveResponseLanguage(question, preferredLanguage);
  const template = matchHistoryTemplate(question);

  // Steps rows have no food names or meal types, so there is nothing for the
  // polish pass to translate and everything for it to hallucinate. The
  // deterministic formatter is already fully localized — ship it as-is.
  if (template?.kind === "steps") {
    return formatStepsRows(rows, lang);
  }

  const draft = formatHistoryRows(rows, lang);

  if (template) {
    const llm = await getLlmSettings();
    const apiKey = llm.openRouterApiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) return draft;
    const polished = await polishHistoryAnswer({
      question,
      draft,
      lang,
      apiKey,
      model: llm.text2sqlModel,
    });
    return polished || draft;
  }

  const llm = await getLlmSettings();
  const apiKey = llm.openRouterApiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) return draft;

  try {
    const content = await openRouterChat({
      apiKey,
      model: llm.text2sqlModel,
      maxTokens: 600,
      messages: [
        {
          role: "system",
          content: [
            "You are a friendly nutrition assistant.",
            "Answer the user's question using ONLY the SQL result rows provided.",
            "Be concise. Include specific numbers (calories, grams, counts) when available.",
            "If rows are empty, say no data was found for that period.",
            "Translate meal types and food names into the response language.",
            responseLanguageInstruction(lang),
          ].join("\n"),
        },
        {
          role: "user",
          content: `Question: ${question}\n\nSQL results (${rows.length} rows):\n${serializeRowsForPrompt(rows)}`,
        },
      ],
    });

    return content?.trim() || draft;
  } catch {
    return draft;
  }
}
