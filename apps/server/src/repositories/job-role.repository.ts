import type { Db } from './index';

export function createJobRoleRepository(db: Db) {
  return {
    list: () => db.jobRole.findMany({ orderBy: { label: 'asc' } }),

    findById: (id: string) => db.jobRole.findUnique({ where: { id } }),

    create: (data: { key: string; label: string }) => db.jobRole.create({ data }),

    /** Idempotent: creates the role or updates its label. */
    upsertByKey: (key: string, label: string) =>
      db.jobRole.upsert({ where: { key }, create: { key, label }, update: { label } }),
  };
}
