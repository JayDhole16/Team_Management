import { ApiErrorSchema, ClaimResponseSchema, CONSENT_VERSION } from '@lk/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { INVALID_CODE_MESSAGE } from '../lib/errors';
import type { DataAccess } from '../repositories';
import { decryptFaceTemplate } from '../services/face-template.service';
import { bearer, createHarness, type Harness } from '../test/helpers';

const GENERIC = { error: { code: 'INVALID_CODE', message: INVALID_CODE_MESSAGE } };

/** Every code failure must be byte-for-byte the same response. */
function expectGeneric(res: { statusCode: number; json: () => unknown }) {
  expect(res.statusCode).toBe(400);
  expect(res.json()).toEqual(GENERIC);
}

describe('POST /register/claim — code lifecycle', () => {
  let h: Harness;
  let owner: string;
  beforeEach(async () => {
    h = await createHarness();
    owner = await h.ownerToken();
  });

  it('a valid code returns a registration token, the owner device mode and the job roles', async () => {
    const { code } = await h.invite(owner, {
      deviceMode: 'COMPANY_MACBOOK',
      presetJobRoleId: h.role('editor').id,
    });
    const res = await h.claim(code);
    expect(res.statusCode).toBe(200);
    const data = ClaimResponseSchema.parse(res.json<{ data: unknown }>().data);
    expect(data.deviceMode).toBe('COMPANY_MACBOOK');
    expect(data.presetJobRoleId).toBe(h.role('editor').id);
    expect(data.jobRoles).toHaveLength(6);
    expect(data.faceEnrollmentRequired).toBe(false);
    expect(new Date(data.expiresAt).getTime() - h.clock.now().getTime()).toBe(30 * 60_000);
  });

  it('accepts lowercase and no dash', async () => {
    const { code } = await h.invite(owner);
    expect((await h.claim(code.toLowerCase().replace('-', ''))).statusCode).toBe(200);
  });

  it('a code is valid at 9:59 and expired at exactly 10:00', async () => {
    const a = await h.invite(owner);
    const b = await h.invite(owner);
    h.clock.advanceMs(10 * 60_000 - 1000);
    expect((await h.claim(a.code)).statusCode).toBe(200);
    h.clock.advanceMs(1000);
    expectGeneric(await h.claim(b.code));
  });

  it('a wrong code gets the generic error', async () => {
    await h.invite(owner);
    expectGeneric(await h.claim('ABCD-EFGH'));
  });

  it('a revoked code gets the generic error', async () => {
    const { id, code } = await h.invite(owner);
    const revoke = await h.app.inject({
      method: 'DELETE',
      url: `/api/v1/codes/${id}`,
      headers: bearer(owner),
    });
    expect(revoke.statusCode).toBe(200);
    expectGeneric(await h.claim(code));
  });

  it('a reused code (second tab) gets the generic error', async () => {
    const { code } = await h.invite(owner);
    expect((await h.claim(code)).statusCode).toBe(200);
    expectGeneric(await h.claim(code));
  });

  it('a used code gets the generic error', async () => {
    const { code } = await h.invite(owner);
    const token = await h.claimToken(code);
    expect((await h.complete(h.completeBody(token))).statusCode).toBe(201);
    expectGeneric(await h.claim(code));
  });

  it('a code of the wrong purpose (password reset) gets the generic error', async () => {
    const { userId } = await h.registerEmployee();
    const reset = await h.app.inject({
      method: 'POST',
      url: `/api/v1/codes/password-reset/${userId}`,
      headers: bearer(owner),
    });
    const resetCode = reset.json<{ data: { code: string } }>().data.code;
    expectGeneric(await h.claim(resetCode));
  });

  it('a malformed body gets the same generic error', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/register/claim',
      payload: { code: 'x'.repeat(100) },
    });
    expectGeneric(res);
  });

  it('invalid JSON or a wrong content type gets the same generic error and counts as a failure', async () => {
    const badJson = await h.app.inject({
      method: 'POST',
      url: '/api/v1/register/claim',
      headers: { 'content-type': 'application/json' },
      payload: '{"code": ',
      remoteAddress: '3.3.3.3',
    });
    expectGeneric(badJson);
    const wrongType = await h.app.inject({
      method: 'POST',
      url: '/api/v1/register/claim',
      headers: { 'content-type': 'text/plain' },
      payload: 'K7M4-Q9XB',
      remoteAddress: '3.3.3.3',
    });
    expectGeneric(wrongType);
    for (let i = 0; i < 3; i++) await h.claim('WRNG-CODE', '3.3.3.3');
    expect((await h.claim('WRNG-CODE', '3.3.3.3')).statusCode).toBe(429);
  });

  it('two parallel claims of one code: exactly one wins', async () => {
    const { code } = await h.invite(owner);
    const results = await Promise.all([h.claim(code, '10.1.1.1'), h.claim(code, '10.1.1.2')]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
  });

  it('writes audit entries for created, claimed and revoked codes', async () => {
    const a = await h.invite(owner);
    await h.claim(a.code);
    const b = await h.invite(owner);
    await h.app.inject({ method: 'DELETE', url: `/api/v1/codes/${b.id}`, headers: bearer(owner) });
    const actions = (await h.db.auditLog.findMany()).map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['access_code.created', 'access_code.claimed', 'access_code.revoked']),
    );
  });
});

describe('POST /register/claim — rate limits', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness({ env: { CLAIM_GLOBAL_FAILURE_CAP: '12' } });
  });

  it('the 6th failed claim from one IP in 15 minutes is blocked, even with a valid code', async () => {
    const owner = await h.ownerToken();
    const { code } = await h.invite(owner);
    for (let i = 0; i < 5; i++) expectGeneric(await h.claim('WRNG-CODE', '9.9.9.9'));
    const blocked = await h.claim(code, '9.9.9.9');
    expect(blocked.statusCode).toBe(429);
    expect(ApiErrorSchema.parse(blocked.json()).error.code).toBe('RATE_LIMITED');

    // Another IP is not affected and can still use the valid code.
    expect((await h.claim(code, '8.8.8.8')).statusCode).toBe(200);
    // After the window the IP may try again.
    h.clock.advanceMinutes(15);
    expectGeneric(await h.claim('WRNG-CODE', '9.9.9.9'));
  });

  it('a successful claim does not reset the counter of the failing IP', async () => {
    const owner = await h.ownerToken();
    for (let i = 0; i < 5; i++) await h.claim('WRNG-CODE', '9.9.9.9');
    const { code } = await h.invite(owner);
    expect((await h.claim(code, '8.8.8.8')).statusCode).toBe(200);
    expect((await h.claim('WRNG-CODE', '9.9.9.9')).statusCode).toBe(429);
  });

  it('hitting the per-IP limit raises one security alert and one aggregated audit row', async () => {
    for (let i = 0; i < 7; i++) await h.claim('WRNG-CODE', '9.9.9.9');
    expect(h.events.alerts.map((a) => a.kind)).toEqual(['CLAIM_IP_BLOCKED']);
    expect(await h.db.auditLog.count({ where: { action: 'access_code.claim_ip_blocked' } })).toBe(
      1,
    );
  });

  it('the global failure cap blocks all IPs and alerts the owner', async () => {
    for (let ip = 1; ip <= 12; ip++) await h.claim('WRNG-CODE', `7.7.7.${ip}`);
    expect(h.events.alerts.map((a) => a.kind)).toContain('CLAIM_FAILURE_CAP');
    expect((await h.claim('WRNG-CODE', '6.6.6.6')).statusCode).toBe(429);
    expect(await h.db.auditLog.count({ where: { action: 'access_code.claim_failure_cap' } })).toBe(
      1,
    );
  });
});

describe('POST /register/complete', () => {
  let h: Harness;
  let owner: string;
  beforeEach(async () => {
    h = await createHarness();
    owner = await h.ownerToken();
  });

  async function claimed(invite: Parameters<Harness['invite']>[1] = {}) {
    const created = await h.invite(owner, invite);
    return { ...created, token: await h.claimToken(created.code) };
  }

  it('creates the employee with the owner-chosen device mode, consent and audit, and notifies the owner', async () => {
    const { id, token } = await claimed({
      deviceMode: 'COMPANY_MACBOOK',
      note: 'Rahul - frontend',
    });
    const res = await h.complete(h.completeBody(token, { email: 'Rahul@Example.COM' }));
    expect(res.statusCode).toBe(201);
    const { userId, deviceMode } = res.json<{ data: { userId: string; deviceMode: string } }>()
      .data;
    expect(deviceMode).toBe('COMPANY_MACBOOK');

    const user = await h.db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({
      email: 'rahul@example.com',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      deviceMode: 'COMPANY_MACBOOK',
      phone: '+91 98765 43210',
      emergencyContactName: 'Sunita Sharma',
      emergencyContactPhone: '+91 91234 56789',
      idleIntervalMin: 20,
      faceTemplate: null,
    });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.joiningDate.toISOString().slice(0, 10)).toBe('2026-10-18');

    const code = await h.db.accessCode.findUniqueOrThrow({ where: { id } });
    expect(code).toMatchObject({ status: 'USED', registeredUserId: userId });
    expect(await h.db.consentRecord.findMany({ where: { userId } })).toEqual([
      expect.objectContaining({ consentVersion: CONSENT_VERSION }),
    ]);
    const actions = (await h.db.auditLog.findMany({ where: { actorUserId: userId } })).map(
      (e) => e.action,
    );
    expect(actions).toEqual(expect.arrayContaining(['access_code.used', 'registration.completed']));
    expect(h.events.registered).toEqual([
      expect.objectContaining({ userId, name: 'Rahul Sharma', deviceMode: 'COMPANY_MACBOOK' }),
    ]);
  });

  it('the employee can log in afterwards', async () => {
    const { accessToken } = await h.registerEmployee();
    const me = await h.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: bearer(accessToken),
    });
    expect(me.json<{ data: { role: string } }>().data.role).toBe('EMPLOYEE');
  });

  it('rejects deviceMode in the body (the employee cannot set it)', async () => {
    const { token } = await claimed({ deviceMode: 'PERSONAL' });
    const res = await h.complete(h.completeBody(token, { deviceMode: 'COMPANY_MACBOOK' }));
    expect(res.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('VALIDATION_ERROR');
    expect(await h.db.user.count({ where: { role: 'EMPLOYEE' } })).toBe(0);
  });

  it('is atomic: a failure after the user insert leaves no user and the code still CLAIMED', async () => {
    const failing = await createHarness({
      data: (real): DataAccess => ({
        repos: real.repos,
        transaction: (fn) =>
          real.transaction((repos) =>
            fn({
              ...repos,
              consent: {
                create: async () => {
                  throw new Error('simulated failure after user insert');
                },
              },
            }),
          ),
      }),
    });
    const ownerToken = await failing.ownerToken();
    const { id, code } = await failing.invite(ownerToken);
    const token = await failing.claimToken(code);

    const res = await failing.complete(failing.completeBody(token));
    expect(res.statusCode).toBe(500);
    expect(await failing.db.user.count({ where: { role: 'EMPLOYEE' } })).toBe(0);
    expect(await failing.db.consentRecord.count()).toBe(0);
    const row = await failing.db.accessCode.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'CLAIMED', registeredUserId: null, usedAt: null });
    expect(failing.events.registered).toHaveLength(0);
  });

  it('a retry after success returns the same result and creates no second user', async () => {
    const { token } = await claimed();
    const body = h.completeBody(token);
    const first = await h.complete(body);
    const second = await h.complete(body);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(await h.db.user.count({ where: { role: 'EMPLOYEE' } })).toBe(1);
    expect(h.events.registered).toHaveLength(1);
  });

  it('two parallel submits create exactly one user', async () => {
    const { token } = await claimed();
    const body = h.completeBody(token);
    const results = await Promise.all([h.complete(body), h.complete(body)]);
    expect(results.every((r) => r.statusCode === 201)).toBe(true);
    expect(await h.db.user.count({ where: { role: 'EMPLOYEE' } })).toBe(1);
  });

  it('the token expires 30 minutes after the claim', async () => {
    const { token } = await claimed();
    h.clock.advanceMinutes(30);
    expectGeneric(await h.complete(h.completeBody(token)));
  });

  it('works at 29 minutes', async () => {
    const { token } = await claimed();
    h.clock.advanceMinutes(29);
    expect((await h.complete(h.completeBody(token))).statusCode).toBe(201);
  });

  it('a made-up token gets the generic error', async () => {
    expectGeneric(await h.complete(h.completeBody('made-up-token')));
  });

  it('a token is bound to its own code: completing with A leaves B untouched', async () => {
    const a = await claimed({ deviceMode: 'PERSONAL' });
    const b = await claimed({ deviceMode: 'COMPANY_MACBOOK' });
    const res = await h.complete(h.completeBody(a.token));
    expect(res.json<{ data: { deviceMode: string } }>().data.deviceMode).toBe('PERSONAL');
    expect((await h.db.accessCode.findUniqueOrThrow({ where: { id: b.id } })).status).toBe(
      'CLAIMED',
    );
  });

  it('a revoked claimed code cannot be completed', async () => {
    const { id, token } = await claimed();
    await h.app.inject({ method: 'DELETE', url: `/api/v1/codes/${id}`, headers: bearer(owner) });
    expectGeneric(await h.complete(h.completeBody(token)));
  });

  it('duplicate email in a different case -> 409 EMAIL_TAKEN, and the code stays usable', async () => {
    await h.registerEmployee({ email: 'rahul@example.com' });
    const { id, token } = await claimed();
    const res = await h.complete(h.completeBody(token, { email: 'RAHUL@example.com' }));
    expect(res.statusCode).toBe(409);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('EMAIL_TAKEN');
    expect((await h.db.accessCode.findUniqueOrThrow({ where: { id } })).status).toBe('CLAIMED');
    // Fixing the email and retrying works.
    expect(
      (await h.complete(h.completeBody(token, { email: 'rahul2@example.com' }))).statusCode,
    ).toBe(201);
  });

  it.each([
    ['weak password', { password: 'password123' }, 'WEAK_PASSWORD'],
    ['short password', { password: 'short' }, 'WEAK_PASSWORD'],
    ['old consent version', { consentVersion: '2000-01-v0' }, 'CONSENT_OUTDATED'],
    ['missing consent', { consentAccepted: undefined }, 'VALIDATION_ERROR'],
    ['unknown job role', { jobRoleId: '00000000-0000-4000-8000-000000000000' }, 'UNKNOWN_JOB_ROLE'],
    ['missing phone', { phone: undefined }, 'VALIDATION_ERROR'],
    ['missing emergency contact', { emergencyContactName: undefined }, 'VALIDATION_ERROR'],
    ['missing emergency phone', { emergencyContactPhone: undefined }, 'VALIDATION_ERROR'],
  ])('rejects %s (%s)', async (_label, override, errorCode) => {
    const { token } = await claimed();
    const res = await h.complete(h.completeBody(token, override));
    expect(res.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe(errorCode);
    expect(await h.db.user.count({ where: { role: 'EMPLOYEE' } })).toBe(0);
  });

  it('a role preset by the owner is locked', async () => {
    const { token } = await claimed({ presetJobRoleId: h.role('editor').id });
    const res = await h.complete(h.completeBody(token, { jobRoleId: h.role('ai_developer').id }));
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('JOB_ROLE_LOCKED');
    const ok = await h.complete(h.completeBody(token, { jobRoleId: h.role('editor').id }));
    expect(ok.statusCode).toBe(201);
  });

  it('stores an optional face template encrypted', async () => {
    const descriptor = Array.from({ length: 128 }, (_, i) => i / 128);
    const { token } = await claimed();
    const res = await h.complete(
      h.completeBody(token, { faceTemplate: { modelVersion: 'test-v1', descriptor } }),
    );
    const { userId } = res.json<{ data: { userId: string } }>().data;
    const user = await h.db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.faceModelVersion).toBe('test-v1');
    expect(user.faceTemplate?.length).toBe(12 + 16 + 128 * 4);
    expect(user.faceEnrolledAt).not.toBeNull();
    const values = decryptFaceTemplate(
      h.env.FACE_ENCRYPTION_KEY,
      userId,
      user.faceTemplate ?? new Uint8Array(),
    );
    expect(values[64]).toBeCloseTo(0.5);
  });

  it('requires the face template when FACE_ENROLLMENT_REQUIRED=true', async () => {
    const strict = await createHarness({ env: { FACE_ENROLLMENT_REQUIRED: 'true' } });
    const ownerToken = await strict.ownerToken();
    const { code } = await strict.invite(ownerToken);
    const token = await strict.claimToken(code);
    const res = await strict.complete(strict.completeBody(token));
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe('FACE_REQUIRED');
  });
});

describe('GET /register/consent', () => {
  it('returns the current consent version and text', async () => {
    const h = await createHarness();
    const res = await h.app.inject({ method: 'GET', url: '/api/v1/register/consent' });
    expect(res.json<{ data: { version: string } }>().data.version).toBe(CONSENT_VERSION);
  });
});
