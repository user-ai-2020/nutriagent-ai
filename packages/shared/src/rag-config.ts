// RAG_EMBEDDING_DIMENSIONS must match the `vector(N)` column width in the
// rag_chunks migration (currently vector(1024), see migration
// 20260726210000_rag_documents_chunks). This is NOT safely runtime-configurable:
// changing EMBEDDING_DIMENSIONS or the embedding model here does not resize the
// DB column. Changing the embedding model's output dimension requires a new
// migration (ALTER COLUMN embedding TYPE vector(N)) AND a full re-embed of every
// existing RagChunk row — old and new embeddings are not comparable if dimensions differ.
export const RAG_EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 1024);

/** Multilingual embedding model — same for query + chunk indexing (Task 5). */
export const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ?? "intfloat/multilingual-e5-large";

export const RAG_DOCUMENT_STATUS = {
  PENDING: "pending",
  READY: "ready",
  FAILED: "failed",
} as const;
