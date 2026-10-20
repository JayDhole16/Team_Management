import cookie from '@fastify/cookie';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import type { Env } from './config/env';
import { createBackgroundQueue } from './lib/background';
import { systemClock, type Clock } from './lib/clock';
import { AppError } from './lib/errors';
import { createEventBus, type EventBus } from './lib/events';
import { createWebPushSender, type PushSender } from './lib/push-sender';
import { createOllamaClient } from './llm/ollama-client';
import type { LlmClient } from './llm/types';
import { registerAuth } from './plugins/auth';
import { attachRealtime } from './realtime/socket';
import type { DataAccess } from './repositories';
import type { HealthRepository } from './repositories/health.repository';
import { registerAgentRoutes } from './routes/agent';
import { registerAiRoutes } from './routes/ai';
import { registerAlertRoutes } from './routes/alerts';
import { registerAuthRoutes } from './routes/auth';
import { registerCodeRoutes } from './routes/codes';
import { registerEmployeeRoutes } from './routes/employees';
import { registerHealthRoutes } from './routes/health';
import { registerJobRoleRoutes } from './routes/job-roles';
import { registerLiveRoutes } from './routes/live';
import { registerMeRoutes } from './routes/me';
import { registerProjectRoutes } from './routes/projects';
import { registerPushRoutes } from './routes/push';
import { registerRegisterRoutes } from './routes/register';
import { registerReportRoutes } from './routes/reports';
import { registerSessionRoutes } from './routes/sessions';
import { registerTaskRoutes } from './routes/tasks';
import { registerUpdateRoutes } from './routes/updates';
import { recordSecurityAlert } from './services/alert.service';
import { createLimiters, type Limiters, type ServiceContext } from './services/context';
import { createLiveTracker, type LiveTracker } from './services/live.service';
import { pushAlert } from './services/push.service';

declare module 'fastify' {
  interface FastifyInstance {
    /** Shared by background jobs (and tests) that call services outside a request. */
    serviceContext: ServiceContext;
    /** Live status of the employees (refreshed by events and the live-status job). */
    liveTracker: LiveTracker;
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
  /** Defaults to Web Push when VAPID keys are set (else off); tests pass a fake or null. */
  push?: PushSender | null;
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
  const app = Fastify({ logger: options.logger ?? false, trustProxy: deps.env.TRUST_PROXY });
  const ctx: ServiceContext = {
    data: deps.data,
    env: deps.env,
    clock,
    bus: deps.bus ?? createEventBus(),
    limiters: deps.limiters ?? createLimiters(deps.env, clock),
    llm: deps.llm ?? createOllamaClient(deps.env, { clock }),
    push: deps.push === undefined ? createWebPushSender(deps.env) : deps.push,
    background: createBackgroundQueue((task, err) => {
      // Prisma errors can echo query arguments: name and code only (as in the error handler).
      const { name, code } = err as { name?: string; code?: string };
      app.log.warn({ task, errName: name, code }, 'background task failed');
    }),
  };

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

  // Event listeners: alerts are stored and pushed, live status follows sessions/heartbeats.
  const liveTracker = createLiveTracker(ctx);
  app.decorate('liveTracker', liveTracker);
  // Own lane: one at a time (the repeat check and the insert must not interleave), and never
  // behind the live-status refreshes.
  ctx.bus.on('security:alert', (event) =>
    ctx.background.run('store security alert', () => recordSecurityAlert(ctx, event), 'security'),
  );
  ctx.bus.on('alert:created', ({ alert }) =>
    ctx.background.spawn('push alert', () => pushAlert(ctx, alert)),
  );
  ctx.bus.on('presence:changed', ({ userId }) => liveTracker.schedule(userId));
  attachRealtime(app, ctx);

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
  registerUpdateRoutes(app, ctx);
  registerAgentRoutes(app, ctx);
  registerAlertRoutes(app, ctx);
  registerLiveRoutes(app, ctx);
  registerPushRoutes(app, ctx);

  return app;
}
