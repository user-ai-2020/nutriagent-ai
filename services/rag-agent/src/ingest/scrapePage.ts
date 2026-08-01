import { createHash } from "node:crypto";

export function hashRawText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface ScrapedArticle {
  url: string;
  title: string;
  text: string;
  publishedDate: Date | null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (og?.[1]) return decodeHtmlEntities(og[1].trim());
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return title?.[1] ? decodeHtmlEntities(title[1].trim()) : "Untitled";
}

export function extractPublishedDate(html: string): Date | null {
  const meta =
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]+property=["']og:published_time["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i.exec(html);

  if (meta?.[1]) {
    const d = new Date(meta[1]);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const jsonLd = /"datePublished"\s*:\s*"([^"]+)"/i.exec(html);
  if (jsonLd?.[1]) {
    const d = new Date(jsonLd[1]);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // No reliable publish date — store null (never guess from fetch time).
  return null;
}

function extractMainText(html: string): string {
  const article = /<article[\s\S]*?>([\s\S]*?)<\/article>/i.exec(html);
  if (article?.[1]) return stripTags(article[1]);
  const main = /<main[\s\S]*?>([\s\S]*?)<\/main>/i.exec(html);
  if (main?.[1]) return stripTags(main[1]);
  return stripTags(html);
}

export async function scrapeArticlePage(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<ScrapedArticle> {
  const res = await fetchImpl(url, {
    headers: {
      "User-Agent": "NutriAgentBot/1.0 (+https://nutriagent.ai)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }

  const html = await res.text();
  const text = extractMainText(html);
  if (text.length < 120) {
    throw new Error(`Insufficient article text extracted from ${url}`);
  }

  return {
    url,
    title: extractTitle(html),
    text,
    publishedDate: extractPublishedDate(html),
  };
}
