import type {
  HeartbeatBatchBody,
  HeartbeatResult,
  SessionCurrent,
  SessionEndReason,
  WorkSession,
} from '@lk/shared';
import { isUniqueViolation, type Repos } from '../repositories';
import type { ServiceContext } from './context';
import { HEARTBEAT_MAX_AGE_MS, planHeartbeatMerge } from './heartbeat-merge';
import { toWorkSession } from './mappers';

/** Heartbeats are kept 90 days (ARCHITECTURE section 4). */
export const HEARTBEAT_RETENTION_MS = 90 * 24 * 60 * 60_000;

/**
 * E-1 / E-2: starts the employee's session. Idempotent: if one is open it is returned, so
 * calling start twice (two tabs, web + agent) never creates a second open session.
 */
export async function startSession(ctx: ServiceContext, userId: string): Promise<WorkSession> {
  const now = ctx.clock();
  try {
    return await ctx.data.transaction(async (repos) => {
      await repos.sessions.lockUser(userId);
      const open = await repos.sessions.findOpen(userId);
      if (open) return toWorkSession(open);
      return toWorkSession(await repos.sessions.create({ userId, startedAt: now }));
    });
  } catch (err) {
    // The lock serialises starts; the partial unique index is the last line of defence.
    if (!isUniqueViolation(err)) throw err;
    const open = await ctx.data.repos.sessions.findOpen(userId);
    if (!open) throw err;
    return toWorkSession(open);
  }
}

/** Closes the user's open session, if any. Call inside a transaction. */
export async function closeOpenSession(
  repos: Repos,
  userId: string,
  endedAt: Date,
  reason: SessionEndReason,
): Promise<WorkSession | null> {
  await repos.sessions.lockUser(userId);
  const open = await repos.sessions.findOpen(userId);
  if (!open) return null;
  // Never end before the session's own start or its newest heartbeat.
  const lastSeen = open.lastHeartbeatAt ?? open.startedAt;
  const end = endedAt < lastSeen ? lastSeen : endedAt;
  await repos.sessions.close(open.id, end, reason);
  return toWorkSession({ ...open, endedAt: end, endReason: reason });
}

/** "Stop session" (break). Idempotent: returns null when nothing was open. */
export async function stopSession(
  ctx: ServiceContext,
  userId: string,
  reason: SessionEndReason = 'MANUAL_STOP',
): Promise<WorkSession | null> {
  const now = ctx.clock();
  return ctx.data.transaction((repos) => closeOpenSession(repos, userId, now, reason));
}

export async function currentSession(ctx: ServiceContext, userId: string): Promise<SessionCurrent> {
  const open = await ctx.data.repos.sessions.findOpen(userId);
  return { session: open ? toWorkSession(open) : null, serverTime: ctx.clock().toISOString() };
}

/** Agent heartbeats, live or replayed from the offline queue. See heartbeat-merge.ts. */
export async function recordHeartbeats(
  ctx: ServiceContext,
  userId: string,
  body: HeartbeatBatchBody,
): Promise<HeartbeatResult> {
  const now = ctx.clock();
  const autocloseSec = ctx.env.SESSION_AUTOCLOSE_AFTER_SEC;
  return ctx.data.transaction(async (repos) => {
    await repos.sessions.lockUser(userId);
    const since = new Date(now.getTime() - HEARTBEAT_MAX_AGE_MS - autocloseSec * 1000);
    const sessions = await repos.sessions.listForMerge(userId, since);
    const plan = planHeartbeatMerge({
      sessions,
      heartbeats: body.heartbeats.map((hb) => ({ at: new Date(hb.at), state: hb.state })),
      now,
      autocloseSec,
    });

    await repos.heartbeats.createMany(
      plan.attach.map((hb) => ({ ...hb, userId, receivedAt: now })),
    );
    for (const [id, update] of plan.sessionUpdates) {
      await repos.sessions.update(id, update);
    }
    await repos.sessionGaps.createMany(plan.gaps);

    const open = await repos.sessions.findOpen(userId);
    return {
      accepted: plan.attach.length,
      ignored: plan.ignored,
      session: open ? toWorkSession(open) : null,
    };
  });
}

/**
 * Background job:
 * - a session whose agent has been silent for SESSION_AUTOCLOSE_AFTER_SEC is closed at its
 *   last heartbeat (AUTO_CLOSED);
 * - a session that never got a heartbeat is closed SESSION_NO_HEARTBEAT_MAX_HOURS after it
 *   started (MAX_DURATION, flagged in reports).
 */
export async function autoCloseSessions(
  ctx: ServiceContext,
): Promise<{ autoClosed: number; maxDuration: number }> {
  const now = ctx.clock();
  const repos = ctx.data.repos;
  const silentCutoff = new Date(now.getTime() - ctx.env.SESSION_AUTOCLOSE_AFTER_SEC * 1000);
  const capMs = ctx.env.SESSION_NO_HEARTBEAT_MAX_HOURS * 60 * 60_000;

  let autoClosed = 0;
  for (const s of await repos.sessions.listSilentOpen(silentCutoff)) {
    // `lastHeartbeatAt` is non-null by the query. The update is guarded on it, so a heartbeat
    // that arrived since the query wins.
    const last = s.lastHeartbeatAt as Date;
    autoClosed += await ctx.data.transaction(async (tx) => {
      await tx.sessions.lockUser(s.userId);
      return tx.sessions.closeIfSilent(s.id, last);
    });
  }

  let maxDuration = 0;
  for (const s of await repos.sessions.listNoHeartbeatOpen(new Date(now.getTime() - capMs))) {
    maxDuration += await ctx.data.transaction(async (tx) => {
      await tx.sessions.lockUser(s.userId);
      return tx.sessions.closeIfNoHeartbeat(s.id, new Date(s.startedAt.getTime() + capMs));
    });
  }
  return { autoClosed, maxDuration };
}

export async function pruneHeartbeats(ctx: ServiceContext): Promise<number> {
  const cutoff = new Date(ctx.clock().getTime() - HEARTBEAT_RETENTION_MS);
  return ctx.data.repos.heartbeats.deleteOlderThan(cutoff);
}
