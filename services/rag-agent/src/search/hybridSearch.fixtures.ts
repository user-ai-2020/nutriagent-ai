import { prisma } from "@nutriagent/db";
import { RAG_DOCUMENT_STATUS, RAG_EMBEDDING_DIMENSIONS } from "@nutriagent/shared";
import { formatEmbeddingVector } from "./hybridSearch.js";

export const HYBRID_TEST_PREFIX = "hybrid-test-";

/** Unit vector along dimension 0 — baseline for similarity tests. */
export function basisVector(primary = 1, secondary = 0): number[] {
  const v = new Array(RAG_EMBEDDING_DIMENSIONS).fill(0);
  v[0] = primary;
  if (RAG_EMBEDDING_DIMENSIONS > 1) v[1] = secondary;
  return v;
}

export async function seedHybridTestChunks(): Promise<{
  proteinChunkId: string;
  stepsChunkId: string;
  pendingChunkId: string;
}> {
  await clearHybridTestChunks();

  const proteinDocId = `${HYBRID_TEST_PREFIX}doc-protein`;
  const stepsDocId = `${HYBRID_TEST_PREFIX}doc-steps`;
  const pendingDocId = `${HYBRID_TEST_PREFIX}doc-pending`;

  await prisma.ragDocument.createMany({
    data: [
      {
        id: proteinDocId,
        sourceUrl: "https://example.com/protein",
        sourceDomain: "example.com",
        title: "Daily protein intake guidelines",
        rawTextHash: `${HYBRID_TEST_PREFIX}hash-protein`,
        status: RAG_DOCUMENT_STATUS.READY,
      },
      {
        id: stepsDocId,
        sourceUrl: "https://example.com/steps",
        sourceDomain: "example.com",
        title: "Walking and daily steps",
        rawTextHash: `${HYBRID_TEST_PREFIX}hash-steps`,
        status: RAG_DOCUMENT_STATUS.READY,
      },
      {
        id: pendingDocId,
        sourceUrl: "https://example.com/pending",
        sourceDomain: "example.com",
        title: "Pending protein draft",
        rawTextHash: `${HYBRID_TEST_PREFIX}hash-pending`,
        status: RAG_DOCUMENT_STATUS.PENDING,
      },
    ],
  });

  const proteinChunkId = `${HYBRID_TEST_PREFIX}chunk-protein`;
  const stepsChunkId = `${HYBRID_TEST_PREFIX}chunk-steps`;
  const pendingChunkId = `${HYBRID_TEST_PREFIX}chunk-pending`;

  const proteinEmbedding = formatEmbeddingVector(basisVector(1, 0));
  const stepsEmbedding = formatEmbeddingVector(basisVector(0, 1));
  const pendingEmbedding = formatEmbeddingVector(basisVector(1, 0));

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO rag_chunks (id, document_id, content, embedding, chunk_index)
    VALUES
      ($1, $2, $3, $4::vector, 0),
      ($5, $6, $7, $8::vector, 0),
      ($9, $10, $11, $12::vector, 0)
    `,
    proteinChunkId,
    proteinDocId,
    "Adults should aim for adequate daily protein intake from lean sources.",
    proteinEmbedding,
    stepsChunkId,
    stepsDocId,
    "Ten thousand daily steps supports cardiovascular health.",
    stepsEmbedding,
    pendingChunkId,
    pendingDocId,
    "Draft protein guidance awaiting review.",
    pendingEmbedding
  );

  return { proteinChunkId, stepsChunkId, pendingChunkId };
}

export async function seedHebrewProteinChunk(): Promise<{ chunkId: string }> {
  await clearHybridTestChunks();

  const docId = `${HYBRID_TEST_PREFIX}doc-hebrew`;
  await prisma.ragDocument.create({
    data: {
      id: docId,
      sourceUrl: "https://example.com/he-protein",
      sourceDomain: "example.com",
      title: "המלצות צריכת חלבון יומית",
      rawTextHash: `${HYBRID_TEST_PREFIX}hash-hebrew`,
      status: RAG_DOCUMENT_STATUS.READY,
    },
  });

  const chunkId = `${HYBRID_TEST_PREFIX}chunk-hebrew`;
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO rag_chunks (id, document_id, content, embedding, chunk_index)
    VALUES ($1, $2, $3, $4::vector, 0)
    `,
    chunkId,
    docId,
    "מבוגרים צריכים לצרוך מספיק חלבון ממקורות רזים בכל יום.",
    formatEmbeddingVector(basisVector(1, 0))
  );

  return { chunkId };
}

export async function clearHybridTestChunks(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM rag_chunks WHERE id LIKE $1`,
    `${HYBRID_TEST_PREFIX}%`
  );
  await prisma.ragDocument.deleteMany({
    where: { id: { startsWith: HYBRID_TEST_PREFIX } },
  });
}

/** Single ready doc for thin-KB weak-match tests (no keyword overlap, low cosine sim). */
export async function seedSingleIrrelevantReadyDoc(): Promise<void> {
  await clearHybridTestChunks();

  const docId = `${HYBRID_TEST_PREFIX}doc-alone`;
  await prisma.ragDocument.create({
    data: {
      id: docId,
      sourceUrl: "https://example.com/steps-only",
      sourceDomain: "example.com",
      title: "Walking and daily steps",
      rawTextHash: `${HYBRID_TEST_PREFIX}hash-alone`,
      status: RAG_DOCUMENT_STATUS.READY,
    },
  });

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO rag_chunks (id, document_id, content, embedding, chunk_index)
    VALUES ($1, $2, $3, $4::vector, 0)
    `,
    `${HYBRID_TEST_PREFIX}chunk-alone`,
    docId,
    "Ten thousand daily steps supports cardiovascular health.",
    formatEmbeddingVector(basisVector(0, 1))
  );
}
