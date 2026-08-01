export interface LlmConfig {
  openRouterApiKey?: string | null;
  chatModel: string;
  visionModel1: string;
  visionModel2: string;
  routerModel: string;
  ragModel: string;
  text2sqlModel: string;
  graphdbModel: string;
}

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  openRouterApiKey: null,
  chatModel: "openai/gpt-4o-mini",
  visionModel1: "google/gemini-2.5-flash",
  visionModel2: "google/gemini-2.5-flash",
  routerModel: "openai/gpt-4o-mini",
  ragModel: "openai/gpt-4o-mini",
  text2sqlModel: "openai/gpt-4o-mini",
  graphdbModel: "openai/gpt-4o-mini",
};

/** Catalog of selectable OpenRouter models for the Admin LLM sheet */
export const LLM_MODEL_CATALOG = {
  chat: [
    { id: "openai/gpt-4o-mini", label: "GPT-4o Mini (cheap)", provider: "OpenAI" },
    { id: "openai/gpt-4o", label: "GPT-4o", provider: "OpenAI" },
    { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", provider: "Google" },
    { id: "google/gemini-flash-1.5", label: "Gemini Flash 1.5 (cheap)", provider: "Google" },
    { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", provider: "Anthropic" },
    { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", provider: "Meta" },
  ],
  vision: [
    { id: "openai/gpt-4o", label: "GPT-4o Vision", provider: "OpenAI" },
    { id: "openai/gpt-4o-mini", label: "GPT-4o Mini Vision (cheap)", provider: "OpenAI" },
    { id: "google/gemini-flash-1.5", label: "Gemini Flash 1.5 Vision (cheap)", provider: "Google" },
    { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash Vision", provider: "Google" },
    { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet Vision", provider: "Anthropic" },
  ],
  /** Cheap router / orchestration models — GPT + Gemini focused */
  router: [
    { id: "openai/gpt-4o-mini", label: "GPT-4o Mini (cheap)", provider: "OpenAI" },
    { id: "openai/gpt-3.5-turbo", label: "GPT-3.5 Turbo (cheap)", provider: "OpenAI" },
    { id: "google/gemini-flash-1.5", label: "Gemini Flash 1.5 (cheap)", provider: "Google" },
    { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash (cheap)", provider: "Google" },
  ],
  rag: [
    { id: "openai/gpt-4o-mini", label: "GPT-4o Mini (cheap)", provider: "OpenAI" },
    { id: "google/gemini-flash-1.5", label: "Gemini Flash 1.5 (cheap)", provider: "Google" },
    { id: "openai/gpt-4o", label: "GPT-4o", provider: "OpenAI" },
    { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", provider: "Google" },
  ],
  text2sql: [
    { id: "openai/gpt-4o-mini", label: "GPT-4o Mini (cheap)", provider: "OpenAI" },
    { id: "google/gemini-flash-1.5", label: "Gemini Flash 1.5 (cheap)", provider: "Google" },
    { id: "openai/gpt-4o", label: "GPT-4o", provider: "OpenAI" },
    { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", provider: "Google" },
  ],
  graphdb: [
    { id: "openai/gpt-4o-mini", label: "GPT-4o Mini (cheap)", provider: "OpenAI" },
    { id: "google/gemini-flash-1.5", label: "Gemini Flash 1.5 (cheap)", provider: "Google" },
    { id: "openai/gpt-4o", label: "GPT-4o", provider: "OpenAI" },
    { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", provider: "Google" },
  ],
} as const;
