import { prisma } from "./client";
import { DEFAULT_LLM_CONFIG, LlmConfig, resolveAiStatus, type AiStatus } from "@nutriagent/shared";

export async function ensureLlmSettings(): Promise<LlmConfig> {
  const row = await prisma.llmSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      openRouterApiKey: process.env.OPENROUTER_API_KEY || null,
      chatModel: process.env.OPENROUTER_MODEL || DEFAULT_LLM_CONFIG.chatModel,
      visionModel1: process.env.OPENROUTER_VISION_MODEL || DEFAULT_LLM_CONFIG.visionModel1,
      visionModel2: DEFAULT_LLM_CONFIG.visionModel2,
      routerModel: DEFAULT_LLM_CONFIG.routerModel,
      ragModel: DEFAULT_LLM_CONFIG.ragModel,
      text2sqlModel: DEFAULT_LLM_CONFIG.text2sqlModel,
      graphdbModel: DEFAULT_LLM_CONFIG.graphdbModel,
    },
  });

  return {
    openRouterApiKey: resolveOpenRouterApiKey(row.openRouterApiKey),
    chatModel: row.chatModel,
    visionModel1: row.visionModel1,
    visionModel2: row.visionModel2,
    routerModel: row.routerModel,
    ragModel: row.ragModel,
    text2sqlModel: row.text2sqlModel,
    graphdbModel: row.graphdbModel,
  };
}

/** Env wins when set — keeps Docker `.env` updates effective without Admin UI re-save. */
function resolveOpenRouterApiKey(stored: string | null | undefined): string | null {
  const envKey = process.env.OPENROUTER_API_KEY?.trim();
  if (envKey) return envKey;
  return stored ?? null;
}

export async function getLlmSettings(): Promise<LlmConfig> {
  const row = await prisma.llmSettings.findUnique({ where: { id: 1 } });
  if (!row) return ensureLlmSettings();
  return {
    openRouterApiKey: resolveOpenRouterApiKey(row.openRouterApiKey),
    chatModel: row.chatModel,
    visionModel1: row.visionModel1,
    visionModel2: row.visionModel2,
    routerModel: row.routerModel,
    ragModel: row.ragModel,
    text2sqlModel: row.text2sqlModel,
    graphdbModel: row.graphdbModel,
  };
}

export function maskApiKey(key: string | null | undefined): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

let _llmCache: { data: LlmConfig; ts: number } | null = null;
const LLM_SETTINGS_TTL_MS = 60_000;

export async function getCachedLlmSettings(): Promise<LlmConfig> {
  if (_llmCache && Date.now() - _llmCache.ts < LLM_SETTINGS_TTL_MS) return _llmCache.data;
  const data = await getLlmSettings();
  _llmCache = { data, ts: Date.now() };
  return data;
}

export async function getAiStatus(): Promise<AiStatus> {
  const row = await prisma.llmSettings.findUnique({ where: { id: 1 } });
  return resolveAiStatus({
    envKey: process.env.OPENROUTER_API_KEY,
    storedKey: row?.openRouterApiKey,
  });
}
