import { LiveListSchema } from '@lk/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { AGENT_STALE_AFTER_SEC } from '../services/live-status';
import { autoCloseSessions } from '../services/session.service';
import { bearer, createHarness, EMPLOYEE_PASSWORD, type Harness } from '../test/helpers';

describe('live status', () => {
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
    seen = 0;
  });

  const post = (url: string, payload?: object, t = token) =>
    h.app.inject({ method: 'POST', url, headers: bearer(t), payload });
  const heartbeat = (state = 'ACTIVE') =>
    post('/api/v1/agent/heartbeat', { heartbeats: [{ at: h.clock.now().toISOString(), state }] });
  const live = async () => {
    // A fresh login: some tests move the clock past the access token's 15 minutes.
    ownerToken = await h.ownerToken();
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/v1/live',
      headers: bearer(ownerToken),
    });
    expect(res.statusCode, res.body).toBe(200);
    return LiveListSchema.parse(res.json<{ data: unknown }>().data);
  };
  const me = async () => {
    const list = await live();
    const row = list.employees.find((e) => e.userId === userId);
    if (!row) throw new Error('employee missing from /live');
    return row;
  };
  /** The statuses announced for this employee since the last call. */
  let seen = 0;
  const announced = async () => {
    await h.drain();
    const mine = h.events.statusChanged.filter((e) => e.userId === userId);
    const fresh = mine.slice(seen).map((e) => `${e.status}${e.agentRunning ? '+agent' : ''}`);
    seen = mine.length;
    return fresh;
  };

  it('follows the session: Working → Idle → Working → On break, announced only on change', async () => {
    expect(await me()).toMatchObject({ status: 'OFFLINE', agentRunning: false, session: null });

    await post('/api/v1/sessions/start');
    expect(await announced()).toEqual(['WORKING']);
    expect(await me()).toMatchObject({ status: 'WORKING', agentRunning: false });

    await heartbeat();
    expect(await announced()).toEqual(['WORKING+agent']);
    h.clock.advanceMs(30_000);
    await heartbeat();
    // Same status again: nothing announced.
    expect(await announced()).toEqual([]);

    h.clock.advanceMs(5_000);
    await post('/api/v1/agent/idle-event', { at: h.clock.now().toISOString(), reason: 'NO_FACE' });
    expect(await announced()).toEqual(['IDLE+agent']);
    expect((await me()).lastIdle).toMatchObject({ reason: 'NO_FACE' });

    h.clock.advanceMs(30_000);
    await heartbeat('ACTIVE');
    expect(await announced()).toEqual(['WORKING+agent']);

    h.clock.advanceMs(30_000);
    await heartbeat('AWAY');
    expect(await announced()).toEqual(['IDLE+agent']);

    await post('/api/v1/sessions/stop');
    expect(await announced()).toEqual(['ON_BREAK']);
    expect(await me()).toMatchObject({ status: 'ON_BREAK', session: null });
  });

  it('flips to Offline after heartbeats stop (agent not running, then auto-close)', async () => {
    await post('/api/v1/sessions/start');
    expect(await announced()).toEqual(['WORKING']);
    await heartbeat();
    expect(await announced()).toEqual(['WORKING+agent']);

    // The agent goes silent: the periodic refresh marks it not running.
    h.clock.advanceMs((AGENT_STALE_AFTER_SEC + 1) * 1000);
    await h.app.liveTracker.refresh();
    expect(await announced()).toEqual(['WORKING']);
    expect((await me()).agentRunning).toBe(false);

    // After SESSION_AUTOCLOSE_AFTER_SEC the job closes the session: Offline.
    h.clock.advanceMs(h.env.SESSION_AUTOCLOSE_AFTER_SEC * 1000);
    expect((await autoCloseSessions(h.app.serviceContext)).autoClosed).toBe(1);
    expect(await announced()).toEqual(['OFFLINE']);
    expect(await me()).toMatchObject({ status: 'OFFLINE', session: null });
  });

  it('a break ends at IST midnight (periodic refresh)', async () => {
    // 2026-10-18 05:00 UTC = 10:30 IST.
    await post('/api/v1/sessions/start');
    await post('/api/v1/sessions/stop');
    expect((await announced()).at(-1)).toBe('ON_BREAK');
    h.clock.advanceMinutes(14 * 60); // 00:30 IST next day
    await h.app.liveTracker.refresh();
    expect(await announced()).toEqual(['OFFLINE']);
  });

  it('logout and deactivation make the employee Offline', async () => {
    const login = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'rahul@example.com', password: EMPLOYEE_PASSWORD },
    });
    const cookie = login.cookies.find((c) => c.name === 'lk_refresh');
    await post('/api/v1/sessions/start');
    expect(await announced()).toEqual(['WORKING']);
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: cookie ? { [cookie.name]: cookie.value } : {},
    });
    expect(await announced()).toEqual(['OFFLINE']);

    await post('/api/v1/sessions/start');
    await announced();
    await h.app.inject({
      method: 'POST',
      url: `/api/v1/employees/${userId}/deactivate`,
      headers: bearer(ownerToken),
    });
    expect(await announced()).toEqual(['OFFLINE']);
    expect((await live()).employees.find((e) => e.userId === userId)).toBeUndefined();
  });

  it('shows the timer start, hours today and this month for everyone in one call', async () => {
    await h.registerEmployee({ email: 'priya@example.com', body: { name: 'Priya Nair' } });
    await post('/api/v1/sessions/start');
    const startedAt = h.clock.now().toISOString();
    h.clock.advanceMinutes(90);

    const list = await live();
    expect(list.employees.map((e) => e.name)).toEqual(['Priya Nair', 'Rahul Sharma']);
    expect(list.serverTime).toBe(h.clock.now().toISOString());
    expect(await me()).toMatchObject({
      session: { startedAt },
      todaySec: 90 * 60,
      monthSec: 90 * 60,
      jobRole: 'Frontend Developer',
    });
  });
});
