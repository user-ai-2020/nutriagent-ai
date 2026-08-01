import { prisma } from "@nutriagent/db";
import { RAG_DOCUMENT_STATUS, createId } from "@nutriagent/shared";
import { RAG_CACHE_DAYS } from "../config/ragConstants.js";
import { isWhitelistedUrl, sourceDomainFromUrl } from "../config/trustedSources.js";
import type { EmbedFn } from "../embedding/embedText.js";
import { chunkText } from "../ingest/chunkText.js";
import { checkRateLimit } from "./rateLimit.js";
import { SCRAPE_RATE_LIMIT_PER_MINUTE } from "../config/ragConstants.js";
import { assertUrlAllowedByRobots } from "../ingest/robots.js";
import { hashRawText, scrapeArticlePage, type ScrapedArticle } from "../ingest/scrapePage.js";
import { formatEmbeddingVector } from "../search/hybridSearch.js";

export interface IngestArticleInput {
  url: string;
  title?: string;
  text?: string;
  publishedDate?: Date | null;
  summary?: string | null;
}

export interface IngestDeps {
  fetchImpl: typeof fetch;
  embed: EmbedFn;
  scrape: (url: string) => Promise<ScrapedArticle>;
}

const defaultDeps = (): IngestDeps => ({
  fetchImpl: fetch,
  embed: async () => {
    throw new Error("embed function not configured");
  },
  scrape: (url) => scrapeArticlePage(url),
});

export async function findCachedDocument(url: string): Promise<{ id: string } | null> {
  const existing = await prisma.ragDocument.findFirst({
    where: { sourceUrl: url },
    orderBy: { fetchedAt: "desc" },
  });
  if (!existing) return null;

  const ageMs = Date.now() - existing.fetchedAt.getTime();
  if (ageMs > RAG_CACHE_DAYS * 24 * 60 * 60 * 1000) return null;
  return { id: existing.id };
}

export async function ingestArticle(
  input: IngestArticleInput,
  deps: Partial<IngestDeps> = {}
): Promise<{ documentId: string; skipped: boolean }> {
  const { fetchImpl, embed, scrape } = { ...defaultDeps(), ...deps };

  if (!isWhitelistedUrl(input.url)) {
    throw new Error(`URL not on trusted whitelist: ${input.url}`);
  }

  const domain = sourceDomainFromUrl(input.url);
  checkRateLimit(domain, SCRAPE_RATE_LIMIT_PER_MINUTE);
  await assertUrlAllowedByRobots(input.url, fetchImpl);

  const cached = await findCachedDocument(input.url);
  if (cached) {
    return { documentId: cached.id, skipped: true };
  }

  const scraped =
    input.text && input.title
      ? {
          url: input.url,
          title: input.title,
          text: input.text,
          publishedDate: input.publishedDate ?? null,
        }
      : await scrape(input.url);

  const rawTextHash = hashRawText(scraped.text);
  const duplicate = await prisma.ragDocument.findUnique({ where: { rawTextHash } });
  if (duplicate) {
    return { documentId: duplicate.id, skipped: true };
  }

  const chunks = chunkText(scraped.text);
  if (chunks.length === 0) {
    throw new Error(`No chunks produced for ${input.url}`);
  }

  const embeddings = await embed(chunks);
  const documentId = createId();

  await prisma.ragDocument.create({
    data: {
      id: documentId,
      sourceUrl: scraped.url,
      sourceDomain: domain,
      title: scraped.title,
      publishedDate: scraped.publishedDate,
      summary: input.summary ?? null,
      rawTextHash,
      status: RAG_DOCUMENT_STATUS.PENDING,
    },
  });

  for (let i = 0; i < chunks.length; i++) {
    const chunkId = createId();
    const embeddingLiteral = formatEmbeddingVector(embeddings[i]!);
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO rag_chunks (id, document_id, content, embedding, chunk_index)
      VALUES ($1, $2, $3, $4::vector, $5)
      `,
      chunkId,
      documentId,
      chunks[i],
      embeddingLiteral,
      i
    );
  }

  await prisma.ragDocument.update({
    where: { id: documentId },
    data: { status: RAG_DOCUMENT_STATUS.READY },
  });

  return { documentId, skipped: false };
}
