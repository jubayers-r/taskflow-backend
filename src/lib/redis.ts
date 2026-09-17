import { env } from '@/config';
import { Redis } from 'ioredis';

import { logger } from './logger';

let errorCount = 0;
const MAX_LOGS = 5;

export const isRedisEnabled = (): boolean => env.USE_REDIS === true;

export const redis: Redis | null = isRedisEnabled()
  ? new Redis({
      host: env.REDIS_HOST ?? 'localhost',
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      retryStrategy(times) {
        // Keeps it from slamming the server instantly if connection drops
        return Math.min(times * 1000, 5000);
      },
    })
  : null;

if (redis) {
  redis.on('error', (err) => {
    if (errorCount < MAX_LOGS) {
      if (err.message.includes('NOAUTH')) {
        logger.error('Redis AUTH error: Authentication required. Check REDIS_PASSWORD.');
      } else {
        logger.error(`Redis error: ${err.message}`);
      }
      errorCount++;
      if (errorCount === MAX_LOGS) {
        logger.warn('Redis log limit reached; silencing further errors.');
      }
    }
  });

  // 'ready' only fires AFTER successful authentication
  redis.on('ready', () => {
    errorCount = 0;
    logger.info('Redis connected and authenticated!');
  });
} else {
  logger.info(
    'USE_REDIS=false — Redis disabled. Using in-memory fallbacks (queue, cache, rate limiter).',
  );
}
