import type { HoursQuery, MonthHours, TodayHours, TodayHoursQuery } from '@lk/shared';
import type { User } from '../generated/prisma/client';
import { badRequest, forbidden, notFound } from '../lib/errors';
import type { ServiceContext } from './context';
import { istMonthRange, istMonthString, monthTotals, todayTotals, type HoursInput } from './hours';
import { toWorkSession } from './mappers';

/**
 * Owner: any employee (userId required). Employee: only themselves. Enforced here, on the
 * server, not just in the UI.
 */
async function resolveTarget(
  ctx: ServiceContext,
  viewer: User,
  userId: string | undefined,
): Promise<string> {
  if (viewer.role === 'EMPLOYEE') {
    if (userId !== undefined && userId !== viewer.id) throw forbidden();
    return viewer.id;
  }
  if (!userId) throw badRequest('userId is required', 'USER_ID_REQUIRED');
  const user = await ctx.data.repos.users.findById(userId);
  if (!user || user.role !== 'EMPLOYEE') throw notFound('Employee');
  return userId;
}

async function loadMonth(ctx: ServiceContext, userId: string, month: string, now: Date) {
  const repos = ctx.data.repos;
  const range = istMonthRange(month);
  const sessions = await repos.sessions.listOverlapping(userId, range.start, range.end);
  const ids = sessions.map((s) => s.id);
  const [heartbeats, gaps] = await Promise.all([
    repos.heartbeats.listForSessions(ids),
    repos.sessionGaps.listForSessions(ids),
  ]);
  const input: HoursInput = {
    sessions,
    heartbeats,
    gaps,
    now,
    idleCapSec: ctx.env.SESSION_AUTOCLOSE_AFTER_SEC,
  };
  return { sessions, input };
}

/** O-5 / E-5: month total, per-day breakdown and sessions. */
export async function monthHours(
  ctx: ServiceContext,
  viewer: User,
  query: HoursQuery,
): Promise<MonthHours> {
  const now = ctx.clock();
  const userId = await resolveTarget(ctx, viewer, query.userId);
  const month = query.month ?? istMonthString(now);
  const { sessions, input } = await loadMonth(ctx, userId, month, now);
  const totals = monthTotals(month, input);
  const rows = new Map(sessions.map((s) => [s.id, s]));
  return {
    userId,
    month,
    totalSec: totals.totalSec,
    idleSec: totals.idleSec,
    workDays: totals.workDays,
    days: totals.days,
    sessions: totals.sessions.flatMap(({ session, workedSec, idleSec, gaps }) => {
      const row = rows.get(session.id);
      if (!row) return [];
      return [
        {
          ...toWorkSession(row),
          workedSec,
          idleSec,
          gaps: gaps.map((g) => ({ from: g.fromAt.toISOString(), to: g.toAt.toISOString() })),
        },
      ];
    }),
  };
}

/** Today and this month (IST), plus the open session for the timer. */
export async function todayHours(
  ctx: ServiceContext,
  viewer: User,
  query: TodayHoursQuery,
): Promise<TodayHours> {
  const now = ctx.clock();
  const userId = await resolveTarget(ctx, viewer, query.userId);
  const { sessions, input } = await loadMonth(ctx, userId, istMonthString(now), now);
  const open = sessions.find((s) => s.endedAt === null);
  return {
    userId,
    ...todayTotals(input),
    openSession: open ? toWorkSession(open) : null,
    serverTime: now.toISOString(),
  };
}
