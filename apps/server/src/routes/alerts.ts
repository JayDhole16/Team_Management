import { AckAllBodySchema, AlertListQuerySchema, IdSchema } from '@lk/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { currentUser } from '../plugins/auth';
import { ackAlert, ackAllAlerts, listAlerts, openAlertCount } from '../services/alert.service';
import type { ServiceContext } from '../services/context';

const IdParams = z.object({ id: IdSchema });

/** Owner alerts (PRD O-8). */
export function registerAlertRoutes(app: FastifyInstance, ctx: ServiceContext) {
  const owner = { config: { auth: ['OWNER'] as const } };

  app.get('/api/v1/alerts', owner, async (request) => {
    const query = AlertListQuerySchema.parse(request.query);
    return { data: await listAlerts(ctx, query) };
  });

  app.get('/api/v1/alerts/open-count', owner, async () => {
    return { data: await openAlertCount(ctx) };
  });

  app.patch('/api/v1/alerts/:id/ack', owner, async (request) => {
    const { id } = IdParams.parse(request.params);
    return { data: await ackAlert(ctx, currentUser(request).id, id) };
  });

  app.post('/api/v1/alerts/ack-all', owner, async (request) => {
    const body = AckAllBodySchema.parse(request.body);
    return { data: await ackAllAlerts(ctx, currentUser(request).id, body) };
  });
}
