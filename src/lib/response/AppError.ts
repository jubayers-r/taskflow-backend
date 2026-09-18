// lib/response/AppError.ts
import { StatusCodes as httpStatus } from 'http-status-codes';

/**
 * Stable, machine-readable error codes. Clients should branch on these instead
 * of parsing human-readable messages, which are free to change.
 */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ValidationErrorDetail {
  field: string;
  message: string;
  code?: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly errors?: ValidationErrorDetail[];

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    errors?: ValidationErrorDetail[],
    isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg = 'Bad Request', errors?: ValidationErrorDetail[]) {
    return new AppError(httpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, msg, errors);
  }

  static unprocessable(msg = 'Validation failed', errors?: ValidationErrorDetail[]) {
    return new AppError(httpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_ERROR, msg, errors);
  }

  static unauthorized(msg = 'Unauthorized') {
    return new AppError(httpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, msg);
  }

  static forbidden(msg = 'Forbidden') {
    return new AppError(httpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, msg);
  }

  static notFound(msg = 'Resource not found') {
    return new AppError(httpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, msg);
  }

  static conflict(msg = 'Conflict') {
    return new AppError(httpStatus.CONFLICT, ErrorCode.CONFLICT, msg);
  }

  static accountLocked(msg = 'Account temporarily locked') {
    return new AppError(httpStatus.LOCKED, ErrorCode.ACCOUNT_LOCKED, msg);
  }

  static tooManyRequests(msg = 'Too many requests, please try again later') {
    return new AppError(httpStatus.TOO_MANY_REQUESTS, ErrorCode.TOO_MANY_REQUESTS, msg);
  }

  static serverBusy(msg = 'Server busy') {
    return new AppError(httpStatus.SERVICE_UNAVAILABLE, ErrorCode.SERVICE_UNAVAILABLE, msg);
  }

  static internal(msg = 'Internal server error') {
    return new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL_ERROR,
      msg,
      undefined,
      false,
    );
  }
}
