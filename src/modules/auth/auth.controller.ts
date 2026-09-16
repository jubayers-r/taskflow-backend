// auth.controller.ts

import { AppError } from '@/lib/response/AppError';
import sendResponse from '@/lib/response/response';
import catchAsync from '@/utils/catchAsync';
import { Request, Response } from 'express';
import { AuthServices } from './auth.service';

const REFRESH_COOKIE_NAME = 'jid';

const getCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge,
});

const loginHandler = catchAsync(async (req: Request, res: Response) => {
  const meta = { ip: req.ip, userAgent: req.headers['user-agent'] };
  const { accessToken, refreshToken, expiresAt } = await AuthServices.login(req.body, meta);

  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions(maxAge));

  req.log.info({ email: req.body.email }, 'User logged in successfully');
  return sendResponse.ok(res, 'User logged in successfully', { accessToken });
});

const refreshHandler = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  if (!token) {
    throw AppError.unauthorized('Refresh token not found');
  }

  const meta = { ip: req.ip, userAgent: req.headers['user-agent'] };
  const { accessToken, refreshToken, expiresAt } = await AuthServices.refreshTokens(token, meta);

  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions(maxAge));

  return sendResponse.ok(res, 'Token refreshed successfully', { accessToken });
});

const logoutHandler = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  if (token) {
    await AuthServices.logout(token);
  }

  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
  req.log.info('User logged out');

  return sendResponse.ok(res, 'Logged out successfully');
});

export const AuthController = {
  loginHandler,
  refreshHandler,
  logoutHandler,
};
