export interface RobotsRules {
  disallow: string[];
}

const cache = new Map<string, { rules: RobotsRules; fetchedAt: number }>();

export function parseRobotsTxt(body: string): RobotsRules {
  const disallow: string[] = [];
  let inWildcardAgent = false;

  for (const rawLine of body.split("\n")) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) continue;

    const agentMatch = /^User-agent:\s*(.+)$/i.exec(line);
    if (agentMatch) {
      const agent = agentMatch[1]!.trim().toLowerCase();
      inWildcardAgent = agent === "*";
      continue;
    }

    if (!inWildcardAgent) continue;

    const disallowMatch = /^Disallow:\s*(.*)$/i.exec(line);
    if (disallowMatch) {
      const path = disallowMatch[1]?.trim() ?? "";
      if (path) disallow.push(path);
    }
  }

  return { disallow };
}

export function isPathAllowed(pathname: string, rules: RobotsRules): boolean {
  for (const prefix of rules.disallow) {
    if (prefix === "/") return false;
    if (pathname.startsWith(prefix)) return false;
  }
  return true;
}

export async function fetchRobotsRules(
  origin: string,
  fetchImpl: typeof fetch = fetch
): Promise<RobotsRules> {
  const cached = cache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < 24 * 60 * 60 * 1000) {
    return cached.rules;
  }

  try {
    const res = await fetchImpl(`${origin}/robots.txt`, {
      headers: { "User-Agent": "NutriAgentBot/1.0 (+https://nutriagent.ai)" },
    });
    if (!res.ok) {
      const rules = { disallow: [] as string[] };
      cache.set(origin, { rules, fetchedAt: Date.now() });
      return rules;
    }
    const rules = parseRobotsTxt(await res.text());
    cache.set(origin, { rules, fetchedAt: Date.now() });
    return rules;
  } catch {
    return { disallow: [] };
  }
}

export async function assertUrlAllowedByRobots(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const parsed = new URL(url);
  const rules = await fetchRobotsRules(parsed.origin, fetchImpl);
  if (!isPathAllowed(parsed.pathname, rules)) {
    throw new Error(`robots.txt disallows fetching ${url}`);
  }
}

export function clearRobotsCache(): void {
  cache.clear();
}
