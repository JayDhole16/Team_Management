import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { ROOT_ENV_PATH } from '../config/env';
import { createPrismaClient } from '../repositories/prisma';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

const SERVER_DIR = fileURLToPath(new URL('../..', import.meta.url));
const START_DB_HINT = 'Start the database first: docker compose up -d db';

/** Integration tests never touch the dev database: they use `<db>_test` on the same server. */
export default async function setup(project: TestProject) {
  if (existsSync(ROOT_ENV_PATH)) process.loadEnvFile(ROOT_ENV_PATH);
  const devUrl = process.env.DATABASE_URL;
  if (!devUrl)
    throw new Error(`DATABASE_URL is not set (create .env with pnpm env:setup). ${START_DB_HINT}`);

  const testUrl = new URL(devUrl);
  const testDb = `${testUrl.pathname.slice(1)}_test`;
  if (!/^[A-Za-z0-9_]+$/.test(testDb)) throw new Error('Unexpected database name in DATABASE_URL');
  testUrl.pathname = `/${testDb}`;

  const admin = createPrismaClient(devUrl);
  try {
    const rows = await admin.$queryRaw<{ found: number }[]>`
      SELECT 1 AS found FROM pg_database WHERE datname = ${testDb}`;
    if (rows.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${testDb}"`);
  } catch (err) {
    throw new Error(`Cannot reach PostgreSQL for tests. ${START_DB_HINT}`, { cause: err });
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    cwd: SERVER_DIR,
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    stdio: 'pipe',
  });

  project.provide('testDatabaseUrl', testUrl.toString());
}
