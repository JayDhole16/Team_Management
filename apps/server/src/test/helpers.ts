// Shared helpers for integration tests (real PostgreSQL test database, see global-setup.ts).
import type { CodeCreated, InviteBody, JobRole } from '@lk/shared';
import { CONSENT_VERSION } from '@lk/shared';
import { inject } from 'vitest';
import { buildApp } from '../app';
import { parseEnv, type Env } from '../config/env';
import { loggerOptions } from '../config/logger';
import type { PrismaClient } from '../generated/prisma/client';
import { createEventBus, type AppEvents } from '../lib/events';
import { createDataAccess, type DataAccess } from '../repositories';
import { createHealthRepository } from '../repositories/health.repository';
import { createPrismaClient } from '../repositories/prisma';
import { runSeed } from '../services/seed.service';
import { mockLlm } from './mock-llm';

export const OWNER = { email: 'owner@test.local', password: 'Boss-Desk-Lamp-2026!' };
export const EMPLOYEE_PASSWORD = 'Strong-Employee-Pw-42';

let prisma: PrismaClient | undefined;
export function testPrisma(): PrismaClient {
  prisma ??= createPrismaClient(inject('testDatabaseUrl'));
  return prisma;
}

export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: inject('testDatabaseUrl'),
    JWT_SECRET: 'test-jwt-secret-'.padEnd(48, 'j'),
    REFRESH_TOKEN_SECRET: 'test-refresh-secret-'.padEnd(48, 'r'),
    CODE_HASH_SECRET: 'test-code-secret-'.padEnd(48, 'c'),
    FACE_ENCRYPTION_KEY: '0f'.repeat(32),
    ...overrides,
  });
}

export async function resetDb(): Promise<void> {
  await testPrisma().$executeRawUnsafe(
    'TRUNCATE users, job_roles, devices, access_codes, refresh_tokens, consent_records, audit_log, work_sessions, heartbeats, work_session_gaps, projects, tasks, task_status_events CASCADE',
  );
}

/** A clock the test moves by hand. */
export class TestClock {
  private current: Date;
  constructor(start = '2026-10-18T05:00:00.000Z') {
    this.current = new Date(start);
  }
  readonly now = () => new Date(this.current);
  advanceMinutes(minutes: number) {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
  advanceMs(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export interface HarnessOptions {
  env?: Record<string, string>;
  /** Replace data access, e.g. to inject a failure inside a transaction. */
  data?: (real: DataAccess) => DataAccess;
  captureLogs?: boolean;
  /** Defaults to a mock that behaves like a stopped Ollama, so no test needs a real model. */
  llm?: ReturnType<typeof mockLlm>;
}

/** Fresh app + empty database + seeded owner and job roles. */
export async function createHarness(options: HarnessOptions = {}) {
  await resetDb();
  const db = testPrisma();
  const realData = createDataAccess(db);
  const data = options.data ? options.data(realData) : realData;
  const env = testEnv(options.env);
  const clock = new TestClock();
  const bus = createEventBus();
  const events = {
    registered: [] as AppEvents['employee:registered'][],
    alerts: [] as AppEvents['security:alert'][],
    taskAssigned: [] as AppEvents['task:assigned'][],
    taskStatus: [] as AppEvents['task:status-changed'][],
    updates: [] as AppEvents['update:sent'][],
  };
  bus.on('employee:registered', (e) => events.registered.push(e));
  bus.on('security:alert', (e) => events.alerts.push(e));
  bus.on('task:assigned', (e) => events.taskAssigned.push(e));
  bus.on('task:status-changed', (e) => events.taskStatus.push(e));
  bus.on('update:sent', (e) => events.updates.push(e));
  const logs: string[] = [];
  const llm = options.llm ?? mockLlm();

  const app = buildApp(
    { healthRepo: createHealthRepository(db), data, env, clock: clock.now, bus, llm: llm.client },
    {
      logger: options.captureLogs
        ? loggerOptions('trace', { write: (line) => void logs.push(line) })
        : false,
    },
  );
  await app.ready();

  await runSeed(
    realData,
    { ownerEmail: OWNER.email, ownerName: 'Test Owner', ownerPassword: OWNER.password },
    clock.now(),
  );
  const roles = await realData.repos.jobRoles.list();
  const roleByKey = Object.fromEntries(roles.map((r) => [r.key, r])) as Record<string, JobRole>;
  const role = (key: string) => {
    const found = roleByKey[key];
    if (!found) throw new Error(`No seeded job role ${key}`);
    return found;
  };

  const harness = {
    app,
    db,
    env,
    clock,
    events,
    logs,
    llm,
    role,

    async login(email: string, password: string, ip = '10.0.0.1') {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password },
        remoteAddress: ip,
      });
      if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
      return res.json<{ data: { accessToken: string } }>().data.accessToken;
    },

    ownerToken() {
      return harness.login(OWNER.email, OWNER.password);
    },

    async invite(ownerToken: string, body: Partial<InviteBody> = {}): Promise<CodeCreated> {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/codes/invite',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { deviceMode: 'PERSONAL', ...body },
      });
      if (res.statusCode !== 201) throw new Error(`invite failed: ${res.statusCode} ${res.body}`);
      return res.json<{ data: CodeCreated }>().data;
    },

    claim(code: string, ip = '10.0.0.2') {
      return app.inject({
        method: 'POST',
        url: '/api/v1/register/claim',
        payload: { code },
        remoteAddress: ip,
      });
    },

    async claimToken(code: string, ip?: string): Promise<string> {
      const res = await harness.claim(code, ip);
      if (res.statusCode !== 200) throw new Error(`claim failed: ${res.statusCode} ${res.body}`);
      return res.json<{ data: { registrationToken: string } }>().data.registrationToken;
    },

    completeBody(token: string, overrides: Record<string, unknown> = {}) {
      return {
        token,
        name: 'Rahul Sharma',
        email: 'rahul@example.com',
        password: EMPLOYEE_PASSWORD,
        jobRoleId: role('frontend_developer').id,
        phone: '+91 98765 43210',
        emergencyContactName: 'Sunita Sharma',
        emergencyContactPhone: '+91 91234 56789',
        consentAccepted: true,
        consentVersion: CONSENT_VERSION,
        ...overrides,
      };
    },

    complete(payload: Record<string, unknown>) {
      return app.inject({ method: 'POST', url: '/api/v1/register/complete', payload });
    },

    /** Owner invites, employee claims and completes, employee logs in. */
    async registerEmployee(
      opts: { email?: string; invite?: Partial<InviteBody>; body?: Record<string, unknown> } = {},
    ) {
      const email = opts.email ?? 'rahul@example.com';
      const owner = await harness.ownerToken();
      const { code } = await harness.invite(owner, opts.invite);
      const token = await harness.claimToken(code);
      const res = await harness.complete(harness.completeBody(token, { email, ...opts.body }));
      if (res.statusCode !== 201) throw new Error(`complete failed: ${res.statusCode} ${res.body}`);
      const userId = res.json<{ data: { userId: string } }>().data.userId;
      const accessToken = await harness.login(email, EMPLOYEE_PASSWORD);
      return { userId, email, accessToken, ownerToken: owner };
    },
  };
  return harness;
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

export function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}
