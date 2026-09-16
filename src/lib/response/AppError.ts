// lib/response/AppError.ts
import { StatusCodes as httpStatus } from 'http-status-codes';

export interface ValidationErrorDetail {
  field: string;
  message: string;
  code?: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: ValidationErrorDetail[];

  constructor(
    statusCode: number,
    message: string,
    errors?: ValidationErrorDetail[],
    isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg = 'Bad Request', errors?: ValidationErrorDetail[]) {
    return new AppError(httpStatus.BAD_REQUEST, msg, errors);
  }

  static unprocessable(msg = 'Validation failed', errors?: ValidationErrorDetail[]) {
    return new AppError(httpStatus.UNPROCESSABLE_ENTITY, msg, errors);
  }

  static unauthorized(msg = 'Unauthorized') {
    return new AppError(httpStatus.UNAUTHORIZED, msg);
  }

  static forbidden(msg = 'Forbidden') {
    return new AppError(httpStatus.FORBIDDEN, msg);
  }

  static notFound(msg = 'Resource not found') {
    return new AppError(httpStatus.NOT_FOUND, msg);
  }

  static conflict(msg = 'Conflict') {
    return new AppError(httpStatus.CONFLICT, msg);
  }

  static tooManyRequests(msg = 'Too many requests, please try again later') {
    return new AppError(httpStatus.TOO_MANY_REQUESTS, msg);
  }

  static serverBusy(msg = 'Server busy') {
    return new AppError(httpStatus.SERVICE_UNAVAILABLE, msg);
  }
}
