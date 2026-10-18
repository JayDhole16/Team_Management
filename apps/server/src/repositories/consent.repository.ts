import type { Db } from './index';

export function createConsentRepository(db: Db) {
  return {
    create: async (data: { userId: string; consentVersion: string; acceptedAt: Date }) =>
      db.consentRecord.create({ data }),
  };
}
