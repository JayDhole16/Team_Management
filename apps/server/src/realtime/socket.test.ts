import { SOCKET_UNAUTHORIZED } from '@lk/shared';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bearer, createHarness, type Harness } from '../test/helpers';
import { isSameOrigin, requestHost } from './socket';

describe('isSameOrigin', () => {
  it('allows no Origin (not a browser) and the same host; refuses other sites', () => {
    expect(isSameOrigin(undefined, 'lk.example')).toBe(true);
    expect(isSameOrigin('https://lk.example', 'lk.example')).toBe(true);
    expect(isSameOrigin('http://localhost:5173', 'localhost:5173')).toBe(true);
    expect(isSameOrigin('https://evil.example', 'lk.example')).toBe(false);
    expect(isSameOrigin('https://lk.example.evil.example', 'lk.example')).toBe(false);
    expect(isSameOrigin('null', 'lk.example')).toBe(false);
    expect(isSameOrigin('https://lk.example', undefined)).toBe(false);
  });

  it('uses X-Forwarded-Host only behind a trusted proxy', () => {
    const headers = { host: '127.0.0.1:4000', 'x-forwarded-host': 'lk.example' };
    expect(requestHost(headers, true)).toBe('lk.example');
    expect(requestHost(headers, false)).toBe('127.0.0.1:4000');
  });
});

describe('Socket.IO realtime', () => {
  let h: Harness;
  let url: string;
  let employee: Awaited<ReturnType<Harness['registerEmployee']>>;
  const sockets: Socket[] = [];

  beforeEach(async () => {
    h = await createHarness();
    employee = await h.registerEmployee();
    url = await h.app.listen({ host: '127.0.0.1', port: 0 });
  });
  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });

  function open(token?: string, origin?: string): Socket {
    const socket = connect(url, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
      auth: token === undefined ? {} : { token },
      ...(origin ? { extraHeaders: { origin } } : {}),
    });
    sockets.push(socket);
    return socket;
  }

  function connected(socket: Socket): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (err) => reject(err));
    });
  }

  function refused(socket: Socket): Promise<string> {
    return new Promise((resolve, reject) => {
      socket.once('connect', () => reject(new Error('should not connect')));
      socket.once('connect_error', (err) => resolve(err.message));
    });
  }

  function next<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`no ${event} within ${timeoutMs} ms`)),
        timeoutMs,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  /** Everything a socket received. */
  function record(socket: Socket): string[] {
    const got: string[] = [];
    socket.onAny((event: string) => got.push(event));
    return got;
  }

  const disconnected = (socket: Socket) =>
    new Promise<string>((resolve) => socket.once('disconnect', (reason) => resolve(reason)));

  it('refuses a missing, garbage or tampered token with the same error', async () => {
    expect(await refused(open())).toBe(SOCKET_UNAUTHORIZED);
    expect(await refused(open('garbage'))).toBe(SOCKET_UNAUTHORIZED);
    const tampered = `${employee.ownerToken.slice(0, -4)}AAAA`;
    expect(await refused(open(tampered))).toBe(SOCKET_UNAUTHORIZED);
  });

  it('refuses a page on another site, even with a valid token', async () => {
    await expect(refused(open(employee.ownerToken, 'https://evil.example'))).resolves.toBeTruthy();
    // The same site connects.
    await connected(open(employee.ownerToken, url));
  });

  it('refuses a deactivated employee even with a token that has not expired', async () => {
    await h.app.inject({
      method: 'POST',
      url: `/api/v1/employees/${employee.userId}/deactivate`,
      headers: bearer(employee.ownerToken),
    });
    expect(await refused(open(employee.accessToken))).toBe(SOCKET_UNAUTHORIZED);
  });

  it('sends idle alerts with the name and reason to the owner only', async () => {
    const owner = open(employee.ownerToken);
    const emp = open(employee.accessToken);
    await Promise.all([connected(owner), connected(emp)]);
    const empGot = record(emp);

    const alert = next<Record<string, unknown>>(owner, 'idle:alert');
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/agent/idle-event',
      headers: bearer(employee.accessToken),
      payload: { at: h.clock.now().toISOString(), reason: 'FACE_MISMATCH' },
    });
    expect(await alert).toMatchObject({
      userId: employee.userId,
      name: 'Rahul Sharma',
      reason: 'FACE_MISMATCH',
    });
    await h.drain();
    expect(empGot).not.toContain('idle:alert');
    expect(empGot).not.toContain('status:changed');
  });

  it('forwards security alerts, acknowledgements and new updates to the owner only', async () => {
    const owner = open(employee.ownerToken);
    const emp = open(employee.accessToken);
    await Promise.all([connected(owner), connected(emp)]);
    const empGot = record(emp);
    const bus = h.app.serviceContext.bus;
    const at = h.clock.now().toISOString();

    const security = next<Record<string, unknown>>(owner, 'security:alert');
    bus.emit('security:alert', { kind: 'CLAIM_FAILURE_CAP', message: 'Many wrong codes.', at });
    expect(await security).toMatchObject({
      kind: 'CLAIM_FAILURE_CAP',
      message: 'Many wrong codes.',
    });

    const acked = next<Record<string, unknown>>(owner, 'alert:acked');
    bus.emit('alert:acked', { at });
    expect(await acked).toEqual({ at });

    const update = next<Record<string, unknown>>(owner, 'update:new');
    bus.emit('update:sent', { updateId: employee.userId, employeeId: employee.userId, at });
    expect(Object.keys(await update).sort()).toEqual(['at', 'employeeId', 'updateId']);

    await h.drain();
    expect(empGot).toEqual([]);
  });

  it('tells the owner about status changes', async () => {
    const owner = open(employee.ownerToken);
    await connected(owner);
    const status = next<Record<string, unknown>>(owner, 'status:changed');
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/sessions/start',
      headers: bearer(employee.accessToken),
    });
    expect(await status).toMatchObject({ userId: employee.userId, status: 'WORKING' });
  });

  it('sends task:assigned with only {taskId, at} to the assignee, nobody else', async () => {
    const other = await h.registerEmployee({ email: 'priya@example.com' });
    const owner = open(employee.ownerToken);
    const emp = open(employee.accessToken);
    const otherEmp = open(other.accessToken);
    await Promise.all([connected(owner), connected(emp), connected(otherEmp)]);
    const ownerGot = record(owner);
    const otherGot = record(otherEmp);

    const assigned = next<Record<string, unknown>>(emp, 'task:assigned');
    const taskId = '11111111-1111-4111-8111-111111111111';
    h.app.serviceContext.bus.emit('task:assigned', {
      taskId,
      assigneeId: employee.userId,
      previousAssigneeId: other.userId,
      at: h.clock.now().toISOString(),
    });
    const payload = await assigned;
    expect(Object.keys(payload).sort()).toEqual(['at', 'taskId']);
    expect(payload.taskId).toBe(taskId);
    await new Promise((r) => setTimeout(r, 100));
    expect(ownerGot).not.toContain('task:assigned');
    expect(otherGot).not.toContain('task:assigned');
  });

  it('announces a registration without email or phone', async () => {
    const owner = open(employee.ownerToken);
    await connected(owner);
    const registered = next<Record<string, unknown>>(owner, 'employee:registered');
    await h.registerEmployee({ email: 'neha@example.com', body: { name: 'Neha Verma' } });
    const payload = await registered;
    expect(payload).toMatchObject({
      name: 'Neha Verma',
      jobRole: 'Frontend Developer',
      deviceMode: 'PERSONAL',
    });
    expect(JSON.stringify(payload)).not.toContain('neha@example.com');
    expect(JSON.stringify(payload)).not.toContain('98765');
  });

  it('closes an employee socket when the owner deactivates them', async () => {
    const emp = open(employee.accessToken);
    await connected(emp);
    const closed = disconnected(emp);
    await h.app.inject({
      method: 'POST',
      url: `/api/v1/employees/${employee.userId}/deactivate`,
      headers: bearer(employee.ownerToken),
    });
    expect(await closed).toBe('io server disconnect');
  });

  it('closes a socket when its access token expires', async () => {
    // The token has 15 min; connect 200 ms before it ends.
    h.clock.advanceMs(15 * 60_000 - 200);
    const emp = open(employee.accessToken);
    await connected(emp);
    expect(await disconnected(emp)).toBe('io server disconnect');
  });
});
