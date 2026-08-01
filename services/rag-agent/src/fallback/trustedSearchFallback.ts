import { loadTrustedSources, type TrustedSource } from "../config/trustedSources.js";
import type { SearchResultLink } from "./trustedSearch.js";

function decodeDdgRedirect(href: string): string | null {
  try {
    if (href.startsWith("//duckduckgo.com/l/?")) {
      href = `https:${href}`;
    }
    const u = new URL(href);
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    if (u.hostname.includes("duckduckgo.com")) return null;
    return href;
  } catch {
    return null;
  }
}

export function parseDdgHtmlResults(html: string, allowedDomain: string): SearchResultLink[] {
  const links: SearchResultLink[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const decoded = decodeDdgRedirect(match[1]!);
    if (!decoded) continue;
    try {
      const host = new URL(decoded).hostname.toLowerCase();
      if (host !== allowedDomain.toLowerCase() && !host.endsWith(`.${allowedDomain.toLowerCase()}`)) {
        continue;
      }
      const title = match[2]!.replace(/<[^>]+>/g, "").trim();
      links.push({ url: decoded, title: title || decoded, domain: allowedDomain });
    } catch {
      /* skip invalid */
    }
  }
  return links;
}

async function searchSiteViaDdg(
  source: TrustedSource,
  keywords: string,
  fetchImpl: typeof fetch
): Promise<SearchResultLink[]> {
  try {
    const q = encodeURIComponent(`site:${source.domain} ${keywords}`);
    const res = await fetchImpl(`https://html.duckduckgo.com/html/?q=${q}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "NutriAgentBot/1.0 (+https://nutriagent.ai)",
      },
      body: `q=${q}`,
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseDdgHtmlResults(html, source.domain).slice(0, 5);
  } catch (err) {
    console.warn(`DuckDuckGo site search failed for ${source.domain}:`, err);
    return [];
  }
}

/** Unofficial DDG HTML scraper — used only when Google Custom Search is not configured. */
export async function searchAllSitesViaDdgFallback(
  keywords: string,
  fetchImpl: typeof fetch = fetch
): Promise<SearchResultLink[]> {
  const config = loadTrustedSources();
  const results: SearchResultLink[] = [];
  const seen = new Set<string>();

  for (const source of config.domains) {
    if (source.searchType !== "site") continue;

    const links = await searchSiteViaDdg(source, keywords, fetchImpl);
    for (const link of links) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      results.push(link);
    }
  }

  return results.slice(0, 8);
}
