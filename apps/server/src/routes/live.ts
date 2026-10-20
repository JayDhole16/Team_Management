import type { FastifyInstance } from 'fastify';
import type { ServiceContext } from '../services/context';
import { listLive } from '../services/live.service';

/** Owner live board (PRD O-6). */
export function registerLiveRoutes(app: FastifyInstance, ctx: ServiceContext) {
  app.get('/api/v1/live', { config: { auth: ['OWNER'] as const } }, async () => {
    return { data: await listLive(ctx) };
  });
}
