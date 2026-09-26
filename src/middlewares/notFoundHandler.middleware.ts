import { ErrorCode } from '@/lib/response/AppError';
import { NextFunction, Request, Response } from 'express';

const DOCS_URL = '/docs';
const OPENAPI_URL = '/openapi.json';

export function notFoundHandler(req: Request, res: Response, _next: NextFunction) {
  const correlationId = req.correlationId;

  // Point at the contract instead of redirecting to it. A 302 here would make a
  // request for a nonexistent path resolve to 200 with an HTML body, so a client
  // typo would look like success and a deployment mismatch would hide behind a
  // cheerful page. A 404 stays a 404; the documentation is advertised in the
  // body and via a Link header (RFC 8288) for anyone who hits it.
  res.setHeader('Link', `<${DOCS_URL}>; rel="describedby"`);

  res.status(404).json({
    success: false,
    message: 'Route not found',
    code: ErrorCode.NOT_FOUND,
    docs: DOCS_URL,
    openapi: OPENAPI_URL,
    correlationId,
    data: {
      path: req.originalUrl,
      method: req.method,
      time: new Date().toISOString(),
    },
  });
}
