// Idempotent seed: the six default job roles and the owner account from .env.
// Safe to run any number of times. Never prints the password.
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { ROOT_ENV_PATH } from '../src/config/env';
import { createDataAccess } from '../src/repositories';
import { createPrismaClient } from '../src/repositories/prisma';
import { runSeed } from '../src/services/seed.service';

if (existsSync(ROOT_ENV_PATH)) process.loadEnvFile(ROOT_ENV_PATH);
const databaseUrl = z.string().min(1).parse(process.env.DATABASE_URL);

const prisma = createPrismaClient(databaseUrl);
try {
  const result = await runSeed(
    createDataAccess(prisma),
    {
      ownerEmail: process.env.OWNER_EMAIL,
      ownerName: process.env.OWNER_NAME,
      ownerPassword: process.env.OWNER_PASSWORD,
    },
    new Date(),
  );
  console.log(`Job roles: ${result.jobRoles} ensured.`);
  console.log(
    {
      created: 'Owner account created from OWNER_EMAIL / OWNER_PASSWORD.',
      exists: 'Owner account already exists (password unchanged).',
      'skipped-other-owner-exists':
        'An owner with a different email already exists; no second owner was created.',
    }[result.owner],
  );
} catch (err) {
  console.error(`Seed failed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
