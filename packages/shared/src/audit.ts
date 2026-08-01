import { AuditLogEntry } from "./types";
import { AUDIT_CACHE_MAX_ENTRIES, AUDIT_CACHE_TTL_SECONDS, REDIS_AUDIT_KEY } from "./constants";

export interface AuditWriter {
  write(entry: Omit<AuditLogEntry, "timestamp"> & { timestamp?: Date }): Promise<AuditLogEntry>;
}

export interface RedisLike {
  zadd(key: string, score: number, member: string): Promise<number>;
  zremrangebyrank(key: string, start: number, stop: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  setex(key: string, seconds: number, value: string): Promise<string>;
  get(key: string): Promise<string | null>;
}

export function serializeAuditEntry(entry: AuditLogEntry): string {
  return JSON.stringify(entry);
}

export function parseAuditEntry(raw: string): AuditLogEntry {
  return JSON.parse(raw) as AuditLogEntry;
}

export async function cacheAuditEntry(redis: RedisLike | null, entry: AuditLogEntry): Promise<void> {
  if (!redis) return;
  const score = new Date(entry.timestamp).getTime();
  await redis.zadd(REDIS_AUDIT_KEY, score, serializeAuditEntry(entry));
  await redis.zremrangebyrank(REDIS_AUDIT_KEY, 0, -(AUDIT_CACHE_MAX_ENTRIES + 1));
  await redis.expire(REDIS_AUDIT_KEY, AUDIT_CACHE_TTL_SECONDS);
}

export async function getRecentAuditLogs(redis: RedisLike | null, limit = 100): Promise<AuditLogEntry[]> {
  if (!redis) return [];
  const raw = await redis.zrevrange(REDIS_AUDIT_KEY, 0, limit - 1);
  return raw.map(parseAuditEntry);
}
