/** Max web-fallback iterations per question (spec 4.4). */
export const MAX_FALLBACK_ROUNDS = 2;

/** Skip re-fetch when an existing RagDocument is newer than this many days (spec 4.4). */
export const RAG_CACHE_DAYS = Number(process.env.RAG_CACHE_DAYS || 7);

/** Per-domain scrape/search budget (spec 4.4). */
export const SCRAPE_RATE_LIMIT_PER_MINUTE = Number(process.env.RAG_SCRAPE_RATE_LIMIT_PER_MIN || 10);

/** Wall-clock cap for a full /query pipeline (LLM + search + scrape + re-search). */
export const RAG_PIPELINE_TIMEOUT_MS = Number(process.env.RAG_PIPELINE_TIMEOUT_MS || 90_000);

/** Per HTTP fetch during scrape/search (single URL). */
export const RAG_FETCH_TIMEOUT_MS = Number(process.env.RAG_FETCH_TIMEOUT_MS || 15_000);

export const CHUNK_TARGET_TOKENS = 400;
export const CHUNK_OVERLAP_TOKENS = 50;

/** Rough chars-per-token for Latin/Hebrew mixed text (checkpoint 4 may refine). */
export const CHARS_PER_TOKEN_ESTIMATE = 4;

export const WEAK_MATCH_DISCLAIMER =
  "לא נמצא מקור מהימן מספיק, הנה המידע הקרוב ביותר שנמצא";
