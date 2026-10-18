import type { Employee } from '@lk/shared';
import { describe, expect, it } from 'vitest';
import { buildEmployeePatch, type SettingsForm } from './employeePatch';

const ROLE_A = '6f1c2c55-6a55-4c1b-9d55-0d6b0c0a0a10';
const ROLE_B = '6f1c2c55-6a55-4c1b-9d55-0d6b0c0a0a11';

const emp: Employee = {
  id: '6f1c2c55-6a55-4c1b-9d55-0d6b0c0a0a01',
  email: 'e@example.com',
  name: 'Emp',
  phone: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  joiningDate: '2026-10-18',
  status: 'ACTIVE',
  jobRoleId: ROLE_A,
  deviceMode: 'PERSONAL',
  idleIntervalMin: 20,
  faceEnrolled: false,
  faceModelVersion: null,
  createdAt: '2026-10-18T10:00:00.000Z',
  deactivatedAt: null,
};

const unchanged: SettingsForm = {
  jobRoleId: ROLE_A,
  deviceMode: 'PERSONAL',
  idle: '20',
  joiningDate: '2026-10-18',
};

describe('buildEmployeePatch', () => {
  it('no changes gives an empty body', () => {
    expect(buildEmployeePatch(emp, unchanged)).toEqual({ ok: true, body: {} });
  });

  it('sends only the changed field', () => {
    expect(buildEmployeePatch(emp, { ...unchanged, idle: '45' })).toEqual({
      ok: true,
      body: { idleIntervalMin: 45 },
    });
    expect(buildEmployeePatch(emp, { ...unchanged, jobRoleId: ROLE_B })).toEqual({
      ok: true,
      body: { jobRoleId: ROLE_B },
    });
    expect(buildEmployeePatch(emp, { ...unchanged, deviceMode: 'COMPANY_MACBOOK' })).toEqual({
      ok: true,
      body: { deviceMode: 'COMPANY_MACBOOK' },
    });
  });

  it('clearing the role sends null', () => {
    expect(buildEmployeePatch(emp, { ...unchanged, jobRoleId: '' })).toEqual({
      ok: true,
      body: { jobRoleId: null },
    });
  });

  it('an empty joining date is ignored', () => {
    expect(buildEmployeePatch(emp, { ...unchanged, joiningDate: '' })).toEqual({
      ok: true,
      body: {},
    });
  });

  it('rejects an idle interval outside 5-120 or not a whole number', () => {
    for (const idle of ['4', '121', '7.5', '', 'abc']) {
      expect(buildEmployeePatch(emp, { ...unchanged, idle }).ok).toBe(false);
    }
    expect(buildEmployeePatch(emp, { ...unchanged, idle: '5' }).ok).toBe(true);
    expect(buildEmployeePatch(emp, { ...unchanged, idle: '120' }).ok).toBe(true);
  });
});
