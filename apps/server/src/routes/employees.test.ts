import { ApiErrorSchema, EmployeeSchema } from '@lk/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { bearer, createHarness, type Harness } from '../test/helpers';

describe('owner employee management', () => {
  let h: Harness;
  let owner: string;
  let userId: string;
  let employeeToken: string;
  beforeEach(async () => {
    h = await createHarness();
    const e = await h.registerEmployee({
      body: {
        faceTemplate: { modelVersion: 'v1', descriptor: Array.from({ length: 64 }, () => 0.1) },
      },
    });
    owner = e.ownerToken;
    userId = e.userId;
    employeeToken = e.accessToken;
  });

  const patch = (payload: unknown, token = owner) =>
    h.app.inject({
      method: 'PATCH',
      url: `/api/v1/employees/${userId}`,
      headers: bearer(token),
      payload: payload as object,
    });

  it('lists employees (not the owner) without secrets, with a role filter', async () => {
    await h.registerEmployee({
      email: 'priya@example.com',
      invite: { presetJobRoleId: h.role('editor').id },
      body: { name: 'Priya', jobRoleId: h.role('editor').id },
    });
    const all = await h.app.inject({
      method: 'GET',
      url: '/api/v1/employees',
      headers: bearer(owner),
    });
    const list = EmployeeSchema.array().parse(all.json<{ data: unknown }>().data);
    expect(list.map((e) => e.name).sort()).toEqual(['Priya', 'Rahul Sharma']);
    expect(all.body).not.toMatch(/passwordHash|faceTemplate"|argon2/);
    expect(list.find((e) => e.id === userId)?.faceEnrolled).toBe(true);

    const editors = await h.app.inject({
      method: 'GET',
      url: `/api/v1/employees?jobRoleId=${h.role('editor').id}`,
      headers: bearer(owner),
    });
    expect(editors.json<{ data: { name: string }[] }>().data.map((e) => e.name)).toEqual(['Priya']);
  });

  it('get returns the employee including the Q15 profile fields', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/api/v1/employees/${userId}`,
      headers: bearer(owner),
    });
    expect(EmployeeSchema.parse(res.json<{ data: unknown }>().data)).toMatchObject({
      phone: '+91 98765 43210',
      emergencyContactName: 'Sunita Sharma',
      joiningDate: '2026-10-18',
      deviceMode: 'PERSONAL',
    });
  });

  it('the owner account is not reachable through /employees', async () => {
    const ownerRow = await h.db.user.findFirstOrThrow({ where: { role: 'OWNER' } });
    const res = await h.app.inject({
      method: 'GET',
      url: `/api/v1/employees/${ownerRow.id}`,
      headers: bearer(owner),
    });
    expect(res.statusCode).toBe(404);
  });

  it('owner patches job role, device mode, idle interval and joining date, with an audit trail', async () => {
    const res = await patch({
      jobRoleId: h.role('backend_developer').id,
      deviceMode: 'COMPANY_MACBOOK',
      idleIntervalMin: 45,
      joiningDate: '2026-10-01',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown }>().data).toMatchObject({
      jobRoleId: h.role('backend_developer').id,
      deviceMode: 'COMPANY_MACBOOK',
      idleIntervalMin: 45,
      joiningDate: '2026-10-01',
    });
    const audit = await h.db.auditLog.findFirstOrThrow({ where: { action: 'employee.updated' } });
    expect(audit.meta).toMatchObject({
      changes: {
        deviceMode: { from: 'PERSONAL', to: 'COMPANY_MACBOOK' },
        idleIntervalMin: { from: 20, to: 45 },
      },
    });
  });

  it('idle interval must be 5-120', async () => {
    expect((await patch({ idleIntervalMin: 4 })).statusCode).toBe(400);
    expect((await patch({ idleIntervalMin: 121 })).statusCode).toBe(400);
    expect((await patch({ idleIntervalMin: 5 })).statusCode).toBe(200);
    expect((await patch({ idleIntervalMin: 120 })).statusCode).toBe(200);
  });

  it('an employee cannot change their own device mode', async () => {
    const res = await patch({ deviceMode: 'PERSONAL' }, employeeToken);
    expect(res.statusCode).toBe(403);
    const self = await h.db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(self.deviceMode).toBe('PERSONAL');
    expect(await h.db.auditLog.count({ where: { action: 'employee.updated' } })).toBe(0);
  });

  it('rejects an unknown job role', async () => {
    const res = await patch({ jobRoleId: '00000000-0000-4000-8000-000000000000' });
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('UNKNOWN_JOB_ROLE');
  });

  it('deactivate deletes the face template, revokes tokens and open codes, keeps the row', async () => {
    const rescan = await h.app.inject({
      method: 'POST',
      url: `/api/v1/codes/face-rescan/${userId}`,
      headers: bearer(owner),
    });
    const rescanId = rescan.json<{ data: { id: string } }>().data.id;

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/employees/${userId}/deactivate`,
      headers: bearer(owner),
    });
    expect(res.json<{ data: unknown }>().data).toMatchObject({
      status: 'DEACTIVATED',
      faceEnrolled: false,
    });

    const row = await h.db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row).toMatchObject({
      status: 'DEACTIVATED',
      faceTemplate: null,
      faceModelVersion: null,
    });
    expect(row.deactivatedAt).not.toBeNull();
    expect(await h.db.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);
    expect((await h.db.accessCode.findUniqueOrThrow({ where: { id: rescanId } })).status).toBe(
      'REVOKED',
    );
    expect(await h.db.auditLog.count({ where: { action: 'employee.deactivated' } })).toBe(1);
  });

  it('reactivate lets the employee log in again (face needs a re-scan code)', async () => {
    await h.app.inject({
      method: 'POST',
      url: `/api/v1/employees/${userId}/deactivate`,
      headers: bearer(owner),
    });
    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/employees/${userId}/reactivate`,
      headers: bearer(owner),
    });
    expect(res.json<{ data: unknown }>().data).toMatchObject({
      status: 'ACTIVE',
      faceEnrolled: false,
    });
    await expect(h.login('rahul@example.com', 'Strong-Employee-Pw-42')).resolves.toBeTypeOf(
      'string',
    );
  });

  it('job roles: anyone signed in can list, only the owner can add', async () => {
    const list = await h.app.inject({
      method: 'GET',
      url: '/api/v1/job-roles',
      headers: bearer(employeeToken),
    });
    expect(list.json<{ data: unknown[] }>().data).toHaveLength(6);
    const add = await h.app.inject({
      method: 'POST',
      url: '/api/v1/job-roles',
      headers: bearer(owner),
      payload: { key: 'video_editor', label: 'Video Editor' },
    });
    expect(add.statusCode).toBe(201);
    const dup = await h.app.inject({
      method: 'POST',
      url: '/api/v1/job-roles',
      headers: bearer(owner),
      payload: { key: 'video_editor', label: 'Again' },
    });
    expect(dup.statusCode).toBe(409);
  });
});
