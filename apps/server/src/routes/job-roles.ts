import { CreateJobRoleBodySchema } from '@lk/shared';
import type { FastifyInstance } from 'fastify';
import { currentUser } from '../plugins/auth';
import type { ServiceContext } from '../services/context';
import { createJobRole, listJobRoles } from '../services/job-role.service';

export function registerJobRoleRoutes(app: FastifyInstance, ctx: ServiceContext) {
  app.get('/api/v1/job-roles', { config: { auth: ['OWNER', 'EMPLOYEE'] } }, async () => {
    return { data: await listJobRoles(ctx) };
  });

  app.post('/api/v1/job-roles', { config: { auth: ['OWNER'] } }, async (request, reply) => {
    const body = CreateJobRoleBodySchema.parse(request.body);
    return reply.code(201).send({ data: await createJobRole(ctx, currentUser(request).id, body) });
  });
}
