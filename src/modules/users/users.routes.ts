// users.routes.ts
// No GET / index here, for the same reason as auth.routes.ts: a hand-written
// endpoint list is a route table that drifts. /docs and /openapi.json are
// generated from the describeRoute() calls, so they cannot.
import { describeRoute } from '@/lib/openapi';
import { authenticate } from '@/middlewares/auth.middleware';
import { Router } from 'express';
import { UsersController } from './users.controller';

const router = Router();

describeRoute({
  method: 'get',
  path: '/api/v1/users/me',
  tags: ['Users'],
  summary: 'Get the authenticated user profile',
  security: true,
  responses: {
    200: 'Current user profile',
    401: 'Not authenticated',
    404: 'User not found',
  },
});
router.get('/me', authenticate, UsersController.meHandler);

export const UsersRoutes = router;
