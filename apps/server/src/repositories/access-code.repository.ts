import type { CodePurpose, Prisma } from '../generated/prisma/client';
import type { Db } from './index';

export function createAccessCodeRepository(db: Db) {
  return {
    create: (data: Prisma.AccessCodeUncheckedCreateInput) => db.accessCode.create({ data }),

    findById: (id: string) => db.accessCode.findUnique({ where: { id } }),

    findByClaimTokenHash: (claimTokenHash: string) =>
      db.accessCode.findUnique({ where: { claimTokenHash } }),

    /**
     * ACTIVE -> CLAIMED in one conditional UPDATE, so two tabs racing for the same code
     * cannot both win. Returns the number of rows changed (0 or 1).
     */
    async claimInvite(args: {
      codeHash: string;
      now: Date;
      claimTokenHash: string;
      claimExpiresAt: Date;
    }): Promise<number> {
      const result = await db.accessCode.updateMany({
        where: {
          codeHash: args.codeHash,
          purpose: 'INVITE',
          status: 'ACTIVE',
          expiresAt: { gt: args.now },
        },
        data: {
          status: 'CLAIMED',
          claimedAt: args.now,
          claimTokenHash: args.claimTokenHash,
          claimExpiresAt: args.claimExpiresAt,
        },
      });
      return result.count;
    },

    /** CLAIMED -> USED, only while the registration window is open. */
    async useClaimed(args: { id: string; now: Date }): Promise<number> {
      const result = await db.accessCode.updateMany({
        where: { id: args.id, status: 'CLAIMED', claimExpiresAt: { gt: args.now } },
        data: { status: 'USED', usedAt: args.now },
      });
      return result.count;
    },

    setRegisteredUser: (id: string, registeredUserId: string) =>
      db.accessCode.update({ where: { id }, data: { registeredUserId } }),

    /** ACTIVE -> USED for PASSWORD_RESET / FACE_RESCAN codes bound to one employee. */
    async consumeForUser(args: {
      codeHash: string;
      purpose: CodePurpose;
      targetUserId: string;
      now: Date;
    }): Promise<{ id: string } | null> {
      const code = await db.accessCode.findUnique({ where: { codeHash: args.codeHash } });
      if (
        !code ||
        code.purpose !== args.purpose ||
        code.targetUserId !== args.targetUserId ||
        code.status !== 'ACTIVE' ||
        code.expiresAt <= args.now
      ) {
        return null;
      }
      const result = await db.accessCode.updateMany({
        where: { id: code.id, status: 'ACTIVE', expiresAt: { gt: args.now } },
        data: { status: 'USED', usedAt: args.now },
      });
      return result.count === 1 ? { id: code.id } : null;
    },

    async revoke(id: string): Promise<number> {
      const result = await db.accessCode.updateMany({
        where: { id, status: { in: ['ACTIVE', 'CLAIMED'] } },
        data: { status: 'REVOKED' },
      });
      return result.count;
    },

    /** Revokes every open code issued for one employee (used on deactivation). */
    async revokeOpenForUser(targetUserId: string): Promise<number> {
      const result = await db.accessCode.updateMany({
        where: { targetUserId, status: { in: ['ACTIVE', 'CLAIMED'] } },
        data: { status: 'REVOKED' },
      });
      return result.count;
    },

    /** Open codes plus anything created since `since`, newest first. */
    listRecent: (since: Date) =>
      db.accessCode.findMany({
        where: { OR: [{ status: { in: ['ACTIVE', 'CLAIMED'] } }, { createdAt: { gte: since } }] },
        orderBy: { createdAt: 'desc' },
      }),

    /** Marks codes whose time ran out as EXPIRED. Returns how many changed. */
    async expireStale(now: Date): Promise<number> {
      const [active, claimed] = await Promise.all([
        db.accessCode.updateMany({
          where: { status: 'ACTIVE', expiresAt: { lte: now } },
          data: { status: 'EXPIRED' },
        }),
        db.accessCode.updateMany({
          where: { status: 'CLAIMED', claimExpiresAt: { lte: now } },
          data: { status: 'EXPIRED' },
        }),
      ]);
      return active.count + claimed.count;
    },
  };
}
