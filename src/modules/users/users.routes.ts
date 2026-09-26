// users.routes.ts
import { describeRoute } from '@/lib/openapi';
import { authenticate } from '@/middlewares/auth.middleware';
import { Router } from 'express';
import { UsersController } from './users.controller';

const router = Router();

describeRoute({
  method: 'get',
  path: '/api/v1/users',
  tags: ['Users'],
  summary: 'List available user endpoints',
  responses: { 200: 'User endpoint index' },
});
router.get('/', (_req, res) =>
  res.json({
    resource: 'users',
    endpoints: {
      me: 'GET /api/v1/users/me',
    },
  }),
);

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
