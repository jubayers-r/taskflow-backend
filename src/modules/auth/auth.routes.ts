// routes/auth.routes.ts
import { describeRoute } from '@/lib/openapi';
import sendResponse from '@/lib/response/response';
import { authenticate } from '@/middlewares/auth.middleware';
import { authLimiter } from '@/middlewares/rateLimiter.middleware';
import { validateRequest } from '@/middlewares/validateRequest.middleware';
import { Router } from 'express';
import { AuthController } from './auth.controller';
import { AuthSchema } from './auth.schema';

const router = Router();

describeRoute({
  method: 'get',
  path: '/api/v1/auth',
  tags: ['Auth'],
  summary: 'List available auth endpoints',
  responses: { 200: 'Auth endpoint index' },
});
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
        me: 'GET /api/v1/auth/me',
        sessions: 'GET /api/v1/auth/sessions',
        forgotPassword: 'POST /api/v1/auth/forgot-password',
        resetPassword: 'POST /api/v1/auth/reset-password',
        resendOtp: 'POST /api/v1/auth/resend-otp',
      },
    },
    'Auth API',
  ),
);

// Sensitive credential / OTP endpoints are rate limited per client.
describeRoute({
  method: 'post',
  path: '/api/v1/auth/register',
  tags: ['Auth'],
  summary: 'Register a new account',
  body: AuthSchema.registerSchema,
  responses: {
    200: 'Registration accepted',
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
  path: '/api/v1/auth/me',
  tags: ['Auth'],
  summary: 'Get the currently authenticated user',
  responses: { 200: 'Current user', 401: 'Missing or invalid access token' },
});
router.get('/me', authenticate, AuthController.meHandler);

describeRoute({
  method: 'get',
  path: '/api/v1/auth/sessions',
  tags: ['Auth'],
  summary: 'List active sessions for the current user',
  responses: { 200: 'Active sessions', 401: 'Missing or invalid access token' },
});
router.get('/sessions', authenticate, AuthController.listSessionsHandler);

describeRoute({
  method: 'delete',
  path: '/api/v1/auth/sessions',
  tags: ['Auth'],
  summary: 'Revoke every session except the current one',
  responses: { 200: 'Other sessions revoked', 401: 'Missing or invalid access token' },
});
router.delete('/sessions', authenticate, AuthController.revokeOtherSessionsHandler);

describeRoute({
  method: 'delete',
  path: '/api/v1/auth/sessions/{id}',
  tags: ['Auth'],
  summary: 'Revoke a specific session',
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
