import { z } from 'zod';
import { DateOnlySchema, IdSchema } from './common';
import { WorkSessionSchema } from './sessions';

/** Calendar month in Asia/Kolkata, e.g. 2026-10. */
export const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

/** `userId` is required for the owner; an employee may omit it (or pass their own id). */
export const HoursQuerySchema = z
  .object({ userId: IdSchema.optional(), month: MonthSchema.optional() })
  .strict();
export type HoursQuery = z.infer<typeof HoursQuerySchema>;

export const TodayHoursQuerySchema = z.object({ userId: IdSchema.optional() }).strict();
export type TodayHoursQuery = z.infer<typeof TodayHoursQuerySchema>;

/**
 * OFFLINE_GAP: part of the day is known only from heartbeats the agent sent late.
 * MAX_DURATION_CLOSE: a session without any agent heartbeat was closed automatically.
 */
export const DayFlagSchema = z.enum(['OFFLINE_GAP', 'MAX_DURATION_CLOSE']);
export type DayFlag = z.infer<typeof DayFlagSchema>;

export const HoursDaySchema = z.object({
  date: DateOnlySchema,
  /** Total logged time. Idle time is NOT deducted (PRD Q1); it is shown separately. */
  workedSec: z.number().int(),
  idleSec: z.number().int(),
  sessionCount: z.number().int(),
  flags: z.array(DayFlagSchema),
});
export type HoursDay = z.infer<typeof HoursDaySchema>;

export const ReportSessionSchema = WorkSessionSchema.extend({
  /** Time of this session inside the requested month. */
  workedSec: z.number().int(),
  idleSec: z.number().int(),
  gaps: z.array(z.object({ from: z.iso.datetime(), to: z.iso.datetime() })),
});
export type ReportSession = z.infer<typeof ReportSessionSchema>;

export const MonthHoursSchema = z.object({
  userId: IdSchema,
  month: MonthSchema,
  totalSec: z.number().int(),
  idleSec: z.number().int(),
  /** Days with any logged time. */
  workDays: z.number().int(),
  /** Only days with logged time, oldest first. */
  days: z.array(HoursDaySchema),
  sessions: z.array(ReportSessionSchema),
});
export type MonthHours = z.infer<typeof MonthHoursSchema>;

export const TodayHoursSchema = z.object({
  userId: IdSchema,
  date: DateOnlySchema,
  todaySec: z.number().int(),
  todayIdleSec: z.number().int(),
  month: MonthSchema,
  monthSec: z.number().int(),
  monthIdleSec: z.number().int(),
  openSession: WorkSessionSchema.nullable(),
  serverTime: z.iso.datetime(),
});
export type TodayHours = z.infer<typeof TodayHoursSchema>;
