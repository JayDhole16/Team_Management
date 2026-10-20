import { z } from 'zod';
import { IdleReasonSchema } from './alerts';
import { DeviceModeSchema, IdSchema } from './common';
import { LiveStatusSchema } from './live';

/**
 * Socket.IO events (ARCHITECTURE section 8). Ids and names only: never task or update text,
 * emails or phone numbers. The web app checks every payload with these schemas.
 */

/** The socket's auth error, for any login problem (no detail on purpose). */
export const SOCKET_UNAUTHORIZED = 'UNAUTHORIZED';

export const StatusChangedEventSchema = z.object({
  userId: IdSchema,
  status: LiveStatusSchema,
  agentRunning: z.boolean(),
  at: z.iso.datetime(),
});

export const IdleAlertEventSchema = z.object({
  alertId: IdSchema,
  userId: IdSchema,
  name: z.string().max(200),
  reason: IdleReasonSchema,
  at: z.iso.datetime(),
});

export const SecurityAlertEventSchema = z.object({
  alertId: IdSchema,
  kind: z.string().max(60),
  message: z.string().max(500),
  at: z.iso.datetime(),
});

export const EmployeeRegisteredEventSchema = z.object({
  userId: IdSchema,
  name: z.string().max(200),
  jobRole: z.string().max(200).nullable(),
  deviceMode: DeviceModeSchema,
  at: z.iso.datetime(),
});

export const UpdateNewEventSchema = z.object({
  updateId: IdSchema,
  employeeId: IdSchema,
  at: z.iso.datetime(),
});

export const TaskStatusChangedEventSchema = z.object({ taskId: IdSchema, at: z.iso.datetime() });

export const AlertAckedEventSchema = z.object({ at: z.iso.datetime() });

/** A quiet alert was stored (late or outside a session): the lists refresh, no beep. */
export const AlertStoredEventSchema = z.object({ alertId: IdSchema, at: z.iso.datetime() });

/** To the employee only. Not the previous assignee (decided in Phase 5). */
export const TaskAssignedEventSchema = z.object({ taskId: IdSchema, at: z.iso.datetime() });

export const OwnerSocketEvents = {
  'status:changed': StatusChangedEventSchema,
  'idle:alert': IdleAlertEventSchema,
  'security:alert': SecurityAlertEventSchema,
  'employee:registered': EmployeeRegisteredEventSchema,
  'update:new': UpdateNewEventSchema,
  'task:status-changed': TaskStatusChangedEventSchema,
  'alert:acked': AlertAckedEventSchema,
  'alert:stored': AlertStoredEventSchema,
} as const;

export const EmployeeSocketEvents = {
  'task:assigned': TaskAssignedEventSchema,
} as const;

export type OwnerSocketEventMap = {
  [K in keyof typeof OwnerSocketEvents]: z.infer<(typeof OwnerSocketEvents)[K]>;
};
export type EmployeeSocketEventMap = {
  [K in keyof typeof EmployeeSocketEvents]: z.infer<(typeof EmployeeSocketEvents)[K]>;
};
export type SocketEventMap = OwnerSocketEventMap & EmployeeSocketEventMap;
