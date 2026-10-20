import { IdleEventBodySchema } from '@lk/shared';
import type { FastifyInstance } from 'fastify';
import { currentUser } from '../plugins/auth';
import { recordIdleEvent } from '../services/alert.service';
import type { ServiceContext } from '../services/context';

/** Agent endpoints (the heartbeat lives with the sessions). Normal access token until the
 *  agent device tokens arrive in Phase 8. */
export function registerAgentRoutes(app: FastifyInstance, ctx: ServiceContext) {
  const employee = { config: { auth: ['EMPLOYEE'] as const } };

  app.post('/api/v1/agent/idle-event', employee, async (request) => {
    const body = IdleEventBodySchema.parse(request.body);
    return { data: await recordIdleEvent(ctx, currentUser(request).id, body) };
  });
}
