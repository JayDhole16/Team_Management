import type { LoginBody, Me } from '@lk/shared';
import type { User } from '../generated/prisma/client';
import { signAccessToken } from '../lib/access-token';
import { keyedHash, randomToken } from '../lib/crypto';
import { AppError, rateLimited } from '../lib/errors';
import { burnPasswordCheck, verifyPassword } from '../lib/passwords';
import type { ServiceContext } from './context';
import { toMe } from './mappers';
import { closeOpenSession } from './session.service';

export interface IssuedSession {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: Me;
}

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
const invalidRefresh = () =>
  new AppError(401, 'INVALID_REFRESH_TOKEN', 'Your session has ended. Please log in again.');
export const accountDeactivated = () =>
  new AppError(403, 'ACCOUNT_DEACTIVATED', 'Your account is deactivated. Contact the owner.');

async function issueSession(ctx: ServiceContext, user: User): Promise<IssuedSession> {
  const now = ctx.clock();
  const refreshToken = randomToken();
  const refreshTokenExpiresAt = new Date(
    now.getTime() + ctx.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60_000,
  );
  await ctx.data.repos.refreshTokens.create({
    userId: user.id,
    tokenHash: keyedHash(ctx.env.REFRESH_TOKEN_SECRET, refreshToken),
    expiresAt: refreshTokenExpiresAt,
  });
  const access = await signAccessToken(
    { sub: user.id, role: user.role },
    ctx.env.JWT_SECRET,
    now,
    ctx.env.ACCESS_TOKEN_TTL_MIN,
  );
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken,
    refreshTokenExpiresAt,
    user: toMe(user),
  };
}

export async function login(
  ctx: ServiceContext,
  input: LoginBody & { ip: string },
): Promise<IssuedSession> {
  const { login: byIp, loginAccount: byAccount } = ctx.limiters;
  if (byIp.isBlocked(input.ip) || byAccount.isBlocked(input.email)) throw rateLimited();

  const user = await ctx.data.repos.users.findByEmail(input.email);
  const ok = user
    ? await verifyPassword(user.passwordHash, input.password)
    : (await burnPasswordCheck(input.password), false);
  if (!user || !ok) {
    byIp.recordFailure(input.ip);
    // Counted for unknown emails too, so the lock does not reveal which accounts exist.
    if (byAccount.recordFailure(input.email).keyLimitReached && user) {
      await ctx.data.repos.audit.record({
        action: 'auth.login_account_locked',
        entity: 'user',
        entityId: user.id,
        meta: { lastIp: input.ip, windowMinutes: 15 },
        at: ctx.clock(),
      });
      ctx.bus.emit('security:alert', {
        kind: 'LOGIN_ACCOUNT_LOCKED',
        // The name, not the email: this text goes over the socket and onto the owner's screen.
        message: `Too many wrong passwords for ${user.name}'s account. Login for it is paused for 15 minutes.`,
        at: ctx.clock().toISOString(),
      });
    }
    throw invalidCredentials();
  }
  // Only after the correct password, so this does not reveal which emails exist.
  if (user.status !== 'ACTIVE') throw accountDeactivated();

  return issueSession(ctx, user);
}

/** Rotates the refresh token: the old one stops working, a new one is issued. */
export async function refresh(ctx: ServiceContext, refreshToken: string): Promise<IssuedSession> {
  const now = ctx.clock();
  const repos = ctx.data.repos;
  const stored = await repos.refreshTokens.findByHash(
    keyedHash(ctx.env.REFRESH_TOKEN_SECRET, refreshToken),
  );
  if (!stored || stored.expiresAt <= now) throw invalidRefresh();

  if (stored.revokedAt) {
    // A revoked token being reused means it may have been stolen: end every session.
    await repos.refreshTokens.revokeAllForUser(stored.userId, now);
    await repos.audit.record({
      action: 'auth.refresh_token_reuse',
      entity: 'user',
      entityId: stored.userId,
      at: now,
    });
    ctx.bus.emit('security:alert', {
      kind: 'REFRESH_TOKEN_REUSE',
      message: 'An old login token was reused. All sessions of that user were signed out.',
      at: now.toISOString(),
    });
    throw invalidRefresh();
  }
  if ((await repos.refreshTokens.revoke(stored.id, now)) !== 1) throw invalidRefresh();

  const user = await repos.users.findById(stored.userId);
  if (!user || user.status !== 'ACTIVE') throw invalidRefresh();
  return issueSession(ctx, user);
}

export async function logout(ctx: ServiceContext, refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  const stored = await ctx.data.repos.refreshTokens.findByHash(
    keyedHash(ctx.env.REFRESH_TOKEN_SECRET, refreshToken),
  );
  if (!stored) return;
  const now = ctx.clock();
  // Only a still-valid login ends the work session (an old cookie just gets cleared).
  const revoked = await ctx.data.repos.refreshTokens.revoke(stored.id, now);
  if (revoked === 1 && stored.expiresAt > now) {
    await ctx.data.transaction((repos) => closeOpenSession(repos, stored.userId, now, 'LOGOUT'));
    ctx.bus.emit('presence:changed', { userId: stored.userId });
  }
}
