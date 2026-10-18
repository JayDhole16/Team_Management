import { ApiErrorSchema } from '@lk/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { decryptFaceTemplate } from '../services/face-template.service';
import { INVALID_CODE_MESSAGE } from '../lib/errors';
import { bearer, createHarness, EMPLOYEE_PASSWORD, type Harness } from '../test/helpers';

const NEW_PASSWORD = 'Brand-New-Secret-77';
const GENERIC = { error: { code: 'INVALID_CODE', message: INVALID_CODE_MESSAGE } };

describe('password reset with an owner-issued code', () => {
  let h: Harness;
  let owner: string;
  let userId: string;
  beforeEach(async () => {
    h = await createHarness();
    const e = await h.registerEmployee();
    owner = e.ownerToken;
    userId = e.userId;
  });

  async function resetCode() {
    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/codes/password-reset/${userId}`,
      headers: bearer(owner),
    });
    expect(res.statusCode).toBe(201);
    return res.json<{ data: { code: string } }>().data.code;
  }

  const complete = (payload: Record<string, string>) =>
    h.app.inject({ method: 'POST', url: '/api/v1/auth/password-reset/complete', payload });

  it('sets the new password, ends existing sessions and uses the code', async () => {
    const code = await resetCode();
    const res = await complete({ email: 'rahul@example.com', code, newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(await h.db.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);
    await expect(h.login('rahul@example.com', EMPLOYEE_PASSWORD)).rejects.toThrow(/401/);
    await expect(h.login('rahul@example.com', NEW_PASSWORD)).resolves.toBeTypeOf('string');
    // Single use.
    expect(
      (
        await complete({ email: 'rahul@example.com', code, newPassword: 'Another-Pass-9988' })
      ).json(),
    ).toEqual(GENERIC);
  });

  it('wrong email, wrong code, expired code all give the same generic error', async () => {
    const code = await resetCode();
    const cases = [
      { email: 'someone@example.com', code, newPassword: NEW_PASSWORD },
      { email: 'rahul@example.com', code: 'ABCD-EFGH', newPassword: NEW_PASSWORD },
    ];
    for (const payload of cases) expect((await complete(payload)).json()).toEqual(GENERIC);
    h.clock.advanceMinutes(10);
    expect(
      (await complete({ email: 'rahul@example.com', code, newPassword: NEW_PASSWORD })).json(),
    ).toEqual(GENERIC);
  });

  it('wrong recovery codes are limited separately from invite claims', async () => {
    const payload = { email: 'rahul@example.com', code: 'ABCD-EFGH', newPassword: NEW_PASSWORD };
    const attempt = () =>
      h.app.inject({
        method: 'POST',
        url: '/api/v1/auth/password-reset/complete',
        payload,
        remoteAddress: '4.4.4.4',
      });
    for (let i = 0; i < 5; i++) expect((await attempt()).json()).toEqual(GENERIC);
    expect((await attempt()).statusCode).toBe(429);
    expect(h.events.alerts.map((a) => a.kind)).toEqual(['RECOVERY_IP_BLOCKED']);
    // The same address can still claim an invite: different counter.
    const { code } = await h.invite(owner);
    expect((await h.claim(code, '4.4.4.4')).statusCode).toBe(200);
  });

  it('a code for one employee cannot reset another', async () => {
    const code = await resetCode();
    await h.registerEmployee({ email: 'priya@example.com' });
    const res = await complete({ email: 'priya@example.com', code, newPassword: NEW_PASSWORD });
    expect(res.json()).toEqual(GENERIC);
  });

  it('rejects a weak new password', async () => {
    const code = await resetCode();
    const res = await complete({ email: 'rahul@example.com', code, newPassword: 'password123' });
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('WEAK_PASSWORD');
  });
});

describe('face re-scan with an owner-issued code', () => {
  let h: Harness;
  let owner: string;
  let userId: string;
  let employeeToken: string;
  const template = {
    modelVersion: 'test-v2',
    descriptor: Array.from({ length: 64 }, (_, i) => i / 64),
  };

  beforeEach(async () => {
    h = await createHarness();
    const e = await h.registerEmployee();
    owner = e.ownerToken;
    userId = e.userId;
    employeeToken = e.accessToken;
  });

  const upload = (code: string) =>
    h.app.inject({
      method: 'POST',
      url: '/api/v1/me/face-template',
      headers: bearer(employeeToken),
      payload: { code, template },
    });

  it('replaces the template (encrypted) and the code is single use', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/codes/face-rescan/${userId}`,
      headers: bearer(owner),
    });
    const { code } = res.json<{ data: { code: string } }>().data;
    expect((await upload(code)).statusCode).toBe(200);

    const user = await h.db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.faceModelVersion).toBe('test-v2');
    const stored = user.faceTemplate ?? new Uint8Array();
    const values = decryptFaceTemplate(h.env.FACE_ENCRYPTION_KEY, userId, stored);
    expect(values[1]).toBeCloseTo(1 / 64);
    // Bound to this user: it does not decrypt as anyone else's template.
    expect(() =>
      decryptFaceTemplate(
        h.env.FACE_ENCRYPTION_KEY,
        '00000000-0000-4000-8000-000000000000',
        stored,
      ),
    ).toThrow();
    expect((await upload(code)).json()).toEqual(GENERIC);
  });

  it('a password-reset code cannot be used for a face re-scan', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/codes/password-reset/${userId}`,
      headers: bearer(owner),
    });
    expect((await upload(res.json<{ data: { code: string } }>().data.code)).json()).toEqual(
      GENERIC,
    );
  });
});
