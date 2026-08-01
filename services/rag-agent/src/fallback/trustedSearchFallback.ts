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

export function parseDdgHtmlResults(html: string, allowedDomains: string | string[]): SearchResultLink[] {
  const links: SearchResultLink[] = [];
  const domains = Array.isArray(allowedDomains) ? allowedDomains : [allowedDomains];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const decoded = decodeDdgRedirect(match[1]!);
    if (!decoded) continue;
    try {
      const host = new URL(decoded).hostname.toLowerCase();
      const matchedDomain = domains.find(d => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`));
      if (!matchedDomain) {
        continue;
      }
      const title = match[2]!.replace(/<[^>]+>/g, "").trim();
      links.push({ url: decoded, title: title || decoded, domain: matchedDomain });
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

  const siteDomains = config.domains
    .filter((s) => s.searchType === "site")
    .map((s) => s.domain);

  if (siteDomains.length === 0) return [];

  const siteQuery = siteDomains.map((d) => `site:${d}`).join(" OR ");
  const combinedKeywords = `${siteQuery} ${keywords}`;

  try {
    const q = encodeURIComponent(combinedKeywords);
    const res = await fetchImpl(`https://html.duckduckgo.com/html/?q=${q}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "NutriAgentBot/1.0 (+https://nutriagent.ai)",
      },
      body: `q=${q}`,
    });
    
    if (res.ok) {
      const html = await res.text();
      const links = parseDdgHtmlResults(html, siteDomains);
      
      for (const link of links) {
        if (seen.has(link.url)) continue;
        seen.add(link.url);
        results.push(link);
      }
    }
  } catch (err) {
    console.warn(`DuckDuckGo combined site search failed:`, err);
  }

  return results.slice(0, 8);
}
