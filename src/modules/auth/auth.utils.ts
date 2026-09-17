import { env } from '@/config';
import crypto from 'crypto';
import * as jose from 'jose';

const ACCESS_SECRET = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const OTP_PEPPER = env.OTP_PEPPER_SECRET;

interface AccessTokenPayload extends jose.JWTPayload {
  sub: string;
  role: string;
  agencyId: string | null;
}

const signAccessToken = async (payload: {
  userId: string;
  role: string;
  agencyId: string | null;
  sessionId: string;
}): Promise<string> => {
  return await new jose.SignJWT({
    role: payload.role,
    agencyId: payload.agencyId,
    sessionId: payload.sessionId,
  })
    .setSubject(payload.userId)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_EXPIRES_IN)
    .sign(ACCESS_SECRET);
};

const verifyAccessToken = async (token: string): Promise<AccessTokenPayload> => {
  const { payload } = await jose.jwtVerify(token, ACCESS_SECRET);
  return payload as AccessTokenPayload;
};

// Opaque Token Helpers
const generateOpaqueRefreshToken = (sessionId: string) => {
  const rawSecret = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawSecret);
  const refreshToken = `${sessionId}.${rawSecret}`;
  return { rawSecret, tokenHash, refreshToken };
};

const generateResetToken = () => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
};

const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const parseCompoundToken = (compoundToken: string): { sessionId: string; rawSecret: string } => {
  const parts = compoundToken.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('INVALID_TOKEN_FORMAT');
  }
  return { sessionId: parts[0], rawSecret: parts[1] };
};

// OTP Utils
const generateOtpCode = (): string => {
  return crypto.randomInt(100000, 1000000).toString();
};

const hashOtp = (code: string): string => {
  return crypto.createHmac('sha256', OTP_PEPPER).update(code).digest('hex');
};

const verifyOtpHash = (rawOtp: string, storedHash: string): boolean => {
  const computedHash = hashOtp(rawOtp);
  const bufA = Buffer.from(computedHash, 'hex');
  const bufB = Buffer.from(storedHash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

export const AuthUtils = {
  signAccessToken,
  verifyAccessToken,
  generateOpaqueRefreshToken,
  hashToken,
  parseCompoundToken,
  generateOtpCode,
  hashOtp,
  verifyOtpHash,
  generateResetToken,
};
