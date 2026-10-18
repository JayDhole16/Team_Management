// The ONE place working hours are calculated (.claude/rules/server.md). Pure functions only.
//
// - Timestamps are UTC; "today" and "month" are Asia/Kolkata (fixed +05:30, no DST).
// - Idle time is NOT deducted from worked time (PRD Q1); it is reported separately.
// - An open session counts up to `now`.
import type { DayFlag, HeartbeatState, SessionEndReason } from '@lk/shared';
import { istDateString } from '../lib/clock';

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export interface Range {
  start: Date;
  /** Exclusive. */
  end: Date;
}

export interface SessionSpan {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  endReason: SessionEndReason | null;
}

export interface HeartbeatPoint {
  sessionId: string;
  at: Date;
  state: HeartbeatState;
}

export interface GapSpan {
  sessionId: string;
  fromAt: Date;
  toAt: Date;
}

/** IST calendar day 'YYYY-MM-DD' -> its UTC range. */
export function istDayRange(date: string): Range {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const start = Date.UTC(y, m - 1, d) - IST_OFFSET_MS;
  return { start: new Date(start), end: new Date(start + DAY_MS) };
}

/** IST calendar month 'YYYY-MM' -> its UTC range. */
export function istMonthRange(month: string): Range {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS),
  };
}

/** The IST month of an instant, e.g. '2026-10'. */
export function istMonthString(date: Date): string {
  return istDateString(date).slice(0, 7);
}

function overlapMs(from: number, to: number, range: Range): number {
  return Math.max(0, Math.min(to, range.end.getTime()) - Math.max(from, range.start.getTime()));
}

function sessionEndMs(session: SessionSpan, now: Date): number {
  return (session.endedAt ?? now).getTime();
}

function sessionOverlapMs(session: SessionSpan, range: Range, now: Date): number {
  return overlapMs(session.startedAt.getTime(), sessionEndMs(session, now), range);
}

/** Worked milliseconds of the sessions inside `range`. */
export function sessionMs(sessions: readonly SessionSpan[], range: Range, now: Date): number {
  return sessions.reduce((sum, s) => sum + sessionOverlapMs(s, range, now), 0);
}

export interface IdleInterval {
  sessionId: string;
  from: number;
  to: number;
}

/**
 * Idle stretches: an IDLE or AWAY heartbeat covers from its time until the next heartbeat of
 * the same session, at most `capSec` (the auto-close threshold) and never past the session end.
 */
export function idleIntervals(
  heartbeats: readonly HeartbeatPoint[],
  sessions: readonly SessionSpan[],
  capSec: number,
  now: Date,
): IdleInterval[] {
  const bySession = new Map<string, HeartbeatPoint[]>();
  for (const hb of heartbeats) {
    const list = bySession.get(hb.sessionId) ?? [];
    list.push(hb);
    bySession.set(hb.sessionId, list);
  }
  const intervals: IdleInterval[] = [];
  for (const session of sessions) {
    const list = [...(bySession.get(session.id) ?? [])].sort(
      (a, b) => a.at.getTime() - b.at.getTime(),
    );
    const end = sessionEndMs(session, now);
    list.forEach((hb, i) => {
      if (hb.state === 'ACTIVE') return;
      const from = Math.max(hb.at.getTime(), session.startedAt.getTime());
      const next = list[i + 1]?.at.getTime() ?? end;
      const to = Math.min(next, from + capSec * 1000, end);
      if (to > from) intervals.push({ sessionId: session.id, from, to });
    });
  }
  return intervals;
}

function intervalMs(intervals: readonly IdleInterval[], range: Range): number {
  return intervals.reduce((sum, i) => sum + overlapMs(i.from, i.to, range), 0);
}

const toSec = (ms: number) => Math.floor(ms / 1000);

export interface DayTotal {
  date: string;
  workedSec: number;
  idleSec: number;
  sessionCount: number;
  flags: DayFlag[];
}

export interface HoursInput {
  sessions: readonly SessionSpan[];
  heartbeats: readonly HeartbeatPoint[];
  gaps: readonly GapSpan[];
  now: Date;
  /** Caps how long one idle heartbeat counts (SESSION_AUTOCLOSE_AFTER_SEC). */
  idleCapSec: number;
}

/** Every IST day of `month` with its totals (days without time included). */
export function dailyTotals(month: string, input: HoursInput): DayTotal[] {
  const { sessions, heartbeats, gaps, now, idleCapSec } = input;
  const idle = idleIntervals(heartbeats, sessions, idleCapSec, now);
  const monthRange = istMonthRange(month);
  const days: DayTotal[] = [];
  for (let t = monthRange.start.getTime(); t < monthRange.end.getTime(); t += DAY_MS) {
    const range = { start: new Date(t), end: new Date(t + DAY_MS) };
    const inDay = sessions.filter((s) => sessionOverlapMs(s, range, now) > 0);
    const ids = new Set(inDay.map((s) => s.id));
    const flags: DayFlag[] = [];
    const hasGap = gaps.some(
      (g) => ids.has(g.sessionId) && overlapMs(g.fromAt.getTime(), g.toAt.getTime(), range) > 0,
    );
    if (hasGap) flags.push('OFFLINE_GAP');
    if (inDay.some((s) => s.endReason === 'MAX_DURATION')) flags.push('MAX_DURATION_CLOSE');
    days.push({
      date: istDateString(range.start),
      workedSec: toSec(sessionMs(inDay, range, now)),
      idleSec: toSec(intervalMs(idle, range)),
      sessionCount: inDay.length,
      flags,
    });
  }
  return days;
}

export interface MonthSessionTotal {
  session: SessionSpan;
  workedSec: number;
  idleSec: number;
  gaps: GapSpan[];
}

export interface MonthTotals {
  month: string;
  /** Sum of the per-day values, so the total always matches the breakdown. */
  totalSec: number;
  idleSec: number;
  workDays: number;
  /** Only days with logged time. */
  days: DayTotal[];
  /** Sessions overlapping the month, oldest first, with their time inside the month. */
  sessions: MonthSessionTotal[];
}

export function monthTotals(month: string, input: HoursInput): MonthTotals {
  const days = dailyTotals(month, input).filter((d) => d.workedSec > 0);
  const range = istMonthRange(month);
  const idle = idleIntervals(input.heartbeats, input.sessions, input.idleCapSec, input.now);
  const sessions = input.sessions
    .filter((s) => sessionOverlapMs(s, range, input.now) > 0)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .map((session) => ({
      session,
      workedSec: toSec(sessionOverlapMs(session, range, input.now)),
      idleSec: toSec(
        intervalMs(
          idle.filter((i) => i.sessionId === session.id),
          range,
        ),
      ),
      gaps: input.gaps.filter((g) => g.sessionId === session.id),
    }));
  return {
    month,
    totalSec: days.reduce((sum, d) => sum + d.workedSec, 0),
    idleSec: days.reduce((sum, d) => sum + d.idleSec, 0),
    workDays: days.length,
    days,
    sessions,
  };
}

export interface TodayTotals {
  date: string;
  todaySec: number;
  todayIdleSec: number;
  month: string;
  monthSec: number;
  monthIdleSec: number;
}

/** Today and this month (IST) as of `input.now`. `input` must cover the whole month. */
export function todayTotals(input: HoursInput): TodayTotals {
  const date = istDateString(input.now);
  const month = istMonthString(input.now);
  const days = dailyTotals(month, input);
  const today = days.find((d) => d.date === date);
  return {
    date,
    todaySec: today?.workedSec ?? 0,
    todayIdleSec: today?.idleSec ?? 0,
    month,
    monthSec: days.reduce((sum, d) => sum + d.workedSec, 0),
    monthIdleSec: days.reduce((sum, d) => sum + d.idleSec, 0),
  };
}
