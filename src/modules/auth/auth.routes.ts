// routes/auth.routes.ts
import sendResponse from '@/lib/response/response';
import { authLimiter } from '@/middlewares/rateLimiter.middleware';
import { validateRequest } from '@/middlewares/validateRequest.middleware';
import { Router } from 'express';
import { AuthController } from './auth.controller';
import { AuthSchema } from './auth.schema';

const router = Router();

router.get('/', (_req, res) =>
  sendResponse.ok(
    res,
    {
      resource: 'auth',
      endpoints: {
        register: 'POST /api/v1/auth/register',
        verifyEmail: 'POST /api/v1/auth/verify-email',
        login: 'POST /api/v1/auth/login',
        refresh: 'POST /api/v1/auth/refresh',
        logout: 'POST /api/v1/auth/logout',
        forgotPassword: 'POST /api/v1/auth/forgot-password',
        resetPassword: 'POST /api/v1/auth/reset-password',
      },
    },
    'Auth API',
  ),
);

// Sensitive credential / OTP endpoints are rate limited per client.
router.post(
  '/register',
  authLimiter,
  validateRequest({ body: AuthSchema.registerSchema }),
  AuthController.registerHandler,
);

router.post(
  '/verify-email',
  authLimiter,
  validateRequest({ body: AuthSchema.verifyOtpSchema }),
  AuthController.verifyOtpHandler,
);
router.post(
  '/forgot-password',
  authLimiter,
  validateRequest({ body: AuthSchema.forgotPasswordSchema }),
  AuthController.forgotPasswordHandler,
);
router.post(
  '/reset-password',
  authLimiter,
  validateRequest({ body: AuthSchema.resetPasswordSchema }),
  AuthController.resetPasswordHandler,
);

router.post(
  '/login',
  authLimiter,
  validateRequest({ body: AuthSchema.loginSchema }),
  AuthController.loginHandler,
);

router.post('/refresh', AuthController.refreshHandler);
router.post('/logout', AuthController.logoutHandler);

export const AuthRoutes = router;
