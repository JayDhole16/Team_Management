import { z } from 'zod';

export const SessionEndReasonSchema = z.enum([
  'MANUAL_STOP',
  'AUTO_CLOSED',
  'LOGOUT',
  'DEACTIVATED',
  'MAX_DURATION',
]);
export type SessionEndReason = z.infer<typeof SessionEndReasonSchema>;

export const HeartbeatStateSchema = z.enum(['ACTIVE', 'IDLE', 'AWAY']);
export type HeartbeatState = z.infer<typeof HeartbeatStateSchema>;

/** A work session. The timer is derived from `startedAt` (server time), never kept on the client. */
export const WorkSessionSchema = z.object({
  id: z.uuid(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  endReason: SessionEndReasonSchema.nullable(),
  lastHeartbeatAt: z.iso.datetime().nullable(),
});
export type WorkSession = z.infer<typeof WorkSessionSchema>;

/** `serverTime` lets the client correct for its own clock when showing the timer. */
export const SessionCurrentSchema = z.object({
  session: WorkSessionSchema.nullable(),
  serverTime: z.iso.datetime(),
});
export type SessionCurrent = z.infer<typeof SessionCurrentSchema>;

/** 12 h of heartbeats every 30 s, so a full offline queue fits in one request. */
export const HEARTBEAT_BATCH_MAX = 1500;

export const HeartbeatSchema = z
  .object({
    /** Client time. Back-dated heartbeats (offline queue) are accepted up to 12 h old. */
    at: z.iso.datetime({ offset: true }),
    state: HeartbeatStateSchema,
  })
  .strict();
export type Heartbeat = z.infer<typeof HeartbeatSchema>;

export const HeartbeatBatchBodySchema = z
  .object({ heartbeats: z.array(HeartbeatSchema).min(1).max(HEARTBEAT_BATCH_MAX) })
  .strict();
export type HeartbeatBatchBody = z.infer<typeof HeartbeatBatchBodySchema>;

export const HeartbeatResultSchema = z.object({
  /** Stored and merged into a session. */
  accepted: z.number().int(),
  /** Too old, in the future, or outside any session (e.g. during a break). */
  ignored: z.number().int(),
  session: WorkSessionSchema.nullable(),
});
export type HeartbeatResult = z.infer<typeof HeartbeatResultSchema>;
