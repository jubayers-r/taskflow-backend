import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { getHealth, getLiveness, renderHealthPage } from './health.service';

/** Human-readable dashboard (database, Redis, queue). */
export const healthPageHandler = async (_req: Request, res: Response) => {
  const health = await getHealth();
  res
    .status(health.status === 'down' ? StatusCodes.SERVICE_UNAVAILABLE : StatusCodes.OK)
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(renderHealthPage(health));
};

/**
 * Liveness probe — process is up. No dependency checks, so an external
 * outage never causes the orchestrator to restart the container.
 */
export const livenessHandler = (_req: Request, res: Response) => {
  res
    .status(StatusCodes.OK)
    .set('Cache-Control', 'no-store')
    .json({ success: true, ...getLiveness() });
};

/**
 * Readiness probe — can this instance serve traffic? Checks required
 * dependencies (database, and Redis when enabled). Returns 503 when not
 * ready so load balancers stop routing traffic here.
 */
export const readinessHandler = async (_req: Request, res: Response) => {
  const health = await getHealth();
  const isReady = health.status === 'ok';
  res
    .status(isReady ? StatusCodes.OK : StatusCodes.SERVICE_UNAVAILABLE)
    .set('Cache-Control', 'no-store')
    .json({ success: isReady, ...health });
};
