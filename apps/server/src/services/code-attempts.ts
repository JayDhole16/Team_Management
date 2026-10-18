import { CODE_FAILURES_PER_IP, type ServiceContext } from './context';
import { invalidCode, rateLimited } from '../lib/errors';

/** Invite claims and recovery codes have separate counters (see Limiters). */
export type CodeFlow = 'claim' | 'recovery';

/** Call before checking any access code. Blocked IPs never reach the code lookup. */
export function assertCodeAttemptAllowed(ctx: ServiceContext, flow: CodeFlow, ip: string): void {
  if (ctx.limiters[flow].isBlocked(ip)) throw rateLimited();
}

/**
 * Every code failure (wrong, expired, revoked, used, wrong purpose) ends here, so they all
 * produce the same error. Limit hits are written to audit_log once (aggregated) and raise a
 * security alert for the owner.
 */
export async function failCodeAttempt(
  ctx: ServiceContext,
  flow: CodeFlow,
  ip: string,
): Promise<never> {
  const result = ctx.limiters[flow].recordFailure(ip);
  const now = ctx.clock();

  if (result.keyLimitReached) {
    await ctx.data.repos.audit.record({
      action: `access_code.${flow}_ip_blocked`,
      entity: 'access_code',
      meta: { ip, failures: CODE_FAILURES_PER_IP, windowMinutes: 15 },
      at: now,
    });
    ctx.bus.emit('security:alert', {
      kind: flow === 'claim' ? 'CLAIM_IP_BLOCKED' : 'RECOVERY_IP_BLOCKED',
      message: `Too many wrong access codes from ${ip}. That address is blocked for 15 minutes.`,
      at: now.toISOString(),
    });
  }
  if (result.globalCapReached) {
    await ctx.data.repos.audit.record({
      action: 'access_code.claim_failure_cap',
      entity: 'access_code',
      meta: { failures: ctx.env.CLAIM_GLOBAL_FAILURE_CAP, windowMinutes: 15 },
      at: now,
    });
    ctx.bus.emit('security:alert', {
      kind: 'CLAIM_FAILURE_CAP',
      message:
        'Many wrong access codes were tried in the last 15 minutes. Code entry is paused for everyone for up to 15 minutes.',
      at: now.toISOString(),
    });
  }
  throw invalidCode();
}
