import { NextFunction, Request, Response } from 'express';

export function notFoundHandler(req: Request, res: Response, _next: NextFunction) {
  const requestId = req.correlationId;

  res.status(404).json({
    success: false,
    message: 'Route not found',
    requestId,
    data: {
      path: req.originalUrl,
      method: req.method,
      time: new Date().toISOString(),
    },
  });
}
