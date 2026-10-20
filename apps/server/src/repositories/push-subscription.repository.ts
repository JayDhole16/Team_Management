import type { Db } from './index';

export function createPushSubscriptionRepository(db: Db) {
  return {
    /** Same endpoint again (e.g. a re-subscribe) replaces the keys and the owner. */
    upsert: (data: { userId: string; endpoint: string; p256dh: string; auth: string }) =>
      db.pushSubscription.upsert({
        where: { endpoint: data.endpoint },
        create: data,
        update: { userId: data.userId, p256dh: data.p256dh, auth: data.auth },
      }),

    findByEndpoint: (endpoint: string) => db.pushSubscription.findUnique({ where: { endpoint } }),

    countForUser: (userId: string) => db.pushSubscription.count({ where: { userId } }),

    /** Every subscription of an active owner. */
    listForOwners: () =>
      db.pushSubscription.findMany({
        where: { user: { role: 'OWNER', status: 'ACTIVE' } },
      }),

    async deleteForUser(userId: string, endpoint: string): Promise<number> {
      const { count } = await db.pushSubscription.deleteMany({ where: { userId, endpoint } });
      return count;
    },

    async deleteById(id: string): Promise<void> {
      await db.pushSubscription.deleteMany({ where: { id } });
    },

    async touch(id: string, at: Date): Promise<void> {
      await db.pushSubscription.updateMany({ where: { id }, data: { lastUsedAt: at } });
    },
  };
}
