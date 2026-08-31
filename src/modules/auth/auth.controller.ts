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

const loginHandler = async (req: Request, res: Response) => {
  try {
    const meta = { ip: req.ip, userAgent: req.headers['user-agent'] };
    const { accessToken, refreshToken, expiresAt } = await AuthServices.login(req.body, meta);

    const maxAge = Math.max(0, expiresAt.getTime() - Date.now());

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions(maxAge));
    return res.status(200).json({ accessToken });
  } catch (err: any) {
    return res.status(401).json({ message: err.message || 'Authentication failed' });
  }
};

const refreshHandler = async (req: Request, res: Response) => {
  try {
    const token = req.cookies[REFRESH_COOKIE_NAME];
    if (!token) return res.status(401).json({ message: 'Refresh token missing' });

    const meta = { ip: req.ip, userAgent: req.headers['user-agent'] };
    const { accessToken, refreshToken, expiresAt } = await AuthServices.refreshTokens(token, meta);

    const maxAge = Math.max(0, expiresAt.getTime() - Date.now());

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions(maxAge));
    return res.status(200).json({ accessToken });
  } catch (err: any) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
    return res.status(401).json({ message: err.message || 'Session expired' });
  }
};

const logoutHandler = async (req: Request, res: Response) => {
  const token = req.cookies[REFRESH_COOKIE_NAME];
  if (token) {
    await AuthServices.logout(token);
  }
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
  return res.status(200).json({ message: 'Logged out successfully' });
};

export const AuthController = {
  loginHandler,
  refreshHandler,
  logoutHandler,
};
