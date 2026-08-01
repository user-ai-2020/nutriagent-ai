import { readFileSync } from "node:fs";
import path from "node:path";

export type TrustedSourceSearchType = "site" | "pubmed_eutils";

export interface TrustedSource {
  domain: string;
  name: string;
  searchType: TrustedSourceSearchType;
}

export interface TrustedSourcesConfig {
  domains: TrustedSource[];
}

let cached: TrustedSourcesConfig | null = null;

export function loadTrustedSources(): TrustedSourcesConfig {
  if (cached) return cached;
  const filePath = path.resolve(__dirname, "../../config/trustedSources.json");
  const raw = readFileSync(filePath, "utf8");
  cached = JSON.parse(raw) as TrustedSourcesConfig;
  return cached;
}

export function isWhitelistedUrl(url: string, sources = loadTrustedSources()): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return sources.domains.some(
      (s) => host === s.domain.toLowerCase() || host.endsWith(`.${s.domain.toLowerCase()}`)
    );
  } catch {
    return false;
  }
}

export function sourceDomainFromUrl(url: string): string {
  return new URL(url).hostname.toLowerCase();
}
