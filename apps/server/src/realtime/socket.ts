import {
  SOCKET_UNAUTHORIZED,
  type EmployeeSocketEventMap,
  type OwnerSocketEventMap,
} from '@lk/shared';
import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { verifyAccessToken } from '../lib/access-token';
import type { ServiceContext } from '../services/context';

export const OWNER_ROOM = 'owner';
export const userRoom = (userId: string) => `user:${userId}`;

interface SocketData {
  userId: string;
  expiresAt: Date;
}

type ServerToClient = {
  [K in keyof (OwnerSocketEventMap & EmployeeSocketEventMap)]: (
    payload: (OwnerSocketEventMap & EmployeeSocketEventMap)[K],
  ) => void;
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- clients send nothing
type ClientToServer = {};

/** No Origin (not a browser) or the same host as the request. */
export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    return host !== undefined && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** The public host: behind a trusted proxy that rewrites Host (TRUST_PROXY), X-Forwarded-Host. */
export function requestHost(
  headers: Record<string, string | string[] | undefined>,
  trustProxy: boolean,
): string | undefined {
  const forwarded = headers['x-forwarded-host'];
  if (trustProxy && typeof forwarded === 'string') return forwarded.split(',')[0]?.trim();
  const host = headers.host;
  return typeof host === 'string' ? host : undefined;
}

/** Socket.IO payloads are small JSON; nothing is ever read from the client. */
const MAX_CLIENT_MESSAGE_BYTES = 4096;

/**
 * Socket.IO on the API's HTTP server (ARCHITECTURE section 8). Same login rules as REST
 * (plugins/auth.ts): a valid access token in `auth.token`, the user re-read and ACTIVE.
 * Every failure gives the same UNAUTHORIZED error. Rooms: `owner`, `user:<id>`.
 *
 * - A socket is closed when its access token expires; the web app reconnects with a fresh one.
 * - Deactivating an employee closes their sockets at once.
 * - Only ids, names and server-written messages are sent: never task or update text, emails
 *   or phone numbers.
 */
export function attachRealtime(app: FastifyInstance, ctx: ServiceContext) {
  const io = new Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>(
    app.server,
    {
      path: '/socket.io',
      serveClient: false,
      maxHttpBufferSize: MAX_CLIENT_MESSAGE_BYTES,
      // A connection that has not logged in within 10 s is dropped.
      connectTimeout: 10_000,
      // Same origin only (the web app and the API share one address); no CORS headers.
      cors: undefined,
      // Browsers always send Origin; a page on another site is refused. (Auth is a bearer token,
      // not a cookie, so this is a second layer.) Non-browser clients send none.
      allowRequest: (req, callback) =>
        callback(
          null,
          isSameOrigin(req.headers.origin, requestHost(req.headers, ctx.env.TRUST_PROXY)),
        ),
    },
  );

  io.use((socket, next) => {
    const unauthorized = () => next(new Error(SOCKET_UNAUTHORIZED));
    const token: unknown = (socket.handshake.auth as Record<string, unknown> | undefined)?.token;
    if (typeof token !== 'string' || token.length > 4096) return unauthorized();
    void (async () => {
      const claims = await verifyAccessToken(token, ctx.env.JWT_SECRET, ctx.clock());
      if (!claims) return unauthorized();
      const user = await ctx.data.repos.users.findById(claims.sub);
      if (!user || user.status !== 'ACTIVE') return unauthorized();
      socket.data.userId = user.id;
      socket.data.expiresAt = claims.expiresAt;
      await socket.join(user.role === 'OWNER' ? OWNER_ROOM : userRoom(user.id));
      // Deactivated between the check above and the join? Its disconnect may have missed this
      // socket, so look again now that it is in the room.
      const again = await ctx.data.repos.users.findById(user.id);
      if (again?.status !== 'ACTIVE') return unauthorized();
      next();
    })().catch(() => unauthorized());
  });

  io.on(
    'connection',
    (socket: Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>) => {
      const ms = socket.data.expiresAt.getTime() - ctx.clock().getTime();
      const timer = setTimeout(() => socket.disconnect(true), Math.max(0, ms));
      timer.unref();
      socket.on('disconnect', () => clearTimeout(timer));
    },
  );

  const owner = io.to(OWNER_ROOM);
  const off = [
    ctx.bus.on('status:changed', (e) => owner.emit('status:changed', e)),
    ctx.bus.on('alert:created', ({ alert }) => {
      if (alert.kind === 'IDLE' && alert.employeeId && alert.idleReason) {
        owner.emit('idle:alert', {
          alertId: alert.id,
          userId: alert.employeeId,
          name: alert.employeeName ?? 'An employee',
          reason: alert.idleReason,
          at: alert.at,
        });
      } else if (alert.kind === 'SECURITY') {
        owner.emit('security:alert', {
          alertId: alert.id,
          kind: alert.securityKind ?? 'SECURITY',
          message: alert.message ?? 'Security alert',
          at: alert.at,
        });
      }
    }),
    ctx.bus.on('alert:acked', (e) => owner.emit('alert:acked', e)),
    ctx.bus.on('employee:registered', (e) => {
      // Name, role and device type only (no email or phone over the socket).
      ctx.background.spawn('announce registration', async () => {
        const role = await ctx.data.repos.jobRoles.findById(e.jobRoleId);
        owner.emit('employee:registered', {
          userId: e.userId,
          name: e.name,
          jobRole: role?.label ?? null,
          deviceMode: e.deviceMode,
          at: e.at,
        });
      });
    }),
    ctx.bus.on('update:sent', (e) =>
      owner.emit('update:new', { updateId: e.updateId, employeeId: e.employeeId, at: e.at }),
    ),
    ctx.bus.on('task:status-changed', (e) =>
      owner.emit('task:status-changed', { taskId: e.taskId, at: e.at }),
    ),
    // To the new assignee only, and without `previousAssigneeId`.
    ctx.bus.on('task:assigned', (e) =>
      io.to(userRoom(e.assigneeId)).emit('task:assigned', { taskId: e.taskId, at: e.at }),
    ),
    ctx.bus.on('employee:deactivated', ({ userId }) =>
      io.in(userRoom(userId)).disconnectSockets(true),
    ),
  ];

  // Before the HTTP server closes: open websockets would otherwise keep `app.close()` waiting.
  app.addHook('preClose', async () => {
    for (const unsubscribe of off) unsubscribe();
    io.local.disconnectSockets(true);
    io.engine.close();
  });
  return io;
}
