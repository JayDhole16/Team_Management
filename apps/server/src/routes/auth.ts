import { LoginBodySchema, PasswordResetCompleteBodySchema } from '@lk/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { currentUser } from '../plugins/auth';
import { login, logout, refresh, type IssuedSession } from '../services/auth.service';
import type { ServiceContext } from '../services/context';
import { toMe } from '../services/mappers';
import { completePasswordReset } from '../services/password-reset.service';

export const REFRESH_COOKIE = 'lk_refresh';
const COOKIE_PATH = '/api/v1/auth';

function sendSession(ctx: ServiceContext, reply: FastifyReply, session: IssuedSession) {
  // httpOnly: page scripts can never read it. SameSite=Strict: not sent cross-site.
  void reply.setCookie(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    // Secure in production, and also whenever the request itself came over HTTPS, so a
    // deployment that forgets NODE_ENV=production still marks the cookie Secure.
    secure: ctx.env.NODE_ENV === 'production' || reply.request.protocol === 'https',
    sameSite: 'strict',
    path: COOKIE_PATH,
    expires: session.refreshTokenExpiresAt,
  });
  return reply.send({
    data: {
      accessToken: session.accessToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
      user: session.user,
    },
  });
}

export function registerAuthRoutes(app: FastifyInstance, ctx: ServiceContext) {
  const pub = { config: { auth: 'public' as const } };

  app.post('/api/v1/auth/login', pub, async (request, reply) => {
    const body = LoginBodySchema.parse(request.body);
    return sendSession(ctx, reply, await login(ctx, { ...body, ip: request.ip }));
  });

  app.post('/api/v1/auth/refresh', pub, async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE];
    if (!token) {
      return reply.code(401).send({
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Your session has ended. Please log in again.',
        },
      });
    }
    return sendSession(ctx, reply, await refresh(ctx, token));
  });

  app.post('/api/v1/auth/logout', pub, async (request, reply) => {
    await logout(ctx, request.cookies[REFRESH_COOKIE]);
    void reply.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
    return reply.send({ data: { ok: true } });
  });

  app.get('/api/v1/auth/me', { config: { auth: ['OWNER', 'EMPLOYEE'] } }, async (request) => {
    return { data: toMe(currentUser(request)) };
  });

  app.post('/api/v1/auth/password-reset/complete', pub, async (request) => {
    const body = PasswordResetCompleteBodySchema.parse(request.body);
    await completePasswordReset(ctx, { ...body, ip: request.ip });
    return { data: { ok: true } };
  });
}
