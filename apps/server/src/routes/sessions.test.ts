import {
  ApiErrorSchema,
  HeartbeatResultSchema,
  SessionCurrentSchema,
  WorkSessionSchema,
} from '@lk/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { autoCloseSessions } from '../services/session.service';
import { bearer, createHarness, EMPLOYEE_PASSWORD, type Harness } from '../test/helpers';

describe('work sessions and heartbeats', () => {
  let h: Harness;
  let token: string;
  let userId: string;
  let ownerToken: string;
  let email: string;
  beforeEach(async () => {
    h = await createHarness();
    const e = await h.registerEmployee();
    token = e.accessToken;
    userId = e.userId;
    ownerToken = e.ownerToken;
    email = e.email;
  });

  const post = (url: string, payload?: object, t = token) =>
    h.app.inject({ method: 'POST', url, headers: bearer(t), payload });
  const start = async () =>
    WorkSessionSchema.parse((await post('/api/v1/sessions/start')).json<{ data: unknown }>().data);
  const heartbeat = async (ats: Date[], state = 'ACTIVE') => {
    const res = await post('/api/v1/agent/heartbeat', {
      heartbeats: ats.map((at) => ({ at: at.toISOString(), state })),
    });
    expect(res.statusCode, res.body).toBe(200);
    return HeartbeatResultSchema.parse(res.json<{ data: unknown }>().data);
  };
  const rows = () =>
    h.db.workSession.findMany({ where: { userId }, orderBy: { startedAt: 'asc' } });
  const autoClose = () => autoCloseSessions(h.app.serviceContext);
  const secondsAfter = (date: Date | string, sec: number) =>
    new Date(new Date(date).getTime() + sec * 1000);

  it('start is idempotent: calling it twice returns the same open session', async () => {
    const first = await start();
    h.clock.advanceMinutes(5);
    const second = await start();
    expect(second.id).toBe(first.id);
    expect(second.startedAt).toBe(first.startedAt);
    expect(await rows()).toHaveLength(1);

    const current = await h.app.inject({
      method: 'GET',
      url: '/api/v1/sessions/current',
      headers: bearer(token),
    });
    const body = SessionCurrentSchema.parse(current.json<{ data: unknown }>().data);
    expect(body.session?.id).toBe(first.id);
    expect(body.serverTime).toBe(h.clock.now().toISOString());
  });

  it('parallel starts never create two open sessions', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => start()));
    expect(new Set(results.map((s) => s.id)).size).toBe(1);
    expect(await h.db.workSession.count({ where: { userId, endedAt: null } })).toBe(1);
  });

  it('the database refuses a second open session', async () => {
    await start();
    await expect(
      h.db.workSession.create({ data: { userId, startedAt: h.clock.now() } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('stop pauses (break), resume starts a new session, stop with nothing open is a no-op', async () => {
    const first = await start();
    h.clock.advanceMinutes(60);
    token = await h.login(email, EMPLOYEE_PASSWORD); // access tokens last 15 min
    const stopped = await post('/api/v1/sessions/stop');
    expect(stopped.statusCode).toBe(200);
    expect(stopped.json<{ data: { id: string; endReason: string } }>().data).toMatchObject({
      id: first.id,
      endReason: 'MANUAL_STOP',
      endedAt: h.clock.now().toISOString(),
    });

    const again = await post('/api/v1/sessions/stop');
    expect(again.json<{ data: unknown }>().data).toBeNull();

    h.clock.advanceMinutes(10);
    const resumed = await start();
    expect(resumed.id).not.toBe(first.id);
    expect(resumed.startedAt).toBe(h.clock.now().toISOString());
    expect((await rows()).map((r) => r.endReason)).toEqual(['MANUAL_STOP', null]);
  });

  it('only employees track time: the owner gets 403', async () => {
    for (const url of [
      '/api/v1/sessions/start',
      '/api/v1/sessions/stop',
      '/api/v1/agent/heartbeat',
    ]) {
      const res = await post(url, {}, ownerToken);
      expect(res.statusCode, url).toBe(403);
    }
  });

  it('rejects a malformed heartbeat batch', async () => {
    const res = await post('/api/v1/agent/heartbeat', {
      heartbeats: [{ at: 'yesterday', state: 'ACTIVE' }],
    });
    expect(res.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('attaches heartbeats to the open session and ignores them during a break', async () => {
    const s = await start();
    h.clock.advanceMs(30_000);
    const live = await heartbeat([h.clock.now()], 'IDLE');
    expect(live).toMatchObject({ accepted: 1, ignored: 0 });
    expect(live.session?.lastHeartbeatAt).toBe(h.clock.now().toISOString());
    expect(await h.db.heartbeat.count({ where: { sessionId: s.id, state: 'IDLE' } })).toBe(1);

    await post('/api/v1/sessions/stop');
    h.clock.advanceMs(30_000);
    const onBreak = await heartbeat([h.clock.now()]);
    expect(onBreak).toEqual({ accepted: 0, ignored: 1, session: null });
  });

  it('auto-closes a session at its last heartbeat when the agent goes silent', async () => {
    const s = await start();
    h.clock.advanceMs(30_000);
    const lastBeat = h.clock.now();
    await heartbeat([lastBeat]);

    h.clock.advanceMs(180_000); // exactly the threshold: still open
    expect(await autoClose()).toEqual({ autoClosed: 0, maxDuration: 0 });

    h.clock.advanceMs(1_000);
    expect(await autoClose()).toEqual({ autoClosed: 1, maxDuration: 0 });
    const [row] = await rows();
    expect(row).toMatchObject({ id: s.id, endedAt: lastBeat, endReason: 'AUTO_CLOSED' });
  });

  it('the auto-close update loses to a newer heartbeat', async () => {
    const s = await start();
    h.clock.advanceMs(30_000);
    const seenByJob = h.clock.now();
    await heartbeat([seenByJob]);
    h.clock.advanceMs(30_000);
    await heartbeat([h.clock.now()]);
    // The job read `seenByJob` before the second heartbeat landed.
    expect(await h.app.serviceContext.data.repos.sessions.closeIfSilent(s.id, seenByJob)).toBe(0);
    expect((await rows())[0]?.endedAt).toBeNull();
  });

  it('closes a session that never got a heartbeat after SESSION_NO_HEARTBEAT_MAX_HOURS', async () => {
    const s = await start();
    h.clock.advanceMinutes(12 * 60 - 1);
    // No request needs a token below, so the 15-min access token may expire.
    expect(await autoClose()).toEqual({ autoClosed: 0, maxDuration: 0 });
    h.clock.advanceMinutes(2);
    expect(await autoClose()).toEqual({ autoClosed: 0, maxDuration: 1 });
    const [row] = await rows();
    expect(row).toMatchObject({
      endReason: 'MAX_DURATION',
      endedAt: secondsAfter(s.startedAt, 12 * 3600),
    });
  });

  it('replayed heartbeats reopen an auto-closed session and the gap is recorded', async () => {
    const s = await start();
    const t0 = h.clock.now();
    for (let i = 1; i <= 4; i++) {
      h.clock.advanceMs(30_000);
      await heartbeat([h.clock.now()]);
    }
    const lastLive = h.clock.now(); // t0 + 2 min
    // Agent offline for 8 minutes; the job closes the session at the last live heartbeat.
    h.clock.advanceMinutes(8);
    expect((await autoClose()).autoClosed).toBe(1);

    // Connection back: the queue (every 30 s since lastLive) is sent in one batch.
    const queue = Array.from({ length: 16 }, (_, i) => secondsAfter(lastLive, 30 * (i + 1)));
    const result = await heartbeat(queue);
    expect(result).toMatchObject({ accepted: 16, ignored: 0 });
    expect(result.session?.id).toBe(s.id);

    const [row] = await rows();
    expect(row).toMatchObject({ endedAt: null, endReason: null, lastHeartbeatAt: h.clock.now() });
    const gaps = await h.db.workSessionGap.findMany({ where: { sessionId: s.id } });
    expect(gaps).toMatchObject([{ fromAt: lastLive, toAt: h.clock.now() }]);

    const report = await h.app.inject({
      method: 'GET',
      url: '/api/v1/reports/hours?month=2026-10',
      headers: bearer(token),
    });
    const data = report.json<{
      data: { totalSec: number; days: { flags: string[] }[]; sessions: { gaps: unknown[] }[] };
    }>().data;
    expect(data.totalSec).toBe((h.clock.now().getTime() - t0.getTime()) / 1000);
    expect(data.days[0]?.flags).toEqual(['OFFLINE_GAP']);
    expect(data.sessions[0]?.gaps).toHaveLength(1);
  });

  it('does not reopen a session the employee stopped', async () => {
    await start();
    h.clock.advanceMs(30_000);
    await heartbeat([h.clock.now()]);
    await post('/api/v1/sessions/stop');
    const stoppedAt = h.clock.now();
    h.clock.advanceMinutes(5);
    const result = await heartbeat([secondsAfter(stoppedAt, 30), secondsAfter(stoppedAt, 60)]);
    expect(result).toMatchObject({ accepted: 0, ignored: 2, session: null });
  });

  it('deactivating an employee closes their open session', async () => {
    await start();
    h.clock.advanceMinutes(30);
    const res = await post(
      `/api/v1/employees/${userId}/deactivate`,
      undefined,
      await h.ownerToken(),
    );
    expect(res.statusCode).toBe(200);
    const [row] = await rows();
    expect(row).toMatchObject({ endReason: 'DEACTIVATED', endedAt: h.clock.now() });
  });

  it('logout closes the open session', async () => {
    const login = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: EMPLOYEE_PASSWORD },
    });
    const cookie = login.cookies.find((c) => c.name === 'lk_refresh');
    if (!cookie) throw new Error('no refresh cookie');
    await start();
    h.clock.advanceMinutes(45);
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { lk_refresh: cookie.value },
    });
    expect(res.statusCode).toBe(200);
    const [row] = await rows();
    expect(row).toMatchObject({ endReason: 'LOGOUT', endedAt: h.clock.now() });
  });
});
