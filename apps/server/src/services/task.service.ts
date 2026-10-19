import {
  canEmployeeSetStatus,
  type AssignBody,
  type DirectTaskBody,
  type MyTask,
  type Task,
  type TaskListQuery,
  type TaskPatchBody,
  type TaskStatusBody,
} from '@lk/shared';
import type { Prisma } from '../generated/prisma/client';
import { badRequest, conflict, notFound } from '../lib/errors';
import type { Repos } from '../repositories';
import type { ServiceContext } from './context';
import { toMyTask, toTask } from './mappers';
import { assertJobRolesExist } from './project.service';

/** The board shows every open task, plus at most this many completed ones (newest first). */
export const COMPLETED_TASK_LIMIT = 500;

const changedMeanwhile = () =>
  conflict('This task was changed in the meantime. Reload and try again.', 'TASK_CHANGED');

async function findTask(repos: Repos, id: string) {
  const task = await repos.tasks.findById(id);
  if (!task) throw notFound('Task');
  return task;
}

/** Tasks go only to active employees (never the owner, never a deactivated account). */
async function findAssignableEmployee(repos: Repos, id: string) {
  const user = await repos.users.findById(id);
  if (!user || user.role !== 'EMPLOYEE' || user.status !== 'ACTIVE') {
    throw badRequest('Choose an active employee.', 'INVALID_ASSIGNEE');
  }
  return user;
}

/** Owner board: sent tasks only (unsent ones live on their project page). */
export async function listTasks(ctx: ServiceContext, query: TaskListQuery): Promise<Task[]> {
  const where: Prisma.TaskWhereInput = {
    assigneeId: query.assigneeId ?? { not: null },
    ...(query.jobRoleId ? { jobRoleId: query.jobRoleId } : {}),
    ...(query.projectId ? { projectId: query.projectId } : {}),
  };
  const { repos } = ctx.data;
  const open =
    query.status === 'COMPLETED'
      ? []
      : await repos.tasks.list({
          ...where,
          status: query.status ?? { not: 'COMPLETED' },
        });
  const completed =
    query.status && query.status !== 'COMPLETED'
      ? []
      : await repos.tasks.list({ ...where, status: 'COMPLETED' }, COMPLETED_TASK_LIMIT);
  return [...open, ...completed].map(toTask);
}

export async function listMyTasks(ctx: ServiceContext, userId: string): Promise<MyTask[]> {
  const rows = await ctx.data.repos.tasks.list({ assigneeId: userId });
  return rows.map(toMyTask);
}

/** O-3: the owner sends one task (already translated or typed by hand) to one employee. */
export async function createDirectTask(
  ctx: ServiceContext,
  ownerId: string,
  body: DirectTaskBody,
): Promise<Task> {
  const now = ctx.clock();
  const task = await ctx.data.transaction(async (repos) => {
    // Inside the transaction, so a deactivation that already committed is seen.
    const employee = await findAssignableEmployee(repos, body.assigneeId);
    const created = await repos.tasks.create({
      title: body.title,
      descriptionTechnical: body.descriptionTechnical,
      descriptionOriginal: body.textOriginal,
      jobRoleId: employee.jobRoleId,
      priority: body.priority,
      source: 'DIRECT',
      assigneeId: body.assigneeId,
      assignedAt: now,
      createdById: ownerId,
      createdAt: now,
    });
    await repos.tasks.addEvent({
      taskId: created.id,
      fromStatus: null,
      toStatus: 'PENDING',
      byUserId: ownerId,
      at: now,
    });
    return created;
  });
  ctx.bus.emit('task:assigned', {
    taskId: task.id,
    assigneeId: body.assigneeId,
    previousAssigneeId: null,
    at: now.toISOString(),
  });
  return toTask(task);
}

/** The owner edits a task that is not completed yet (decided 2026-10-20). */
export async function updateTask(
  ctx: ServiceContext,
  ownerId: string,
  id: string,
  patch: TaskPatchBody,
): Promise<Task> {
  const task = await findTask(ctx.data.repos, id);
  if (task.status === 'COMPLETED') {
    throw conflict('A completed task cannot be changed.', 'TASK_COMPLETED');
  }
  await assertJobRolesExist(ctx.data.repos, [patch.jobRoleId]);
  const updated = await ctx.data.transaction(async (repos) => {
    const row = await repos.tasks.updateGuarded(
      id,
      { status: task.status, assigneeId: task.assigneeId },
      patch,
    );
    if (!row) throw changedMeanwhile();
    // A change to work an employee already has is kept on record (which fields, not the text).
    if (task.assigneeId !== null) {
      await repos.audit.record({
        actorUserId: ownerId,
        action: 'task.edited_after_sending',
        entity: 'task',
        entityId: id,
        meta: { fields: Object.keys(patch), assigneeId: task.assigneeId },
        at: ctx.clock(),
      });
    }
    return row;
  });
  return toTask(updated);
}

/** Only unsent tasks can be deleted; a sent task is part of an employee's history. */
export async function deleteTask(ctx: ServiceContext, id: string): Promise<void> {
  const task = await findTask(ctx.data.repos, id);
  if (task.assigneeId !== null || !(await ctx.data.repos.tasks.deleteUnassigned(id))) {
    throw conflict(
      'This task was already sent to an employee, so it cannot be deleted.',
      'TASK_ASSIGNED',
    );
  }
}

/**
 * O-2: send a task to an employee, or move it to another one (decided 2026-10-20). Either
 * way it starts again as Pending, and the change is logged.
 */
export async function assignTask(
  ctx: ServiceContext,
  ownerId: string,
  id: string,
  body: AssignBody,
): Promise<Task> {
  const now = ctx.clock();
  const task = await findTask(ctx.data.repos, id);
  if (task.status === 'COMPLETED') {
    throw conflict('A completed task cannot be sent again.', 'TASK_COMPLETED');
  }
  if (task.assigneeId === body.assigneeId) return toTask(task); // a repeated click

  const updated = await ctx.data.transaction(async (repos) => {
    await findAssignableEmployee(repos, body.assigneeId);
    const row = await repos.tasks.updateGuarded(
      id,
      { status: task.status, assigneeId: task.assigneeId },
      {
        assigneeId: body.assigneeId,
        status: 'PENDING',
        blockedReason: null,
        assignedAt: now,
      },
    );
    if (!row) throw changedMeanwhile();
    await repos.tasks.addEvent({
      taskId: id,
      fromStatus: task.assigneeId === null ? null : task.status,
      toStatus: 'PENDING',
      byUserId: ownerId,
      note: task.assigneeId === null ? null : 'Reassigned',
      at: now,
    });
    return row;
  });
  ctx.bus.emit('task:assigned', {
    taskId: id,
    assigneeId: body.assigneeId,
    previousAssigneeId: task.assigneeId,
    at: now.toISOString(),
  });
  return toTask(updated);
}

/** E-3: only the assigned employee changes the status (decided 2026-10-20). */
export async function setTaskStatus(
  ctx: ServiceContext,
  userId: string,
  id: string,
  body: TaskStatusBody,
): Promise<MyTask> {
  const now = ctx.clock();
  const task = await ctx.data.repos.tasks.findById(id);
  // Someone else's task looks exactly like a missing one.
  if (!task || task.assigneeId !== userId) throw notFound('Task');
  if (task.status === body.status) return toMyTask(task); // a repeated click
  if (!canEmployeeSetStatus(task.status, body.status)) {
    throw conflict('This status change is not possible.', 'INVALID_STATUS_CHANGE');
  }
  const reason = body.status === 'BLOCKED' ? (body.reason ?? null) : null;

  const updated = await ctx.data.transaction(async (repos) => {
    const row = await repos.tasks.updateGuarded(
      id,
      { status: task.status, assigneeId: userId },
      {
        status: body.status,
        blockedReason: reason,
        completedAt: body.status === 'COMPLETED' ? now : null,
      },
    );
    if (!row) throw changedMeanwhile();
    await repos.tasks.addEvent({
      taskId: id,
      fromStatus: task.status,
      toStatus: body.status,
      byUserId: userId,
      note: reason,
      at: now,
    });
    return row;
  });
  ctx.bus.emit('task:status-changed', {
    taskId: id,
    assigneeId: userId,
    from: task.status,
    to: body.status,
    at: now.toISOString(),
  });
  return toMyTask(updated);
}
