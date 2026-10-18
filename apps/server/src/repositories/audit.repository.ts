import type { Prisma } from '../generated/prisma/client';
import type { Db } from './index';

export interface AuditEntry {
  actorUserId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  /** Never put passwords, codes, tokens or face data here. */
  meta?: Prisma.InputJsonObject;
  at: Date;
}

export function createAuditRepository(db: Db) {
  return {
    record: (entry: AuditEntry) =>
      db.auditLog.create({
        data: {
          actorUserId: entry.actorUserId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          meta: entry.meta ?? {},
          at: entry.at,
        },
      }),
  };
}
