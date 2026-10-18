import type { Clock } from './clock';

export interface FailureLimiterOptions {
  windowMs: number;
  /** Failures allowed per key inside the window; the next attempt is blocked. */
  perKeyLimit: number;
  /** Failures allowed across all keys inside the window. Infinity disables it. */
  globalCap: number;
  now: Clock;
}

export interface FailureResult {
  /** True exactly once per key, on the failure that reaches the per-key limit. */
  keyLimitReached: boolean;
  /** True exactly once per window, on the failure that reaches the global cap. */
  globalCapReached: boolean;
}

/**
 * Sliding-window counter of FAILED attempts (successes are not counted).
 * In memory: correct for the single server process this system runs as.
 */
export class FailureLimiter {
  private readonly byKey = new Map<string, number[]>();
  private global: number[] = [];

  constructor(private readonly options: FailureLimiterOptions) {}

  isBlocked(key: string): boolean {
    const now = this.options.now().getTime();
    return (
      this.prune(this.byKey.get(key) ?? [], now).length >= this.options.perKeyLimit ||
      this.globalCount(now) >= this.options.globalCap
    );
  }

  recordFailure(key: string): FailureResult {
    const now = this.options.now().getTime();
    const keyHits = this.prune(this.byKey.get(key) ?? [], now);
    keyHits.push(now);
    this.byKey.set(key, keyHits);
    this.global = this.prune(this.global, now);
    this.global.push(now);
    if (this.byKey.size > 10_000) this.sweep(now);
    return {
      keyLimitReached: keyHits.length === this.options.perKeyLimit,
      globalCapReached: this.global.length === this.options.globalCap,
    };
  }

  private globalCount(now: number): number {
    this.global = this.prune(this.global, now);
    return this.global.length;
  }

  private prune(hits: number[], now: number): number[] {
    const from = now - this.options.windowMs;
    return hits.filter((t) => t > from);
  }

  private sweep(now: number) {
    for (const [key, hits] of this.byKey) {
      const kept = this.prune(hits, now);
      if (kept.length === 0) this.byKey.delete(key);
      else this.byKey.set(key, kept);
    }
  }
}
