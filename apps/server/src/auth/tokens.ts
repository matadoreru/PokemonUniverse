import type { AuthUser } from '@pokemon-universe/shared';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
export const AUTH_COOKIE = 'pu_session';

export async function signIdentity(identity: AuthUser): Promise<string> {
  return new SignJWT({ displayName: identity.displayName, kind: identity.kind, ...(identity.email ? { email: identity.email } : {}) })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(identity.id).setIssuedAt()
    .setExpirationTime(identity.kind === 'GUEST' ? '30d' : '7d').sign(secret);
}

export async function verifyIdentity(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
  if (!payload.sub || typeof payload.displayName !== 'string' || (payload.kind !== 'USER' && payload.kind !== 'GUEST')) throw new Error('Invalid identity token');
  return {
    id: payload.sub, displayName: payload.displayName, kind: payload.kind,
    ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
  };
}
