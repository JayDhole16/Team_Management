import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { createAccessCodeRepository } from './access-code.repository';
import { createAuditRepository } from './audit.repository';
import { createConsentRepository } from './consent.repository';
import { createJobRoleRepository } from './job-role.repository';
import { createRefreshTokenRepository } from './refresh-token.repository';
import { createUserRepository } from './user.repository';

/** A Prisma client or the client of an open transaction. */
export type Db = PrismaClient | Prisma.TransactionClient;

export function createRepos(db: Db) {
  return {
    users: createUserRepository(db),
    jobRoles: createJobRoleRepository(db),
    accessCodes: createAccessCodeRepository(db),
    refreshTokens: createRefreshTokenRepository(db),
    consent: createConsentRepository(db),
    audit: createAuditRepository(db),
  };
}
export type Repos = ReturnType<typeof createRepos>;

/** What services get: repos for single statements, `transaction` for multi-table writes. */
export interface DataAccess {
  repos: Repos;
  transaction<T>(fn: (repos: Repos) => Promise<T>): Promise<T>;
}

export function createDataAccess(prisma: PrismaClient): DataAccess {
  return {
    repos: createRepos(prisma),
    transaction: (fn) => prisma.$transaction((tx) => fn(createRepos(tx))),
  };
}

/** Prisma unique-constraint violation (e.g. duplicate email). */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}
