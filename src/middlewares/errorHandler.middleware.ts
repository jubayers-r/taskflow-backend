import { logger } from '@/lib/logger';
import { AppError } from '@/lib/response/AppError';
import { NextFunction, Request, Response } from 'express';
import { StatusCodes as httpStatus } from 'http-status-codes';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.correlationId;

  // Handle expected operational errors thrown via AppError
  if (err instanceof AppError && err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
      correlationId: requestId,
    });
  }

  // Handle unexpected bugs or system crashes
  logger.error({ err, requestId, path: req.path }, 'Unhandled error');
  return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: 'Internal server error',
    correlationId: requestId,
  });
}
