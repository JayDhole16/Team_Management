import { z } from 'zod';
import { IdSchema } from './common';

/** Owner alerts (PRD O-8): failed idle checks and security alerts, open until acknowledged. */

export const AlertKindSchema = z.enum(['IDLE', 'SECURITY']);
export type AlertKind = z.infer<typeof AlertKindSchema>;

/** Why an idle check failed (ARCHITECTURE section 5). */
export const IdleReasonSchema = z.enum([
  'NO_ACTIVITY',
  'NO_FACE',
  'FACE_MISMATCH',
  'CAMERA_UNAVAILABLE',
]);
export type IdleReason = z.infer<typeof IdleReasonSchema>;

export const SecurityAlertKindSchema = z.enum([
  'CLAIM_FAILURE_CAP',
  'CLAIM_IP_BLOCKED',
  'RECOVERY_IP_BLOCKED',
  'LOGIN_ACCOUNT_LOCKED',
  'REFRESH_TOKEN_REUSE',
  'DUPLICATE_FACE',
]);
export type SecurityAlertKind = z.infer<typeof SecurityAlertKindSchema>;

/** Plain English for the owner (toasts, the Alerts page, push notifications). */
export const IDLE_REASON_LABELS: Record<IdleReason, string> = {
  NO_ACTIVITY: 'no keyboard or mouse activity',
  NO_FACE: 'nobody at the camera',
  FACE_MISMATCH: 'a different person at the camera',
  CAMERA_UNAVAILABLE: 'camera blocked or not available',
};

/** Short and without names or addresses: used on a phone's lock screen (push). */
export const SECURITY_KIND_LABELS: Record<SecurityAlertKind, string> = {
  CLAIM_FAILURE_CAP: 'many wrong access codes were tried',
  CLAIM_IP_BLOCKED: 'wrong access codes from one address',
  RECOVERY_IP_BLOCKED: 'wrong reset codes from one address',
  LOGIN_ACCOUNT_LOCKED: 'an account was locked after wrong passwords',
  REFRESH_TOKEN_REUSE: 'an old login was reused',
  DUPLICATE_FACE: 'the same face was registered twice',
};

export const ALERTS_PAGE_DEFAULT = 50;
export const ALERTS_PAGE_MAX = 100;

// --- Request bodies ---

/** Sent by the agent (or the dev simulator) when an idle check fails. */
export const IdleEventBodySchema = z
  .object({
    /** Client time of the check. Accepted up to 12 h old (offline queue). */
    at: z.iso.datetime({ offset: true }),
    reason: IdleReasonSchema,
    /** Face match distance (lower is better), when there was a face. */
    score: z.number().min(0).max(10).optional(),
  })
  .strict();
export type IdleEventBody = z.infer<typeof IdleEventBodySchema>;

export const AlertListQuerySchema = z
  .object({
    status: z.enum(['open', 'all']).default('all'),
    employeeId: IdSchema.optional(),
    kind: AlertKindSchema.optional(),
    /** Id of the last alert of the previous page. */
    cursor: IdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(ALERTS_PAGE_MAX).default(ALERTS_PAGE_DEFAULT),
  })
  .strict();
export type AlertListQuery = z.infer<typeof AlertListQuerySchema>;

export const AckAllBodySchema = z
  .object({
    /** Only alerts that reached the server up to this time (the newest `receivedAt` on screen),
     *  so one that arrived after the page loaded stays open, even if it is back-dated. */
    upTo: z.iso.datetime(),
  })
  .strict();
export type AckAllBody = z.infer<typeof AckAllBodySchema>;

// --- Responses ---

export const AlertSchema = z.object({
  id: IdSchema,
  kind: AlertKindSchema,
  /** IDLE: the employee. */
  employeeId: IdSchema.nullable(),
  employeeName: z.string().nullable(),
  idleReason: IdleReasonSchema.nullable(),
  score: z.number().nullable(),
  securityKind: z.string().nullable(),
  /** SECURITY: written by the server. */
  message: z.string().nullable(),
  at: z.iso.datetime(),
  /** Server time it arrived (an idle event's `at` is the laptop's time and can be hours old). */
  receivedAt: z.iso.datetime(),
  ownerAckAt: z.iso.datetime().nullable(),
});
export type Alert = z.infer<typeof AlertSchema>;

export const AlertPageSchema = z.object({
  items: z.array(AlertSchema),
  nextCursor: IdSchema.nullable(),
});
export type AlertPage = z.infer<typeof AlertPageSchema>;

export const IdleEventResultSchema = z.object({
  /** False when `at` was more than 12 h old or too far in the future (ignored). */
  accepted: z.boolean(),
  alertId: IdSchema.nullable(),
});
export type IdleEventResult = z.infer<typeof IdleEventResultSchema>;

export const OpenAlertCountSchema = z.object({ count: z.number().int().min(0) });
export type OpenAlertCount = z.infer<typeof OpenAlertCountSchema>;

export const AckAllResultSchema = z.object({ acknowledged: z.number().int().min(0) });
export type AckAllResult = z.infer<typeof AckAllResultSchema>;

/** One line for a toast or a push notification. */
export function describeAlert(alert: {
  kind: AlertKind;
  employeeName: string | null;
  idleReason: IdleReason | null;
  message: string | null;
}): string {
  if (alert.kind === 'IDLE') {
    const reason = alert.idleReason ? IDLE_REASON_LABELS[alert.idleReason] : 'idle check failed';
    return `${alert.employeeName ?? 'An employee'}: ${reason}`;
  }
  return alert.message ?? 'Security alert';
}
