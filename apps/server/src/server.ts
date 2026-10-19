import { buildApp } from './app';
import { loadEnv } from './config/env';
import { loggerOptions } from './config/logger';
import { startExpireCodesJob } from './jobs/expire-codes';
import { startSessionJobs } from './jobs/sessions';
import { createDataAccess } from './repositories';
import { createHealthRepository } from './repositories/health.repository';
import { createPrismaClient } from './repositories/prisma';

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);

const app = buildApp(
  { healthRepo: createHealthRepository(prisma), data: createDataAccess(prisma), env },
  { logger: loggerOptions(env.LOG_LEVEL) },
);

const bus = app.serviceContext.bus;
// Socket.IO delivers these to the owner in Phase 7; for now they are logged (no secrets in them).
bus.on('employee:registered', (e) => app.log.info({ userId: e.userId }, 'employee registered'));
bus.on('security:alert', (e) => app.log.warn({ kind: e.kind }, `security alert: ${e.message}`));
// Ids only: task text is never logged.
bus.on('task:assigned', (e) =>
  app.log.info({ taskId: e.taskId, assigneeId: e.assigneeId }, 'task assigned'),
);
bus.on('task:status-changed', (e) =>
  app.log.info({ taskId: e.taskId, from: e.from, to: e.to }, 'task status changed'),
);

const stopExpireJob = startExpireCodesJob(app.serviceContext, app.log);
const stopSessionJobs = startSessionJobs(app.serviceContext, app.log);

async function shutdown(signal: string) {
  app.log.info(`${signal} received, shutting down`);
  stopExpireJob();
  stopSessionJobs();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  app.log.error(err);
  await prisma.$disconnect();
  process.exit(1);
}
