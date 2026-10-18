import type { Db } from './index';

export function createSessionGapRepository(db: Db) {
  return {
    async createMany(rows: { sessionId: string; fromAt: Date; toAt: Date }[]): Promise<void> {
      if (rows.length > 0) await db.workSessionGap.createMany({ data: rows });
    },

    listForSessions: (sessionIds: string[]) =>
      db.workSessionGap.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { sessionId: true, fromAt: true, toAt: true },
        orderBy: { fromAt: 'asc' },
      }),
  };
}
