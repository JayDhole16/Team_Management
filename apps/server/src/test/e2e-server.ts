// Starts the API for the Playwright run (apps/web/playwright.config.ts) against a FRESH database
// `<POSTGRES_DB>_e2e`: dropped, re-created, migrated and seeded with a throwaway owner on every
// run. The dev database and the `_test` database are never touched.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROOT_ENV_PATH } from '../config/env';
import { createDataAccess } from '../repositories';
import { createPrismaClient } from '../repositories/prisma';
import { runSeed } from '../services/seed.service';

const SERVER_DIR = fileURLToPath(new URL('../..', import.meta.url));

if (existsSync(ROOT_ENV_PATH)) process.loadEnvFile(ROOT_ENV_PATH);

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (the Playwright config sets it)`);
  return value;
};

const devUrl = required('DATABASE_URL');
const e2eUrl = new URL(devUrl);
const e2eDb = `${e2eUrl.pathname.slice(1)}_e2e`;
// Safety: only ever drop a database whose name ends in _e2e.
if (!/^[A-Za-z0-9_]+_e2e$/.test(e2eDb)) throw new Error('Unexpected database name in DATABASE_URL');
e2eUrl.pathname = `/${e2eDb}`;

const admin = createPrismaClient(devUrl);
try {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${e2eDb}" WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${e2eDb}"`);
} catch (err) {
  throw new Error('Cannot reach PostgreSQL. Start it first: docker compose up -d db', {
    cause: err,
  });
} finally {
  await admin.$disconnect();
}

execSync('npx prisma migrate deploy', {
  cwd: SERVER_DIR,
  env: { ...process.env, DATABASE_URL: e2eUrl.toString() },
  stdio: 'pipe',
});

const prisma = createPrismaClient(e2eUrl.toString());
try {
  await runSeed(
    createDataAccess(prisma),
    {
      ownerEmail: required('E2E_OWNER_EMAIL'),
      ownerName: 'E2E Owner',
      ownerPassword: required('E2E_OWNER_PASSWORD'),
    },
    new Date(),
  );
} finally {
  await prisma.$disconnect();
}

// Real env vars win over .env (process.loadEnvFile never overrides), so the server uses these.
process.env.DATABASE_URL = e2eUrl.toString();
process.env.PORT = process.env.E2E_API_PORT ?? '4100';
process.env.HOST = '127.0.0.1';
process.env.LOG_LEVEL = 'warn';
process.env.FACE_ENROLLMENT_REQUIRED = 'false';

await import('../server');
