/**
 * Difference between the server clock and this device's clock, learned from the HTTP `Date`
 * header. Countdowns use it so a wrong laptop clock does not show a wrong time left.
 * The header has 1-second resolution, so small differences are ignored.
 */
let offsetMs = 0;

const IGNORE_BELOW_MS = 2000;

/** Pure: offset for a `Date` header received at `localNow`, or null if the header is unusable. */
export function offsetFromDateHeader(header: string | null, localNow: number): number | null {
  if (!header) return null;
  const serverMs = Date.parse(header);
  if (Number.isNaN(serverMs)) return null;
  // The header is truncated to the second; assume the middle of that second.
  const diff = serverMs + 500 - localNow;
  return Math.abs(diff) < IGNORE_BELOW_MS ? 0 : diff;
}

export function noteServerDate(header: string | null, localNow = Date.now()): void {
  const offset = offsetFromDateHeader(header, localNow);
  if (offset !== null) offsetMs = offset;
}

/** Best estimate of the server's current time in ms. */
export function serverNow(localNow = Date.now()): number {
  return localNow + offsetMs;
}
