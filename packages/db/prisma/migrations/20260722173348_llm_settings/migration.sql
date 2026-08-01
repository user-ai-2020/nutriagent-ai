-- CreateTable
CREATE TABLE "llm_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "open_router_api_key" TEXT,
    "chat_model" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    "vision_model_1" TEXT NOT NULL DEFAULT 'openai/gpt-4o',
    "vision_model_2" TEXT NOT NULL DEFAULT 'google/gemini-flash-1.5',
    "router_model" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    "rag_model" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    "text2sql_model" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    "graphdb_model" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_settings_pkey" PRIMARY KEY ("id")
);
