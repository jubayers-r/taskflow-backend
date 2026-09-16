// routes/auth.routes.ts
import { validateRequest } from '@/middlewares/validateRequest.middleware';
import { Router } from 'express';
import { AuthController } from './auth.controller';
import { AuthSchema } from './auth.schema';

const router = Router();

// In production, attach rateLimiters to sensitive auth endpoints
router.post(
  '/register',
  validateRequest({ body: AuthSchema.registerSchema }),
  AuthController.registerHandler,
);

router.post(
  '/verify-email',
  validateRequest({ body: AuthSchema.verifyOtpSchema }),
  AuthController.verifyOtpHandler,
);

router.post(
  '/login',
  validateRequest({ body: AuthSchema.loginSchema }),
  AuthController.loginHandler,
);

router.post('/refresh', AuthController.refreshHandler);
router.post('/logout', AuthController.logoutHandler);

export const AuthRoutes = router;
