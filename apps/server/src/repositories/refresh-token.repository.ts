import type { Db } from './index';

export function createRefreshTokenRepository(db: Db) {
  return {
    create: (data: { userId: string; tokenHash: string; expiresAt: Date }) =>
      db.refreshToken.create({ data }),

    findByHash: (tokenHash: string) => db.refreshToken.findUnique({ where: { tokenHash } }),

    /** Returns 1 if this call revoked it, 0 if it was already revoked (reuse / race). */
    async revoke(id: string, now: Date): Promise<number> {
      const result = await db.refreshToken.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: now },
      });
      return result.count;
    },

    async revokeAllForUser(userId: string, now: Date): Promise<number> {
      const result = await db.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return result.count;
    },
  };
}
