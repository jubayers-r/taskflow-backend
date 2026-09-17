import { isRedisEnabled, redis } from '@/lib/redis';
import rateLimit, { type Options } from 'express-rate-limit';
import RedisStore, { RedisReply } from 'rate-limit-redis';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Distributed store when Redis is enabled; otherwise express-rate-limit falls
// back to its built-in in-memory MemoryStore. Each limiter gets its own prefix
// so their counters never collide in the shared Redis keyspace.
const createStore = (prefix: string) => {
  if (!isRedisEnabled() || !redis) return undefined;
  const redisClient = redis;
  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) =>
      redisClient.call(...(args as [string, ...string[]])) as Promise<RedisReply>,
  });
};

const createLimiter = (prefix: string, options: Partial<Options> = {}) => {
  const store = createStore(prefix);
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    standardHeaders: true,
    legacyHeaders: false,
    ...(store ? { store } : {}),
    ...options,
  });
};

// Broad protection applied to the whole versioned API surface.
export const apiLimiter = createLimiter('rl:api:', { limit: 300 });

// Strict protection for credential / OTP endpoints to blunt brute-force and
// enumeration attempts. Successful requests don't count against the quota.
export const authLimiter = createLimiter('rl:auth:', {
  limit: 10,
  skipSuccessfulRequests: true,
});
