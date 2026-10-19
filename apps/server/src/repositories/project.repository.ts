import type { Prisma } from '../generated/prisma/client';
import type { Db } from './index';

export function createProjectRepository(db: Db) {
  return {
    create: (data: Prisma.ProjectUncheckedCreateInput) => db.project.create({ data }),

    findById: (id: string) => db.project.findUnique({ where: { id } }),

    update: (id: string, data: Prisma.ProjectUncheckedUpdateInput) =>
      db.project.update({ where: { id }, data }),

    /** Newest first. */
    list: () => db.project.findMany({ orderBy: { createdAt: 'desc' } }),
  };
}
