import { isRedisEnabled, redis } from '@/lib/redis';
import rateLimit from 'express-rate-limit';
import RedisStore, { RedisReply } from 'rate-limit-redis';

// Distributed store when Redis is enabled; otherwise falls back to the
// built-in in-memory MemoryStore automatically.
const store = (() => {
  if (!isRedisEnabled() || !redis) return undefined;
  const redisClient = redis;
  return new RedisStore({
    sendCommand: (...args: string[]) =>
      redisClient.call(...(args as [string, ...string[]])) as Promise<RedisReply>,
  });
})();

export const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  ...(store ? { store } : {}),
});
