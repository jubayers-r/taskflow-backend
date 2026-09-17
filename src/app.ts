import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { apiReference } from '@scalar/express-api-reference';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application } from 'express';
import helmet from 'helmet';
import path from 'path';
import { env } from './config';

import { buildOpenApiDocument } from './lib/openapi';
import { emailBullQueue } from './lib/queue';
import { attachClientMeta } from './middlewares/clientMeta.middleware';
import { errorHandler } from './middlewares/errorHandler.middleware';
import { apiLimiter } from './middlewares/rateLimiter.middleware';
import { livenessHandler, readinessHandler } from './modules/health/health.controller';
import { HealthRoutes } from './modules/health/health.routes';
import { notFoundHandler } from './middlewares/notFoundHandler.middleware';
import { requestIdMiddleware } from './middlewares/requestId.middleware';
import Routes from './routes';

const app: Application = express();

// Required for req.ip to resolve the real client behind a reverse proxy.
app.set('trust proxy', env.TRUST_PROXY);

app.use('/public', express.static(path.join(process.cwd(), 'public')));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestIdMiddleware);
app.use(attachClientMeta);
app.use(cors({ origin: env.ALLOWED_ORIGINS, credentials: true }));
app.use(helmet());
app.use(cookieParser());

app.use('/api/v1', apiLimiter, Routes);

// Landing page: / redirects to the health dashboard
app.get('/', (_req, res) => res.redirect('/health'));

// Operational endpoints live at the root (unversioned) by convention.
// /health        -> human-readable dashboard
// /health/live   -> liveness probe  (process up, no deps)
// /health/ready  -> readiness probe (database + Redis)
app.use('/health', HealthRoutes);

// Kubernetes-style aliases
app.get('/healthz', livenessHandler);
app.get('/readyz', readinessHandler);

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

app.use('/docs', (_req, res, next) => {
  res.setHeader('Content-Security-Policy', docsContentSecurityPolicy);
  next();
});

app.use('/docs', apiReference({ url: '/openapi.json' }));

//global API not found middleware
app.use(notFoundHandler);

//global error middleware
app.use(errorHandler);

export default app;
