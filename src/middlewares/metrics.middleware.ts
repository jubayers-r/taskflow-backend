import { httpInflightRequests, httpRequestDurationSeconds, httpRequestsTotal } from '@/lib/metrics';
import { NextFunction, Request, Response } from 'express';

/**
 * Observes every request. Labels are deliberately bounded: `route` is the route
 * pattern (not the raw path) and `client` bucketed into three states, so label
 * cardinality stays constant regardless of traffic.
 */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startedAt = process.hrtime.bigint();

  httpInflightRequests.inc({ method: req.method });

  res.on('finish', () => {
    httpInflightRequests.dec({ method: req.method });

    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : '<unmatched>';
    const client = req.auth ? 'authenticated' : 'anonymous';

    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    httpRequestsTotal.inc({ ...labels, client });

    const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    httpRequestDurationSeconds.observe(labels, seconds);
  });

  next();
};
