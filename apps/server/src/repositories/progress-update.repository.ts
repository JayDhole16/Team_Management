import type { Prisma } from '../generated/prisma/client';
import type { Db } from './index';

/** What every update read returns: the employee's name and the linked task. */
export const updateInclude = {
  employee: { select: { name: true } },
  task: { select: { id: true, title: true, status: true, assigneeId: true } },
} satisfies Prisma.ProgressUpdateInclude;

export type ProgressUpdateRow = Prisma.ProgressUpdateGetPayload<{ include: typeof updateInclude }>;

/** Newest first; the id breaks ties so paging never skips or repeats a row. */
const newestFirst: Prisma.ProgressUpdateOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

export function createProgressUpdateRepository(db: Db) {
  return {
    create: (data: Prisma.ProgressUpdateUncheckedCreateInput): Promise<ProgressUpdateRow> =>
      db.progressUpdate.create({ data, include: updateInclude }),

    findById: (id: string): Promise<ProgressUpdateRow | null> =>
      db.progressUpdate.findUnique({ where: { id }, include: updateInclude }),

    findByPreviewMac: (previewMac: string): Promise<ProgressUpdateRow | null> =>
      db.progressUpdate.findUnique({ where: { previewMac }, include: updateInclude }),

    /**
     * One page (keyset). `scope` is what the caller may see at all; the cursor (the last id of
     * the previous page) must lie inside it, so a page of one employee's updates cannot be
     * positioned on someone else's. `filter` narrows the page only (e.g. unread), so a cursor
     * row that was marked read meanwhile still works. Returns null for an unknown cursor.
     */
    async page(
      scope: Prisma.ProgressUpdateWhereInput,
      filter: Prisma.ProgressUpdateWhereInput,
      cursor: string | undefined,
      limit: number,
    ): Promise<{ rows: ProgressUpdateRow[]; nextCursor: string | null } | null> {
      let after: Prisma.ProgressUpdateWhereInput = {};
      if (cursor) {
        const from = await db.progressUpdate.findFirst({
          where: { AND: [scope, { id: cursor }] },
          select: { id: true, createdAt: true },
        });
        if (!from) return null;
        after = {
          OR: [
            { createdAt: { lt: from.createdAt } },
            { createdAt: from.createdAt, id: { lt: from.id } },
          ],
        };
      }
      const rows = await db.progressUpdate.findMany({
        where: { AND: [scope, filter, after] },
        include: updateInclude,
        orderBy: newestFirst,
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      return { rows: pageRows, nextCursor: hasMore ? (pageRows.at(-1)?.id ?? null) : null };
    },

    countUnread: (): Promise<number> => db.progressUpdate.count({ where: { readByOwnerAt: null } }),

    /** Sets the read time only once (a second click keeps the first time). */
    async markRead(id: string, at: Date): Promise<void> {
      await db.progressUpdate.updateMany({
        where: { id, readByOwnerAt: null },
        data: { readByOwnerAt: at },
      });
    },

    async markAllRead(
      filter: { upTo: Date; employeeId?: string | undefined },
      at: Date,
    ): Promise<number> {
      const { count } = await db.progressUpdate.updateMany({
        where: {
          readByOwnerAt: null,
          createdAt: { lte: filter.upTo },
          ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
        },
        data: { readByOwnerAt: at },
      });
      return count;
    },
  };
}
