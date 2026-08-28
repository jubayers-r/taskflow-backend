import { logger } from '@/lib/logger';
import { NextFunction, Request, Response } from 'express';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  const requestId = res.locals.requestId;
  // req.log.error({ err }, 'Unhandled request error');

  if (err.message === 'BAD_REQUEST') {
    return res.status(400).json({ error: 'Bad request', requestId });
  }

  if (err.message === 'NOT_FOUND') {
    return res.status(404).json({ error: 'Not found', requestId });
  }
  if (err.message === 'SERVER_BUSY') {
    return res.status(503).json({ error: 'Server busy, please retry', requestId });
  }

  logger.error({ err, requestId, path: req.path }, 'Unhandled error');
  return res.status(500).json({ error: 'Internal server error', requestId });
}
