import { z } from 'zod';
import { IdleReasonSchema } from './alerts';
import { IdSchema } from './common';

/** Owner live status (PRD O-6). */

export const LiveStatusSchema = z.enum(['WORKING', 'IDLE', 'ON_BREAK', 'OFFLINE']);
export type LiveStatus = z.infer<typeof LiveStatusSchema>;

export const LIVE_STATUS_LABELS: Record<LiveStatus, string> = {
  WORKING: 'Working',
  IDLE: 'Idle',
  ON_BREAK: 'On break',
  OFFLINE: 'Offline',
};

export const LiveEmployeeSchema = z.object({
  userId: IdSchema,
  name: z.string(),
  jobRole: z.string().nullable(),
  status: LiveStatusSchema,
  /** False while a session is open but no agent heartbeat arrives ("Agent not running"). */
  agentRunning: z.boolean(),
  /** The open session, for the timer. */
  session: z.object({ startedAt: z.iso.datetime() }).nullable(),
  lastSeenAt: z.iso.datetime().nullable(),
  lastIdle: z.object({ reason: IdleReasonSchema, at: z.iso.datetime() }).nullable(),
  /** Worked time today and this month (Asia/Kolkata), idle time not deducted. */
  todaySec: z.number().int().min(0),
  monthSec: z.number().int().min(0),
});
export type LiveEmployee = z.infer<typeof LiveEmployeeSchema>;

export const LiveListSchema = z.object({
  employees: z.array(LiveEmployeeSchema),
  serverTime: z.iso.datetime(),
});
export type LiveList = z.infer<typeof LiveListSchema>;
