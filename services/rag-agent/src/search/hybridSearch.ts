import { RAG_EMBEDDING_DIMENSIONS } from "@nutriagent/shared";

/** RRF smoothing constant (spec 4.0) — used for ranking only, not matchScore. */
export const RRF_K = 60;

/** Gate for checkpoint 3 fallback loop (spec 4.1). */
export const MATCH_SCORE_THRESHOLD = 80;

export const HYBRID_SEARCH_DEFAULT_LIMIT = 10;
export const HYBRID_SEARCH_CANDIDATE_LIMIT = 50;

/** Blend weights — used in docs; fusion uses complementary OR (see computeMatchScore). */
export const MATCH_VECTOR_WEIGHT = 0.6;
export const MATCH_KEYWORD_WEIGHT = 0.4;

/**
 * ts_rank at this value maps to a 100% keyword component (before blending).
 * Typical strong FTS hits land ~0.1–0.4 with `simple` config.
 */
export const KEYWORD_RANK_SATURATION = 0.25;

export interface HybridSearchHit {
  chunkId: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  rrfScore: number;
  vectorSimilarity: number;
  keywordScore: number;
  matchScore: number;
  title: string;
  sourceUrl: string;
  sourceDomain: string;
  publishedDate: Date | null;
  fetchedAt: Date;
}

export interface HybridSearchOptions {
  queryText: string;
  queryEmbedding: number[];
  limit?: number;
  candidateLimit?: number;
}

export function formatEmbeddingVector(values: number[]): string {
  if (values.length !== RAG_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding length ${values.length} does not match RAG_EMBEDDING_DIMENSIONS (${RAG_EMBEDDING_DIMENSIONS})`
    );
  }
  return `[${values.join(",")}]`;
}

export function assertEmbeddingDimensions(values: number[]): void {
  if (values.length !== RAG_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Query embedding has ${values.length} dimensions; DB column is vector(${RAG_EMBEDDING_DIMENSIONS})`
    );
  }
}

/** Normalize raw ts_rank to 0–1 (absolute keyword strength, not rank position). */
export function normalizeKeywordScore(keywordScore: number): number {
  if (keywordScore <= 0) return 0;
  return Math.min(1, keywordScore / KEYWORD_RANK_SATURATION);
}

/**
 * matchScore (0–100) from absolute signals returned by Postgres — not from RRF rank.
 * Uses complementary OR fusion: 1 - (1-v)(1-k), so a strong vector hit is not dragged
 * down by a weak ts_rank, but a genuine dual-strong hit still reaches ~100%.
 */
export function computeMatchScore(vectorSimilarity: number, keywordScore: number): number {
  const v = Math.min(1, Math.max(0, vectorSimilarity));
  const k = normalizeKeywordScore(keywordScore);
  const fused = 1 - (1 - v) * (1 - k);
  return Math.min(100, Math.max(0, fused * 100));
}

interface HybridSearchRow {
  chunk_id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  rrf_score: number | string;
  vector_similarity: number | string;
  keyword_score: number | string;
  title: string;
  source_url: string;
  source_domain: string;
  published_date: Date | null;
  fetched_at: Date;
}

export async function hybridSearch(
  prisma: { $queryRawUnsafe: <T>(query: string, ...values: unknown[]) => Promise<T> },
  options: HybridSearchOptions
): Promise<HybridSearchHit[]> {
  const { queryText, queryEmbedding } = options;
  const limit = options.limit ?? HYBRID_SEARCH_DEFAULT_LIMIT;
  const candidateLimit = options.candidateLimit ?? HYBRID_SEARCH_CANDIDATE_LIMIT;

  assertEmbeddingDimensions(queryEmbedding);
  const embeddingLiteral = formatEmbeddingVector(queryEmbedding);

  const rows = await prisma.$queryRawUnsafe<HybridSearchRow[]>(
    `
    WITH vector_ranked AS (
      SELECT
        c.id,
        RANK() OVER (ORDER BY c.embedding <=> $1::vector) AS rank,
        1 - (c.embedding <=> $1::vector) AS vector_similarity
      FROM rag_chunks c
      INNER JOIN rag_documents d ON d.id = c.document_id AND d.status = 'ready'
      ORDER BY c.embedding <=> $1::vector
      LIMIT $3
    ),
    keyword_ranked AS (
      SELECT
        c.id,
        RANK() OVER (
          ORDER BY ts_rank(c.tsv, plainto_tsquery('simple', $2)) DESC
        ) AS rank,
        ts_rank(c.tsv, plainto_tsquery('simple', $2)) AS keyword_score
      FROM rag_chunks c
      INNER JOIN rag_documents d ON d.id = c.document_id AND d.status = 'ready'
      WHERE c.tsv @@ plainto_tsquery('simple', $2)
      ORDER BY ts_rank(c.tsv, plainto_tsquery('simple', $2)) DESC
      LIMIT $3
    ),
    rrf AS (
      SELECT
        COALESCE(v.id, k.id) AS chunk_id,
        COALESCE(1.0 / ($4 + v.rank), 0) + COALESCE(1.0 / ($4 + k.rank), 0) AS rrf_score,
        COALESCE(v.vector_similarity, 0) AS vector_similarity,
        COALESCE(k.keyword_score, 0) AS keyword_score
      FROM vector_ranked v
      FULL OUTER JOIN keyword_ranked k ON v.id = k.id
    )
    SELECT
      r.chunk_id,
      r.rrf_score,
      r.vector_similarity,
      r.keyword_score,
      c.document_id,
      c.content,
      c.chunk_index,
      d.title,
      d.source_url,
      d.source_domain,
      d.published_date,
      d.fetched_at
    FROM rrf r
    INNER JOIN rag_chunks c ON c.id = r.chunk_id
    INNER JOIN rag_documents d ON d.id = c.document_id
    ORDER BY r.rrf_score DESC
    LIMIT $5
    `,
    embeddingLiteral,
    queryText,
    candidateLimit,
    RRF_K,
    limit
  );

  return rows.map((row) => {
    const rrfScore = Number(row.rrf_score);
    const vectorSimilarity = Number(row.vector_similarity);
    const keywordScore = Number(row.keyword_score);
    return {
      chunkId: row.chunk_id,
      documentId: row.document_id,
      content: row.content,
      chunkIndex: row.chunk_index,
      rrfScore,
      vectorSimilarity,
      keywordScore,
      matchScore: computeMatchScore(vectorSimilarity, keywordScore),
      title: row.title,
      sourceUrl: row.source_url,
      sourceDomain: row.source_domain,
      publishedDate: row.published_date,
      fetchedAt: row.fetched_at,
    };
  });
}
