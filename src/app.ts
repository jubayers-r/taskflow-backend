import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { apiReference } from '@scalar/express-api-reference';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application } from 'express';
import helmet from 'helmet';
import path from 'path';
import { env } from './config';

import { buildOpenApiDocument } from './lib/openapi';
import { emailBullQueue } from './lib/queue';
import { collectMetrics, metricsRegistry } from './lib/metrics';
import { attachClientMeta } from './middlewares/clientMeta.middleware';
import { errorHandler } from './middlewares/errorHandler.middleware';
import { metricsMiddleware } from './middlewares/metrics.middleware';
import { apiLimiter } from './middlewares/rateLimiter.middleware';
import { livenessHandler, readinessHandler } from './modules/health/health.controller';
import { HealthRoutes } from './modules/health/health.routes';
import { notFoundHandler } from './middlewares/notFoundHandler.middleware';
import { requestIdMiddleware } from './middlewares/requestId.middleware';
import Routes from './routes';

// Scalar loads its bundle from a CDN and ships an inline init script, so the
// default helmet CSP (`script-src 'self'`) would blank the page. Relax it for
// this read-only route only, leaving the strict policy everywhere else.
const docsContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: https:",
  "font-src 'self' https: data:",
  "worker-src 'self' blob: https://cdn.jsdelivr.net",
  "connect-src 'self' https://cdn.jsdelivr.net",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

/**
 * Builds a fully-wired Express application. Exported as a factory so tests can
 * create isolated instances (and so the app is not a hard-to-mock singleton).
 */
export const createApp = (): Application => {
  const app = express();

  // Required for req.ip to resolve the real client behind a reverse proxy.
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use('/public', express.static(path.join(process.cwd(), 'public')));

  // Cap request bodies: the API only exchanges JSON and form payloads, and
  // metadata-only attachments at this scope stay well under 1 MB.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(compression());
  app.use(requestIdMiddleware);
  app.use(metricsMiddleware);
  app.use(attachClientMeta);
  app.use(cors({ origin: env.ALLOWED_ORIGINS, credentials: true }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          // The health dashboard renders an inline <style> block.
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'frame-ancestors': ["'none'"],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    }),
  );
  app.use(cookieParser());

  app.use('/api/v1', apiLimiter, Routes);

  // Landing page: / redirects to the health dashboard
  app.get('/', (_req, res) => res.redirect('/health'));

  // Operational endpoints live at the root (unversioned) by convention.
  app.use('/health', HealthRoutes);

  // Kubernetes-style aliases
  app.get('/healthz', livenessHandler);
  app.get('/readyz', readinessHandler);

  // Prometheus metrics (text exposition format), mounted before the API limiter
  // so the scraper is never throttled.
  app.get('/metrics', async (_req, res) => {
    res.setHeader('Content-Type', metricsRegistry.contentType);
    res.end(await collectMetrics());
  });

  // Bull Board is only mounted when the queue is Redis-backed
  if (emailBullQueue) {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: [new BullMQAdapter(emailBullQueue)],
      serverAdapter,
    });

    app.use('/admin/queues', serverAdapter.getRouter());
  }

  // OpenAPI document and Scalar API reference UI
  const openApiDocument = buildOpenApiDocument();
  app.get('/openapi.json', (_req, res) => res.json(openApiDocument));

  app.use('/docs', (_req, res, next) => {
    res.setHeader('Content-Security-Policy', docsContentSecurityPolicy);
    next();
  });

  app.use('/docs', apiReference({ url: '/openapi.json' }));

  //global API not found middleware
  app.use(notFoundHandler);

  //global error middleware
  app.use(errorHandler);

  return app;
};

const app = createApp();

export default app;
