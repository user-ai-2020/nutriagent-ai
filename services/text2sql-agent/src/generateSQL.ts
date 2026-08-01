import { getCachedLlmSettings } from "@nutriagent/db";
import { openRouterChat } from "@nutriagent/shared";
import { matchHistorySql } from "./historyTemplates";

const SQL_BLOCK_RE = /```(?:sql)?\s*([\s\S]*?)```/i;

export function extractSqlFromLlmResponse(raw: string): string {
  const trimmed = raw.trim();
  const block = trimmed.match(SQL_BLOCK_RE);
  if (block?.[1]) return block[1].trim();
  const selectIdx = trimmed.search(/\bSELECT\b/i);
  if (selectIdx >= 0) return trimmed.slice(selectIdx).replace(/;+\s*$/, "").trim();
  return trimmed.replace(/;+\s*$/, "").trim();
}

export async function generateSQL(question: string, schemaDescription: string): Promise<string> {
  const template = matchHistorySql(question);
  if (template) return template;

  const llm = await getCachedLlmSettings();
  const apiKey = llm.openRouterApiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OpenRouter API key is not configured for Text2SQL");
  }

  try {
    const content = await openRouterChat({
      apiKey,
      model: llm.text2sqlModel,
      maxTokens: 800,
      messages: [
        {
          role: "system",
          content: [
            "You are a PostgreSQL expert for a nutrition tracking app.",
            "Return exactly one SELECT query and nothing else (no explanation).",
            "Use only the tables/columns in the schema below.",
            "Never reference user_id in WHERE — it is added by the server.",
            "Always include LIMIT (max 500).",
            schemaDescription,
          ].join("\n"),
        },
        { role: "user", content: question },
      ],
    });

    if (!content?.trim()) {
      throw new Error("Text2SQL model returned an empty response");
    }

    return extractSqlFromLlmResponse(content);
  } catch (err) {
    const fallback = matchHistorySql(question);
    if (fallback) return fallback;
    throw err;
  }
}
