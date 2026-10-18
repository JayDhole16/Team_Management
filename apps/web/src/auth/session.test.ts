import { describe, expect, it } from 'vitest';
import { decideAccess, homeFor } from './access';
import { AuthSession, type AuthSnapshot, type ChannelLike, type LockLike } from './session';

const owner = {
  id: '6f1c2c55-6a55-4c1b-9d55-0d6b0c0a0a02',
  email: 'owner@example.com',
  name: 'Owner',
  role: 'OWNER' as const,
  status: 'ACTIVE' as const,
  jobRoleId: null,
  deviceMode: null,
  idleIntervalMin: 20,
  faceEnrolled: false,
};
const employee = {
  ...owner,
  id: '6f1c2c55-6a55-4c1b-9d55-0d6b0c0a0a03',
  role: 'EMPLOYEE' as const,
};

const okRefresh = (token: string) =>
  new Response(
    JSON.stringify({
      data: { accessToken: token, accessTokenExpiresAt: '2026-10-18T10:15:00.000Z', user: owner },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

/** fetch that resolves only when `release()` is called, counting calls. */
function slowFetch() {
  let calls = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    await gate;
    return okRefresh(`tok-${calls}`);
  };
  return { fetchImpl, count: () => calls, release: () => release?.() };
}

describe('AuthSession.refresh', () => {
  it('runs one refresh for concurrent callers (React StrictMode, parallel 401s)', async () => {
    const f = slowFetch();
    const session = new AuthSession({ fetchImpl: f.fetchImpl });
    const a = session.refresh();
    const b = session.refresh();
    void session.bootstrap();
    f.release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(f.count()).toBe(1);
    expect(ra?.accessToken).toBe('tok-1');
    expect(rb).toBe(ra);
    expect(session.getSnapshot()).toMatchObject({ status: 'signed-in', user: owner });
  });

  it('takes the cross-tab lock around the refresh when Web Locks exist', async () => {
    const taken: string[] = [];
    const locks: LockLike = {
      request: async (name, callback) => {
        taken.push(name);
        return callback();
      },
    };
    const session = new AuthSession({ fetchImpl: async () => okRefresh('tok'), locks });
    await session.refresh();
    expect(taken).toEqual(['lk-auth-refresh']);
  });

  it('a later refresh after the first finished makes a new request', async () => {
    let calls = 0;
    const session = new AuthSession({
      fetchImpl: async () => okRefresh(`tok-${++calls}`),
    });
    await session.refresh();
    await session.refresh();
    expect(calls).toBe(2);
    expect(session.getToken()).toBe('tok-2');
  });

  it('a missing cookie means signed out (no error shown on first load)', async () => {
    const session = new AuthSession({
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'x' } }), {
          status: 401,
        }),
    });
    await session.bootstrap();
    expect(session.getSnapshot()).toEqual({ status: 'signed-out', user: null, notice: null });
  });

  it('offline on first load gives the offline state, and bootstrap can be retried', async () => {
    let fail = true;
    const session = new AuthSession({
      fetchImpl: async () => {
        if (fail) throw new TypeError('fetch failed');
        return okRefresh('tok');
      },
    });
    await session.bootstrap();
    expect(session.getSnapshot().status).toBe('offline');
    fail = false;
    await session.bootstrap();
    expect(session.getSnapshot().status).toBe('signed-in');
  });
});

describe('AuthSession sign-out', () => {
  function fakeChannel() {
    const sent: unknown[] = [];
    const channel: ChannelLike = { postMessage: (m) => sent.push(m), onmessage: null };
    return { channel, sent };
  }

  it('logout waits for a running refresh, discards its result and then calls the server', async () => {
    const f = slowFetch();
    const order: string[] = [];
    const session = new AuthSession({ fetchImpl: f.fetchImpl });
    const refreshing = session.refresh(); // e.g. a polling query got a 401
    const loggingOut = session.logout(async () => {
      order.push(`logout after ${f.count()} refresh`);
    });
    await Promise.resolve();
    expect(order).toEqual([]); // not before the refresh finished
    f.release();
    await expect(refreshing).resolves.toBeNull(); // discarded: never signs back in
    await loggingOut;
    expect(order).toEqual(['logout after 1 refresh']);
    expect(f.count()).toBe(1);
    expect(session.getToken()).toBeNull();
    expect(session.getSnapshot().status).toBe('signed-out');
  });

  it('logout runs under the cross-tab refresh lock', async () => {
    const taken: string[] = [];
    const locks: LockLike = {
      request: async (name, callback) => {
        taken.push(name);
        return callback();
      },
    };
    const session = new AuthSession({ fetchImpl: async () => okRefresh('tok'), locks });
    await session.logout(async () => undefined);
    expect(taken).toEqual(['lk-auth-refresh']);
  });

  it('a logout from another tab during a refresh is not undone by that refresh', async () => {
    const f = slowFetch();
    const { channel } = fakeChannel();
    const session = new AuthSession({ fetchImpl: f.fetchImpl, channel });
    const refreshing = session.refresh();
    channel.onmessage?.({ data: 'logout' } as MessageEvent);
    f.release();
    await expect(refreshing).resolves.toBeNull();
    expect(session.getSnapshot().status).toBe('signed-out');
    expect(session.getToken()).toBeNull();
  });

  it('if the server cannot be reached, logout fails and the user stays signed in', async () => {
    const session = new AuthSession({ fetchImpl: async () => okRefresh('tok') });
    await session.refresh();
    await expect(
      session.logout(async () => {
        throw new TypeError('fetch failed');
      }),
    ).rejects.toThrow();
    expect(session.getSnapshot().status).toBe('signed-in');
  });

  it('clears the token and tells other tabs', async () => {
    const { channel, sent } = fakeChannel();
    const session = new AuthSession({ fetchImpl: async () => okRefresh('tok'), channel });
    await session.refresh();
    session.signOut();
    expect(session.getToken()).toBeNull();
    expect(session.getSnapshot().status).toBe('signed-out');
    expect(sent).toEqual(['logout']);
  });

  it('signs out when another tab logs out, without echoing the message', async () => {
    const { channel, sent } = fakeChannel();
    const session = new AuthSession({ fetchImpl: async () => okRefresh('tok'), channel });
    await session.refresh();
    channel.onmessage?.({ data: 'logout' } as MessageEvent);
    expect(session.getToken()).toBeNull();
    expect(sent).toEqual([]);
  });
});

describe('decideAccess', () => {
  const snap = (s: Partial<AuthSnapshot>): AuthSnapshot => ({
    status: 'signed-in',
    user: null,
    notice: null,
    ...s,
  });

  it('waits while the user is unknown, so owner pages never flash', () => {
    expect(decideAccess(snap({ status: 'unknown' }), 'OWNER')).toEqual({ kind: 'wait' });
  });

  it('sends signed-out users to login', () => {
    expect(decideAccess(snap({ status: 'signed-out' }), 'EMPLOYEE')).toEqual({
      kind: 'redirect',
      to: '/login',
    });
  });

  it('sends an employee who opens an owner page to their own home', () => {
    expect(decideAccess(snap({ user: employee }), 'OWNER')).toEqual({
      kind: 'redirect',
      to: '/me',
    });
    expect(decideAccess(snap({ user: owner }), 'EMPLOYEE')).toEqual({
      kind: 'redirect',
      to: '/owner',
    });
  });

  it('allows the right role', () => {
    expect(decideAccess(snap({ user: owner }), 'OWNER')).toEqual({ kind: 'allow' });
  });

  it('keeps signed-in users away from login/register', () => {
    expect(decideAccess(snap({ user: employee }), 'public-only')).toEqual({
      kind: 'redirect',
      to: '/me',
    });
    expect(decideAccess(snap({ status: 'signed-out' }), 'public-only')).toEqual({ kind: 'allow' });
  });

  it('homeFor', () => {
    expect(homeFor('OWNER')).toBe('/owner');
    expect(homeFor('EMPLOYEE')).toBe('/me');
  });
});
