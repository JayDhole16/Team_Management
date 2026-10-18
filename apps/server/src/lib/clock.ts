/** Injectable "now" so tests can control time (code expiry, rate-limit windows). */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** Today's calendar date in Asia/Kolkata as YYYY-MM-DD. */
export function istDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** YYYY-MM-DD -> Date for a Postgres DATE column (midnight UTC; the column has no time). */
export function dateOnlyToDb(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function dbDateToString(value: Date): string {
  return value.toISOString().slice(0, 10);
}
