-- RagDocument / RagChunk (Task 4.0) — pgvector already enabled in init migration

CREATE TABLE "rag_documents" (
    "id" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_domain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "published_date" TIMESTAMP(3),
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT,
    "raw_text_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rag_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rag_documents_raw_text_hash_key" ON "rag_documents"("raw_text_hash");
CREATE INDEX "rag_documents_source_domain_idx" ON "rag_documents"("source_domain");
CREATE INDEX "rag_documents_status_idx" ON "rag_documents"("status");

CREATE TABLE "rag_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "tsv" tsvector,
    "chunk_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rag_chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rag_chunks_document_id_idx" ON "rag_chunks"("document_id");

-- ANN index for cosine similarity (pgvector ≥0.5 / pg16 image)
CREATE INDEX "rag_chunks_embedding_hnsw_idx" ON "rag_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- Full-text keyword search (Hebrew: simple config + trigger; Task 5)
CREATE INDEX "rag_chunks_tsv_gin_idx" ON "rag_chunks" USING gin ("tsv");

ALTER TABLE "rag_chunks" ADD CONSTRAINT "rag_chunks_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "rag_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep tsv in sync with content (simple tokenizer — Hebrew-safe baseline for Task 5)
CREATE OR REPLACE FUNCTION rag_chunks_tsv_update() RETURNS trigger AS $$
BEGIN
    NEW.tsv := to_tsvector('simple', COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rag_chunks_tsv_trigger
    BEFORE INSERT OR UPDATE OF "content" ON "rag_chunks"
    FOR EACH ROW EXECUTE FUNCTION rag_chunks_tsv_update();
