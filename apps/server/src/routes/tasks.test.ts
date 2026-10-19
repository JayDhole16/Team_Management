import { randomUUID } from 'node:crypto';
import {
  ApiErrorSchema,
  MyTaskSchema,
  ProjectDetailSchema,
  TaskSchema,
  type Task,
  type TaskStatus,
} from '@lk/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { bearer, createHarness, type Harness } from '../test/helpers';

const SECRET_TEXT = 'SECRET-TASK-TEXT-MARKER';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing test fixture');
  return value;
}

describe('tasks', () => {
  let h: Harness;
  let owner: string;
  let rahul: { userId: string; accessToken: string };
  let priya: { userId: string; accessToken: string };
  let project: { id: string; taskIds: string[] };

  beforeEach(async () => {
    h = await createHarness({ captureLogs: true }); // the mock LLM behaves like a stopped Ollama
    rahul = await h.registerEmployee();
    priya = await h.registerEmployee({
      email: 'priya@example.com',
      body: { name: 'Priya Verma', jobRoleId: h.role('graphic_designer').id },
    });
    owner = await h.ownerToken();
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: bearer(owner),
      payload: {
        title: 'Clothing store',
        summaryTechnical: 'Online store.',
        tasks: [
          {
            title: 'Cart page',
            descriptionTechnical: `Build the cart. ${SECRET_TEXT}`,
            jobRoleId: h.role('frontend_developer').id,
            priority: 'HIGH',
            source: 'AI_BREAKDOWN',
          },
          {
            title: 'Banner',
            descriptionTechnical: 'Homepage banner.',
            jobRoleId: h.role('graphic_designer').id,
            priority: 'LOW',
            source: 'MANUAL',
          },
        ],
      },
    });
    const detail = ProjectDetailSchema.parse(res.json<{ data: unknown }>().data);
    project = { id: detail.id, taskIds: detail.tasks.map((t) => t.id) };
  });

  const cartId = () => must(project.taskIds[0]);
  const bannerId = () => must(project.taskIds[1]);

  const assign = (taskId: string, assigneeId: string, token = owner) =>
    h.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskId}/assign`,
      headers: bearer(token),
      payload: { assigneeId },
    });

  const setStatus = (taskId: string, token: string, status: TaskStatus, reason?: string) =>
    h.app.inject({
      method: 'POST',
      url: `/api/v1/tasks/${taskId}/status`,
      headers: bearer(token),
      payload: reason === undefined ? { status } : { status, reason },
    });

  const mine = async (token: string) => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/v1/tasks/mine',
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    return MyTaskSchema.array().parse(res.json<{ data: unknown }>().data);
  };

  const board = async (query = '') => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/api/v1/tasks${query}`,
      headers: bearer(owner),
    });
    expect(res.statusCode).toBe(200);
    return TaskSchema.array().parse(res.json<{ data: unknown }>().data);
  };

  const events = (taskId: string) =>
    h.db.taskStatusEvent.findMany({ where: { taskId }, orderBy: { at: 'asc' } });

  it('assign sends the task with the project summary; the employee sees only their own', async () => {
    h.clock.advanceMinutes(1);
    const res = await assign(cartId(), rahul.userId);
    expect(res.statusCode).toBe(200);
    expect(TaskSchema.parse(res.json<{ data: unknown }>().data)).toMatchObject({
      assigneeId: rahul.userId,
      assigneeName: 'Rahul Sharma',
      status: 'PENDING',
      assignedAt: h.clock.now().toISOString(),
    });
    expect(h.events.taskAssigned).toEqual([
      expect.objectContaining({
        taskId: cartId(),
        assigneeId: rahul.userId,
        previousAssigneeId: null,
      }),
    ]);
    expect(await events(cartId())).toEqual([
      expect.objectContaining({
        fromStatus: null,
        toStatus: 'PENDING',
        byUserId: expect.any(String),
      }),
    ]);

    const rahulTasks = await mine(rahul.accessToken);
    expect(rahulTasks).toHaveLength(1);
    expect(rahulTasks[0]).toMatchObject({
      title: 'Cart page',
      project: { title: 'Clothing store', summaryTechnical: 'Online store.' },
    });
    // The employee view carries exactly these fields (no owner wording, no assignee data).
    expect(Object.keys(must(rahulTasks[0])).sort()).toEqual(
      [
        'assignedAt',
        'blockedReason',
        'completedAt',
        'descriptionTechnical',
        'id',
        'jobRoleId',
        'priority',
        'project',
        'source',
        'status',
        'title',
        'updatedAt',
      ].sort(),
    );
    expect(Object.keys(must(rahulTasks[0]?.project ?? undefined)).sort()).toEqual([
      'id',
      'summaryTechnical',
      'title',
    ]);
    expect(await mine(priya.accessToken)).toEqual([]);
  });

  it('only active employees can be assigned', async () => {
    for (const bad of [
      randomUUID(),
      (await h.db.user.findFirstOrThrow({ where: { role: 'OWNER' } })).id,
    ]) {
      const res = await assign(cartId(), bad);
      expect(res.statusCode).toBe(400);
      expect(ApiErrorSchema.parse(res.json()).error.code).toBe('INVALID_ASSIGNEE');
    }
    await h.app.inject({
      method: 'POST',
      url: `/api/v1/employees/${priya.userId}/deactivate`,
      headers: bearer(owner),
    });
    const res = await assign(cartId(), priya.userId);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('INVALID_ASSIGNEE');
    expect(h.events.taskAssigned).toHaveLength(0);
  });

  it('the board shows only sent tasks, with filters', async () => {
    await assign(cartId(), rahul.userId);
    await assign(bannerId(), priya.userId);
    await setStatus(bannerId(), priya.accessToken, 'IN_PROGRESS');
    await h.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/tasks`,
      headers: bearer(owner),
      payload: {
        title: 'Unsent one',
        descriptionTechnical: 'x',
        jobRoleId: null,
        priority: 'LOW',
        source: 'MANUAL',
      },
    });

    expect((await board()).map((t) => t.title).sort()).toEqual(['Banner', 'Cart page']);
    expect((await board(`?assigneeId=${priya.userId}`)).map((t) => t.title)).toEqual(['Banner']);
    expect((await board('?status=IN_PROGRESS')).map((t) => t.title)).toEqual(['Banner']);
    expect(
      (await board(`?jobRoleId=${h.role('frontend_developer').id}`)).map((t) => t.title),
    ).toEqual(['Cart page']);
    expect(await board(`?projectId=${randomUUID()}`)).toEqual([]);
    const bad = await h.app.inject({
      method: 'GET',
      url: '/api/v1/tasks?status=DONE',
      headers: bearer(owner),
    });
    expect(bad.statusCode).toBe(400);
  });

  it('the employee walks the whole status flow; every change is logged', async () => {
    await assign(cartId(), rahul.userId);
    const steps: [TaskStatus, string | undefined][] = [
      ['IN_PROGRESS', undefined],
      ['BLOCKED', 'Waiting for the payment keys'],
      ['IN_PROGRESS', undefined],
      ['COMPLETED', undefined],
      ['IN_PROGRESS', undefined], // Reopen
      ['COMPLETED', undefined],
    ];
    for (const [status, reason] of steps) {
      h.clock.advanceMinutes(1);
      const res = await setStatus(cartId(), rahul.accessToken, status, reason);
      expect(res.statusCode, status).toBe(200);
      const task = MyTaskSchema.parse(res.json<{ data: unknown }>().data);
      expect(task.status).toBe(status);
      expect(task.blockedReason).toBe(status === 'BLOCKED' ? reason : null);
      expect(task.completedAt).toBe(status === 'COMPLETED' ? h.clock.now().toISOString() : null);
    }
    const log = await events(cartId());
    expect(log.map((e) => `${e.fromStatus ?? '-'}>${e.toStatus}`)).toEqual([
      '->PENDING',
      'PENDING>IN_PROGRESS',
      'IN_PROGRESS>BLOCKED',
      'BLOCKED>IN_PROGRESS',
      'IN_PROGRESS>COMPLETED',
      'COMPLETED>IN_PROGRESS',
      'IN_PROGRESS>COMPLETED',
    ]);
    expect(log[2]?.note).toBe('Waiting for the payment keys');
    expect(log.slice(1).every((e) => e.byUserId === rahul.userId)).toBe(true);
    expect(h.events.taskStatus).toHaveLength(6);

    // The owner's board shows it as completed.
    expect((await board('?status=COMPLETED')).map((t) => t.id)).toEqual([cartId()]);
  });

  it('blocked needs a reason; impossible changes are refused; a repeat is a no-op', async () => {
    await assign(cartId(), rahul.userId);
    const noReason = await setStatus(cartId(), rahul.accessToken, 'BLOCKED');
    expect(noReason.statusCode).toBe(400);

    const toPending = await setStatus(cartId(), rahul.accessToken, 'PENDING');
    expect(toPending.statusCode).toBe(200); // already pending: nothing changes
    await setStatus(cartId(), rahul.accessToken, 'IN_PROGRESS');
    const back = await setStatus(cartId(), rahul.accessToken, 'PENDING');
    expect(back.statusCode).toBe(409);
    expect(ApiErrorSchema.parse(back.json()).error.code).toBe('INVALID_STATUS_CHANGE');

    const again = await setStatus(cartId(), rahul.accessToken, 'IN_PROGRESS');
    expect(again.statusCode).toBe(200);
    expect(await events(cartId())).toHaveLength(2); // assign + one start
  });

  it("another employee cannot touch or even see someone else's task", async () => {
    await assign(cartId(), rahul.userId);
    const res = await setStatus(cartId(), priya.accessToken, 'COMPLETED');
    expect(res.statusCode).toBe(404);
    // An unsent task is not anyone's either.
    expect((await setStatus(bannerId(), priya.accessToken, 'IN_PROGRESS')).statusCode).toBe(404);
    const row = await h.db.task.findUniqueOrThrow({ where: { id: cartId() } });
    expect(row.status).toBe('PENDING');
  });

  it('reassign moves the task, resets it to Pending and logs it; completed tasks stay put', async () => {
    await assign(cartId(), rahul.userId);
    await setStatus(cartId(), rahul.accessToken, 'BLOCKED', 'Need designs');
    const res = await assign(cartId(), priya.userId);
    expect(res.statusCode).toBe(200);
    expect(TaskSchema.parse(res.json<{ data: unknown }>().data)).toMatchObject({
      assigneeId: priya.userId,
      status: 'PENDING',
      blockedReason: null,
    });
    expect((await events(cartId())).at(-1)).toMatchObject({
      fromStatus: 'BLOCKED',
      toStatus: 'PENDING',
      note: 'Reassigned',
    });
    expect(h.events.taskAssigned.at(-1)).toMatchObject({
      assigneeId: priya.userId,
      previousAssigneeId: rahul.userId,
    });
    expect(await mine(rahul.accessToken)).toEqual([]);
    expect((await mine(priya.accessToken)).map((t) => t.id)).toEqual([cartId()]);
    // The previous assignee can no longer change it.
    expect((await setStatus(cartId(), rahul.accessToken, 'IN_PROGRESS')).statusCode).toBe(404);

    // Same assignee again: nothing changes.
    await assign(cartId(), priya.userId);
    expect(h.events.taskAssigned).toHaveLength(2);

    await setStatus(cartId(), priya.accessToken, 'COMPLETED');
    const moved = await assign(cartId(), rahul.userId);
    expect(moved.statusCode).toBe(409);
    expect(ApiErrorSchema.parse(moved.json()).error.code).toBe('TASK_COMPLETED');
  });

  it('owner edits a task until it is completed; deletes only unsent tasks', async () => {
    const edit = (payload: object) =>
      h.app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${cartId()}`,
        headers: bearer(owner),
        payload,
      });
    const del = (id: string) =>
      h.app.inject({ method: 'DELETE', url: `/api/v1/tasks/${id}`, headers: bearer(owner) });

    const edited = await edit({ title: 'Cart and checkout', priority: 'MEDIUM' });
    expect(TaskSchema.parse(edited.json<{ data: unknown }>().data)).toMatchObject({
      title: 'Cart and checkout',
      priority: 'MEDIUM',
    });
    expect((await edit({ jobRoleId: randomUUID() })).statusCode).toBe(400);

    await assign(cartId(), rahul.userId);
    expect((await edit({ descriptionTechnical: 'Updated after sending.' })).statusCode).toBe(200);
    expect((await mine(rahul.accessToken))[0]?.descriptionTechnical).toBe('Updated after sending.');
    // Edits to sent work are audited (field names only, never the text).
    const audit = await h.db.auditLog.findMany({ where: { action: 'task.edited_after_sending' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.meta).toEqual({ fields: ['descriptionTechnical'], assigneeId: rahul.userId });
    expect(JSON.stringify(audit)).not.toContain('Updated after sending.');

    const assignedDelete = await del(cartId());
    expect(assignedDelete.statusCode).toBe(409);
    expect(ApiErrorSchema.parse(assignedDelete.json()).error.code).toBe('TASK_ASSIGNED');

    await setStatus(cartId(), rahul.accessToken, 'COMPLETED');
    const late = await edit({ title: 'Too late' });
    expect(late.statusCode).toBe(409);
    expect(ApiErrorSchema.parse(late.json()).error.code).toBe('TASK_COMPLETED');

    expect((await del(bannerId())).statusCode).toBe(200);
    expect(await h.db.task.count({ where: { id: bannerId() } })).toBe(0);
    expect((await del(randomUUID())).statusCode).toBe(404);
  });

  it('direct task: created and sent in one step, works with the AI offline', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/tasks/direct',
      headers: bearer(owner),
      payload: {
        assigneeId: priya.userId,
        textOriginal: 'Instagram ke liye Diwali post banao',
        title: 'Diwali Instagram post',
        descriptionTechnical: '1080x1080 post with the offer text.',
        priority: 'HIGH',
      },
    });
    expect(res.statusCode).toBe(201);
    const task: Task = TaskSchema.parse(res.json<{ data: unknown }>().data);
    expect(task).toMatchObject({
      source: 'DIRECT',
      projectId: null,
      project: null,
      assigneeId: priya.userId,
      jobRoleId: h.role('graphic_designer').id,
      descriptionOriginal: 'Instagram ke liye Diwali post banao',
      status: 'PENDING',
    });
    expect(h.llm.requests).toHaveLength(0);
    expect(h.events.taskAssigned).toEqual([
      expect.objectContaining({ taskId: task.id, assigneeId: priya.userId }),
    ]);
    expect((await events(task.id)).map((e) => e.toStatus)).toEqual(['PENDING']);
    const priyaTasks = await mine(priya.accessToken);
    expect(priyaTasks.map((t) => t.title)).toEqual(['Diwali Instagram post']);

    const toOwner = await h.app.inject({
      method: 'POST',
      url: '/api/v1/tasks/direct',
      headers: bearer(owner),
      payload: {
        assigneeId: randomUUID(),
        textOriginal: 'abc def',
        title: 'Nope',
        descriptionTechnical: 'x',
        priority: 'LOW',
      },
    });
    expect(toOwner.statusCode).toBe(400);
    expect(await h.db.task.count({ where: { source: 'DIRECT' } })).toBe(1);
  });

  it('never logs task text', async () => {
    await assign(cartId(), rahul.userId);
    await setStatus(cartId(), rahul.accessToken, 'BLOCKED', `Blocked ${SECRET_TEXT}`);
    await mine(rahul.accessToken);
    await board();
    expect(h.logs.join('\n')).not.toContain(SECRET_TEXT);
  });
});
