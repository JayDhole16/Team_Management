import Fastify, { type FastifyServerOptions } from 'fastify';
import type { HealthRepository } from './repositories/health.repository';
import { registerHealthRoutes } from './routes/health';

export interface AppDeps {
  healthRepo: HealthRepository;
}

export function buildApp(deps: AppDeps, options: { logger?: FastifyServerOptions['logger'] } = {}) {
  const app = Fastify({ logger: options.logger ?? false });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.setErrorHandler((error: { statusCode?: number; message?: string }, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'request failed');
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
    }
    return reply
      .code(statusCode)
      .send({ error: { code: 'BAD_REQUEST', message: error.message ?? 'Bad request' } });
  });

  registerHealthRoutes(app, deps);

  return app;
}
