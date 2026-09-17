import { describeRoute } from '@/lib/openapi';
import { Router } from 'express';

import { healthPageHandler, livenessHandler, readinessHandler } from './health.controller';

const router = Router();

describeRoute({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Human-readable health dashboard',
  responses: { 200: 'Healthy or degraded', 503: 'A dependency is down' },
});
router.get('/', healthPageHandler);

describeRoute({
  method: 'get',
  path: '/health/live',
  tags: ['Health'],
  summary: 'Liveness probe (process is up)',
  responses: { 200: 'Alive' },
});
router.get('/live', livenessHandler);

describeRoute({
  method: 'get',
  path: '/health/ready',
  tags: ['Health'],
  summary: 'Readiness probe (dependencies reachable)',
  responses: { 200: 'Ready', 503: 'Not ready' },
});
router.get('/ready', readinessHandler);

export const HealthRoutes = router;
