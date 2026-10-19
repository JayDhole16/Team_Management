import type { Prisma, TaskStatus } from '../generated/prisma/client';
import type { Db } from './index';

/** What every task read returns: the project summary and the assignee's name. */
export const taskInclude = {
  project: { select: { id: true, title: true, summaryTechnical: true } },
  assignee: { select: { name: true } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function createTaskRepository(db: Db) {
  return {
    create: (data: Prisma.TaskUncheckedCreateInput): Promise<TaskRow> =>
      db.task.create({ data, include: taskInclude }),

    findById: (id: string): Promise<TaskRow | null> =>
      db.task.findUnique({ where: { id }, include: taskInclude }),

    /**
     * Updates only while the task still has `expected` status and assignee, so two
     * concurrent changes cannot both win. Returns null when the guard did not match.
     */
    async updateGuarded(
      id: string,
      expected: { status: TaskStatus; assigneeId: string | null },
      data: Prisma.TaskUncheckedUpdateManyInput,
    ): Promise<TaskRow | null> {
      const { count } = await db.task.updateMany({ where: { id, ...expected }, data });
      if (count === 0) return null;
      return db.task.findUnique({ where: { id }, include: taskInclude });
    },

    /** Deletes the task only while it is unsent. Returns whether it was deleted. */
    async deleteUnassigned(id: string): Promise<boolean> {
      const { count } = await db.task.deleteMany({ where: { id, assigneeId: null } });
      return count > 0;
    },

    list: (where: Prisma.TaskWhereInput, take?: number): Promise<TaskRow[]> =>
      db.task.findMany({
        where,
        include: taskInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        ...(take ? { take } : {}),
      }),

    /** Tasks of a project in the order they were created. */
    listByProject: (projectId: string): Promise<TaskRow[]> =>
      db.task.findMany({
        where: { projectId },
        include: taskInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),

    /** Just enough to count tasks per project and status. */
    statusesForProjects: (projectIds: string[]) =>
      db.task.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true, status: true, assigneeId: true },
      }),

    addEvent: (data: Prisma.TaskStatusEventUncheckedCreateInput) =>
      db.taskStatusEvent.create({ data }),

    listEvents: (taskId: string) =>
      db.taskStatusEvent.findMany({ where: { taskId }, orderBy: [{ at: 'asc' }, { id: 'asc' }] }),
  };
}
