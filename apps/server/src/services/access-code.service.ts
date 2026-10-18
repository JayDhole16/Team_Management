import {
  CODE_TTL_MINUTES,
  formatCode,
  type CodeCreated,
  type CodeListItem,
  type InviteBody,
} from '@lk/shared';
import type { CodePurpose } from '../generated/prisma/client';
import { generateAccessCode } from '../lib/access-code';
import { addMinutes } from '../lib/clock';
import { keyedHash } from '../lib/crypto';
import { AppError, badRequest, notFound } from '../lib/errors';
import { isUniqueViolation, type Repos } from '../repositories';
import type { ServiceContext } from './context';
import { toCodeListItem } from './mappers';

/** Finished codes stay in the owner's list for this long. */
const LIST_HISTORY_HOURS = 24;
const MAX_GENERATE_ATTEMPTS = 5;

export function hashCode(ctx: ServiceContext, normalizedCode: string): string {
  return keyedHash(ctx.env.CODE_HASH_SECRET, normalizedCode);
}

interface NewCode {
  purpose: CodePurpose;
  createdById: string;
  targetUserId?: string;
  presetJobRoleId?: string;
  deviceMode?: InviteBody['deviceMode'];
  note?: string;
}

/** Creates the code row plus an audit entry. The plain code is returned once and never stored. */
async function createCode(ctx: ServiceContext, input: NewCode): Promise<CodeCreated> {
  const now = ctx.clock();
  const expiresAt = addMinutes(now, CODE_TTL_MINUTES);

  for (let attempt = 1; ; attempt++) {
    const code = generateAccessCode();
    try {
      const row = await ctx.data.transaction(async (repos: Repos) => {
        const created = await repos.accessCodes.create({
          purpose: input.purpose,
          codeHash: hashCode(ctx, code),
          createdById: input.createdById,
          targetUserId: input.targetUserId ?? null,
          presetJobRoleId: input.presetJobRoleId ?? null,
          deviceMode: input.deviceMode ?? null,
          note: input.note ?? null,
          expiresAt,
          createdAt: now,
        });
        await repos.audit.record({
          actorUserId: input.createdById,
          action: 'access_code.created',
          entity: 'access_code',
          entityId: created.id,
          meta: {
            purpose: input.purpose,
            deviceMode: input.deviceMode ?? null,
            presetJobRoleId: input.presetJobRoleId ?? null,
            targetUserId: input.targetUserId ?? null,
          },
          at: now,
        });
        return created;
      });
      return {
        id: row.id,
        purpose: row.purpose,
        code: formatCode(code),
        expiresAt: expiresAt.toISOString(),
      };
    } catch (err) {
      // A collision with an old code's hash is astronomically rare; just draw again.
      if (!isUniqueViolation(err) || attempt >= MAX_GENERATE_ATTEMPTS) throw err;
    }
  }
}

export async function issueInvite(
  ctx: ServiceContext,
  ownerId: string,
  body: InviteBody,
): Promise<CodeCreated> {
  if (body.presetJobRoleId && !(await ctx.data.repos.jobRoles.findById(body.presetJobRoleId))) {
    throw badRequest('Unknown job role', 'UNKNOWN_JOB_ROLE');
  }
  return createCode(ctx, {
    purpose: 'INVITE',
    createdById: ownerId,
    deviceMode: body.deviceMode,
    ...(body.presetJobRoleId ? { presetJobRoleId: body.presetJobRoleId } : {}),
    ...(body.note ? { note: body.note } : {}),
  });
}

/** PASSWORD_RESET or FACE_RESCAN code for one existing, active employee. */
export async function issueForEmployee(
  ctx: ServiceContext,
  ownerId: string,
  userId: string,
  purpose: 'PASSWORD_RESET' | 'FACE_RESCAN',
): Promise<CodeCreated> {
  const user = await ctx.data.repos.users.findById(userId);
  if (!user || user.role !== 'EMPLOYEE') throw notFound('Employee');
  if (user.status !== 'ACTIVE') {
    throw new AppError(409, 'EMPLOYEE_DEACTIVATED', 'Reactivate the employee first.');
  }
  return createCode(ctx, { purpose, createdById: ownerId, targetUserId: userId });
}

export async function listCodes(ctx: ServiceContext): Promise<CodeListItem[]> {
  const now = ctx.clock();
  const since = new Date(now.getTime() - LIST_HISTORY_HOURS * 60 * 60_000);
  const rows = await ctx.data.repos.accessCodes.listRecent(since);
  return rows.map((row) => toCodeListItem(row, now));
}

export async function revokeCode(ctx: ServiceContext, ownerId: string, id: string): Promise<void> {
  const now = ctx.clock();
  await ctx.data.transaction(async (repos) => {
    if ((await repos.accessCodes.revoke(id)) === 0) {
      if (!(await repos.accessCodes.findById(id))) throw notFound('Code');
      throw new AppError(
        409,
        'CODE_NOT_REVOCABLE',
        'This code is already used, expired or revoked.',
      );
    }
    await repos.audit.record({
      actorUserId: ownerId,
      action: 'access_code.revoked',
      entity: 'access_code',
      entityId: id,
      at: now,
    });
  });
}

/** Run by the background job. Services never rely on it: they compare against `now`. */
export function expireStaleCodes(ctx: ServiceContext): Promise<number> {
  return ctx.data.repos.accessCodes.expireStale(ctx.clock());
}
