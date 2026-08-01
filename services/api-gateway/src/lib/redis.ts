import Redis from "ioredis";
import { RedisLike } from "@nutriagent/shared";

let redis: Redis | null = null;

export function getRedis(): RedisLike | null {
  if (!process.env.REDIS_URL) return null;
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    redis.connect().catch(() => {
      console.warn("Redis unavailable - falling back to Postgres only");
      redis = null;
    });
  }
  return redis as unknown as RedisLike;
}
