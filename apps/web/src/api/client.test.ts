import { HealthDataSchema } from '@lk/shared';
import { describe, expect, it } from 'vitest';
import { ApiError, apiGet } from './client';
import { fetchHealth } from './health';

function fakeFetch(status: number, body: unknown): typeof fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
}

const healthy = { status: 'ok', db: 'ok', time: '2026-10-18T10:00:00.000Z' };
const down = { status: 'degraded', db: 'down', time: '2026-10-18T10:00:00.000Z' };

describe('apiGet', () => {
  it('returns parsed data on success', async () => {
    const data = await apiGet('/health', HealthDataSchema, {
      fetchImpl: fakeFetch(200, { data: healthy }),
    });
    expect(data).toEqual(healthy);
  });

  it('throws ApiError with the server code for an error envelope', async () => {
    const promise = apiGet('/x', HealthDataSchema, {
      fetchImpl: fakeFetch(404, { error: { code: 'NOT_FOUND', message: 'Route not found' } }),
    });
    await expect(promise).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('rejects a success body that does not match the schema', async () => {
    const promise = apiGet('/health', HealthDataSchema, {
      fetchImpl: fakeFetch(200, { data: { status: 'ok' } }),
    });
    await expect(promise).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('reports a network failure', async () => {
    const promise = apiGet('/health', HealthDataSchema, {
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});

describe('fetchHealth', () => {
  it('treats a 503 body as data so the page can show "database down"', async () => {
    await expect(fetchHealth(fakeFetch(503, { data: down }))).resolves.toEqual(down);
  });
});
