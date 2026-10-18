import { HeartbeatBatchBodySchema } from '@lk/shared';
import type { FastifyInstance } from 'fastify';
import { currentUser } from '../plugins/auth';
import type { ServiceContext } from '../services/context';
import {
  currentSession,
  recordHeartbeats,
  startSession,
  stopSession,
} from '../services/session.service';

export function registerSessionRoutes(app: FastifyInstance, ctx: ServiceContext) {
  // Only employees track time; the owner gets 403.
  const employee = { config: { auth: ['EMPLOYEE'] as const } };

  app.post('/api/v1/sessions/start', employee, async (request) => {
    return { data: await startSession(ctx, currentUser(request).id) };
  });

  app.post('/api/v1/sessions/stop', employee, async (request) => {
    return { data: await stopSession(ctx, currentUser(request).id) };
  });

  app.get('/api/v1/sessions/current', employee, async (request) => {
    return { data: await currentSession(ctx, currentUser(request).id) };
  });

  // Uses the normal access token until agent device tokens arrive (Phase 8).
  app.post('/api/v1/agent/heartbeat', employee, async (request) => {
    const body = HeartbeatBatchBodySchema.parse(request.body);
    return { data: await recordHeartbeats(ctx, currentUser(request).id, body) };
  });
}
