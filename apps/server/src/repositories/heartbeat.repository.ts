import type { HeartbeatState } from '../generated/prisma/client';
import type { Db } from './index';

export interface LatestHeartbeat {
  sessionId: string;
  at: Date;
  state: HeartbeatState;
}

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

    /** The newest heartbeat of each session (optionally only ACTIVE ones). */
    latestForSessions: (sessionIds: string[], onlyActive = false) =>
      sessionIds.length === 0
        ? Promise.resolve([] as LatestHeartbeat[])
        : onlyActive
          ? db.$queryRaw<LatestHeartbeat[]>`
              SELECT DISTINCT ON (session_id) session_id AS "sessionId", at, state
              FROM heartbeats
              WHERE session_id = ANY(${sessionIds}::uuid[]) AND state = 'ACTIVE'
              ORDER BY session_id, at DESC`
          : db.$queryRaw<LatestHeartbeat[]>`
              SELECT DISTINCT ON (session_id) session_id AS "sessionId", at, state
              FROM heartbeats
              WHERE session_id = ANY(${sessionIds}::uuid[])
              ORDER BY session_id, at DESC`,

    /** When the server last received a heartbeat for each session (server time). */
    lastReceivedForSessions: (sessionIds: string[]) =>
      sessionIds.length === 0
        ? Promise.resolve([] as { sessionId: string; receivedAt: Date }[])
        : db.heartbeat
            .groupBy({
              by: ['sessionId'],
              where: { sessionId: { in: sessionIds } },
              _max: { receivedAt: true },
            })
            .then((rows) =>
              rows.flatMap((r) =>
                r._max.receivedAt
                  ? [{ sessionId: r.sessionId, receivedAt: r._max.receivedAt }]
                  : [],
              ),
            ),

    /** Retention: heartbeats are kept 90 days. */
    async deleteOlderThan(cutoff: Date): Promise<number> {
      const result = await db.heartbeat.deleteMany({ where: { at: { lt: cutoff } } });
      return result.count;
    },
  };
}
