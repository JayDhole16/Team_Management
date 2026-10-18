import type { UserRole } from '@lk/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { User } from '../generated/prisma/client';
import { verifyAccessToken } from '../lib/access-token';
import { forbidden, unauthorized } from '../lib/errors';
import type { ServiceContext } from '../services/context';

/** Every route must say who may call it: `'public'` or a list of roles. */
export type RouteAuth = 'public' | readonly UserRole[];

export interface RouteAuthEntry {
  method: string;
  url: string;
  auth: RouteAuth;
}

declare module 'fastify' {
  interface FastifyContextConfig {
    auth?: RouteAuth;
  }
  interface FastifyRequest {
    authUser: User | null;
  }
  interface FastifyInstance {
    /** Every registered route and its auth rule (used by the RBAC tests). */
    routeAuthTable: RouteAuthEntry[];
  }
}

/**
 * Server-side RBAC. Must be registered before any route.
 * - Startup fails if a route forgets `config.auth`.
 * - The user is re-read from the database on every request, so deactivation and role
 *   changes take effect immediately, not when the access token expires.
 */
export function registerAuth(app: FastifyInstance, ctx: ServiceContext) {
  app.decorate('routeAuthTable', [] as RouteAuthEntry[]);
  app.decorateRequest('authUser', null);

  app.addHook('onRoute', (route) => {
    const auth = route.config?.auth;
    if (auth === undefined) {
      throw new Error(`Route ${String(route.method)} ${route.url} must declare config.auth`);
    }
    for (const method of [route.method].flat()) {
      app.routeAuthTable.push({ method, url: route.url, auth });
    }
  });

  app.addHook('onRequest', async (request) => {
    const auth = request.routeOptions.config.auth;
    // `undefined` only for Fastify's own 404 handler.
    if (auth === undefined || auth === 'public') return;

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    const claims = await verifyAccessToken(header.slice(7), ctx.env.JWT_SECRET, ctx.clock());
    if (!claims) throw unauthorized();

    const user = await ctx.data.repos.users.findById(claims.sub);
    if (!user || user.status !== 'ACTIVE') throw unauthorized();
    if (!auth.includes(user.role)) throw forbidden();
    request.authUser = user;
  });
}

/** The signed-in user on a non-public route (the onRequest hook guarantees it). */
export function currentUser(request: FastifyRequest): User {
  if (!request.authUser) throw unauthorized();
  return request.authUser;
}
