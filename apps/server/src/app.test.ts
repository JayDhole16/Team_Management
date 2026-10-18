import { ApiErrorSchema, apiSuccess, HealthDataSchema } from '@lk/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { createDataAccess } from './repositories';
import type { HealthRepository } from './repositories/health.repository';
import { testEnv, testPrisma } from './test/helpers';

const okRepo: HealthRepository = { pingDb: async () => undefined };
const downRepo: HealthRepository = {
  pingDb: async () => {
    throw new Error('ECONNREFUSED');
  },
};

function makeApp(healthRepo: HealthRepository) {
  return buildApp({ healthRepo, data: createDataAccess(testPrisma()), env: testEnv() });
}

let app: ReturnType<typeof buildApp> | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /api/v1/health', () => {
  it('returns 200 with db ok', async () => {
    app = makeApp(okRepo);
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = apiSuccess(HealthDataSchema).parse(res.json());
    expect(body.data).toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('returns 503 with db down when the database is unreachable', async () => {
    app = makeApp(downRepo);
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(503);
    const body = apiSuccess(HealthDataSchema).parse(res.json());
    expect(body.data).toMatchObject({ status: 'degraded', db: 'down' });
  });
});

describe('error envelope', () => {
  it('unknown routes return a 404 { error } body', async () => {
    app = makeApp(okRepo);
    const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('NOT_FOUND');
  });

  it('unexpected errors return a generic 500 without internals', async () => {
    app = makeApp(okRepo);
    app.get('/boom', { config: { auth: 'public' } }, async () => {
      throw new Error('secret internal detail');
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret internal detail');
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('INTERNAL_ERROR');
  });

  it('validation errors return 400 VALIDATION_ERROR without echoing values', async () => {
    app = makeApp(okRepo);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'not-an-email', password: 'leak-me-please' },
    });
    expect(res.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('VALIDATION_ERROR');
    expect(res.body).not.toContain('leak-me-please');
  });
});
