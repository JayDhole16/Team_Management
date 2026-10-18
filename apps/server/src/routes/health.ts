import type { FastifyInstance } from 'fastify';
import type { HealthRepository } from '../repositories/health.repository';
import { getHealth } from '../services/health.service';

export function registerHealthRoutes(app: FastifyInstance, deps: { healthRepo: HealthRepository }) {
  // Public: used by the web health page and later by the uptime monitor.
  app.get('/api/v1/health', { config: { auth: 'public' } }, async (_request, reply) => {
    const data = await getHealth(deps.healthRepo);
    return reply.code(data.db === 'ok' ? 200 : 503).send({ data });
  });
}
