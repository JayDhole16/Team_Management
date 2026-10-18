import { ApiErrorSchema, MonthHoursSchema, TodayHoursSchema } from '@lk/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { bearer, createHarness, EMPLOYEE_PASSWORD, type Harness } from '../test/helpers';

describe('hours reports', () => {
  let h: Harness;
  let rahul: { userId: string; email: string; accessToken: string };
  let priya: { userId: string; accessToken: string };

  beforeEach(async () => {
    h = await createHarness();
    rahul = await h.registerEmployee();
    priya = await h.registerEmployee({ email: 'priya@example.com', body: { name: 'Priya' } });
  });

  const get = (url: string, token: string) =>
    h.app.inject({ method: 'GET', url, headers: bearer(token) });

  /** Rahul works 23:30 -> 01:30 IST across the night of Oct 18/19 (open on Oct 19). */
  async function workAcrossMidnight() {
    h.clock.advanceMs(new Date('2026-10-18T18:00:00Z').getTime() - h.clock.now().getTime());
    const token = await h.login(rahul.email, EMPLOYEE_PASSWORD);
    await h.app.inject({ method: 'POST', url: '/api/v1/sessions/start', headers: bearer(token) });
    h.clock.advanceMinutes(120);
    return h.login(rahul.email, EMPLOYEE_PASSWORD);
  }

  it('splits a session across IST midnight in today and month totals', async () => {
    const token = await workAcrossMidnight();

    const today = TodayHoursSchema.parse(
      (await get('/api/v1/reports/hours/today', token)).json<{ data: unknown }>().data,
    );
    expect(today).toMatchObject({
      userId: rahul.userId,
      date: '2026-10-19',
      todaySec: 90 * 60,
      month: '2026-10',
      monthSec: 120 * 60,
      todayIdleSec: 0,
    });
    expect(today.openSession).not.toBeNull();

    const month = MonthHoursSchema.parse(
      (await get('/api/v1/reports/hours?month=2026-10', token)).json<{ data: unknown }>().data,
    );
    expect(month.totalSec).toBe(120 * 60);
    expect(month.workDays).toBe(2);
    expect(month.days.map((d) => [d.date, d.workedSec])).toEqual([
      ['2026-10-18', 30 * 60],
      ['2026-10-19', 90 * 60],
    ]);
    expect(month.sessions).toHaveLength(1);
  });

  it('the owner can read any employee', async () => {
    await workAcrossMidnight();
    const owner = await h.ownerToken();
    const res = await get(`/api/v1/reports/hours?userId=${rahul.userId}&month=2026-10`, owner);
    expect(res.statusCode).toBe(200);
    expect(MonthHoursSchema.parse(res.json<{ data: unknown }>().data).totalSec).toBe(120 * 60);

    const other = await get(`/api/v1/reports/hours/today?userId=${priya.userId}`, owner);
    expect(other.statusCode).toBe(200);
    expect(TodayHoursSchema.parse(other.json<{ data: unknown }>().data)).toMatchObject({
      userId: priya.userId,
      todaySec: 0,
      openSession: null,
    });
  });

  it('an employee reads only their own hours', async () => {
    const own = await get(`/api/v1/reports/hours?userId=${priya.userId}`, priya.accessToken);
    expect(own.statusCode).toBe(200);

    for (const url of [
      `/api/v1/reports/hours?userId=${rahul.userId}`,
      `/api/v1/reports/hours/today?userId=${rahul.userId}`,
    ]) {
      const res = await get(url, priya.accessToken);
      expect(res.statusCode, url).toBe(403);
      expect(ApiErrorSchema.parse(res.json()).error.code).toBe('FORBIDDEN');
    }
  });

  it('the owner must name an employee', async () => {
    const owner = await h.ownerToken();
    const missing = await get('/api/v1/reports/hours', owner);
    expect(missing.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(missing.json()).error.code).toBe('USER_ID_REQUIRED');

    const ownerRow = await h.db.user.findFirstOrThrow({ where: { role: 'OWNER' } });
    for (const id of [ownerRow.id, '7b0f1c9e-2a8d-4c3e-9f1a-1b2c3d4e5f60']) {
      const res = await get(`/api/v1/reports/hours/today?userId=${id}`, owner);
      expect(res.statusCode).toBe(404);
    }
  });

  it('validates the query', async () => {
    for (const url of ['/api/v1/reports/hours?month=2026-13', '/api/v1/reports/hours?foo=1']) {
      const res = await get(url, rahul.accessToken);
      expect(res.statusCode, url).toBe(400);
    }
  });
});
