/** All dates and times are shown in India time, whatever the device's time zone. */
export const APP_TIME_ZONE = 'Asia/Kolkata';

const pad = (n: number) => String(n).padStart(2, '0');

/** 3725 -> "01:02:05". Hours can go above 24. */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${pad(h)}:${pad(m)}:${pad(sec % 60)}`;
}

/** 27120 -> "7h 32m", 2700 -> "45m", 0 -> "0m". */
export function formatHours(totalSec: number): string {
  const min = Math.max(0, Math.floor(totalSec / 60));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** 545 -> "09:05" (minutes:seconds, for short countdowns). */
export function formatCountdown(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
}

function parts(ms: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ms)) {
    out[p.type] = p.value;
  }
  return out;
}

/** Calendar date in India for an instant, e.g. "2026-10-18". */
export function istDate(ms: number): string {
  const p = parts(ms);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Calendar month in India for an instant, e.g. "2026-10". */
export function istMonth(ms: number): string {
  return istDate(ms).slice(0, 7);
}

/** "18 Oct 2026, 14:05" in India time. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** "14:05" in India time. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** A date-only value ("2026-10-18") as "Sun, 18 Oct 2026". It has no time zone, so format as UTC. */
export function formatDay(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`));
}

/** "2026-10" -> "October 2026". */
export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-15T12:00:00Z`));
}

/** The month before/after "2026-10" (delta -1 / +1). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 15));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
