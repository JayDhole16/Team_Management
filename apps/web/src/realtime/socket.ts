import { SOCKET_UNAUTHORIZED } from '@lk/shared';
import { io, type Socket } from 'socket.io-client';
import type { z } from 'zod';

export interface RealtimeOptions {
  /** Event name -> payload schema. Anything else, or a payload that fails, is ignored. */
  events: Record<string, z.ZodType>;
  getToken: () => string | null;
  /** Gets a fresh access token (de-duplicated by AuthSession). Null: signed out. */
  refresh: () => Promise<unknown>;
  onEvent: (event: string, payload: unknown) => void;
  onConnectedChange: (connected: boolean) => void;
}

const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30_000;
const STABLE_AFTER_MS = 10_000;

/**
 * One Socket.IO connection for the signed-in user (same origin, path /socket.io). The access
 * token goes in the handshake. The server refuses an expired token and closes the socket when
 * the token runs out: then a fresh token is fetched and the socket reconnects, with a growing
 * pause so a broken login cannot loop. Returns a function that disconnects for good.
 */
export function connectRealtime(options: RealtimeOptions): () => void {
  let stopped = false;
  let failures = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const socket: Socket = io({
    path: '/socket.io',
    auth: (cb) => cb({ token: options.getToken() ?? '' }),
  });

  const reconnectWithFreshToken = () => {
    if (stopped) return;
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** failures);
    failures += 1;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(
      () => {
        void options
          .refresh()
          .catch(() => null)
          .then(() => {
            if (!stopped && options.getToken()) socket.connect();
          });
      },
      failures === 1 ? 0 : delay,
    );
  };

  let stableTimer: ReturnType<typeof setTimeout> | undefined;
  socket.on('connect', () => {
    // Only a connection that stays up counts as healthy, so a connect-then-drop loop keeps
    // its growing pause.
    clearTimeout(stableTimer);
    stableTimer = setTimeout(() => {
      failures = 0;
    }, STABLE_AFTER_MS);
    options.onConnectedChange(true);
  });
  socket.on('disconnect', (reason) => {
    clearTimeout(stableTimer);
    options.onConnectedChange(false);
    // The server closed it (token expired or account deactivated): it will not retry by itself.
    if (reason === 'io server disconnect') reconnectWithFreshToken();
  });
  socket.on('connect_error', (err) => {
    options.onConnectedChange(false);
    // Refused by the login check: Socket.IO does not retry that by itself either.
    if (err.message === SOCKET_UNAUTHORIZED) reconnectWithFreshToken();
  });
  socket.onAny((event: string, payload: unknown) => {
    const schema = options.events[event];
    if (!schema) return;
    const parsed = schema.safeParse(payload);
    if (parsed.success) options.onEvent(event, parsed.data);
  });

  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    clearTimeout(stableTimer);
    socket.disconnect();
  };
}
