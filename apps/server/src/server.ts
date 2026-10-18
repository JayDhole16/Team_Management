import { buildApp } from './app';
import { loadEnv } from './config/env';
import { createHealthRepository } from './repositories/health.repository';
import { createPrismaClient } from './repositories/prisma';

const env = loadEnv();
const prisma = createPrismaClient(env.DATABASE_URL);

const app = buildApp(
  { healthRepo: createHealthRepository(prisma) },
  {
    logger: {
      level: env.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  },
);

async function shutdown(signal: string) {
  app.log.info(`${signal} received, shutting down`);
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
