import type { CreateJobRoleBody, JobRole } from '@lk/shared';
import { AppError } from '../lib/errors';
import { isUniqueViolation } from '../repositories';
import type { ServiceContext } from './context';

/** Seeded on every `pnpm db:seed` (PRD section 1). The owner can add more. */
export const DEFAULT_JOB_ROLES: readonly { key: string; label: string }[] = [
  { key: 'editor', label: 'Editor' },
  { key: 'graphic_designer', label: 'Graphic Designer' },
  { key: 'frontend_developer', label: 'Frontend Developer' },
  { key: 'backend_developer', label: 'Backend Developer' },
  { key: 'ai_developer', label: 'AI Developer' },
  { key: 'fullstack_developer', label: 'Full-stack Developer' },
];

export function listJobRoles(ctx: ServiceContext): Promise<JobRole[]> {
  return ctx.data.repos.jobRoles.list();
}

export async function createJobRole(
  ctx: ServiceContext,
  ownerId: string,
  body: CreateJobRoleBody,
): Promise<JobRole> {
  const now = ctx.clock();
  return ctx.data
    .transaction(async (repos) => {
      const role = await repos.jobRoles.create(body);
      await repos.audit.record({
        actorUserId: ownerId,
        action: 'job_role.created',
        entity: 'job_role',
        entityId: role.id,
        meta: { key: role.key },
        at: now,
      });
      return role;
    })
    .catch((err: unknown) => {
      if (isUniqueViolation(err)) {
        throw new AppError(409, 'JOB_ROLE_EXISTS', 'A job role with this key already exists.');
      }
      throw err;
    });
}
