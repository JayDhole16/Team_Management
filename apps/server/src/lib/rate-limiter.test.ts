import { describe, expect, it } from 'vitest';
import { FailureLimiter } from './rate-limiter';

function setup(globalCap = Infinity) {
  let now = Date.parse('2026-10-18T05:00:00Z');
  const limiter = new FailureLimiter({
    windowMs: 15 * 60_000,
    perKeyLimit: 5,
    globalCap,
    now: () => new Date(now),
  });
  return { limiter, advance: (ms: number) => (now += ms) };
}

describe('FailureLimiter', () => {
  it('allows 5 failures per key, then blocks the 6th attempt', () => {
    const { limiter } = setup();
    for (let i = 1; i <= 5; i++) {
      expect(limiter.isBlocked('1.1.1.1')).toBe(false);
      limiter.recordFailure('1.1.1.1');
    }
    expect(limiter.isBlocked('1.1.1.1')).toBe(true);
  });

  it('reports reaching the per-key limit exactly once', () => {
    const { limiter } = setup();
    const results = Array.from({ length: 7 }, () => limiter.recordFailure('ip').keyLimitReached);
    expect(results).toEqual([false, false, false, false, true, false, false]);
  });

  it('does not affect other keys', () => {
    const { limiter } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure('1.1.1.1');
    expect(limiter.isBlocked('2.2.2.2')).toBe(false);
  });

  it('unblocks when old failures slide out of the 15-minute window', () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure('ip');
    advance(15 * 60_000 - 1);
    expect(limiter.isBlocked('ip')).toBe(true);
    advance(1);
    expect(limiter.isBlocked('ip')).toBe(false);
  });

  it('blocks everyone once the global cap is reached, and reports it once', () => {
    const { limiter } = setup(10);
    const capHits: boolean[] = [];
    for (let i = 0; i < 10; i++) capHits.push(limiter.recordFailure(`ip-${i}`).globalCapReached);
    expect(capHits.filter(Boolean)).toHaveLength(1);
    expect(capHits[9]).toBe(true);
    expect(limiter.isBlocked('fresh-ip')).toBe(true);
  });
});
