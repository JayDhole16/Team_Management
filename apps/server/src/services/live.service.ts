import type { IdleReason, LiveEmployee, LiveList, LiveStatus } from '@lk/shared';
import type { ServiceContext } from './context';
import { istMonthRange, istMonthString, todayTotals } from './hours';
import { deriveLiveStatus, type LiveStatusResult } from './live-status';

interface EmployeeStatus extends LiveStatusResult {
  userId: string;
  name: string;
  jobRole: string | null;
  openStartedAt: Date | null;
  lastIdle: { reason: IdleReason; at: Date } | null;
}

/** Live status of the active employees (all, or only `userIds`). */
async function loadStatuses(ctx: ServiceContext, userIds?: string[]): Promise<EmployeeStatus[]> {
  const { repos } = ctx.data;
  const now = ctx.clock();
  const employees = await repos.users.listActiveEmployeesBrief(userIds);
  const ids = employees.map((e) => e.id);
  if (ids.length === 0) return [];

  const [open, lastEnded, lastIdle] = await Promise.all([
    repos.sessions.listOpenForUsers(ids),
    repos.sessions.lastEndedForUsers(ids),
    repos.alerts.latestIdleForUsers(ids),
  ]);
  const openIds = open.map((s) => s.id);
  const [latest, latestActive, lastReceived] = await Promise.all([
    repos.heartbeats.latestForSessions(openIds),
    repos.heartbeats.latestForSessions(openIds, true),
    repos.heartbeats.lastReceivedForSessions(openIds),
  ]);

  const openByUser = new Map(open.map((s) => [s.userId, s]));
  const endedByUser = new Map(lastEnded.map((s) => [s.userId, s]));
  const idleByUser = new Map(lastIdle.map((a) => [a.userId, a]));
  const latestBySession = new Map(latest.map((h) => [h.sessionId, h]));
  const activeBySession = new Map(latestActive.map((h) => [h.sessionId, h.at]));
  const receivedBySession = new Map(lastReceived.map((h) => [h.sessionId, h.receivedAt]));

  return employees.map((e) => {
    const session = openByUser.get(e.id);
    const idle = idleByUser.get(e.id);
    const hb = session ? latestBySession.get(session.id) : undefined;
    const result = deriveLiveStatus({
      now,
      open: session
        ? {
            startedAt: session.startedAt,
            lastHeartbeat: hb ? { at: hb.at, state: hb.state } : null,
            lastActiveAt: activeBySession.get(session.id) ?? null,
            lastReceivedAt: receivedBySession.get(session.id) ?? null,
          }
        : null,
      lastEnded: endedByUser.get(e.id) ?? null,
      lastIdleAt: idle?.at ?? null,
    });
    return {
      ...result,
      userId: e.id,
      name: e.name,
      jobRole: e.jobRole?.label ?? null,
      openStartedAt: session?.startedAt ?? null,
      lastIdle: idle ? { reason: idle.idleReason, at: idle.at } : null,
    };
  });
}

/**
 * O-6: the owner's live board. Hours today and this month come from services/hours.ts with
 * sessions only (worked time; idle time is on the hours report), in one batch for everyone.
 */
export async function listLive(ctx: ServiceContext): Promise<LiveList> {
  const now = ctx.clock();
  const statuses = await loadStatuses(ctx);
  const range = istMonthRange(istMonthString(now));
  const sessions = await ctx.data.repos.sessions.listOverlappingForUsers(
    statuses.map((s) => s.userId),
    range.start,
    range.end,
  );
  const employees = statuses.map((s): LiveEmployee => {
    const totals = todayTotals({
      sessions: sessions.filter((row) => row.userId === s.userId),
      heartbeats: [],
      gaps: [],
      now,
      idleCapSec: ctx.env.SESSION_AUTOCLOSE_AFTER_SEC,
    });
    return {
      userId: s.userId,
      name: s.name,
      jobRole: s.jobRole,
      status: s.status,
      agentRunning: s.agentRunning,
      session: s.openStartedAt ? { startedAt: s.openStartedAt.toISOString() } : null,
      lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
      lastIdle: s.lastIdle ? { reason: s.lastIdle.reason, at: s.lastIdle.at.toISOString() } : null,
      todaySec: totals.todaySec,
      monthSec: totals.monthSec,
    };
  });
  return { employees, serverTime: now.toISOString() };
}

export interface LiveTracker {
  /** Recompute (everyone, or only `userIds`) and emit `status:changed` for what changed. */
  refresh(userIds?: string[]): Promise<void>;
  /**
   * Queue a refresh of one employee on the background queue. Changes that arrive while one is
   * queued are folded into it, so a burst of heartbeats costs one refresh, not one each.
   */
  schedule(userId: string): void;
  /** Queue a refresh of everyone, unless one is already queued or running. */
  scheduleAll(): void;
}

/**
 * Remembers each employee's last status so `status:changed` goes out only on a real change
 * (a heartbeat every 30 s would otherwise flood the owner). Called through the background
 * queue, one refresh at a time.
 */
export function createLiveTracker(ctx: ServiceContext): LiveTracker {
  const last = new Map<string, { status: LiveStatus; agentRunning: boolean }>();
  const dirty = new Set<string>();
  let flushQueued = false;
  let allQueued = false;
  const tracker: LiveTracker = {
    schedule(userId) {
      dirty.add(userId);
      if (flushQueued) return;
      flushQueued = true;
      ctx.background.run('live status', async () => {
        // Reset first: a change during this refresh queues the next one.
        flushQueued = false;
        const ids = [...dirty];
        dirty.clear();
        await tracker.refresh(ids);
      });
    },
    scheduleAll() {
      if (allQueued) return;
      allQueued = true;
      ctx.background.run('live status (all)', async () => {
        try {
          await tracker.refresh();
        } finally {
          allQueued = false;
        }
      });
    },
    async refresh(userIds) {
      const statuses = await loadStatuses(ctx, userIds);
      const at = ctx.clock().toISOString();
      const seen = new Set<string>();
      for (const s of statuses) {
        seen.add(s.userId);
        const before = last.get(s.userId);
        if (before?.status === s.status && before.agentRunning === s.agentRunning) continue;
        last.set(s.userId, { status: s.status, agentRunning: s.agentRunning });
        ctx.bus.emit('status:changed', {
          userId: s.userId,
          status: s.status,
          agentRunning: s.agentRunning,
          at,
        });
      }
      // Deactivated (or removed) employees leave the board as Offline.
      for (const userId of userIds ?? [...last.keys()]) {
        if (seen.has(userId) || !last.has(userId)) continue;
        last.delete(userId);
        ctx.bus.emit('status:changed', { userId, status: 'OFFLINE', agentRunning: false, at });
      }
    },
  };
  return tracker;
}
