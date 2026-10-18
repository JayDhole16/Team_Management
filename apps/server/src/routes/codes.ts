import { IdSchema, InviteBodySchema } from '@lk/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser } from '../plugins/auth';
import {
  issueForEmployee,
  issueInvite,
  listCodes,
  revokeCode,
} from '../services/access-code.service';
import type { ServiceContext } from '../services/context';

const IdParams = z.object({ id: IdSchema });
const UserIdParams = z.object({ userId: IdSchema });

export function registerCodeRoutes(app: FastifyInstance, ctx: ServiceContext) {
  const owner = { config: { auth: ['OWNER'] as const } };

  app.post('/api/v1/codes/invite', owner, async (request, reply) => {
    const body = InviteBodySchema.parse(request.body);
    return reply.code(201).send({ data: await issueInvite(ctx, currentUser(request).id, body) });
  });

  app.post('/api/v1/codes/password-reset/:userId', owner, async (request, reply) => {
    const { userId } = UserIdParams.parse(request.params);
    const created = await issueForEmployee(ctx, currentUser(request).id, userId, 'PASSWORD_RESET');
    return reply.code(201).send({ data: created });
  });

  app.post('/api/v1/codes/face-rescan/:userId', owner, async (request, reply) => {
    const { userId } = UserIdParams.parse(request.params);
    const created = await issueForEmployee(ctx, currentUser(request).id, userId, 'FACE_RESCAN');
    return reply.code(201).send({ data: created });
  });

  app.get('/api/v1/codes', owner, async () => {
    return { data: await listCodes(ctx) };
  });

  app.delete('/api/v1/codes/:id', owner, async (request) => {
    const { id } = IdParams.parse(request.params);
    await revokeCode(ctx, currentUser(request).id, id);
    return { data: { ok: true } };
  });
}
