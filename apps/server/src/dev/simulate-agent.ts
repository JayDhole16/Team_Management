// DEV ONLY: pretends to be an employee's desktop agent, so live status and owner alerts can be
// tested before the real agent exists (Phase 8/9). Talks to a local API only.
//
//   SIM_PASSWORD=... pnpm sim:agent -- --email rahul@example.com --idle-after 20 --reason NO_FACE --stop-after 60
//
// What it does: logs in as the employee, starts the work session, sends a heartbeat every
// --interval seconds, optionally reports an idle event (--idle-after; heartbeats are AWAY from
// then on, like the agent while its prompt is open) or just switches to AWAY (--away-after),
// then stops sending (--stop-after). With no agent
// heartbeat the server marks the agent "not running" after ~90 s and closes the session about
// 3 minutes later, so the owner sees Offline. --logout ends the session at once instead.
// The access token is never printed.
import { parseArgs } from 'node:util';
import {
  AuthTokenResponseSchema,
  HeartbeatResultSchema,
  IdleEventResultSchema,
  IdleReasonSchema,
  WorkSessionSchema,
  type HeartbeatState,
} from '@lk/shared';
import { z } from 'zod';

if (process.env.NODE_ENV === 'production') {
  console.error(
    'simulate-agent is a development tool. It refuses to run with NODE_ENV=production.',
  );
  process.exit(1);
}

const { values } = parseArgs({
  // `pnpm sim:agent -- --email x` passes the `--` through.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    api: { type: 'string', default: 'http://localhost:4000' },
    email: { type: 'string' },
    password: { type: 'string' },
    interval: { type: 'string', default: '15' },
    'idle-after': { type: 'string' },
    reason: { type: 'string', default: 'NO_ACTIVITY' },
    'away-after': { type: 'string' },
    'stop-after': { type: 'string' },
    logout: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

const USAGE = `Usage: SIM_PASSWORD=<password> pnpm sim:agent -- --email <employee email> [options]
  --api <url>          API address (default http://localhost:4000; localhost only)
  --interval <sec>     seconds between heartbeats (default 15)
  --idle-after <sec>   report an idle event after this many seconds
  --reason <reason>    NO_ACTIVITY | NO_FACE | FACE_MISMATCH | CAMERA_UNAVAILABLE (default NO_ACTIVITY)
  --away-after <sec>   send AWAY heartbeats from this many seconds on
  --stop-after <sec>   stop sending heartbeats (the session then auto-closes: Offline)
  --logout             log out at the end (ends the session at once)
  --password <pw>      instead of SIM_PASSWORD (visible in your shell history)`;

if (values.help || !values.email) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}

const api = new URL(values.api);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(api.hostname)) {
  console.error('simulate-agent only talks to a local API (localhost). Refusing', api.origin);
  process.exit(1);
}
const password = values.password ?? process.env.SIM_PASSWORD;
if (!password) {
  console.error('Set SIM_PASSWORD (or pass --password).');
  process.exit(1);
}
const seconds = (name: string, v: string | undefined) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`--${name} must be a number of seconds`);
    process.exit(1);
  }
  return n;
};
const intervalSec = Math.max(1, seconds('interval', values.interval) ?? 15);
const idleAfter = seconds('idle-after', values['idle-after']);
const awayAfter = seconds('away-after', values['away-after']);
const stopAfter = seconds('stop-after', values['stop-after']);
const reason = IdleReasonSchema.safeParse(values.reason);
if (!reason.success) {
  console.error(`--reason must be one of ${IdleReasonSchema.options.join(', ')}`);
  process.exit(1);
}

let token = '';
let cookie = '';
const log = (msg: string) => console.log(`[${new Date().toLocaleTimeString('en-IN')}] ${msg}`);

async function call<T extends z.ZodType>(method: string, path: string, schema: T, body?: unknown) {
  const res = await fetch(new URL(`/api/v1${path}`, api), {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0] ?? '';
  const json = (await res.json().catch(() => ({}))) as {
    data?: unknown;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json.error?.message ?? ''}`);
  return schema.parse(json.data) as z.infer<T>;
}

const login = await call('POST', '/auth/login', AuthTokenResponseSchema, {
  email: values.email,
  password,
});
token = login.accessToken;
if (login.user.role !== 'EMPLOYEE') {
  console.error('Log in as an employee, not the owner.');
  process.exit(1);
}
log(`Logged in as ${login.user.name}.`);
const session = await call('POST', '/sessions/start', WorkSessionSchema);
log(`Session started at ${new Date(session.startedAt).toLocaleTimeString('en-IN')}.`);

const started = Date.now();
const elapsed = () => (Date.now() - started) / 1000;
let idleSent = false;

async function refreshToken() {
  // Access tokens last 15 min; the refresh cookie gives a new one.
  const fresh = await call('POST', '/auth/refresh', AuthTokenResponseSchema);
  token = fresh.accessToken;
}

async function tick(): Promise<boolean> {
  const t = elapsed();
  if (stopAfter !== undefined && t >= stopAfter) return false;
  if (idleAfter !== undefined && !idleSent && t >= idleAfter) {
    idleSent = true;
    const r = await call('POST', '/agent/idle-event', IdleEventResultSchema, {
      at: new Date().toISOString(),
      reason: reason.data,
    });
    log(r.accepted ? `Idle event sent (${reason.data}).` : 'Idle event ignored by the server.');
  }
  // After a failed idle check the real agent keeps reporting AWAY until the employee dismisses
  // its "Are you there?" prompt (Phase 9); an ACTIVE heartbeat would show Working again.
  const away = idleSent || (awayAfter !== undefined && t >= awayAfter);
  const state: HeartbeatState = away ? 'AWAY' : 'ACTIVE';
  const r = await call('POST', '/agent/heartbeat', HeartbeatResultSchema, {
    heartbeats: [{ at: new Date().toISOString(), state }],
  });
  log(`Heartbeat ${state} (accepted ${r.accepted}).`);
  return true;
}

let lastRefresh = Date.now();
for (;;) {
  if (Date.now() - lastRefresh > 10 * 60_000) {
    await refreshToken();
    lastRefresh = Date.now();
  }
  if (!(await tick())) break;
  await new Promise((r) => setTimeout(r, intervalSec * 1000));
}

if (values.logout) {
  await call('POST', '/auth/logout', z.unknown());
  log('Logged out: the session ended. The owner should see Offline now.');
} else {
  log('Stopped sending heartbeats. "Agent not running" in ~90 s, Offline in ~3-3.5 min.');
}
