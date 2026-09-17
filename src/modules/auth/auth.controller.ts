// auth.controller.ts
import { AppError } from '@/lib/response/AppError';
import sendResponse from '@/lib/response/response';
import catchAsync from '@/utils/catchAsync';
import { CookieOptions, Request, Response } from 'express';
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

const extractClientMeta = (req: Request) => {
  return (
    req.clientMeta ?? {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    }
  );
};

const registerHandler = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.register(req.body);

  req.log?.info({ email: req.body.email }, 'User registered successfully');
  return sendResponse.ok(res, result.user, result.message);
});

const loginHandler = catchAsync(async (req: Request, res: Response) => {
  const meta = extractClientMeta(req);
  const { accessToken, refreshToken, expiresAt } = await AuthService.login(req.body, meta);

  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions(maxAge));

  req.log?.info({ email: req.body.email }, 'User logged in successfully');
  return sendResponse.ok(res, { accessToken }, 'User logged in successfully');
});

const verifyOtpHandler = catchAsync(async (req: Request, res: Response) => {
  const meta = extractClientMeta(req);

  const result = await AuthService.verifyOtpAndCompleteAction(req.body, meta);

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
  const result = await AuthService.forgotPassword(req.body);

  req.log?.info({ email: req.body.email }, 'User forgot password');
  return sendResponse.ok(res, result, 'Password reset email sent successfully');
});

const resetPasswordHandler = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.resetPassword(req.body);

  req.log?.info({ email: req.body.email }, 'User reset password');
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

  req.log?.info('User logged out');
  return sendResponse.ok(res, null, 'Logged out successfully');
});

export const AuthController = {
  registerHandler,
  verifyOtpHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
};
