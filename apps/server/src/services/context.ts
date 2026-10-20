import type { Env } from '../config/env';
import type { BackgroundQueue } from '../lib/background';
import type { Clock } from '../lib/clock';
import type { EventBus } from '../lib/events';
import { FailureLimiter } from '../lib/rate-limiter';
import type { PushSender } from '../lib/push-sender';
import type { LlmClient } from '../llm/types';
import type { DataAccess } from '../repositories';

export const RATE_LIMIT_WINDOW_MS = 15 * 60_000;
export const LOGIN_FAILURES_PER_IP = 10;
export const LOGIN_FAILURES_PER_ACCOUNT = 10;
export const CODE_FAILURES_PER_IP = 5;
/** AI calls per user in the window. The GPU is shared, so one user cannot queue it up. */
export const AI_CALLS_PER_USER = 60;
/** Progress updates sent per employee in the window, so the owner's inbox cannot be flooded. */
export const UPDATES_PER_USER = 30;
/** Idle events per employee in the window. The shortest idle interval is 5 min, so a real
 *  agent sends at most ~3; the cap stops a loop from flooding the owner with beeps. */
export const IDLE_EVENTS_PER_USER = 20;

export interface Limiters {
  /** Failed logins per IP. */
  login: FailureLimiter;
  /** Failed logins per email, so guessing from many IPs is still capped. */
  loginAccount: FailureLimiter;
  /** Failed invite-code claims per IP, plus the global cap. */
  claim: FailureLimiter;
  /** Failed password-reset / face-rescan codes per IP. No global cap, so floods of
   *  wrong invite codes cannot block recovery for everyone. */
  recovery: FailureLimiter;
  /** Every /ai/* call per user (counted as an attempt whether it succeeds or not). */
  ai: FailureLimiter;
  /** Every progress update sent, per employee. */
  updates: FailureLimiter;
  /** Every idle event reported, per employee. */
  idleEvents: FailureLimiter;
}

export function createLimiters(env: Pick<Env, 'CLAIM_GLOBAL_FAILURE_CAP'>, now: Clock): Limiters {
  const perKey = (perKeyLimit: number, globalCap = Infinity) =>
    new FailureLimiter({ windowMs: RATE_LIMIT_WINDOW_MS, perKeyLimit, globalCap, now });
  return {
    login: perKey(LOGIN_FAILURES_PER_IP),
    loginAccount: perKey(LOGIN_FAILURES_PER_ACCOUNT),
    claim: perKey(CODE_FAILURES_PER_IP, env.CLAIM_GLOBAL_FAILURE_CAP),
    recovery: perKey(CODE_FAILURES_PER_IP),
    ai: perKey(AI_CALLS_PER_USER),
    updates: perKey(UPDATES_PER_USER),
    idleEvents: perKey(IDLE_EVENTS_PER_USER),
  };
}

/** Everything a service needs. Built once in buildApp and passed to every service call. */
export interface ServiceContext {
  data: DataAccess;
  env: Env;
  clock: Clock;
  bus: EventBus;
  limiters: Limiters;
  llm: LlmClient;
  /** Null when VAPID keys are not configured (push off). */
  push: PushSender | null;
  background: BackgroundQueue;
}
