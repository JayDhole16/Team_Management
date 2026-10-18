import {
  IDLE_INTERVAL_MAX,
  IDLE_INTERVAL_MIN,
  type DeviceMode,
  type Employee,
  type EmployeePatchBody,
} from '@lk/shared';

export interface SettingsForm {
  /** '' means "no role". */
  jobRoleId: string;
  deviceMode: DeviceMode | '';
  /** As typed in the number field. */
  idle: string;
  joiningDate: string;
}

export type PatchResult = { ok: true; body: EmployeePatchBody } | { ok: false; idleError: string };

/** The PATCH body for the employee settings form: only the fields that changed. */
export function buildEmployeePatch(emp: Employee, form: SettingsForm): PatchResult {
  const idle = Number(form.idle);
  if (
    form.idle.trim() === '' ||
    !Number.isInteger(idle) ||
    idle < IDLE_INTERVAL_MIN ||
    idle > IDLE_INTERVAL_MAX
  ) {
    return {
      ok: false,
      idleError: `Enter a whole number from ${IDLE_INTERVAL_MIN} to ${IDLE_INTERVAL_MAX}.`,
    };
  }
  const body: EmployeePatchBody = {};
  if ((emp.jobRoleId ?? '') !== form.jobRoleId) body.jobRoleId = form.jobRoleId || null;
  if (form.deviceMode && form.deviceMode !== emp.deviceMode) body.deviceMode = form.deviceMode;
  if (idle !== emp.idleIntervalMin) body.idleIntervalMin = idle;
  if (form.joiningDate && form.joiningDate !== emp.joiningDate) body.joiningDate = form.joiningDate;
  return { ok: true, body };
}
