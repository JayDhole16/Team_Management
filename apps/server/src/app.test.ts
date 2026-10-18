import { ApiErrorSchema, apiSuccess, HealthDataSchema } from '@lk/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { HealthRepository } from './repositories/health.repository';

const okRepo: HealthRepository = { pingDb: async () => undefined };
const downRepo: HealthRepository = {
  pingDb: async () => {
    throw new Error('ECONNREFUSED');
  },
};

let app: ReturnType<typeof buildApp> | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /api/v1/health', () => {
  it('returns 200 with db ok', async () => {
    app = buildApp({ healthRepo: okRepo });
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = apiSuccess(HealthDataSchema).parse(res.json());
    expect(body.data).toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('returns 503 with db down when the database is unreachable', async () => {
    app = buildApp({ healthRepo: downRepo });
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(503);
    const body = apiSuccess(HealthDataSchema).parse(res.json());
    expect(body.data).toMatchObject({ status: 'degraded', db: 'down' });
  });
});

describe('error envelope', () => {
  it('unknown routes return a 404 { error } body', async () => {
    app = buildApp({ healthRepo: okRepo });
    const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('NOT_FOUND');
  });

  it('unexpected errors return a generic 500 without internals', async () => {
    app = buildApp({ healthRepo: okRepo });
    app.get('/boom', async () => {
      throw new Error('secret internal detail');
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret internal detail');
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('INTERNAL_ERROR');
  });
});
