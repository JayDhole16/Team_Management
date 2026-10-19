import {
  IdSchema,
  MarkAllReadBodySchema,
  MyUpdatesQuerySchema,
  UpdateCreateBodySchema,
  UpdateListQuerySchema,
  UpdatePreviewBodySchema,
} from '@lk/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser } from '../plugins/auth';
import type { ServiceContext } from '../services/context';
import {
  listMyUpdates,
  listUpdates,
  markAllUpdatesRead,
  markUpdateRead,
  previewUpdate,
  sendUpdate,
  unreadUpdateCount,
} from '../services/update.service';

const IdParams = z.object({ id: IdSchema });

/** Progress updates (PRD E-4, O-10). The update text is never logged. */
export function registerUpdateRoutes(app: FastifyInstance, ctx: ServiceContext) {
  const owner = { config: { auth: ['OWNER'] as const } };
  const employee = { config: { auth: ['EMPLOYEE'] as const } };

  app.post('/api/v1/updates/preview', employee, async (request) => {
    const body = UpdatePreviewBodySchema.parse(request.body);
    return { data: await previewUpdate(ctx, currentUser(request).id, body, request.log) };
  });

  app.post('/api/v1/updates', employee, async (request, reply) => {
    const body = UpdateCreateBodySchema.parse(request.body);
    return reply.code(201).send({ data: await sendUpdate(ctx, currentUser(request).id, body) });
  });

  app.get('/api/v1/updates/mine', employee, async (request) => {
    const query = MyUpdatesQuerySchema.parse(request.query);
    return { data: await listMyUpdates(ctx, currentUser(request).id, query) };
  });

  app.get('/api/v1/updates', owner, async (request) => {
    const query = UpdateListQuerySchema.parse(request.query);
    return { data: await listUpdates(ctx, query) };
  });

  app.get('/api/v1/updates/unread-count', owner, async () => {
    return { data: await unreadUpdateCount(ctx) };
  });

  app.patch('/api/v1/updates/:id/read', owner, async (request) => {
    const { id } = IdParams.parse(request.params);
    return { data: await markUpdateRead(ctx, id) };
  });

  app.post('/api/v1/updates/read-all', owner, async (request) => {
    const body = MarkAllReadBodySchema.parse(request.body);
    return { data: await markAllUpdatesRead(ctx, body) };
  });
}
