import { PushSubscribeBodySchema, PushUnsubscribeBodySchema } from '@lk/shared';
import type { FastifyInstance } from 'fastify';
import { currentUser } from '../plugins/auth';
import type { ServiceContext } from '../services/context';
import { pushConfig, subscribePush, unsubscribePush } from '../services/push.service';

/** Phone push notifications for the owner (PRD O-14). Endpoints and keys are never logged. */
export function registerPushRoutes(app: FastifyInstance, ctx: ServiceContext) {
  const owner = { config: { auth: ['OWNER'] as const } };

  app.get('/api/v1/push/config', owner, async () => {
    return { data: pushConfig(ctx) };
  });

  app.post('/api/v1/push/subscribe', owner, async (request) => {
    const body = PushSubscribeBodySchema.parse(request.body);
    return { data: await subscribePush(ctx, currentUser(request).id, body) };
  });

  app.delete('/api/v1/push/subscribe', owner, async (request) => {
    const body = PushUnsubscribeBodySchema.parse(request.body);
    return { data: await unsubscribePush(ctx, currentUser(request).id, body) };
  });
}
