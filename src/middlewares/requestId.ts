import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

import { logger } from '@/lib/logger';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  req.log = logger.child({ requestId });
  next();
}
