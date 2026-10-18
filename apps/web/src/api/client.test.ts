import { HealthDataSchema, type AuthTokenResponse } from '@lk/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AuthSession } from '../auth/session';
import { ApiError, apiGet, apiPost } from './client';
import { offsetFromDateHeader } from './clock';
import { fetchHealth } from './health';
import { toQuery } from './query';

function fakeFetch(status: number, body: unknown): typeof fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const healthy = { status: 'ok', db: 'ok', time: '2026-10-18T10:00:00.000Z' };
const down = { status: 'degraded', db: 'down', time: '2026-10-18T10:00:00.000Z' };

const me: AuthTokenResponse['user'] = {
  id: '6f1c2c55-6a55-4c1b-9d55-0d6b0c0a0a01',
  email: 'e@example.com',
  name: 'Emp',
  role: 'EMPLOYEE',
  status: 'ACTIVE',
  jobRoleId: null,
  deviceMode: 'PERSONAL',
  idleIntervalMin: 20,
  faceEnrolled: false,
};
const tokens = (accessToken: string): { data: AuthTokenResponse } => ({
  data: { accessToken, accessTokenExpiresAt: '2026-10-18T10:15:00.000Z', user: me },
});

interface Call {
  url: string;
  method: string;
  auth: string | null;
  body: string | null;
}

/** A scripted fetch: answers in order and records each request. */
function scripted(responses: Response[]) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      auth: headers.get('Authorization'),
      body: typeof init?.body === 'string' ? init.body : null,
    });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next;
  };
  return { calls, fetchImpl };
}

describe('apiGet', () => {
  it('returns parsed data on success', async () => {
    const data = await apiGet('/health', HealthDataSchema, {
      auth: false,
      fetchImpl: fakeFetch(200, { data: healthy }),
    });
    expect(data).toEqual(healthy);
  });

  it('throws ApiError with the server code for an error envelope', async () => {
    const promise = apiGet('/x', HealthDataSchema, {
      auth: false,
      fetchImpl: fakeFetch(404, { error: { code: 'NOT_FOUND', message: 'Route not found' } }),
    });
    await expect(promise).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('rejects a success body that does not match the schema', async () => {
    const promise = apiGet('/health', HealthDataSchema, {
      auth: false,
      fetchImpl: fakeFetch(200, { data: { status: 'ok' } }),
    });
    await expect(promise).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('reports a network failure', async () => {
    const promise = apiGet('/health', HealthDataSchema, {
      auth: false,
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});

describe('signed-in requests', () => {
  const Ok = z.object({ ok: z.boolean() });

  it('sends the JSON body and the Bearer token', async () => {
    const { calls, fetchImpl } = scripted([json(200, { data: { ok: true } })]);
    const session = new AuthSession({ fetchImpl });
    session.setSession(tokens('tok-1').data);
    await apiPost('/things', Ok, { a: 1 }, { fetchImpl, session });
    expect(calls[0]).toMatchObject({
      url: '/api/v1/things',
      method: 'POST',
      auth: 'Bearer tok-1',
      body: '{"a":1}',
    });
  });

  it('on 401 refreshes once and retries with the new token', async () => {
    const { calls, fetchImpl } = scripted([
      json(401, { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } }),
      json(200, tokens('tok-2')),
      json(200, { data: { ok: true } }),
    ]);
    const session = new AuthSession({ fetchImpl });
    session.setSession(tokens('tok-1').data);
    await expect(apiGet('/things', Ok, { fetchImpl, session })).resolves.toEqual({ ok: true });
    expect(calls.map((c) => c.url)).toEqual([
      '/api/v1/things',
      '/api/v1/auth/refresh',
      '/api/v1/things',
    ]);
    expect(calls[2]?.auth).toBe('Bearer tok-2');
  });

  it('signs out when the refresh is refused', async () => {
    const { calls, fetchImpl } = scripted([
      json(401, { error: { code: 'UNAUTHORIZED', message: 'Please log in.' } }),
      json(401, { error: { code: 'INVALID_REFRESH_TOKEN', message: 'ended' } }),
    ]);
    const session = new AuthSession({ fetchImpl });
    session.setSession(tokens('tok-1').data);
    await expect(apiGet('/things', Ok, { fetchImpl, session })).rejects.toMatchObject({
      status: 401,
    });
    expect(calls).toHaveLength(2);
    expect(session.getToken()).toBeNull();
    expect(session.getSnapshot()).toMatchObject({ status: 'signed-out', user: null });
    expect(session.getSnapshot().notice).toMatch(/log in again/);
  });

  it('public calls never refresh and never send a token', async () => {
    const { calls, fetchImpl } = scripted([
      json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Wrong email or password.' } }),
    ]);
    const session = new AuthSession({ fetchImpl });
    session.setSession(tokens('tok-1').data);
    await expect(
      apiPost('/auth/login', Ok, { email: 'x' }, { fetchImpl, session, auth: false }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.auth).toBeNull();
  });
});

describe('fetchHealth', () => {
  it('treats a 503 body as data so the page can show "database down"', async () => {
    await expect(fetchHealth(fakeFetch(503, { data: down }))).resolves.toEqual(down);
  });
});

describe('offsetFromDateHeader', () => {
  const local = Date.parse('2026-10-18T10:00:00.000Z');

  it('ignores small differences (header has 1 s resolution)', () => {
    expect(offsetFromDateHeader('Sun, 18 Oct 2026 10:00:01 GMT', local)).toBe(0);
  });

  it('measures a device clock that is 5 minutes slow', () => {
    expect(offsetFromDateHeader('Sun, 18 Oct 2026 10:05:00 GMT', local)).toBe(300_500);
  });

  it('returns null for a missing or broken header', () => {
    expect(offsetFromDateHeader(null, local)).toBeNull();
    expect(offsetFromDateHeader('not a date', local)).toBeNull();
  });
});

describe('toQuery', () => {
  it('leaves out empty values', () => {
    expect(toQuery({ a: 'x', b: undefined, c: '' })).toBe('?a=x');
    expect(toQuery({})).toBe('');
  });
});
