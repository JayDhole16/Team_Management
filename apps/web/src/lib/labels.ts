import type {
  CodePurpose,
  CodeStatus,
  DayFlag,
  DeviceMode,
  JobRole,
  SessionEndReason,
  TaskPriority,
  TaskStatus,
} from '@lk/shared';
import type { Tone } from '../components/ui';

export const DEVICE_MODE_LABEL: Record<DeviceMode, string> = {
  COMPANY_MACBOOK: 'Company MacBook',
  PERSONAL: 'Personal laptop',
};

export const CODE_PURPOSE_LABEL: Record<CodePurpose, string> = {
  INVITE: 'New employee',
  PASSWORD_RESET: 'Password reset',
  FACE_RESCAN: 'Face re-scan',
};

export const CODE_STATUS: Record<CodeStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Waiting', tone: 'blue' },
  CLAIMED: { label: 'Registering', tone: 'amber' },
  USED: { label: 'Used', tone: 'green' },
  EXPIRED: { label: 'Expired', tone: 'grey' },
  REVOKED: { label: 'Revoked', tone: 'grey' },
};

export const DAY_FLAG_TEXT: Record<DayFlag, string> = {
  OFFLINE_GAP: 'Part of this day was sent late by the desktop agent (it was offline).',
  MAX_DURATION_CLOSE:
    'A session had no desktop agent and was closed automatically after 12 hours. Check this day.',
};

export const END_REASON_LABEL: Record<SessionEndReason, string> = {
  MANUAL_STOP: 'Stopped (break)',
  AUTO_CLOSED: 'Agent went quiet',
  LOGOUT: 'Logged out',
  DEACTIVATED: 'Account deactivated',
  MAX_DURATION: 'Closed after 12 h without agent',
};

export function roleLabel(roles: JobRole[] | undefined, id: string | null): string {
  if (!id) return 'No role';
  return roles?.find((r) => r.id === id)?.label ?? '…';
}

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Pending', tone: 'grey' },
  IN_PROGRESS: { label: 'In progress', tone: 'blue' },
  BLOCKED: { label: 'Blocked', tone: 'red' },
  COMPLETED: { label: 'Completed', tone: 'green' },
};

export const PRIORITY: Record<TaskPriority, { label: string; tone: Tone }> = {
  HIGH: { label: 'High priority', tone: 'red' },
  MEDIUM: { label: 'Medium priority', tone: 'amber' },
  LOW: { label: 'Low priority', tone: 'grey' },
};

export const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];
