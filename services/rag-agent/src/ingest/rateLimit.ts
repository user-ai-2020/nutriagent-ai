const fetchTimestamps = new Map<string, number[]>();

export class RateLimitError extends Error {
  constructor(domain: string) {
    super(`Rate limit exceeded for domain: ${domain}`);
    this.name = "RateLimitError";
  }
}

export function checkRateLimit(domain: string, limitPerMinute: number): void {
  const now = Date.now();
  const windowMs = 60_000;
  const history = (fetchTimestamps.get(domain) ?? []).filter((t) => now - t < windowMs);

  if (history.length >= limitPerMinute) {
    throw new RateLimitError(domain);
  }

  history.push(now);
  fetchTimestamps.set(domain, history);
}

/** Test helper — reset in-memory counters. */
export function resetRateLimits(): void {
  fetchTimestamps.clear();
}
