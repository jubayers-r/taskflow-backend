import { ErrorCode } from '@/lib/response/AppError';
import { NextFunction, Request, Response } from 'express';

export function notFoundHandler(req: Request, res: Response, _next: NextFunction) {
  const correlationId = req.correlationId;

  res.status(404).json({
    success: false,
    message: 'Route not found',
    code: ErrorCode.NOT_FOUND,
    correlationId,
    data: {
      path: req.originalUrl,
      method: req.method,
      time: new Date().toISOString(),
    },
  });
}
