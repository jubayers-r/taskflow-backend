import { logger } from '@/lib/logger';
import { AppError } from '@/lib/response/AppError';
import { NextFunction, Request, Response } from 'express';
import { StatusCodes as httpStatus } from 'http-status-codes';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  const requestId = res.locals.requestId;

  // Handle expected operational errors thrown via AppError
  if (err instanceof AppError && err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.message,
      requestId,
    });
  }

  // Handle unexpected bugs or system crashes
  logger.error({ err, requestId, path: req.path }, 'Unhandled error');
  return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
    error: 'Internal server error',
    requestId,
  });
}
