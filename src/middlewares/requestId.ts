import { logger } from '@/lib/logger';
import { NextFunction, Request, Response } from 'express';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  // Use existing header if sent by a gateway/frontend, or generate a new one
  const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();

  // Attach a scoped child logger to this specific request
  req.log = logger.child({ correlationId });
  req.correlationId = correlationId;

  // Send it back in the response headers so clients can quote it on error
  res.setHeader('X-Request-Id', correlationId);

  // Log incoming request
  req.log.info({ method: req.method, url: req.url }, 'Incoming request');

  next();
}
