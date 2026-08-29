import * as jose from 'jose';

const ACCESS_SECRET = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET!);
const REFRESH_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!);

interface AccessTokenPayload extends jose.JWTPayload {
  sub: string;
  role: string;
  agencyId: string;
}

interface RefreshTokenPayload extends jose.JWTPayload {
  sub: string;
  tokenId: string;
  familyId: string;
}

const signAccessToken = async (payload: {
  userId: string;
  role: string;
  agencyId: string;
}): Promise<string> => {
  return await new jose.SignJWT({
    role: payload.role,
    agencyId: payload.agencyId,
  })
    .setSubject(payload.userId)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(ACCESS_SECRET);
};

const signRefreshToken = async (payload: {
  userId: string;
  tokenId: string;
  familyId: string;
}): Promise<string> => {
  return await new jose.SignJWT({
    tokenId: payload.tokenId,
    familyId: payload.familyId,
  })
    .setSubject(payload.userId)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(REFRESH_SECRET);
};

const verifyAccessToken = async (token: string): Promise<AccessTokenPayload> => {
  const { payload } = await jose.jwtVerify(token, ACCESS_SECRET);
  return payload as AccessTokenPayload;
};

const verifyRefreshToken = async (token: string): Promise<RefreshTokenPayload> => {
  const { payload } = await jose.jwtVerify(token, REFRESH_SECRET);
  return payload as RefreshTokenPayload;
};

export const AuthUtils = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
