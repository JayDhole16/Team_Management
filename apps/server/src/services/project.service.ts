import type {
  Project,
  ProjectCreateBody,
  ProjectDetail,
  ProjectPatchBody,
  Task,
  TaskCreateBody,
  TaskStatusCounts,
} from '@lk/shared';
import type { TaskStatus } from '../generated/prisma/client';
import { badRequest, notFound } from '../lib/errors';
import type { Repos } from '../repositories';
import type { ServiceContext } from './context';
import { emptyTaskCounts, toProject, toTask } from './mappers';

/** Every job role id that is set must exist. */
export async function assertJobRolesExist(
  repos: Repos,
  ids: readonly (string | null | undefined)[],
): Promise<void> {
  for (const id of new Set(ids)) {
    if (id && !(await repos.jobRoles.findById(id))) {
      throw badRequest('Unknown job role', 'UNKNOWN_JOB_ROLE');
    }
  }
}

function countStatuses(
  rows: readonly { status: TaskStatus; assigneeId: string | null }[],
): TaskStatusCounts {
  const counts = emptyTaskCounts();
  for (const row of rows) {
    // An unsent task is always PENDING; count it separately so the owner sees what is left.
    counts[row.assigneeId === null ? 'UNASSIGNED' : row.status] += 1;
  }
  return counts;
}

async function findProject(repos: Repos, id: string) {
  const project = await repos.projects.findById(id);
  if (!project) throw notFound('Project');
  return project;
}

async function projectDetail(repos: Repos, id: string): Promise<ProjectDetail> {
  const project = await findProject(repos, id);
  const tasks = await repos.tasks.listByProject(id);
  return { ...toProject(project, countStatuses(tasks)), tasks: tasks.map(toTask) };
}

/**
 * The owner saves a reviewed project (from the AI breakdown, or typed by hand when the AI is
 * offline) with its unsent tasks, in one transaction.
 */
export async function createProject(
  ctx: ServiceContext,
  ownerId: string,
  body: ProjectCreateBody,
): Promise<ProjectDetail> {
  const now = ctx.clock();
  await assertJobRolesExist(
    ctx.data.repos,
    body.tasks.map((t) => t.jobRoleId),
  );
  return ctx.data.transaction(async (repos) => {
    const project = await repos.projects.create({
      title: body.title,
      briefOriginal: body.briefOriginal || null,
      summaryTechnical: body.summaryTechnical,
      createdById: ownerId,
      createdAt: now,
    });
    for (const [index, task] of body.tasks.entries()) {
      await repos.tasks.create({
        ...task,
        projectId: project.id,
        createdById: ownerId,
        // Explicit and 1 ms apart: the database's now() is the same for the whole
        // transaction, and the project page lists tasks in the order the owner wrote them.
        createdAt: new Date(now.getTime() + index),
      });
    }
    return projectDetail(repos, project.id);
  });
}

export async function listProjects(ctx: ServiceContext): Promise<Project[]> {
  const projects = await ctx.data.repos.projects.list();
  const rows = await ctx.data.repos.tasks.statusesForProjects(projects.map((p) => p.id));
  return projects.map((project) =>
    toProject(project, countStatuses(rows.filter((r) => r.projectId === project.id))),
  );
}

export function getProject(ctx: ServiceContext, id: string): Promise<ProjectDetail> {
  return projectDetail(ctx.data.repos, id);
}

export async function updateProject(
  ctx: ServiceContext,
  id: string,
  patch: ProjectPatchBody,
): Promise<ProjectDetail> {
  await findProject(ctx.data.repos, id);
  await ctx.data.repos.projects.update(id, patch);
  return projectDetail(ctx.data.repos, id);
}

/** The owner adds a task by hand to a saved project. It starts unsent. */
export async function addProjectTask(
  ctx: ServiceContext,
  ownerId: string,
  projectId: string,
  body: TaskCreateBody,
): Promise<Task> {
  await findProject(ctx.data.repos, projectId);
  await assertJobRolesExist(ctx.data.repos, [body.jobRoleId]);
  const task = await ctx.data.repos.tasks.create({
    ...body,
    projectId,
    createdById: ownerId,
    createdAt: ctx.clock(),
  });
  return toTask(task);
}
