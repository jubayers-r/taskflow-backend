import { logger } from '@/lib/logger';
import { AppError, ErrorCode, ValidationErrorDetail } from '@/lib/response/AppError';
import { Prisma } from '@/prisma/generated/client';
import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

/**
 * Translates a Prisma known request error into an operational AppError so that
 * database constraint violations surface as meaningful HTTP responses instead
 * of opaque 500s.
 */
const fromPrismaError = (err: Prisma.PrismaClientKnownRequestError): AppError | null => {
  switch (err.code) {
    case 'P2002': {
      const target = err.meta?.target;
      const fields = Array.isArray(target) ? (target as string[]).join(', ') : undefined;
      return AppError.conflict(
        fields ? `A record with this ${fields} already exists` : 'Unique constraint violation',
      );
    }
    case 'P2025':
      return AppError.notFound('The requested record was not found');
    case 'P2003':
      return AppError.conflict('Related record constraint violation');
    case 'P2000':
      return AppError.badRequest('A provided value is too long for the field');
    default:
      return null;
  }
};

const fromZodError = (err: ZodError): AppError => {
  const errors: ValidationErrorDetail[] = err.issues.map((issue) => ({
    field: issue.path.join('.') || '_root',
    message: issue.message,
    code: issue.code,
  }));
  return AppError.unprocessable('Validation failed', errors);
};

const isJsonParseError = (err: Error): boolean => {
  return err instanceof SyntaxError && 'body' in err;
};

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const correlationId = req.correlationId;

  const appError = (() => {
    if (err instanceof AppError) return err;
    if (err instanceof ZodError) return fromZodError(err);
    if (err instanceof Prisma.PrismaClientKnownRequestError) return fromPrismaError(err);
    if (isJsonParseError(err)) return AppError.badRequest('Malformed JSON in request body');
    return null;
  })();

  if (appError) {
    // Only unexpected (non-operational) errors deserve an error-level log.
    if (!appError.isOperational) {
      logger.error({ err, correlationId, path: req.path }, 'Unhandled error');
    }

    return res.status(appError.statusCode).json({
      success: false,
      message: appError.message,
      code: appError.code,
      errors: appError.errors,
      correlationId,
    });
  }

  // Unknown/unexpected errors: log with the original and return a safe 500.
  logger.error({ err, correlationId, path: req.path }, 'Unhandled error');
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    code: ErrorCode.INTERNAL_ERROR,
    correlationId,
  });
}
