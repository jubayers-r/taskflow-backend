import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application } from 'express';
import helmet from 'helmet';
import path from 'path';
import { env } from './config';

import { emailBullQueue } from './lib/queue';
import { errorHandler } from './middlewares/errorHandler.middleware';
import { livenessHandler, readinessHandler } from './modules/health/health.controller';
import { HealthRoutes } from './modules/health/health.routes';
import { notFoundHandler } from './middlewares/notFoundHandler.middleware';
import { requestIdMiddleware } from './middlewares/requestId.middleware';
import Routes from './routes';

const app: Application = express();

app.use('/public', express.static(path.join(process.cwd(), 'public')));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestIdMiddleware);
app.use(cors({ origin: env.ALLOWED_ORIGINS, credentials: true }));
app.use(helmet());
app.use(cookieParser());

app.use('/api/v1', Routes);

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

//global API not found middleware
app.use(notFoundHandler);

//global error middleware
app.use(errorHandler);

export default app;
