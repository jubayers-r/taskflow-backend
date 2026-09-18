import { logger } from '@/lib/logger';
import { runWithRequestContext } from '@/lib/requestContext';
import { NextFunction, Request, Response } from 'express';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  // Use existing header if sent by a gateway/frontend, or generate a new one
  const correlationId = (req.headers['x-request-id'] as string) || crypto.randomUUID();

  // Attach a scoped child logger to this specific request
  req.log = logger.child({ correlationId });
  req.correlationId = correlationId;

  // Send it back in the response headers so clients can quote it on error
  res.setHeader('X-Request-Id', correlationId);

  const startedAt = performance.now();
  res.on('finish', () => {
    req.log.info(
      {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      },
      'Request completed',
    );
  });

  // Everything downstream (including async continuations) can read the context.
  runWithRequestContext({ correlationId, logger: req.log }, () => next());
}
