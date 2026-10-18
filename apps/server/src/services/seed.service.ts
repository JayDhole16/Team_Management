import { checkPassword, EmailSchema, PASSWORD_PROBLEM_MESSAGES } from '@lk/shared';
import { dateOnlyToDb, istDateString } from '../lib/clock';
import { hashPassword } from '../lib/passwords';
import type { DataAccess } from '../repositories';
import { DEFAULT_JOB_ROLES } from './job-role.service';

export interface SeedInput {
  ownerEmail: string | undefined;
  ownerName: string | undefined;
  ownerPassword: string | undefined;
}

export interface SeedResult {
  jobRoles: number;
  owner: 'created' | 'exists' | 'skipped-other-owner-exists';
}

/**
 * Idempotent: job roles are upserted by key; the owner is created only if missing and an
 * existing owner's password is never overwritten. Error messages never echo the password.
 */
export async function runSeed(data: DataAccess, input: SeedInput, now: Date): Promise<SeedResult> {
  const email = EmailSchema.safeParse(input.ownerEmail ?? '');
  if (!email.success) throw new Error('OWNER_EMAIL in .env is missing or not a valid email');
  const name = input.ownerName?.trim() || 'Owner';
  const password = input.ownerPassword ?? '';
  if (password.toLowerCase().startsWith('change-me')) {
    throw new Error('OWNER_PASSWORD in .env is still the placeholder. Set a real password.');
  }
  const problem = checkPassword(password, email.data);
  if (problem) {
    throw new Error(
      `OWNER_PASSWORD in .env is not acceptable: ${PASSWORD_PROBLEM_MESSAGES[problem]}`,
    );
  }

  for (const role of DEFAULT_JOB_ROLES) await data.repos.jobRoles.upsertByKey(role.key, role.label);

  const existing = await data.repos.users.findByEmail(email.data);
  if (existing) {
    if (existing.role !== 'OWNER') throw new Error('OWNER_EMAIL belongs to an employee account');
    return { jobRoles: DEFAULT_JOB_ROLES.length, owner: 'exists' };
  }
  if ((await data.repos.users.countByRole('OWNER')) > 0) {
    return { jobRoles: DEFAULT_JOB_ROLES.length, owner: 'skipped-other-owner-exists' };
  }

  const passwordHash = await hashPassword(password);
  await data.transaction(async (repos) => {
    const owner = await repos.users.create({
      email: email.data,
      name,
      passwordHash,
      role: 'OWNER',
      status: 'ACTIVE',
      joiningDate: dateOnlyToDb(istDateString(now)),
      createdAt: now,
    });
    await repos.audit.record({
      actorUserId: owner.id,
      action: 'owner.seeded',
      entity: 'user',
      entityId: owner.id,
      at: now,
    });
  });
  return { jobRoles: DEFAULT_JOB_ROLES.length, owner: 'created' };
}
