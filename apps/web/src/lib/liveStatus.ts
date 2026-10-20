import { LIVE_STATUS_LABELS, type LiveEmployee, type LiveStatus } from '@lk/shared';
import type { Tone } from '../components/ui';
import { formatDateTime, istDate } from './time';

/** Badge colours from docs/SCREENS.md: Working green, Idle amber, On break blue, Offline grey. */
export const LIVE_STATUS: Record<LiveStatus, { label: string; tone: Tone }> = {
  WORKING: { label: LIVE_STATUS_LABELS.WORKING, tone: 'green' },
  IDLE: { label: LIVE_STATUS_LABELS.IDLE, tone: 'amber' },
  ON_BREAK: { label: LIVE_STATUS_LABELS.ON_BREAK, tone: 'blue' },
  OFFLINE: { label: LIVE_STATUS_LABELS.OFFLINE, tone: 'grey' },
};

export const LIVE_STATUS_ORDER: readonly LiveStatus[] = ['IDLE', 'WORKING', 'ON_BREAK', 'OFFLINE'];

export function countByStatus(employees: readonly LiveEmployee[]): Record<LiveStatus, number> {
  const counts: Record<LiveStatus, number> = { WORKING: 0, IDLE: 0, ON_BREAK: 0, OFFLINE: 0 };
  for (const e of employees) counts[e.status] += 1;
  return counts;
}

/** Idle first (needs attention), then working, on break, offline; by name within each. */
export function sortLive(employees: readonly LiveEmployee[]): LiveEmployee[] {
  const rank = (s: LiveStatus) => LIVE_STATUS_ORDER.indexOf(s);
  return [...employees].sort(
    (a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name),
  );
}

/** "A session is open but no agent heartbeat arrives" (PRD O-6). */
export const agentMissing = (e: Pick<LiveEmployee, 'session' | 'agentRunning'>): boolean =>
  e.session !== null && !e.agentRunning;

/** "just now", "5 min ago", "3 h ago", else the date and time. */
export function lastSeenText(iso: string | null, nowMs: number): string {
  if (!iso) return 'Never';
  const min = Math.floor((nowMs - Date.parse(iso)) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 12 * 60) return `${Math.floor(min / 60)} h ago`;
  return formatDateTime(iso);
}

/** Team hours today: the totals from the server plus what open sessions ran since. */
export function teamTodaySec(employees: readonly LiveEmployee[], grownSec: number): number {
  return employees.reduce((sum, e) => sum + e.todaySec + (e.session ? grownSec : 0), 0);
}

/**
 * Seconds an open session has run since the board was loaded (`serverTime`), stopping at
 * India midnight: the board's "today" is over then and the next refresh starts the new day.
 */
export function grownSinceLoad(serverTime: string, serverNowMs: number): number {
  const from = Date.parse(serverTime);
  const dayEnd = Date.parse(`${istDate(from)}T00:00:00+05:30`) + 24 * 3600_000;
  return Math.floor(Math.max(0, Math.min(serverNowMs, dayEnd) - from) / 1000);
}
