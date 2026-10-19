import { randomUUID } from 'node:crypto';
import { ApiErrorSchema, ProjectDetailSchema, ProjectSchema, TaskSchema } from '@lk/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DataAccess } from '../repositories';
import { bearer, createHarness, type Harness } from '../test/helpers';

describe('projects', () => {
  let h: Harness;
  let owner: string;

  beforeEach(async () => {
    h = await createHarness(); // the mock LLM behaves like a stopped Ollama
    owner = await h.ownerToken();
  });

  const body = (role = h.role) => ({
    title: 'Clothing store',
    briefOriginal: 'Mujhe ek online store banwana hai',
    summaryTechnical: 'Online store with cart and UPI payment.',
    tasks: [
      {
        title: 'Cart page',
        descriptionTechnical: 'Build the cart.',
        jobRoleId: role('frontend_developer').id,
        priority: 'HIGH',
        source: 'AI_BREAKDOWN',
      },
      {
        title: 'Payment API',
        descriptionTechnical: 'UPI integration.',
        jobRoleId: role('backend_developer').id,
        priority: 'MEDIUM',
        source: 'AI_BREAKDOWN',
      },
      {
        title: 'Banner',
        descriptionTechnical: 'Homepage banner.',
        jobRoleId: null,
        priority: 'LOW',
        source: 'MANUAL',
      },
    ],
  });

  const create = (payload: unknown, token = owner, app = h.app) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: bearer(token),
      payload: payload as object,
    });

  it('creates a project with unsent tasks in the order written', async () => {
    const res = await create(body());
    expect(res.statusCode).toBe(201);
    const project = ProjectDetailSchema.parse(res.json<{ data: unknown }>().data);
    expect(project).toMatchObject({
      title: 'Clothing store',
      briefOriginal: 'Mujhe ek online store banwana hai',
      counts: { UNASSIGNED: 3, PENDING: 0, IN_PROGRESS: 0, BLOCKED: 0, COMPLETED: 0 },
    });
    expect(project.tasks.map((t) => t.title)).toEqual(['Cart page', 'Payment API', 'Banner']);
    expect(project.tasks[0]).toMatchObject({
      status: 'PENDING',
      assigneeId: null,
      assignedAt: null,
      source: 'AI_BREAKDOWN',
      projectId: project.id,
      project: { id: project.id, summaryTechnical: 'Online store with cart and UPI payment.' },
    });
  });

  it('works with the AI offline: a project typed by hand, without a brief', async () => {
    const res = await create({
      title: 'Logo refresh',
      summaryTechnical: 'New logo for the brand.',
      tasks: [],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { briefOriginal: null } }>().data.briefOriginal).toBeNull();
    expect(h.llm.requests).toHaveLength(0);
  });

  it('rejects an unknown job role and creates nothing', async () => {
    const payload = body();
    payload.tasks = payload.tasks.map((t, i) => (i === 1 ? { ...t, jobRoleId: randomUUID() } : t));
    const res = await create(payload);
    expect(res.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('UNKNOWN_JOB_ROLE');
    expect(await h.db.project.count()).toBe(0);
  });

  it('is atomic: a failure on a later task leaves no project and no tasks', async () => {
    let calls = 0;
    const failing = await createHarness({
      data: (real): DataAccess => ({
        repos: real.repos,
        transaction: (fn) =>
          real.transaction((repos) =>
            fn({
              ...repos,
              tasks: {
                ...repos.tasks,
                create: async (data) => {
                  calls += 1;
                  if (calls === 2) throw new Error('simulated failure on the second task');
                  return repos.tasks.create(data);
                },
              },
            }),
          ),
      }),
    });
    const res = await create(body(failing.role), await failing.ownerToken(), failing.app);
    expect(res.statusCode).toBe(500);
    expect(await failing.db.project.count()).toBe(0);
    expect(await failing.db.task.count()).toBe(0);
  });

  it('lists projects newest first with counts; get, patch and add a task', async () => {
    const first = ProjectDetailSchema.parse((await create(body())).json<{ data: unknown }>().data);
    h.clock.advanceMinutes(5);
    await create({ title: 'Second', summaryTechnical: 'Two', tasks: [] });

    const list = await h.app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: bearer(owner),
    });
    const projects = ProjectSchema.array().parse(list.json<{ data: unknown }>().data);
    expect(projects.map((p) => p.title)).toEqual(['Second', 'Clothing store']);
    expect(projects[1]?.counts.UNASSIGNED).toBe(3);

    const patched = await h.app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${first.id}`,
      headers: bearer(owner),
      payload: { summaryTechnical: 'Store with cart, UPI and COD.' },
    });
    expect(patched.statusCode).toBe(200);
    expect(ProjectDetailSchema.parse(patched.json<{ data: unknown }>().data).summaryTechnical).toBe(
      'Store with cart, UPI and COD.',
    );

    h.clock.advanceMinutes(1);
    const added = await h.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${first.id}/tasks`,
      headers: bearer(owner),
      payload: {
        title: 'Size guide',
        descriptionTechnical: 'Static page.',
        jobRoleId: null,
        priority: 'LOW',
        source: 'MANUAL',
      },
    });
    expect(added.statusCode).toBe(201);
    expect(TaskSchema.parse(added.json<{ data: unknown }>().data)).toMatchObject({
      title: 'Size guide',
      assigneeId: null,
      projectId: first.id,
    });

    const detail = await h.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${first.id}`,
      headers: bearer(owner),
    });
    const project = ProjectDetailSchema.parse(detail.json<{ data: unknown }>().data);
    expect(project.tasks.map((t) => t.title).at(-1)).toBe('Size guide');
    expect(project.tasks.every((t) => t.project?.summaryTechnical.includes('COD'))).toBe(true);
  });

  it('404 for an unknown project; strict bodies', async () => {
    const missing = await h.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${randomUUID()}`,
      headers: bearer(owner),
    });
    expect(missing.statusCode).toBe(404);

    const extra = await create({ ...body(), createdById: randomUUID() });
    expect(extra.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(extra.json()).error.code).toBe('VALIDATION_ERROR');
  });
});
