import { openRouterChat, isClearlyOutOfScope } from "@nutriagent/shared";

export async function extractSearchKeywords(
  question: string,
  apiKey?: string | null,
  model?: string
): Promise<string> {
  if (isClearlyOutOfScope(question)) return "NONE";
  const content = await openRouterChat({
    apiKey,
    model,
    maxTokens: 120,
    messages: [
      {
        role: "system",
        content:
          "Extract 3-6 concise English search keywords for nutrition/health web search. " +
          "If the question is unrelated to nutrition, diet, food, fitness, or health, reply with the single word NONE. " +
          "If the question is in Hebrew, translate concepts to English for search. " +
          "Reply with keywords only, comma-separated, no punctuation elsewhere.",
      },
      { role: "user", content: question },
    ],
  });

  const keywords = (content ?? question)
    .replace(/\n/g, " ")
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");

  return keywords || question.slice(0, 120);
}
