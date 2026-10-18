import type { Prisma, SessionEndReason } from '../generated/prisma/client';
import type { Db } from './index';

export function createWorkSessionRepository(db: Db) {
  return {
    /**
     * Serialises session writes for one user until the transaction ends (start, stop,
     * heartbeat, auto-close). Only meaningful inside `transaction`.
     */
    async lockUser(userId: string): Promise<void> {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    },

    // Not findUnique: `userId` is unique only among open sessions (partial index).
    findOpen: (userId: string) => db.workSession.findFirst({ where: { userId, endedAt: null } }),

    create: (data: { userId: string; startedAt: Date; deviceId?: string | null }) =>
      db.workSession.create({ data }),

    /** Closes the session only if it is still open. Returns the number of rows changed. */
    async close(id: string, endedAt: Date, endReason: SessionEndReason): Promise<number> {
      const result = await db.workSession.updateMany({
        where: { id, endedAt: null },
        data: { endedAt, endReason },
      });
      return result.count;
    },

    update: (id: string, data: Prisma.WorkSessionUncheckedUpdateInput) =>
      db.workSession.update({ where: { id }, data }),

    /** Every session that may still receive a heartbeat at or after `since`. */
    listForMerge: (userId: string, since: Date) =>
      db.workSession.findMany({
        where: { userId, OR: [{ endedAt: null }, { endedAt: { gte: since } }] },
        orderBy: { startedAt: 'asc' },
      }),

    /** Sessions overlapping [start, end). */
    listOverlapping: (userId: string, start: Date, end: Date) =>
      db.workSession.findMany({
        where: {
          userId,
          startedAt: { lt: end },
          OR: [{ endedAt: null }, { endedAt: { gt: start } }],
        },
        orderBy: { startedAt: 'asc' },
      }),

    /** Open sessions whose agent went silent before `cutoff`. */
    listSilentOpen: (cutoff: Date) =>
      db.workSession.findMany({
        where: { endedAt: null, lastHeartbeatAt: { lt: cutoff } },
        select: { id: true, userId: true, lastHeartbeatAt: true },
      }),

    /** Open sessions that never got a heartbeat and started before `cutoff`. */
    listNoHeartbeatOpen: (cutoff: Date) =>
      db.workSession.findMany({
        where: { endedAt: null, lastHeartbeatAt: null, startedAt: { lt: cutoff } },
        select: { id: true, userId: true, startedAt: true },
      }),

    /**
     * Auto-close guarded on the heartbeat the job saw: if a newer heartbeat arrived in the
     * meantime, nothing changes.
     */
    async closeIfSilent(id: string, lastHeartbeatAt: Date): Promise<number> {
      const result = await db.workSession.updateMany({
        where: { id, endedAt: null, lastHeartbeatAt },
        data: { endedAt: lastHeartbeatAt, endReason: 'AUTO_CLOSED' },
      });
      return result.count;
    },

    async closeIfNoHeartbeat(id: string, endedAt: Date): Promise<number> {
      const result = await db.workSession.updateMany({
        where: { id, endedAt: null, lastHeartbeatAt: null },
        data: { endedAt, endReason: 'MAX_DURATION' },
      });
      return result.count;
    },
  };
}
