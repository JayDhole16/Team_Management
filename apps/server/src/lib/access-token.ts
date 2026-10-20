import type { UserRole } from '@lk/shared';
import { jwtVerify, SignJWT } from 'jose';

const ALG = 'HS256';
const ISSUER = 'lk-workforce';

export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
}

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  claims: AccessTokenClaims,
  secret: string,
  now: Date,
  ttlMinutes: number,
): Promise<{ token: string; expiresAt: Date }> {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + ttlMinutes * 60;
  const token = await new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(key(secret));
  return { token, expiresAt: new Date(exp * 1000) };
}

export interface VerifiedAccessToken extends AccessTokenClaims {
  /** When the token stops working (sockets are closed then). */
  expiresAt: Date;
}

/** Returns null for any invalid, expired or tampered token. */
export async function verifyAccessToken(
  token: string,
  secret: string,
  now: Date,
): Promise<VerifiedAccessToken | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: [ALG],
      issuer: ISSUER,
      currentDate: now,
    });
    if (typeof payload.sub !== 'string') return null;
    if (payload.role !== 'OWNER' && payload.role !== 'EMPLOYEE') return null;
    if (typeof payload.exp !== 'number') return null;
    return { sub: payload.sub, role: payload.role, expiresAt: new Date(payload.exp * 1000) };
  } catch {
    return null;
  }
}
