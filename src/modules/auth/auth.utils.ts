import crypto from 'crypto';
import * as jose from 'jose';

const ACCESS_SECRET = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET!);

interface AccessTokenPayload extends jose.JWTPayload {
  sub: string;
  role: string;
  agencyId: string;
}

const signAccessToken = async (payload: {
  userId: string;
  role: string;
  agencyId: string;
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
    .setExpirationTime('15m')
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

export const AuthUtils = {
  signAccessToken,
  verifyAccessToken,
  generateOpaqueRefreshToken,
  hashToken,
  parseCompoundToken,
};
