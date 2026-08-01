import {
  isWhitelistedUrl,
  loadTrustedSources,
  sourceDomainFromUrl,
  type TrustedSource,
} from "../config/trustedSources.js";
import { searchAllSitesViaDdgFallback } from "./trustedSearchFallback.js";

export interface SearchResultLink {
  url: string;
  title: string;
  domain: string;
}

export interface GoogleCseItem {
  link: string;
  title: string;
  snippet?: string;
}

export interface GoogleCseResponse {
  items?: GoogleCseItem[];
}

export interface TrustedSearchDeps {
  isGoogleConfigured?: () => boolean;
  searchGoogle?: (keywords: string, fetchImpl: typeof fetch) => Promise<SearchResultLink[]>;
  searchPubMed?: (keywords: string, fetchImpl: typeof fetch) => Promise<SearchResultLink[]>;
  searchDdgFallback?: (keywords: string, fetchImpl: typeof fetch) => Promise<SearchResultLink[]>;
}

let ddgFallbackWarned = false;

export function isGoogleSearchConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SEARCH_API_KEY?.trim() && process.env.GOOGLE_SEARCH_CX?.trim());
}

export function warnDdgFallbackOnce(): void {
  if (ddgFallbackWarned) return;
  ddgFallbackWarned = true;
  console.warn(
    "Google Search not configured (GOOGLE_SEARCH_API_KEY / GOOGLE_SEARCH_CX), using unofficial DDG fallback — see README"
  );
}

/** @internal Test helper — resets one-shot DDG fallback warning. */
export function resetDdgFallbackWarningForTests(): void {
  ddgFallbackWarned = false;
}

export function parseGoogleCseResponse(data: GoogleCseResponse): SearchResultLink[] {
  const links: SearchResultLink[] = [];
  for (const item of data.items ?? []) {
    if (!item.link || !isWhitelistedUrl(item.link)) continue;
    const domain = sourceDomainFromUrl(item.link);
    if (domain.includes("pubmed")) continue;
    links.push({
      url: item.link,
      title: item.title?.trim() || item.link,
      domain,
    });
  }
  return links.slice(0, 8);
}

async function searchPubMed(keywords: string, fetchImpl: typeof fetch): Promise<SearchResultLink[]> {
  try {
    const term = encodeURIComponent(keywords);
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=5&term=${term}`;
    const res = await fetchImpl(searchUrl);
    if (!res.ok) return [];

    const data = (await res.json()) as { esearchresult?: { idlist?: string[] } };
    const ids = data.esearchresult?.idlist ?? [];
    return ids.map((id) => ({
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      title: `PubMed ${id}`,
      domain: "pubmed.ncbi.nlm.nih.gov",
    }));
  } catch (err) {
    console.warn("PubMed E-utilities search failed:", err);
    return [];
  }
}

async function searchGoogleCustomSearch(
  keywords: string,
  fetchImpl: typeof fetch
): Promise<SearchResultLink[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY?.trim();
  const cx = process.env.GOOGLE_SEARCH_CX?.trim();
  if (!apiKey || !cx) return [];

  try {
    const q = encodeURIComponent(keywords);
    const url =
      `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}` +
      `&cx=${encodeURIComponent(cx)}&q=${q}&num=8`;

    const timeoutMs = Number(process.env.RAG_FETCH_TIMEOUT_MS || 15_000);
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });

    if (res.status === 429) {
      console.warn("Google Custom Search quota exceeded (429); skipping web results for this round");
      return [];
    }
    if (!res.ok) {
      console.warn(`Google Custom Search failed with HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as GoogleCseResponse;
    return parseGoogleCseResponse(data);
  } catch (err) {
    console.warn("Google Custom Search request failed:", err);
    return [];
  }
}

async function searchSiteSources(
  keywords: string,
  fetchImpl: typeof fetch,
  deps: TrustedSearchDeps
): Promise<SearchResultLink[]> {
  const googleConfigured = deps.isGoogleConfigured ?? isGoogleSearchConfigured;

  if (googleConfigured()) {
    const searchGoogle = deps.searchGoogle ?? searchGoogleCustomSearch;
    return searchGoogle(keywords, fetchImpl);
  }

  warnDdgFallbackOnce();
  const searchDdg = deps.searchDdgFallback ?? searchAllSitesViaDdgFallback;
  return searchDdg(keywords, fetchImpl);
}

export async function searchTrustedSources(
  keywords: string,
  fetchImpl: typeof fetch = fetch,
  deps: TrustedSearchDeps = {}
): Promise<SearchResultLink[]> {
  const config = loadTrustedSources();
  const results: SearchResultLink[] = [];
  const seen = new Set<string>();

  const searchPubMedFn = deps.searchPubMed ?? searchPubMed;
  const pubmedSource = config.domains.find((s: TrustedSource) => s.searchType === "pubmed_eutils");

  if (pubmedSource) {
    for (const link of await searchPubMedFn(keywords, fetchImpl)) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      results.push(link);
    }
  }

  for (const link of await searchSiteSources(keywords, fetchImpl, deps)) {
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    results.push(link);
  }

  return results.slice(0, 8);
}
