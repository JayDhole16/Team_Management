import { randomUUID } from 'node:crypto';
import { ApiErrorSchema } from '@lk/shared';
import type { HTTPMethods } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { createDataAccess } from '../repositories';
import { bearer, createHarness, testEnv, testPrisma, type Harness } from '../test/helpers';

function concreteUrl(url: string) {
  return url.replace(/:[A-Za-z]+/g, randomUUID());
}

describe('route auth declarations', () => {
  it('refuses to register a route without config.auth', () => {
    const app = buildApp({
      healthRepo: { pingDb: async () => undefined },
      data: createDataAccess(testPrisma()),
      env: testEnv(),
    });
    expect(() => app.get('/api/v1/forgot-auth', async () => ({ data: 1 }))).toThrow(
      /must declare config.auth/,
    );
  });
});

describe('RBAC on every route', () => {
  let h: Harness;
  let employeeToken: string;
  let ownerToken: string;

  beforeAll(async () => {
    h = await createHarness();
    const employee = await h.registerEmployee();
    employeeToken = employee.accessToken;
    ownerToken = employee.ownerToken;
  });

  const ownerOnly = () =>
    h.app.routeAuthTable.filter((r) => r.auth !== 'public' && !r.auth.includes('EMPLOYEE'));
  const protectedRoutes = () => h.app.routeAuthTable.filter((r) => r.auth !== 'public');

  it('has the expected owner-only routes registered', () => {
    const urls = ownerOnly().map((r) => `${r.method} ${r.url}`);
    expect(urls).toEqual(
      expect.arrayContaining([
        'POST /api/v1/codes/invite',
        'POST /api/v1/codes/password-reset/:userId',
        'POST /api/v1/codes/face-rescan/:userId',
        'GET /api/v1/codes',
        'DELETE /api/v1/codes/:id',
        'GET /api/v1/employees',
        'GET /api/v1/employees/:id',
        'PATCH /api/v1/employees/:id',
        'POST /api/v1/employees/:id/deactivate',
        'POST /api/v1/employees/:id/reactivate',
        'POST /api/v1/job-roles',
      ]),
    );
  });

  it('an employee token gets 403 on EVERY owner-only route', async () => {
    for (const route of ownerOnly()) {
      const res = await h.app.inject({
        method: route.method as HTTPMethods,
        url: concreteUrl(route.url),
        headers: bearer(employeeToken),
        payload: route.method === 'GET' || route.method === 'HEAD' ? undefined : {},
      });
      expect(res.statusCode, `${route.method} ${route.url}`).toBe(403);
      if (route.method !== 'HEAD') {
        expect(ApiErrorSchema.parse(res.json()).error.code).toBe('FORBIDDEN');
      }
    }
  });

  it('no token gets 401 on every protected route', async () => {
    for (const route of protectedRoutes()) {
      const res = await h.app.inject({
        method: route.method as HTTPMethods,
        url: concreteUrl(route.url),
      });
      expect(res.statusCode, `${route.method} ${route.url}`).toBe(401);
    }
  });

  it('a garbage or tampered token gets 401', async () => {
    for (const token of ['garbage', `${ownerToken.slice(0, -4)}AAAA`]) {
      const res = await h.app.inject({
        method: 'GET',
        url: '/api/v1/employees',
        headers: bearer(token),
      });
      expect(res.statusCode).toBe(401);
    }
  });

  it('an expired access token gets 401', async () => {
    h.clock.advanceMinutes(16);
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/v1/employees',
      headers: bearer(ownerToken),
    });
    expect(res.statusCode).toBe(401);
  });

  it('the owner cannot use employee-only routes', async () => {
    const owner = await h.ownerToken();
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/me/face-template',
      headers: bearer(owner),
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });
});
