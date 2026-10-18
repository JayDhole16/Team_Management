import type { Prisma, UserRole, UserStatus } from '../generated/prisma/client';
import type { Db } from './index';

export function createUserRepository(db: Db) {
  return {
    findById: (id: string) => db.user.findUnique({ where: { id } }),

    /** `email` must already be lowercased. */
    findByEmail: (email: string) => db.user.findUnique({ where: { email } }),

    create: (data: Prisma.UserUncheckedCreateInput) => db.user.create({ data }),

    update: (id: string, data: Prisma.UserUncheckedUpdateInput) =>
      db.user.update({ where: { id }, data }),

    list: (filter: { role: UserRole; jobRoleId?: string; status?: UserStatus }) =>
      db.user.findMany({ where: filter, orderBy: { name: 'asc' } }),

    countByRole: (role: UserRole) => db.user.count({ where: { role } }),
  };
}
