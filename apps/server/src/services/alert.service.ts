import type {
  AckAllBody,
  AckAllResult,
  Alert,
  AlertListQuery,
  AlertPage,
  IdleEventBody,
  IdleEventResult,
  OpenAlertCount,
  SecurityAlertKind,
} from '@lk/shared';
import type { Prisma } from '../generated/prisma/client';
import { badRequest, notFound, rateLimited } from '../lib/errors';
import type { AppEvents } from '../lib/events';
import type { ServiceContext } from './context';
import { HEARTBEAT_MAX_AGE_MS, HEARTBEAT_MAX_FUTURE_MS } from './heartbeat-merge';
import { toAlert } from './mappers';

/**
 * A failed idle check reported by the employee's agent (ARCHITECTURE section 5). Stored as
 * an open alert; the owner gets a beep, a toast and a push. Same time limits as heartbeats:
 * up to 12 h old (offline queue), small clock skew clamped to "now", further ahead ignored.
 */
export async function recordIdleEvent(
  ctx: ServiceContext,
  userId: string,
  body: IdleEventBody,
): Promise<IdleEventResult> {
  if (ctx.limiters.idleEvents.isBlocked(userId)) throw rateLimited();
  // Counted before any await, so parallel requests cannot all slip under the limit.
  ctx.limiters.idleEvents.recordFailure(userId);

  const now = ctx.clock();
  const sent = new Date(body.at);
  const ageMs = now.getTime() - sent.getTime();
  if (ageMs > HEARTBEAT_MAX_AGE_MS || ageMs < -HEARTBEAT_MAX_FUTURE_MS) {
    return { accepted: false, alertId: null };
  }
  const at = sent > now ? now : sent;

  const row = await ctx.data.repos.alerts.create({
    kind: 'IDLE',
    userId,
    idleReason: body.reason,
    score: body.score ?? null,
    at,
    receivedAt: now,
  });
  const alert = toAlert(row);
  ctx.bus.emit('alert:created', { alert });
  ctx.bus.emit('presence:changed', { userId });
  return { accepted: true, alertId: alert.id };
}

/** A repeat of an open security alert within this window adds no new alert, beep or push. */
export const SECURITY_ALERT_REPEAT_WINDOW_MS = 15 * 60_000;

/** Kinds anyone can raise without logging in (from many addresses): folded by kind alone.
 *  The others (a locked account, a reused login) are folded only when the text is the same,
 *  so a second employee's incident still shows. */
const FOLD_BY_KIND: ReadonlySet<SecurityAlertKind> = new Set([
  'CLAIM_IP_BLOCKED',
  'RECOVERY_IP_BLOCKED',
  'CLAIM_FAILURE_CAP',
]);

/**
 * Stores a security alert raised on the bus (code abuse, account lock, token reuse). Anyone can
 * trigger some of these without logging in (wrong codes from many addresses), so while one of
 * the same kind (see FOLD_BY_KIND) is open and less than 15 minutes old, a repeat is not
 * stored or announced again; every occurrence is still in the audit log. Runs one at a time
 * (its own background lane). Returns null for a folded repeat.
 */
export async function recordSecurityAlert(
  ctx: ServiceContext,
  event: AppEvents['security:alert'],
): Promise<Alert | null> {
  const since = new Date(ctx.clock().getTime() - SECURITY_ALERT_REPEAT_WINDOW_MS);
  const message = FOLD_BY_KIND.has(event.kind) ? undefined : event.message;
  if (await ctx.data.repos.alerts.findOpenSecuritySince(event.kind, since, message)) return null;
  const row = await ctx.data.repos.alerts.create({
    kind: 'SECURITY',
    securityKind: event.kind,
    message: event.message,
    at: new Date(event.at),
    receivedAt: ctx.clock(),
  });
  const alert = toAlert(row);
  ctx.bus.emit('alert:created', { alert });
  return alert;
}

/** O-8: the owner's alert list, newest first. */
export async function listAlerts(ctx: ServiceContext, query: AlertListQuery): Promise<AlertPage> {
  const scope: Prisma.AlertWhereInput = {
    ...(query.employeeId ? { userId: query.employeeId } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
  };
  const filter: Prisma.AlertWhereInput = query.status === 'open' ? { ownerAckAt: null } : {};
  const page = await ctx.data.repos.alerts.page(scope, filter, query.cursor, query.limit);
  if (!page) throw badRequest('This page is no longer available. Reload.', 'INVALID_CURSOR');
  return { items: page.rows.map(toAlert), nextCursor: page.nextCursor };
}

export async function openAlertCount(ctx: ServiceContext): Promise<OpenAlertCount> {
  return { count: await ctx.data.repos.alerts.countOpen() };
}

/** Idempotent: a second acknowledge keeps the first time. */
export async function ackAlert(ctx: ServiceContext, ownerId: string, id: string): Promise<Alert> {
  const { repos } = ctx.data;
  const now = ctx.clock();
  const changed = await repos.alerts.ack(id, now, ownerId);
  const row = await repos.alerts.findById(id);
  if (!row) throw notFound('Alert');
  if (changed > 0) ctx.bus.emit('alert:acked', { at: now.toISOString() });
  return toAlert(row);
}

/** Only alerts received up to `upTo` (the newest one on screen), so a newer alert stays open. */
export async function ackAllAlerts(
  ctx: ServiceContext,
  ownerId: string,
  body: AckAllBody,
): Promise<AckAllResult> {
  const { repos } = ctx.data;
  const now = ctx.clock();
  const acknowledged = await repos.alerts.ackAllUpTo(new Date(body.upTo), now, ownerId);
  if (acknowledged > 0) ctx.bus.emit('alert:acked', { at: now.toISOString() });
  return { acknowledged };
}
