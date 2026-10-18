import { AuthTokenResponseSchema, type AuthTokenResponse, type Me } from '@lk/shared';
import { ApiError, networkError, parseEnvelope } from '../api/errors';

export type AuthStatus = 'unknown' | 'signed-in' | 'signed-out' | 'offline';

export interface AuthSnapshot {
  status: AuthStatus;
  user: Me | null;
  /** Why the user was signed out, shown on the login page (e.g. the session expired). */
  notice: string | null;
}

/** Minimal parts of the browser APIs we use, so tests can pass fakes. */
export interface LockLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}
export interface ChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

export interface AuthSessionDeps {
  fetchImpl?: typeof fetch;
  /** `navigator.locks`; when missing, refreshes are only de-duplicated inside this tab. */
  locks?: LockLike | null;
  /** Tells other tabs about a logout. */
  channel?: ChannelLike | null;
}

const REFRESH_LOCK = 'lk-auth-refresh';
const SESSION_ENDED = 'Your session has ended. Please log in again.';

/**
 * The signed-in user and the short-lived access token, kept in memory only (never in
 * localStorage). The refresh token is an httpOnly cookie the page cannot read.
 *
 * The server rotates the refresh token on every refresh and signs the user out everywhere if
 * an old one is reused, so refreshes must never overlap: one in-flight promise per tab, and a
 * Web Lock across tabs.
 */
export class AuthSession {
  private token: string | null = null;
  private snapshot: AuthSnapshot = { status: 'unknown', user: null, notice: null };
  private readonly listeners = new Set<() => void>();
  private inflight: Promise<AuthTokenResponse | null> | null = null;
  private bootstrapPromise: Promise<void> | null = null;
  /** Bumped on every sign-out, so a refresh that was already running cannot sign back in. */
  private epoch = 0;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly deps: AuthSessionDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? ((...args) => fetch(...args));
    if (deps.channel) {
      deps.channel.onmessage = (event) => {
        if (event.data === 'logout') this.signOut(null, false);
      };
    }
  }

  getToken(): string | null {
    return this.token;
  }

  getSnapshot = (): AuthSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: AuthSnapshot) {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  /** Uses the token for API calls without announcing the sign-in to the UI yet. */
  stage(session: AuthTokenResponse): void {
    this.token = session.accessToken;
  }

  /** `notice` is shown once on the home page (e.g. the work session did not start). */
  setSession(session: AuthTokenResponse, notice: string | null = null): void {
    this.token = session.accessToken;
    this.set({ status: 'signed-in', user: session.user, notice });
  }

  clearNotice(): void {
    if (this.snapshot.notice) this.set({ ...this.snapshot, notice: null });
  }

  /** Clears the token and user. `broadcast` tells other open tabs to sign out too. */
  signOut(notice: string | null = null, broadcast = true): void {
    this.epoch += 1;
    this.token = null;
    this.set({ status: 'signed-out', user: null, notice });
    if (broadcast) this.deps.channel?.postMessage('logout');
  }

  /**
   * Logs out on the server, then here. Never overlaps a refresh: a refresh still running is
   * discarded and awaited, and `call` runs under the same cross-tab lock. Otherwise the logout
   * and the refresh would race with one cookie and the server would treat it as token theft
   * (signing out every device) or rotate the cookie so the logout misses it.
   * If `call` fails (e.g. offline) the user stays signed in and the error is thrown, because
   * the httpOnly cookie would otherwise survive on a shared laptop.
   */
  async logout(call: () => Promise<unknown>): Promise<void> {
    this.epoch += 1;
    await this.inflight?.catch(() => null);
    const run = () => call();
    await (this.deps.locks ? this.deps.locks.request(REFRESH_LOCK, run) : run());
    this.signOut();
  }

  /** First load: restore the session from the refresh cookie. Runs once per page load. */
  bootstrap(): Promise<void> {
    this.bootstrapPromise ??= this.refresh()
      .then(() => undefined)
      .catch(() => {
        this.bootstrapPromise = null; // allow "Try again"
        this.set({ status: 'offline', user: null, notice: null });
      });
    return this.bootstrapPromise;
  }

  /**
   * Gets a new access token from the refresh cookie. Resolves null (and signs out) when the
   * cookie is missing or no longer valid; throws ApiError NETWORK_ERROR when offline.
   */
  refresh(): Promise<AuthTokenResponse | null> {
    if (!this.inflight) {
      const run = () => this.doRefresh();
      const locked = this.deps.locks ? this.deps.locks.request(REFRESH_LOCK, run) : run();
      this.inflight = locked.finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async doRefresh(): Promise<AuthTokenResponse | null> {
    const epoch = this.epoch;
    let res: Response;
    try {
      res = await this.fetchImpl('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
    } catch {
      throw networkError();
    }
    try {
      const session = await parseEnvelope(res, AuthTokenResponseSchema);
      if (epoch !== this.epoch) return null; // signed out meanwhile
      // Keep a notice that is still on screen (e.g. "Press Resume") across token refreshes.
      const keep = this.snapshot.status === 'signed-in' ? this.snapshot.notice : null;
      this.setSession(session, keep);
      return session;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const wasSignedIn = this.snapshot.status === 'signed-in';
        this.signOut(wasSignedIn ? SESSION_ENDED : null, false);
        return null;
      }
      throw err;
    }
  }
}

function browserLocks(): LockLike | null {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return null;
  return navigator.locks as LockLike;
}

function browserChannel(): ChannelLike | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel('lk-auth');
  // Node (unit tests) would otherwise keep the process alive for an open channel.
  (channel as { unref?: () => void }).unref?.();
  return channel;
}

/** The app-wide session. Tests create their own `AuthSession` with fakes. */
export const authSession = new AuthSession({ locks: browserLocks(), channel: browserChannel() });
