import { EMBEDDING_MODEL, openRouterEmbed, RAG_EMBEDDING_DIMENSIONS } from "@nutriagent/shared";

export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export function createOpenRouterEmbedder(apiKey?: string | null): EmbedFn {
  return async (texts: string[]) => {
    if (texts.length === 0) return [];
    const vectors = await openRouterEmbed({
      input: texts,
      model: EMBEDDING_MODEL,
      dimensions: RAG_EMBEDDING_DIMENSIONS,
      apiKey,
    });
    for (const v of vectors) {
      if (v.length !== RAG_EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Embedding model returned ${v.length} dimensions; expected ${RAG_EMBEDDING_DIMENSIONS}`
        );
      }
    }
    return vectors;
  };
}

/** Deterministic local embedder for tests — not semantically meaningful. */
export function createDeterministicEmbedder(dim = RAG_EMBEDDING_DIMENSIONS): EmbedFn {
  return async (texts: string[]) =>
    texts.map((text) => {
      const vec = new Array(dim).fill(0);
      for (let i = 0; i < text.length; i++) {
        vec[i % dim] = (vec[i % dim] + text.charCodeAt(i) * 0.001) % 1;
      }
      return vec;
    });
}
