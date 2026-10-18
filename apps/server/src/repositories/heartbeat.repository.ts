import type { HeartbeatState } from '../generated/prisma/client';
import type { Db } from './index';

export function createHeartbeatRepository(db: Db) {
  return {
    async createMany(
      rows: {
        userId: string;
        sessionId: string;
        at: Date;
        state: HeartbeatState;
        receivedAt: Date;
      }[],
    ): Promise<number> {
      if (rows.length === 0) return 0;
      const result = await db.heartbeat.createMany({ data: rows });
      return result.count;
    },

    listForSessions: (sessionIds: string[]) =>
      db.heartbeat.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { sessionId: true, at: true, state: true },
        orderBy: { at: 'asc' },
      }),

    /** Retention: heartbeats are kept 90 days. */
    async deleteOlderThan(cutoff: Date): Promise<number> {
      const result = await db.heartbeat.deleteMany({ where: { at: { lt: cutoff } } });
      return result.count;
    },
  };
}
