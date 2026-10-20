import {
  AckAllResultSchema,
  AlertPageSchema,
  AlertSchema,
  ApiErrorSchema,
  IdleEventResultSchema,
  OpenAlertCountSchema,
} from '@lk/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDLE_EVENTS_PER_USER } from '../services/context';
import { bearer, createHarness, EMPLOYEE_PASSWORD, type Harness } from '../test/helpers';

describe('alerts (idle events and security alerts)', () => {
  let h: Harness;
  let token: string;
  let userId: string;
  let ownerToken: string;
  beforeEach(async () => {
    h = await createHarness();
    const e = await h.registerEmployee();
    token = e.accessToken;
    userId = e.userId;
    ownerToken = e.ownerToken;
  });

  const idleEvent = (body: object, t = token) =>
    h.app.inject({
      method: 'POST',
      url: '/api/v1/agent/idle-event',
      headers: bearer(t),
      payload: body,
    });
  const ownerGet = (url: string) =>
    h.app.inject({ method: 'GET', url, headers: bearer(ownerToken) });
  const list = async (query = '') =>
    AlertPageSchema.parse(
      (await ownerGet(`/api/v1/alerts${query}`)).json<{ data: unknown }>().data,
    );
  const openCount = async () =>
    OpenAlertCountSchema.parse(
      (await ownerGet('/api/v1/alerts/open-count')).json<{ data: unknown }>().data,
    ).count;
  const now = () => h.clock.now().toISOString();

  it('an idle event becomes an open alert with the employee name, and is announced', async () => {
    const res = await idleEvent({ at: now(), reason: 'NO_FACE' });
    expect(res.statusCode, res.body).toBe(200);
    const result = IdleEventResultSchema.parse(res.json<{ data: unknown }>().data);
    expect(result.accepted).toBe(true);

    const page = await list();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: result.alertId,
      kind: 'IDLE',
      employeeId: userId,
      employeeName: 'Rahul Sharma',
      idleReason: 'NO_FACE',
      ownerAckAt: null,
    });
    expect(await openCount()).toBe(1);
    expect(h.events.alertsCreated.map((e) => e.alert.employeeName)).toEqual(['Rahul Sharma']);
  });

  it('accepts back-dated events up to 12 h, ignores older or future ones, clamps small skew', async () => {
    const at = (min: number) => new Date(h.clock.now().getTime() + min * 60_000).toISOString();
    const accepted = async (body: object) =>
      IdleEventResultSchema.parse((await idleEvent(body)).json<{ data: unknown }>().data).accepted;

    expect(await accepted({ at: at(-11 * 60), reason: 'NO_ACTIVITY' })).toBe(true);
    expect(await accepted({ at: at(-13 * 60), reason: 'NO_ACTIVITY' })).toBe(false);
    expect(await accepted({ at: at(5), reason: 'NO_ACTIVITY' })).toBe(false);
    expect(
      await accepted({
        at: new Date(h.clock.now().getTime() + 30_000).toISOString(),
        reason: 'FACE_MISMATCH',
        score: 0.71,
      }),
    ).toBe(true);

    const items = (await list()).items;
    expect(items).toHaveLength(2);
    // The skewed one is stored at "now", not in the future.
    expect(items[0]).toMatchObject({ idleReason: 'FACE_MISMATCH', score: 0.71, at: now() });
  });

  it('refuses unknown reasons and extra fields', async () => {
    expect((await idleEvent({ at: now(), reason: 'SLEEPING' })).statusCode).toBe(400);
    expect((await idleEvent({ at: now(), reason: 'NO_FACE', userId })).statusCode).toBe(400);
  });

  it(`allows ${IDLE_EVENTS_PER_USER} idle events per employee per 15 min, then 429`, async () => {
    for (let i = 0; i < IDLE_EVENTS_PER_USER; i += 1) {
      expect((await idleEvent({ at: now(), reason: 'NO_ACTIVITY' })).statusCode).toBe(200);
    }
    const blocked = await idleEvent({ at: now(), reason: 'NO_ACTIVITY' });
    expect(blocked.statusCode).toBe(429);
    expect(ApiErrorSchema.parse(blocked.json()).error.code).toBe('RATE_LIMITED');
    h.clock.advanceMinutes(16);
    const fresh = await h.login('rahul@example.com', EMPLOYEE_PASSWORD);
    expect((await idleEvent({ at: now(), reason: 'NO_ACTIVITY' }, fresh)).statusCode).toBe(200);
  });

  it('acknowledge is idempotent and keeps the first time; the alert stays in the list', async () => {
    await idleEvent({ at: now(), reason: 'NO_FACE' });
    const [alert] = (await list()).items;
    const ack = () =>
      h.app.inject({
        method: 'PATCH',
        url: `/api/v1/alerts/${alert?.id}/ack`,
        headers: bearer(ownerToken),
      });
    const first = AlertSchema.parse((await ack()).json<{ data: unknown }>().data);
    expect(first.ownerAckAt).toBe(now());
    h.clock.advanceMinutes(3);
    const second = AlertSchema.parse((await ack()).json<{ data: unknown }>().data);
    expect(second.ownerAckAt).toBe(first.ownerAckAt);

    expect(await openCount()).toBe(0);
    expect((await list('?status=open')).items).toHaveLength(0);
    expect((await list('?status=all')).items).toHaveLength(1);

    const row = await h.db.alert.findUniqueOrThrow({ where: { id: alert?.id ?? '' } });
    expect(row.ownerAckById).not.toBeNull();

    const missing = await h.app.inject({
      method: 'PATCH',
      url: '/api/v1/alerts/00000000-0000-4000-8000-000000000000/ack',
      headers: bearer(ownerToken),
    });
    expect(missing.statusCode).toBe(404);
  });

  it('acknowledge all stops at `upTo`, so a newer alert stays open', async () => {
    await idleEvent({ at: now(), reason: 'NO_FACE' });
    h.clock.advanceMinutes(1);
    await idleEvent({ at: now(), reason: 'NO_ACTIVITY' });
    const upTo = now();
    h.clock.advanceMinutes(1);
    await idleEvent({ at: now(), reason: 'CAMERA_UNAVAILABLE' });

    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/alerts/ack-all',
      headers: bearer(ownerToken),
      payload: { upTo },
    });
    expect(AckAllResultSchema.parse(res.json<{ data: unknown }>().data).acknowledged).toBe(2);
    const open = (await list('?status=open')).items;
    expect(open.map((a) => a.idleReason)).toEqual(['CAMERA_UNAVAILABLE']);
  });

  it('acknowledge all leaves a back-dated event that arrived after the page loaded', async () => {
    await idleEvent({ at: now(), reason: 'NO_FACE' });
    const upTo = (await list()).items[0]?.receivedAt ?? '';
    h.clock.advanceMinutes(1);
    // From an agent's offline queue: happened an hour ago, arrives now.
    const hourAgo = new Date(h.clock.now().getTime() - 3600_000).toISOString();
    await idleEvent({ at: hourAgo, reason: 'NO_ACTIVITY' });
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/alerts/ack-all',
      headers: bearer(ownerToken),
      payload: { upTo },
    });
    expect(AckAllResultSchema.parse(res.json<{ data: unknown }>().data).acknowledged).toBe(1);
    expect((await list('?status=open')).items.map((a) => a.idleReason)).toEqual(['NO_ACTIVITY']);
  });

  it('filters by employee and kind, and pages newest first', async () => {
    const other = await h.registerEmployee({ email: 'priya@example.com', body: { name: 'Priya' } });
    for (let i = 0; i < 3; i += 1) {
      h.clock.advanceMinutes(1);
      await idleEvent({ at: now(), reason: 'NO_ACTIVITY' });
    }
    await idleEvent({ at: now(), reason: 'NO_FACE' }, other.accessToken);

    const mine = await list(`?employeeId=${userId}&limit=2`);
    expect(mine.items).toHaveLength(2);
    expect(mine.items.every((a) => a.employeeId === userId)).toBe(true);
    const next = await list(`?employeeId=${userId}&limit=2&cursor=${mine.nextCursor ?? ''}`);
    expect(next.items).toHaveLength(1);
    expect(next.nextCursor).toBeNull();
    // A cursor from another employee's list is refused.
    const priya = await list(`?employeeId=${other.userId}`);
    const bad = await ownerGet(
      `/api/v1/alerts?employeeId=${userId}&cursor=${priya.items[0]?.id ?? ''}`,
    );
    expect(bad.statusCode).toBe(400);

    expect((await list('?kind=SECURITY')).items).toHaveLength(0);
  });

  it('stores security alerts from the bus as open SECURITY alerts', async () => {
    h.app.serviceContext.bus.emit('security:alert', {
      kind: 'CLAIM_IP_BLOCKED',
      message: 'Too many wrong access codes from 10.0.0.9. That address is blocked for 15 minutes.',
      at: now(),
    });
    await h.drain();
    const [alert] = (await list('?kind=SECURITY')).items;
    expect(alert).toMatchObject({
      kind: 'SECURITY',
      securityKind: 'CLAIM_IP_BLOCKED',
      employeeId: null,
      ownerAckAt: null,
    });
    expect(alert?.message).toContain('blocked for 15 minutes');
    expect(await openCount()).toBe(1);
  });

  it('folds a repeat of an open security alert within 15 minutes (no new row, no announcement)', async () => {
    const raise = () =>
      h.app.serviceContext.bus.emit('security:alert', {
        kind: 'REFRESH_TOKEN_REUSE',
        message: 'An old login token was reused.',
        at: now(),
      });
    raise();
    await h.drain();
    raise();
    await h.drain();
    expect((await list('?kind=SECURITY')).items).toHaveLength(1);
    expect(h.events.alertsCreated).toHaveLength(1);

    // After 15 minutes, or once acknowledged, the next one is a new alert.
    h.clock.advanceMinutes(16);
    raise();
    await h.drain();
    ownerToken = await h.ownerToken();
    expect((await list('?kind=SECURITY')).items).toHaveLength(2);
  });

  it('folds repeats that arrive at the same moment (no race between check and insert)', async () => {
    for (const ip of ['10.1.1.1', '10.2.2.2', '10.3.3.3']) {
      h.app.serviceContext.bus.emit('security:alert', {
        kind: 'CLAIM_IP_BLOCKED',
        message: `Too many wrong access codes from ${ip}. That address is blocked for 15 minutes.`,
        at: now(),
      });
    }
    await h.drain();
    expect((await list('?kind=SECURITY')).items).toHaveLength(1);
    expect(h.events.alertsCreated).toHaveLength(1);
  });

  it('a second employee’s locked account is a new alert (folded by text for that kind)', async () => {
    for (const name of ['Rahul', 'Rahul', 'Priya']) {
      h.app.serviceContext.bus.emit('security:alert', {
        kind: 'LOGIN_ACCOUNT_LOCKED',
        message: `Too many wrong passwords for ${name}'s account. Login for it is paused for 15 minutes.`,
        at: now(),
      });
    }
    await h.drain();
    const messages = (await list('?kind=SECURITY')).items.map((a) => a.message);
    expect(messages).toHaveLength(2);
    expect(messages.some((m) => m?.includes('Priya'))).toBe(true);
  });

  it('never puts a forged address into the alert text', async () => {
    const forged = 'Call 98765 43210 to unlock';
    for (let i = 0; i < 5; i += 1) await h.claim('AAAA-AAAA', forged);
    await h.drain();
    const [alert] = (await list('?kind=SECURITY')).items;
    expect(alert?.message).toContain('from one address');
    expect(alert?.message).not.toContain('98765');
  });

  it('a real rate-limit hit (wrong codes) reaches the alert list', async () => {
    for (let i = 0; i < 5; i += 1) await h.claim('AAAA-AAAA', '10.9.9.9');
    await h.drain();
    const alerts = (await list('?kind=SECURITY')).items;
    expect(alerts.map((a) => a.securityKind)).toContain('CLAIM_IP_BLOCKED');
  });
});
