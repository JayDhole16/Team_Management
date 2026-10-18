import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  // Short connect timeout so /health reports "down" quickly instead of hanging.
  const adapter = new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
  return new PrismaClient({ adapter });
}
