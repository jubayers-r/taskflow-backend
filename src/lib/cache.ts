import { isRedisEnabled, redis } from './redis';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

/**
 * In-process KV fallback so the app works without a Redis server
 * (USE_REDIS=false). It mirrors the small subset of redis commands the
 * app actually relies on, with TTL expiry.
 */
class MemoryKV {
  private store = new Map<string, CacheEntry>();

  async get(key: string): Promise<string | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

const memoryKV = new MemoryKV();

export const cache = {
  async get(key: string): Promise<string | undefined> {
    if (isRedisEnabled() && redis) return (await redis.get(key)) ?? undefined;
    return memoryKV.get(key);
  },

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (isRedisEnabled() && redis) {
      await redis.set(key, value, 'EX', ttlSeconds);
      return;
    }
    await memoryKV.set(key, value, ttlSeconds);
  },

  async del(key: string): Promise<void> {
    if (isRedisEnabled() && redis) {
      await redis.del(key);
      return;
    }
    await memoryKV.del(key);
  },
} as const;
