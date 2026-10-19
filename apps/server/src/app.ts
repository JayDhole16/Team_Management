import cookie from '@fastify/cookie';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import type { Env } from './config/env';
import { systemClock, type Clock } from './lib/clock';
import { AppError } from './lib/errors';
import { createEventBus, type EventBus } from './lib/events';
import { createOllamaClient } from './llm/ollama-client';
import type { LlmClient } from './llm/types';
import { registerAuth } from './plugins/auth';
import type { DataAccess } from './repositories';
import type { HealthRepository } from './repositories/health.repository';
import { registerAiRoutes } from './routes/ai';
import { registerAuthRoutes } from './routes/auth';
import { registerCodeRoutes } from './routes/codes';
import { registerEmployeeRoutes } from './routes/employees';
import { registerHealthRoutes } from './routes/health';
import { registerJobRoleRoutes } from './routes/job-roles';
import { registerMeRoutes } from './routes/me';
import { registerProjectRoutes } from './routes/projects';
import { registerRegisterRoutes } from './routes/register';
import { registerReportRoutes } from './routes/reports';
import { registerSessionRoutes } from './routes/sessions';
import { registerTaskRoutes } from './routes/tasks';
import { createLimiters, type Limiters, type ServiceContext } from './services/context';

declare module 'fastify' {
  interface FastifyInstance {
    /** Shared by background jobs (and tests) that call services outside a request. */
    serviceContext: ServiceContext;
  }
}

export interface AppDeps {
  healthRepo: HealthRepository;
  data: DataAccess;
  env: Env;
  clock?: Clock;
  bus?: EventBus;
  limiters?: Limiters;
  /** Defaults to the real Ollama client; tests pass a mock. */
  llm?: LlmClient;
}

/** Turns Zod issues into one readable line. Never includes the submitted values. */
function describeZodError(error: ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    )
    .join('; ');
}

export function buildApp(deps: AppDeps, options: { logger?: FastifyServerOptions['logger'] } = {}) {
  const clock = deps.clock ?? systemClock;
  const ctx: ServiceContext = {
    data: deps.data,
    env: deps.env,
    clock,
    bus: deps.bus ?? createEventBus(),
    limiters: deps.limiters ?? createLimiters(deps.env, clock),
    llm: deps.llm ?? createOllamaClient(deps.env, { clock }),
  };

  const app = Fastify({ logger: options.logger ?? false, trustProxy: deps.env.TRUST_PROXY });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ZodError) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: describeZodError(error) } });
    }
    const { statusCode = 500, message } = error as { statusCode?: number; message?: string };
    if (statusCode >= 500) {
      // Prisma errors can echo query arguments (password hashes, template bytes): log only
      // their name and code.
      const name = (error as { name?: string }).name ?? '';
      if (name.startsWith('Prisma')) {
        const code = (error as { code?: string }).code;
        request.log.error({ prismaError: name, code }, 'database request failed');
      } else {
        request.log.error({ err: error }, 'request failed');
      }
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
    }
    return reply
      .code(statusCode)
      .send({ error: { code: 'BAD_REQUEST', message: message ?? 'Bad request' } });
  });

  app.decorate('serviceContext', ctx);
  // Order matters: the auth hooks must exist before any route is added.
  registerAuth(app, ctx);
  void app.register(cookie);

  registerHealthRoutes(app, deps);
  registerAuthRoutes(app, ctx);
  registerRegisterRoutes(app, ctx);
  registerCodeRoutes(app, ctx);
  registerEmployeeRoutes(app, ctx);
  registerJobRoleRoutes(app, ctx);
  registerMeRoutes(app, ctx);
  registerSessionRoutes(app, ctx);
  registerReportRoutes(app, ctx);
  registerAiRoutes(app, ctx);
  registerProjectRoutes(app, ctx);
  registerTaskRoutes(app, ctx);

  return app;
}
