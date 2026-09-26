// auth.controller.ts
import { AppError } from '@/lib/response/AppError';
import sendResponse from '@/lib/response/response';
import { validatedBody, validatedParams } from '@/middlewares/validateRequest.middleware';
import catchAsync from '@/utils/catchAsync';
import { UsersSerializer } from '@/modules/users/users.serializer';
import { UsersService } from '@/modules/users/users.service';
import { CookieOptions, Request, Response } from 'express';
import { AuthInputType } from './auth.schemas';
import { AuthService } from './auth.service';

const REFRESH_COOKIE_NAME = 'jid';
const AUTH_COOKIE_PATH = '/api/v1/auth';

const getCookieOptions = (maxAgeMs: number): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: AUTH_COOKIE_PATH,
  maxAge: maxAgeMs,
});

const extractClientMeta = (req: Request) => req.clientMeta;

const registerHandler = catchAsync(async (req: Request, res: Response) => {
  const payload = validatedBody<AuthInputType['registerPayload']>(req);
  const result = await AuthService.register(payload);

  req.log.info({ email: payload.email }, 'User registered successfully');
  return sendResponse.ok(res, UsersSerializer.userSummary(result.user), result.message);
});

const loginHandler = catchAsync(async (req: Request, res: Response) => {
  const payload = validatedBody<AuthInputType['loginPayload']>(req);
  const meta = extractClientMeta(req);
  const { accessToken, refreshToken, expiresAt } = await AuthService.login(payload, meta);

  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions(maxAge));

  req.log.info({ email: payload.email }, 'User logged in successfully');
  return sendResponse.ok(res, { accessToken }, 'User logged in successfully');
});

const verifyOtpHandler = catchAsync(async (req: Request, res: Response) => {
  const payload = validatedBody<AuthInputType['verifyOtpPayload']>(req);
  const meta = extractClientMeta(req);

  const result = await AuthService.verifyOtpAndCompleteAction(payload, meta);

  return sendResponse.ok(res, result, 'Verification successful');
});

const refreshHandler = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    throw AppError.unauthorized('Refresh token not found');
  }

  const meta = extractClientMeta(req);
  const { accessToken, refreshToken, expiresAt } = await AuthService.refreshTokens(token, meta);

  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions(maxAge));

  return sendResponse.ok(res, { accessToken }, 'Token refreshed successfully');
});

const forgotPasswordHandler = catchAsync(async (req: Request, res: Response) => {
  const payload = validatedBody<AuthInputType['forgotPasswordPayload']>(req);
  const result = await AuthService.forgotPassword(payload);

  req.log.info({ email: payload.email }, 'User forgot password');
  return sendResponse.ok(res, result, 'Password reset email sent successfully');
});

const resetPasswordHandler = catchAsync(async (req: Request, res: Response) => {
  const payload = validatedBody<AuthInputType['resetPasswordPayload']>(req);
  const result = await AuthService.resetPassword(payload);

  req.log.info('User reset password');
  return sendResponse.ok(res, result, 'Password reset successfully');
});

const logoutHandler = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (token) {
    await AuthService.logout(token);
  }

  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: AUTH_COOKIE_PATH,
  });

  req.log.info('User logged out');
  return sendResponse.ok(res, null, 'Logged out successfully');
});

const resendOtpHandler = catchAsync(async (req: Request, res: Response) => {
  const payload = validatedBody<AuthInputType['resendOtpPayload']>(req);
  const result = await AuthService.resendOtp(payload, extractClientMeta(req));

  req.log.info({ email: payload.email, purpose: payload.purpose }, 'OTP resent');
  return sendResponse.ok(res, result, 'Verification code sent');
});

const meHandler = catchAsync(async (req: Request, res: Response) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }
  // Delegates to the users module so there is one service and one serializer
  // behind both /auth/me and /users/me. Kept for backwards compatibility.
  const user = await UsersService.getCurrentUser(req.auth);
  return sendResponse.ok(res, UsersSerializer.currentUser(user), 'Current user');
});

const listSessionsHandler = catchAsync(async (req: Request, res: Response) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }
  const sessions = await AuthService.listSessions(req.auth.userId, req.auth.sessionId);
  return sendResponse.ok(res, sessions, 'Active sessions');
});

const revokeSessionHandler = catchAsync(async (req: Request, res: Response) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }
  const { id } = validatedParams<AuthInputType['sessionIdParams']>(req);
  const result = await AuthService.revokeSession(req.auth.userId, id);
  return sendResponse.ok(res, result, 'Session revoked');
});

const revokeOtherSessionsHandler = catchAsync(async (req: Request, res: Response) => {
  if (!req.auth) {
    throw AppError.unauthorized();
  }
  const result = await AuthService.revokeOtherSessions(req.auth.userId, req.auth.sessionId);
  return sendResponse.ok(res, result, 'Other sessions revoked');
});

export const AuthController = {
  registerHandler,
  verifyOtpHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  resendOtpHandler,
  meHandler,
  listSessionsHandler,
  revokeSessionHandler,
  revokeOtherSessionsHandler,
};
