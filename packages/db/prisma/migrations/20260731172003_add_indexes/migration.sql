-- DropIndex
DROP INDEX "daily_steps_user_id_date_idx";

-- DropIndex
DROP INDEX "rag_chunks_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "rag_chunks_tsv_gin_idx";

-- AlterTable
ALTER TABLE "daily_steps" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "rag_documents" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "chat_history_meal_id_idx" ON "chat_history"("meal_id");

-- CreateIndex
CREATE INDEX "meal_items_meal_id_idx" ON "meal_items"("meal_id");
