import { Request, Response } from 'express';
import { AuthServices } from './auth.service';

const REFRESH_COOKIE_NAME = 'jid';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const loginHandler = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const meta = { ip: req.ip, userAgent: req.headers['user-agent'] };

    const { accessToken, refreshToken } = await AuthServices.login(email, password, meta);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, COOKIE_OPTIONS);
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
    const { accessToken, refreshToken } = await AuthServices.refreshTokens(token, meta);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, COOKIE_OPTIONS);
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
