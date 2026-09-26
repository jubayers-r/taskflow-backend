// routes/auth.routes.ts
// No GET / index here on purpose. A hand-written list of this module's endpoints
// is a second route table that drifts the moment a route is added — it was
// already stale at 10 of 12. /docs and /openapi.json are generated from the
// describeRoute() calls below, so they cannot drift. The versioned root
// (GET /api/v1) is the only place that advertises the service.
import { describeRoute } from '@/lib/openapi';
import { authenticate } from '@/middlewares/auth.middleware';
import { authLimiter } from '@/middlewares/rateLimiter.middleware';
import { validateRequest } from '@/middlewares/validateRequest.middleware';
import { Router } from 'express';
import { AuthController } from './auth.controller';
import { AuthSchema } from './auth.schemas';

const router = Router();

// Sensitive credential / OTP endpoints are rate limited per client.
describeRoute({
  method: 'post',
  path: '/api/v1/auth/register',
  tags: ['Auth'],
  summary: 'Register a new account',
  body: AuthSchema.registerSchema,
  responses: {
    200: 'Registration accepted; returns otpSent and, in development only, the otp code',
    409: 'Email already registered',
    422: 'Validation error',
  },
});
router.post(
  '/register',
  authLimiter,
  validateRequest({ body: AuthSchema.registerSchema }),
  AuthController.registerHandler,
);

describeRoute({
  method: 'post',
  path: '/api/v1/auth/verify-email',
  tags: ['Auth'],
  summary: 'Verify an email with an OTP code',
  body: AuthSchema.verifyOtpSchema,
  responses: { 200: 'Verified', 401: 'Invalid or expired code', 422: 'Validation error' },
});
router.post(
  '/verify-email',
  authLimiter,
  validateRequest({ body: AuthSchema.verifyOtpSchema }),
  AuthController.verifyOtpHandler,
);

describeRoute({
  method: 'post',
  path: '/api/v1/auth/forgot-password',
  tags: ['Auth'],
  summary: 'Request a password reset email',
  body: AuthSchema.forgotPasswordSchema,
  responses: { 200: 'Reset email sent if the account exists', 422: 'Validation error' },
});
router.post(
  '/forgot-password',
  authLimiter,
  validateRequest({ body: AuthSchema.forgotPasswordSchema }),
  AuthController.forgotPasswordHandler,
);

describeRoute({
  method: 'post',
  path: '/api/v1/auth/reset-password',
  tags: ['Auth'],
  summary: 'Reset a password using a reset token',
  body: AuthSchema.resetPasswordSchema,
  responses: { 200: 'Password reset', 400: 'Invalid or expired token', 422: 'Validation error' },
});
router.post(
  '/reset-password',
  authLimiter,
  validateRequest({ body: AuthSchema.resetPasswordSchema }),
  AuthController.resetPasswordHandler,
);

describeRoute({
  method: 'post',
  path: '/api/v1/auth/resend-otp',
  tags: ['Auth'],
  summary: 'Resend a verification code',
  body: AuthSchema.resendOtpSchema,
  responses: {
    200: 'Code sent if the account requires verification',
    429: 'Cooldown in effect',
    422: 'Validation error',
  },
});
router.post(
  '/resend-otp',
  authLimiter,
  validateRequest({ body: AuthSchema.resendOtpSchema }),
  AuthController.resendOtpHandler,
);

describeRoute({
  method: 'post',
  path: '/api/v1/auth/login',
  tags: ['Auth'],
  summary: 'Log in with email and password',
  body: AuthSchema.loginSchema,
  responses: { 200: 'Tokens issued', 401: 'Invalid credentials', 422: 'Validation error' },
});
router.post(
  '/login',
  authLimiter,
  validateRequest({ body: AuthSchema.loginSchema }),
  AuthController.loginHandler,
);

describeRoute({
  method: 'post',
  path: '/api/v1/auth/refresh',
  tags: ['Auth'],
  summary: 'Rotate a refresh token and issue a new access token',
  responses: { 200: 'Tokens refreshed', 401: 'Refresh token missing or invalid' },
});
router.post('/refresh', AuthController.refreshHandler);

describeRoute({
  method: 'post',
  path: '/api/v1/auth/logout',
  tags: ['Auth'],
  summary: 'Revoke the current session',
  responses: { 200: 'Logged out' },
});
router.post('/logout', AuthController.logoutHandler);

describeRoute({
  method: 'get',
  path: '/api/v1/auth/sessions',
  tags: ['Auth'],
  summary: 'List active sessions for the current user',
  security: true,
  responses: { 200: 'Active sessions', 401: 'Missing or invalid access token' },
});
router.get('/sessions', authenticate, AuthController.listSessionsHandler);

describeRoute({
  method: 'delete',
  path: '/api/v1/auth/sessions',
  tags: ['Auth'],
  summary: 'Revoke every session except the current one',
  security: true,
  responses: { 200: 'Other sessions revoked', 401: 'Missing or invalid access token' },
});
router.delete('/sessions', authenticate, AuthController.revokeOtherSessionsHandler);

describeRoute({
  method: 'delete',
  path: '/api/v1/auth/sessions/:id',
  tags: ['Auth'],
  summary: 'Revoke a specific session',
  security: true,
  responses: {
    200: 'Session revoked',
    401: 'Missing or invalid access token',
    404: 'Session not found',
  },
});
router.delete(
  '/sessions/:id',
  authenticate,
  validateRequest({ params: AuthSchema.sessionIdParamSchema }),
  AuthController.revokeSessionHandler,
);

export const AuthRoutes = router;
