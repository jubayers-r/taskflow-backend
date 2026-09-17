import { env } from '@/config';
import sendResponse from '@/lib/response/response';
import { AuthRoutes } from '@/modules/auth/auth.routes';
import { Router } from 'express';

const router = Router();

const Routes = router;

// API discovery root — avoids a bare 404 and advertises the contract.
router.get('/', (_req, res) =>
  sendResponse.ok(
    res,
    {
      service: env.PROJECT_NAME,
      apiVersion: 'v1',
      environment: env.NODE_ENV,
      endpoints: {
        auth: '/api/v1/auth',
        health: '/health',
        liveness: '/health/live',
        readiness: '/health/ready',
      },
    },
    `${env.PROJECT_NAME} API v1`,
  ),
);

router.use('/auth', AuthRoutes);

export default Routes;
