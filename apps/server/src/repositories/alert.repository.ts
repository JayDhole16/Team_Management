import type { IdleReason, Prisma } from '../generated/prisma/client';
import type { Db } from './index';

/** What every alert read returns: the employee's name. */
export const alertInclude = {
  user: { select: { name: true } },
} satisfies Prisma.AlertInclude;

export type AlertRow = Prisma.AlertGetPayload<{ include: typeof alertInclude }>;

/** Newest first; the id breaks ties so paging never skips or repeats a row. */
const newestFirst: Prisma.AlertOrderByWithRelationInput[] = [{ at: 'desc' }, { id: 'desc' }];

export function createAlertRepository(db: Db) {
  return {
    create: (data: Prisma.AlertUncheckedCreateInput): Promise<AlertRow> =>
      db.alert.create({ data, include: alertInclude }),

    findById: (id: string): Promise<AlertRow | null> =>
      db.alert.findUnique({ where: { id }, include: alertInclude }),

    /** Keyset page, same rules as progress updates (the cursor must lie inside `scope`). */
    async page(
      scope: Prisma.AlertWhereInput,
      filter: Prisma.AlertWhereInput,
      cursor: string | undefined,
      limit: number,
    ): Promise<{ rows: AlertRow[]; nextCursor: string | null } | null> {
      let after: Prisma.AlertWhereInput = {};
      if (cursor) {
        const from = await db.alert.findFirst({
          where: { AND: [scope, { id: cursor }] },
          select: { id: true, at: true },
        });
        if (!from) return null;
        after = { OR: [{ at: { lt: from.at } }, { at: from.at, id: { lt: from.id } }] };
      }
      const rows = await db.alert.findMany({
        where: { AND: [scope, filter, after] },
        include: alertInclude,
        orderBy: newestFirst,
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      return { rows: pageRows, nextCursor: hasMore ? (pageRows.at(-1)?.id ?? null) : null };
    },

    /** An open security alert of this kind raised since `since` (repeats are folded into it). */
    findOpenSecuritySince: (securityKind: string, since: Date, message?: string) =>
      db.alert.findFirst({
        where: {
          kind: 'SECURITY',
          securityKind,
          ownerAckAt: null,
          at: { gte: since },
          ...(message === undefined ? {} : { message }),
        },
        select: { id: true },
      }),

    countOpen: (): Promise<number> => db.alert.count({ where: { ownerAckAt: null } }),

    /** Sets the ack only once (a second click keeps the first time). Returns rows changed. */
    async ack(id: string, at: Date, byUserId: string): Promise<number> {
      const { count } = await db.alert.updateMany({
        where: { id, ownerAckAt: null },
        data: { ownerAckAt: at, ownerAckById: byUserId },
      });
      return count;
    },

    async ackAllUpTo(upTo: Date, at: Date, byUserId: string): Promise<number> {
      const { count } = await db.alert.updateMany({
        where: { ownerAckAt: null, receivedAt: { lte: upTo } },
        data: { ownerAckAt: at, ownerAckById: byUserId },
      });
      return count;
    },

    /** Each user's newest idle alert (live board). */
    latestIdleForUsers: (userIds: string[]) =>
      userIds.length === 0
        ? Promise.resolve([])
        : db.$queryRaw<{ userId: string; at: Date; idleReason: IdleReason }[]>`
            SELECT DISTINCT ON (user_id) user_id AS "userId", at, idle_reason AS "idleReason"
            FROM alerts
            WHERE user_id = ANY(${userIds}::uuid[]) AND kind = 'IDLE'
            ORDER BY user_id, at DESC`,
  };
}
