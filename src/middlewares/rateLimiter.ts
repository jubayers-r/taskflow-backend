import { logger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import { NextFunction, Request, Response } from 'express';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 10000;

export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip;
  const key = `rate:${ip}`;

  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }

  if (count > MAX_REQUESTS) {
    logger.warn({ ip, count }, 'Rate limit exceeded');
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: WINDOW_SECONDS,
      requestId: res.locals.requestId,
    });
    return;
  }

  next();
}
