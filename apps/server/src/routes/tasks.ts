import {
  AssignBodySchema,
  DirectTaskBodySchema,
  IdSchema,
  TaskListQuerySchema,
  TaskPatchBodySchema,
  TaskStatusBodySchema,
} from '@lk/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser } from '../plugins/auth';
import type { ServiceContext } from '../services/context';
import {
  assignTask,
  createDirectTask,
  deleteTask,
  listMyTasks,
  listTasks,
  setTaskStatus,
  updateTask,
} from '../services/task.service';

const IdParams = z.object({ id: IdSchema });

export function registerTaskRoutes(app: FastifyInstance, ctx: ServiceContext) {
  const owner = { config: { auth: ['OWNER'] as const } };
  const employee = { config: { auth: ['EMPLOYEE'] as const } };

  // Owner board (O-4); `assigneeId` gives one employee's tasks.
  app.get('/api/v1/tasks', owner, async (request) => {
    const query = TaskListQuerySchema.parse(request.query);
    return { data: await listTasks(ctx, query) };
  });

  app.get('/api/v1/tasks/mine', employee, async (request) => {
    return { data: await listMyTasks(ctx, currentUser(request).id) };
  });

  app.post('/api/v1/tasks/direct', owner, async (request, reply) => {
    const body = DirectTaskBodySchema.parse(request.body);
    return reply
      .code(201)
      .send({ data: await createDirectTask(ctx, currentUser(request).id, body) });
  });

  app.patch('/api/v1/tasks/:id', owner, async (request) => {
    const { id } = IdParams.parse(request.params);
    const body = TaskPatchBodySchema.parse(request.body);
    return { data: await updateTask(ctx, currentUser(request).id, id, body) };
  });

  app.delete('/api/v1/tasks/:id', owner, async (request) => {
    const { id } = IdParams.parse(request.params);
    await deleteTask(ctx, id);
    return { data: { ok: true } };
  });

  app.post('/api/v1/tasks/:id/assign', owner, async (request) => {
    const { id } = IdParams.parse(request.params);
    const body = AssignBodySchema.parse(request.body);
    return { data: await assignTask(ctx, currentUser(request).id, id, body) };
  });

  app.post('/api/v1/tasks/:id/status', employee, async (request) => {
    const { id } = IdParams.parse(request.params);
    const body = TaskStatusBodySchema.parse(request.body);
    return { data: await setTaskStatus(ctx, currentUser(request).id, id, body) };
  });
}
