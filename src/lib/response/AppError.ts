import { StatusCodes as httpStatus } from 'http-status-codes';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg = 'Bad Request') {
    return new AppError(httpStatus.BAD_REQUEST, msg);
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
  static serverBusy(msg = 'Server busy') {
    return new AppError(httpStatus.SERVICE_UNAVAILABLE, msg);
  }
}
