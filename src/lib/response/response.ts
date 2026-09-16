import type { Response } from 'express';
import { StatusCodes as httpStatus } from 'http-status-codes';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type TResponse<T> = {
  statusCode?: number;
  message?: string;
  data?: T | null;
  meta?: PaginationMeta;
};

/**
 * Standardized API response sender
 */
const sendResponse = <T>(res: Response, response: TResponse<T>) => {
  const statusCode = response.statusCode ?? httpStatus.OK;
  const isSuccess = statusCode >= 200 && statusCode < 300;
  const correlationId = res.req?.correlationId;

  // 204 No Content cannot send a response body
  if (statusCode === httpStatus.NO_CONTENT) {
    return res.status(statusCode).send();
  }

  return res.status(statusCode).json({
    success: isSuccess,
    message: response.message ?? 'Success',
    meta: response.meta,
    data: response.data ?? null,
    correlationId,
  });
};

// --- Semantic Helpers (No Magic Status Codes) ---

/** 200 OK */
sendResponse.ok = <T>(res: Response, message = 'Request successful', data?: T) => {
  return sendResponse(res, {
    statusCode: httpStatus.OK,
    message,
    data,
  });
};

/** 201 Created */
sendResponse.created = <T>(res: Response, message = 'Resource created successfully', data?: T) => {
  return sendResponse(res, {
    statusCode: httpStatus.CREATED,
    message,
    data,
  });
};

/** 200 OK with Pagination Metadata */
sendResponse.paginated = <T>(
  res: Response,
  message = 'Data retrieved successfully',
  data: T,
  meta: PaginationMeta,
) => {
  return sendResponse(res, {
    statusCode: httpStatus.OK,
    message,
    data,
    meta,
  });
};

/** 204 No Content (Deletes / Updates with empty body) */
sendResponse.noContent = (res: Response) => {
  return sendResponse(res, {
    statusCode: httpStatus.NO_CONTENT,
  });
};

export default sendResponse;
