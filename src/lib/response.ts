// import type { PaginationMeta } from '@/core/database/builders/queryBuilder';
import type { Response } from 'express';

export type TResponse<T> = {
  statusCode: number;
  success?: boolean;
  message?: string;
  // meta?: PaginationMeta;
  data?: T | null;
};

/**
 * Main utility function to send standardized API responses
 */
const sendResponse = <T>(res: Response, response: TResponse<T>) => {
  const isSuccess =
    typeof response.success === 'boolean'
      ? response.success
      : response.statusCode >= 200 && response.statusCode < 300;

  return res.status(response.statusCode).json({
    success: isSuccess,
    statusCode: response.statusCode,
    message: response.message,
    // meta: response.meta,
    data: response.data,
  });
};

// --- Helper Methods ---

/**
 * Sends a 200 OK response
 */
sendResponse.ok = <T>(res: Response, payload: Omit<TResponse<T>, 'statusCode'>) => {
  return sendResponse(res, { ...payload, statusCode: 200 });
};

/**
 * Sends a 201 Created response
 */
sendResponse.created = <T>(res: Response, payload: Omit<TResponse<T>, 'statusCode'>) => {
  return sendResponse(res, { ...payload, statusCode: 201 });
};

/**
 * Sends a 400 Bad Request response
 */
sendResponse.badRequest = <T>(res: Response, payload: Omit<TResponse<T>, 'statusCode'>) => {
  return sendResponse(res, { ...payload, statusCode: 400, success: false });
};

/**
 * Sends a 404 Not Found response
 */
sendResponse.notFound = <T>(res: Response, payload: Omit<TResponse<T>, 'statusCode'>) => {
  return sendResponse(res, { ...payload, statusCode: 404, success: false });
};

export default sendResponse;
