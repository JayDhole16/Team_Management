import { describe, expect, it } from 'vitest';
import {
  dailyTotals,
  idleIntervals,
  istDayRange,
  istMonthRange,
  istMonthString,
  monthTotals,
  sessionMs,
  todayTotals,
  type HeartbeatPoint,
  type HoursInput,
  type SessionSpan,
} from './hours';

const H = 3600;
const d = (iso: string) => new Date(iso);

function session(
  id: string,
  from: string,
  to: string | null,
  endReason = 'MANUAL_STOP',
): SessionSpan {
  return {
    id,
    startedAt: d(from),
    endedAt: to ? d(to) : null,
    endReason: to ? (endReason as SessionSpan['endReason']) : null,
  };
}

function input(overrides: Partial<HoursInput>): HoursInput {
  return {
    sessions: [],
    heartbeats: [],
    gaps: [],
    now: d('2026-10-20T12:00:00Z'),
    idleCapSec: 180,
    ...overrides,
  };
}

describe('IST ranges', () => {
  it('an IST day starts at 18:30 UTC the evening before', () => {
    expect(istDayRange('2026-10-18')).toEqual({
      start: d('2026-10-17T18:30:00.000Z'),
      end: d('2026-10-18T18:30:00.000Z'),
    });
  });

  it('a month range covers the whole IST month, including year end', () => {
    expect(istMonthRange('2026-10')).toEqual({
      start: d('2026-09-30T18:30:00.000Z'),
      end: d('2026-10-31T18:30:00.000Z'),
    });
    expect(istMonthRange('2026-12').end).toEqual(d('2026-12-31T18:30:00.000Z'));
  });

  it('20:00 UTC already belongs to the next IST day and month', () => {
    expect(istMonthString(d('2026-10-31T20:00:00Z'))).toBe('2026-11');
    expect(istMonthString(d('2026-10-31T18:29:59Z'))).toBe('2026-10');
  });
});

describe('worked time', () => {
  it('clips a session to the range', () => {
    const s = session('a', '2026-10-18T17:30:00Z', '2026-10-18T19:30:00Z');
    expect(sessionMs([s], istDayRange('2026-10-18'), d('2026-10-20T00:00:00Z'))).toBe(H * 1000);
  });

  it('splits a session crossing IST midnight between the two days', () => {
    // 22:00 -> 02:00 IST
    const s = session('a', '2026-10-18T16:30:00Z', '2026-10-18T20:30:00Z');
    const days = dailyTotals('2026-10', input({ sessions: [s] }));
    expect(days.find((x) => x.date === '2026-10-18')?.workedSec).toBe(2 * H);
    expect(days.find((x) => x.date === '2026-10-19')?.workedSec).toBe(2 * H);
    expect(days.find((x) => x.date === '2026-10-18')?.sessionCount).toBe(1);
    expect(days.find((x) => x.date === '2026-10-19')?.sessionCount).toBe(1);
  });

  it('splits a session crossing the month boundary between the two months', () => {
    // Oct 31 23:00 IST -> Nov 1 01:00 IST
    const s = session('a', '2026-10-31T17:30:00Z', '2026-10-31T19:30:00Z');
    const now = d('2026-11-02T00:00:00Z');
    const oct = monthTotals('2026-10', input({ sessions: [s], now }));
    const nov = monthTotals('2026-11', input({ sessions: [s], now }));
    expect(oct.totalSec).toBe(H);
    expect(oct.days.map((x) => x.date)).toEqual(['2026-10-31']);
    expect(nov.totalSec).toBe(H);
    expect(nov.days.map((x) => x.date)).toEqual(['2026-11-01']);
    expect(oct.sessions[0]?.workedSec).toBe(H);
    expect(nov.sessions[0]?.workedSec).toBe(H);
  });

  it('counts an open session up to now', () => {
    const now = d('2026-10-20T06:30:00Z'); // 12:00 IST
    const s = session('a', '2026-10-20T03:30:00Z', null); // 09:00 IST
    const t = todayTotals(input({ sessions: [s], now }));
    expect(t).toMatchObject({
      date: '2026-10-20',
      todaySec: 3 * H,
      month: '2026-10',
      monthSec: 3 * H,
    });
  });

  it('an open session left overnight counts on both days', () => {
    const now = d('2026-10-20T04:30:00Z'); // Oct 20 10:00 IST
    const s = session('a', '2026-10-19T12:30:00Z', null); // Oct 19 18:00 IST
    const days = dailyTotals('2026-10', input({ sessions: [s], now }));
    expect(days.find((x) => x.date === '2026-10-19')?.workedSec).toBe(6 * H);
    expect(days.find((x) => x.date === '2026-10-20')?.workedSec).toBe(10 * H);
  });

  it('adds stop/resume sessions and counts work days', () => {
    const sessions = [
      session('a', '2026-10-19T03:30:00Z', '2026-10-19T07:30:00Z'), // 4 h
      session('b', '2026-10-19T08:30:00Z', '2026-10-19T12:30:00Z'), // 4 h
      session('c', '2026-10-20T03:30:00Z', '2026-10-20T05:00:00Z'), // 1.5 h
    ];
    const m = monthTotals('2026-10', input({ sessions }));
    expect(m.totalSec).toBe(9.5 * H);
    expect(m.workDays).toBe(2);
    expect(m.days).toEqual([
      { date: '2026-10-19', workedSec: 8 * H, idleSec: 0, sessionCount: 2, flags: [] },
      { date: '2026-10-20', workedSec: 1.5 * H, idleSec: 0, sessionCount: 1, flags: [] },
    ]);
    expect(m.sessions.map((s) => s.session.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns zeros for no sessions', () => {
    const m = monthTotals('2026-10', input({}));
    expect(m).toMatchObject({ totalSec: 0, idleSec: 0, workDays: 0, days: [], sessions: [] });
    expect(todayTotals(input({}))).toMatchObject({ todaySec: 0, monthSec: 0, todayIdleSec: 0 });
  });

  it('total always equals the sum of the day values', () => {
    const sessions = [
      session('a', '2026-10-01T00:00:00.400Z', '2026-10-01T00:00:01.700Z'),
      session('b', '2026-10-01T01:00:00.600Z', '2026-10-01T01:00:01.900Z'),
    ];
    const m = monthTotals('2026-10', input({ sessions }));
    expect(m.totalSec).toBe(m.days.reduce((s, x) => s + x.workedSec, 0));
  });
});

describe('idle time', () => {
  const s = session('a', '2026-10-19T04:00:00Z', '2026-10-19T05:00:00Z');
  const hb = (at: string, state: HeartbeatPoint['state']): HeartbeatPoint => ({
    sessionId: 'a',
    at: d(at),
    state,
  });

  it('an idle heartbeat covers until the next heartbeat', () => {
    const heartbeats = [
      hb('2026-10-19T04:00:00Z', 'ACTIVE'),
      hb('2026-10-19T04:00:30Z', 'IDLE'),
      hb('2026-10-19T04:01:00Z', 'AWAY'),
      hb('2026-10-19T04:01:30Z', 'ACTIVE'),
    ];
    const m = monthTotals('2026-10', input({ sessions: [s], heartbeats }));
    expect(m.idleSec).toBe(60);
    // Idle is reported separately, never deducted.
    expect(m.totalSec).toBe(H);
    expect(m.sessions[0]?.idleSec).toBe(60);
  });

  it('caps one idle heartbeat at the auto-close threshold and at the session end', () => {
    const heartbeats = [hb('2026-10-19T04:10:00Z', 'IDLE'), hb('2026-10-19T04:59:00Z', 'IDLE')];
    const intervals = idleIntervals(heartbeats, [s], 180, d('2026-10-20T00:00:00Z'));
    expect(intervals.map((i) => (i.to - i.from) / 1000)).toEqual([180, 60]);
  });

  it('splits idle time at IST midnight', () => {
    const night = session('a', '2026-10-19T18:00:00Z', '2026-10-19T19:00:00Z');
    const heartbeats = [hb('2026-10-19T18:29:00Z', 'IDLE'), hb('2026-10-19T18:31:00Z', 'ACTIVE')];
    const days = dailyTotals('2026-10', input({ sessions: [night], heartbeats }));
    // 23:59 -> 00:01 IST
    expect(days.find((x) => x.date === '2026-10-19')?.idleSec).toBe(60);
    expect(days.find((x) => x.date === '2026-10-20')?.idleSec).toBe(60);
  });
});

describe('flags', () => {
  it('flags offline gaps and sessions closed for having no agent heartbeat', () => {
    const sessions = [
      session('a', '2026-10-19T04:00:00Z', '2026-10-19T06:00:00Z', 'AUTO_CLOSED'),
      // 21:30 IST -> 09:30 IST next day
      session('b', '2026-10-20T16:00:00Z', '2026-10-21T04:00:00Z', 'MAX_DURATION'),
    ];
    const gaps = [
      { sessionId: 'a', fromAt: d('2026-10-19T04:30:00Z'), toAt: d('2026-10-19T05:00:00Z') },
    ];
    const m = monthTotals('2026-10', input({ sessions, gaps, now: d('2026-10-25T00:00:00Z') }));
    expect(m.days.map((x) => [x.date, x.flags])).toEqual([
      ['2026-10-19', ['OFFLINE_GAP']],
      ['2026-10-20', ['MAX_DURATION_CLOSE']],
      ['2026-10-21', ['MAX_DURATION_CLOSE']],
    ]);
    expect(m.sessions[0]?.gaps).toHaveLength(1);
  });
});
