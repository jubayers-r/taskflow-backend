import { env } from '@/config';
import { describeRoute } from '@/lib/openapi';
import sendResponse from '@/lib/response/response';
import { AuthRoutes } from '@/modules/auth/auth.routes';
import { UsersRoutes } from '@/modules/users/users.routes';
import { Router } from 'express';

const router = Router();

const Routes = router;

// API service metadata — gives the versioned base path a 200 for gateways and
// uptime probes, and points at the generated contract.
//
// It deliberately does NOT list the routes. A hand-maintained endpoint map is a
// second source of truth for the route table: it drifts the moment a module is
// added, and the drift is invisible until someone reads stale docs. `/docs` and
// `/openapi.json` are generated from the describeRoute() calls next to each
// route, so they cannot drift. This document points there instead.
describeRoute({
  method: 'get',
  path: '/api/v1',
  tags: ['Meta'],
  summary: 'API service metadata and contract links',
  responses: { 200: 'Service metadata and links' },
});
router.get('/', (_req, res) =>
  sendResponse.ok(
    res,
    {
      service: env.PROJECT_NAME,
      apiVersion: 'v1',
      environment: env.NODE_ENV,
      openapi: '/openapi.json',
      docs: '/docs',
    },
    `${env.PROJECT_NAME} API v1`,
  ),
);

router.use('/auth', AuthRoutes);
router.use('/users', UsersRoutes);

export default Routes;
