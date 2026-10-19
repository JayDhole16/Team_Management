import {
  IdSchema,
  ProjectCreateBodySchema,
  ProjectPatchBodySchema,
  TaskCreateBodySchema,
} from '@lk/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser } from '../plugins/auth';
import type { ServiceContext } from '../services/context';
import {
  addProjectTask,
  createProject,
  getProject,
  listProjects,
  updateProject,
} from '../services/project.service';

const IdParams = z.object({ id: IdSchema });

export function registerProjectRoutes(app: FastifyInstance, ctx: ServiceContext) {
  const owner = { config: { auth: ['OWNER'] as const } };

  app.get('/api/v1/projects', owner, async () => {
    return { data: await listProjects(ctx) };
  });

  app.post('/api/v1/projects', owner, async (request, reply) => {
    const body = ProjectCreateBodySchema.parse(request.body);
    return reply.code(201).send({ data: await createProject(ctx, currentUser(request).id, body) });
  });

  app.get('/api/v1/projects/:id', owner, async (request) => {
    const { id } = IdParams.parse(request.params);
    return { data: await getProject(ctx, id) };
  });

  app.patch('/api/v1/projects/:id', owner, async (request) => {
    const { id } = IdParams.parse(request.params);
    const body = ProjectPatchBodySchema.parse(request.body);
    return { data: await updateProject(ctx, id, body) };
  });

  app.post('/api/v1/projects/:id/tasks', owner, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const body = TaskCreateBodySchema.parse(request.body);
    return reply
      .code(201)
      .send({ data: await addProjectTask(ctx, currentUser(request).id, id, body) });
  });
}
