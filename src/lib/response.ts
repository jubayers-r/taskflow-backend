import type { Response } from 'express';

export type TResponse<T> = {
  statusCode?: number;
  success?: boolean;
  message?: string;
  data?: T | null;
};

/**
 * Standardized API success response wrapper
 */
const sendResponse = <T>(res: Response, response: TResponse<T>) => {
  const statusCode = response.statusCode ?? 200;
  const isSuccess =
    typeof response.success === 'boolean'
      ? response.success
      : statusCode >= 200 && statusCode < 300;

  // Extract correlationId directly from the request object attached to res
  const correlationId = res.req?.correlationId;

  return res.status(statusCode).json({
    success: isSuccess,
    message: response.message ?? 'Success',
    data: response.data ?? null,
    correlationId,
  });
};

// --- Convenience Helpers ---

sendResponse.ok = <T>(res: Response, payload: Omit<TResponse<T>, 'statusCode'>) => {
  return sendResponse(res, { ...payload, statusCode: 200 });
};

sendResponse.created = <T>(res: Response, payload: Omit<TResponse<T>, 'statusCode'>) => {
  return sendResponse(res, { ...payload, statusCode: 201 });
};

export default sendResponse;
