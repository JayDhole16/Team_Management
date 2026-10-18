import type { TodayHours } from '@lk/shared';
import { describe, expect, it } from 'vitest';
import { agentRunning, elapsedSec, liveTotals, remainingSec, serverNowFrom } from './timer';
import {
  formatClock,
  formatCountdown,
  formatDay,
  formatHours,
  istDate,
  istMonth,
  shiftMonth,
} from './time';

const T = (iso: string) => Date.parse(iso);

describe('server-derived timer', () => {
  const serverTime = '2026-10-18T10:00:00.000Z';

  it('adds only the locally elapsed time to the server time', () => {
    // Device clock is 1 hour wrong; it does not matter, only the difference counts.
    const receivedAt = T('2026-10-18T11:00:00.000Z');
    const now = receivedAt + 5_000;
    expect(serverNowFrom(serverTime, receivedAt, now)).toBe(T('2026-10-18T10:00:05.000Z'));
  });

  it('never goes backwards if the device clock jumps back', () => {
    const receivedAt = T('2026-10-18T11:00:00.000Z');
    expect(serverNowFrom(serverTime, receivedAt, receivedAt - 60_000)).toBe(T(serverTime));
  });

  it('elapsed seconds are never negative', () => {
    expect(elapsedSec('2026-10-18T09:00:00.000Z', T(serverTime))).toBe(3600);
    expect(elapsedSec('2026-10-18T10:00:30.000Z', T(serverTime))).toBe(0);
  });
});

describe('liveTotals', () => {
  const base: TodayHours = {
    userId: '6f1c2c55-6a55-4c1b-9d55-0d6b0c0a0a01',
    date: '2026-10-18',
    todaySec: 7200,
    todayIdleSec: 0,
    month: '2026-10',
    monthSec: 36000,
    monthIdleSec: 0,
    openSession: null,
    serverTime: '2026-10-18T10:00:00.000Z',
  };
  const receivedAt = 1_000_000;

  it('on a break the totals do not move', () => {
    expect(liveTotals(base, receivedAt, receivedAt + 60_000)).toEqual({
      sessionSec: null,
      todaySec: 7200,
      monthSec: 36000,
    });
  });

  it('a running session grows the session, today and month by the same amount', () => {
    const report: TodayHours = {
      ...base,
      openSession: {
        id: '6f1c2c55-6a55-4c1b-9d55-0d6b0c0a0a09',
        startedAt: '2026-10-18T09:30:00.000Z',
        endedAt: null,
        endReason: null,
        lastHeartbeatAt: null,
      },
    };
    expect(liveTotals(report, receivedAt, receivedAt + 90_000)).toEqual({
      sessionSec: 30 * 60 + 90,
      todaySec: 7290,
      monthSec: 36090,
    });
  });
});

describe('liveTotals across India midnight', () => {
  it('stops growing today at 00:00 IST and the month at the month end', () => {
    // Report fetched at 23:59:00 IST on 31 Oct (18:29 UTC); 3 minutes pass without a refetch.
    const report: TodayHours = {
      userId: '6f1c2c55-6a55-4c1b-9d55-0d6b0c0a0a01',
      date: '2026-10-31',
      todaySec: 3600,
      todayIdleSec: 0,
      month: '2026-10',
      monthSec: 36000,
      monthIdleSec: 0,
      openSession: {
        id: '6f1c2c55-6a55-4c1b-9d55-0d6b0c0a0a09',
        startedAt: '2026-10-31T17:29:00.000Z',
        endedAt: null,
        endReason: null,
        lastHeartbeatAt: null,
      },
      serverTime: '2026-10-31T18:29:00.000Z',
    };
    const t = liveTotals(report, 0, 3 * 60_000);
    expect(t.sessionSec).toBe(3600 + 180); // the session itself keeps running
    expect(t.todaySec).toBe(3600 + 60); // only up to midnight
    expect(t.monthSec).toBe(36000 + 60); // 31 Oct is the month end too
  });
});

describe('remainingSec', () => {
  it('counts down to zero and rounds up', () => {
    const exp = '2026-10-18T10:10:00.000Z';
    expect(remainingSec(exp, T('2026-10-18T10:00:00.000Z'))).toBe(600);
    expect(remainingSec(exp, T('2026-10-18T10:09:59.500Z'))).toBe(1);
    expect(remainingSec(exp, T('2026-10-18T10:11:00.000Z'))).toBe(0);
  });
});

describe('agentRunning', () => {
  const now = T('2026-10-18T10:00:00.000Z');
  it('is true only with a heartbeat in the last 2 minutes', () => {
    expect(agentRunning(null, now)).toBe(false);
    expect(agentRunning('2026-10-18T09:59:00.000Z', now)).toBe(true);
    expect(agentRunning('2026-10-18T09:57:00.000Z', now)).toBe(false);
  });
});

describe('formatting', () => {
  it('formatClock', () => {
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(3725)).toBe('01:02:05');
    expect(formatClock(100 * 3600)).toBe('100:00:00');
    expect(formatClock(-5)).toBe('00:00:00');
  });

  it('formatHours', () => {
    expect(formatHours(0)).toBe('0m');
    expect(formatHours(2700)).toBe('45m');
    expect(formatHours(27_120)).toBe('7h 32m');
  });

  it('formatCountdown', () => {
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(545)).toBe('09:05');
  });

  it('uses the India date, not UTC, near midnight', () => {
    // 18:45 UTC on the 18th is 00:15 IST on the 19th.
    expect(istDate(T('2026-10-18T18:45:00.000Z'))).toBe('2026-10-19');
    expect(istDate(T('2026-10-18T18:15:00.000Z'))).toBe('2026-10-18');
    // 31 Oct 19:00 UTC is already November in India.
    expect(istMonth(T('2026-10-31T19:00:00.000Z'))).toBe('2026-11');
  });

  it('formatDay shows the calendar date as given', () => {
    expect(formatDay('2026-10-18')).toBe('Sun, 18 Oct 2026');
  });

  it('shiftMonth crosses years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});
