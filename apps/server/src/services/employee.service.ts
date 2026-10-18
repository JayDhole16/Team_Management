import type { Employee, EmployeeListQuery, EmployeePatchBody } from '@lk/shared';
import type { Prisma } from '../generated/prisma/client';
import { dateOnlyToDb, dbDateToString } from '../lib/clock';
import { badRequest, notFound } from '../lib/errors';
import type { Repos } from '../repositories';
import type { ServiceContext } from './context';
import { toEmployee } from './mappers';

async function findEmployee(repos: Repos, id: string) {
  const user = await repos.users.findById(id);
  // The owner account is never managed through these endpoints.
  if (!user || user.role !== 'EMPLOYEE') throw notFound('Employee');
  return user;
}

export async function listEmployees(
  ctx: ServiceContext,
  query: EmployeeListQuery,
): Promise<Employee[]> {
  const rows = await ctx.data.repos.users.list({ role: 'EMPLOYEE', ...query });
  return rows.map(toEmployee);
}

export async function getEmployee(ctx: ServiceContext, id: string): Promise<Employee> {
  return toEmployee(await findEmployee(ctx.data.repos, id));
}

/** Owner edits job role, device mode, idle interval and joining date. Changes are audited. */
export async function updateEmployee(
  ctx: ServiceContext,
  ownerId: string,
  id: string,
  patch: EmployeePatchBody,
): Promise<Employee> {
  const now = ctx.clock();
  if (patch.jobRoleId && !(await ctx.data.repos.jobRoles.findById(patch.jobRoleId))) {
    throw badRequest('Unknown job role', 'UNKNOWN_JOB_ROLE');
  }
  return ctx.data.transaction(async (repos) => {
    const before = await findEmployee(repos, id);
    const data: Prisma.UserUncheckedUpdateInput = {};
    const changes: Record<string, { from: string | number | null; to: string | number | null }> =
      {};

    if (patch.jobRoleId !== undefined && patch.jobRoleId !== before.jobRoleId) {
      data.jobRoleId = patch.jobRoleId;
      changes.jobRoleId = { from: before.jobRoleId, to: patch.jobRoleId };
    }
    if (patch.deviceMode !== undefined && patch.deviceMode !== before.deviceMode) {
      data.deviceMode = patch.deviceMode;
      changes.deviceMode = { from: before.deviceMode, to: patch.deviceMode };
    }
    if (patch.idleIntervalMin !== undefined && patch.idleIntervalMin !== before.idleIntervalMin) {
      data.idleIntervalMin = patch.idleIntervalMin;
      changes.idleIntervalMin = { from: before.idleIntervalMin, to: patch.idleIntervalMin };
    }
    const beforeJoining = dbDateToString(before.joiningDate);
    if (patch.joiningDate !== undefined && patch.joiningDate !== beforeJoining) {
      data.joiningDate = dateOnlyToDb(patch.joiningDate);
      changes.joiningDate = { from: beforeJoining, to: patch.joiningDate };
    }

    if (Object.keys(changes).length === 0) return toEmployee(before);
    const updated = await repos.users.update(id, data);
    await repos.audit.record({
      actorUserId: ownerId,
      action: 'employee.updated',
      entity: 'user',
      entityId: id,
      meta: { changes },
      at: now,
    });
    return toEmployee(updated);
  });
}

/**
 * Offboarding: blocks login, ends every session (refresh tokens; access tokens are
 * rejected because the auth check reads the user status), revokes open codes for this
 * employee and deletes the face template. Task and hours history is kept.
 */
export async function deactivateEmployee(
  ctx: ServiceContext,
  ownerId: string,
  id: string,
): Promise<Employee> {
  const now = ctx.clock();
  return ctx.data.transaction(async (repos) => {
    const before = await findEmployee(repos, id);
    if (before.status === 'DEACTIVATED') return toEmployee(before);
    const updated = await repos.users.update(id, {
      status: 'DEACTIVATED',
      deactivatedAt: now,
      faceTemplate: null,
      faceModelVersion: null,
      faceEnrolledAt: null,
    });
    await repos.refreshTokens.revokeAllForUser(id, now);
    await repos.accessCodes.revokeOpenForUser(id);
    await repos.audit.record({
      actorUserId: ownerId,
      action: 'employee.deactivated',
      entity: 'user',
      entityId: id,
      meta: { faceTemplateDeleted: before.faceTemplate !== null },
      at: now,
    });
    return toEmployee(updated);
  });
}

/** The employee can log in again; a FACE_RESCAN code is needed to enroll the face again. */
export async function reactivateEmployee(
  ctx: ServiceContext,
  ownerId: string,
  id: string,
): Promise<Employee> {
  const now = ctx.clock();
  return ctx.data.transaction(async (repos) => {
    const before = await findEmployee(repos, id);
    if (before.status === 'ACTIVE') return toEmployee(before);
    const updated = await repos.users.update(id, { status: 'ACTIVE', deactivatedAt: null });
    await repos.audit.record({
      actorUserId: ownerId,
      action: 'employee.reactivated',
      entity: 'user',
      entityId: id,
      at: now,
    });
    return toEmployee(updated);
  });
}
