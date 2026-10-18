import type { TodayHours } from '@lk/shared';
import { shiftMonth } from './time';

/**
 * The timer is always derived from server timestamps (CLAUDE web rule): the server sends
 * `serverTime` with each response, and we add only the time that passed locally since that
 * response arrived. A wrong device clock therefore cannot change the shown time.
 */
export function serverNowFrom(serverTime: string, receivedAtLocal: number, nowLocal: number) {
  return Date.parse(serverTime) + Math.max(0, nowLocal - receivedAtLocal);
}

/** Seconds since `startedAt` at the given server time. Never negative. */
export function elapsedSec(startedAt: string, serverNowMs: number): number {
  return Math.max(0, Math.floor((serverNowMs - Date.parse(startedAt)) / 1000));
}

export interface LiveTotals {
  /** Running session, or null when on a break. */
  sessionSec: number | null;
  todaySec: number;
  monthSec: number;
}

/** Today/month totals from the report, plus the time the open session has run since then. */
export function liveTotals(
  report: TodayHours,
  receivedAtLocal: number,
  nowLocal: number,
): LiveTotals {
  if (!report.openSession) {
    return { sessionSec: null, todaySec: report.todaySec, monthSec: report.monthSec };
  }
  const now = serverNowFrom(report.serverTime, receivedAtLocal, nowLocal);
  const from = Date.parse(report.serverTime);
  // Stop adding at India midnight / the end of the month: the report's "today" and "month"
  // are over then, and the page refetches the new day (MyDayPage).
  const dayEnd = Date.parse(`${report.date}T00:00:00+05:30`) + 24 * 3600_000;
  const monthEnd = Date.parse(`${shiftMonth(report.month, 1)}-01T00:00:00+05:30`);
  const grown = (until: number) => Math.floor(Math.max(0, Math.min(now, until) - from) / 1000);
  return {
    sessionSec: elapsedSec(report.openSession.startedAt, now),
    todaySec: report.todaySec + grown(dayEnd),
    monthSec: report.monthSec + grown(monthEnd),
  };
}

/** Seconds left until `expiresAt`, rounded up so "00:00" means really expired. */
export function remainingSec(expiresAt: string, serverNowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - serverNowMs) / 1000));
}

/** The desktop agent counts as running if it sent a heartbeat in the last 2 minutes. */
export const AGENT_FRESH_MS = 2 * 60_000;

export function agentRunning(lastHeartbeatAt: string | null, serverNowMs: number): boolean {
  return lastHeartbeatAt !== null && serverNowMs - Date.parse(lastHeartbeatAt) < AGENT_FRESH_MS;
}
