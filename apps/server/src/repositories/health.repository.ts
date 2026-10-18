import type { PrismaClient } from '../generated/prisma/client';

export interface HealthRepository {
  /** Resolves if the database answers a trivial query, rejects otherwise. */
  pingDb(): Promise<void>;
}

export function createHealthRepository(prisma: PrismaClient): HealthRepository {
  return {
    async pingDb() {
      await prisma.$queryRaw`SELECT 1`;
    },
  };
}
