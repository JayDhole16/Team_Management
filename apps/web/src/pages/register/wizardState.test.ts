import { INVALID_CODE_MESSAGE, RegisterCompleteBodySchema, type ClaimResponse } from '@lk/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { validateDetails, validateNewPassword } from './validateDetails';
import {
  EMAIL_TAKEN_MESSAGE,
  buildCompleteBody,
  claimErrorMessage,
  initialWizard,
  wizardReducer,
  type Details,
  type WizardAction,
  type WizardState,
} from './wizardState';

const ROLE = '6f1c2c55-6a55-4c1b-9d55-0d6b0c0a0a10';

const claim: ClaimResponse = {
  registrationToken: 'reg-token',
  expiresAt: '2026-10-18T10:30:00.000Z',
  deviceMode: 'PERSONAL',
  presetJobRoleId: null,
  jobRoles: [{ id: ROLE, key: 'video_editor', label: 'Video editor' }],
  faceEnrollmentRequired: false,
};

const details: Details = {
  name: 'Rahul Sharma',
  email: 'rahul@example.com',
  password: 'Mango-River-Lamp-73',
  passwordConfirm: 'Mango-River-Lamp-73',
  jobRoleId: ROLE,
  phone: '+91 98765 43210',
  emergencyContactName: 'Sunita Sharma',
  emergencyContactPhone: '+91 91234 56789',
  deviceConfirmed: true,
};

const run = (...actions: WizardAction[]) => actions.reduce(wizardReducer, initialWizard);
const atFace = (): WizardState =>
  run(
    { type: 'claimed', claim },
    { type: 'details', details },
    { type: 'consent', version: '2026-10-v2' },
  );

describe('wizardReducer', () => {
  it('goes code -> details -> consent -> face -> done', () => {
    expect(run().step).toBe('code');
    expect(run({ type: 'claimed', claim }).step).toBe('details');
    expect(run({ type: 'claimed', claim }, { type: 'details', details }).step).toBe('consent');
    expect(atFace().step).toBe('face');
    expect(wizardReducer(atFace(), { type: 'registered', deviceMode: 'PERSONAL' }).step).toBe(
      'done',
    );
  });

  it('pre-fills and keeps the role the owner preset', () => {
    const s = run({ type: 'claimed', claim: { ...claim, presetJobRoleId: ROLE } });
    expect(s.details.jobRoleId).toBe(ROLE);
  });

  it('cannot go back to the code step (the code is used up)', () => {
    const s = run({ type: 'claimed', claim });
    expect(wizardReducer(s, { type: 'back' }).step).toBe('details');
    expect(wizardReducer(atFace(), { type: 'back' }).step).toBe('consent');
  });

  it('forgets the password and token once registered', () => {
    const done = wizardReducer(atFace(), { type: 'registered', deviceMode: 'COMPANY_MACBOOK' });
    expect(done.details.password).toBe('');
    expect(done.details.passwordConfirm).toBe('');
    expect(done.claim).toBeNull();
    expect(JSON.stringify(done)).not.toContain(details.password);
    expect(done.registeredDeviceMode).toBe('COMPANY_MACBOOK');
  });

  it('EMAIL_TAKEN returns to the details step with the specific message', () => {
    const s = wizardReducer(atFace(), { type: 'failed', code: 'EMAIL_TAKEN', message: 'x' });
    expect(s.step).toBe('details');
    expect(s.error).toBe(EMAIL_TAKEN_MESSAGE);
    expect(s.details.email).toBe(details.email);
  });

  it('an expired or revoked registration restarts with the generic code message', () => {
    const s = wizardReducer(atFace(), { type: 'failed', code: 'INVALID_CODE', message: 'x' });
    expect(s.step).toBe('code');
    expect(s.error).toBe(INVALID_CODE_MESSAGE);
    expect(s.claim).toBeNull();
    expect(s.details.password).toBe('');
  });

  it('a changed consent text sends the employee back to read it', () => {
    const s = wizardReducer(atFace(), { type: 'failed', code: 'CONSENT_OUTDATED', message: 'x' });
    expect(s.step).toBe('consent');
    expect(s.consentVersion).toBeNull();
  });

  it('a network failure keeps the step so Finish can be pressed again', () => {
    const s = wizardReducer(atFace(), { type: 'failed', code: 'NETWORK_ERROR', message: 'x' });
    expect(s.step).toBe('face');
    expect(s.error).toMatch(/Cannot reach the server/);
  });
});

describe('claimErrorMessage', () => {
  it('shows the same message for every kind of invalid code', () => {
    for (const err of [
      new ApiError(400, 'INVALID_CODE', 'This code is invalid or has expired.'),
      new ApiError(400, 'VALIDATION_ERROR', 'code: too long'),
      new ApiError(500, 'INTERNAL_ERROR', 'boom'),
      new Error('anything'),
    ]) {
      expect(claimErrorMessage(err)).toBe(INVALID_CODE_MESSAGE);
    }
  });

  it('explains rate limiting and network trouble (no hint about the code)', () => {
    expect(claimErrorMessage(new ApiError(429, 'RATE_LIMITED', 'x'))).toMatch(/15 minutes/);
    expect(claimErrorMessage(new ApiError(0, 'NETWORK_ERROR', 'x'))).toMatch(/Cannot reach/);
  });
});

describe('buildCompleteBody', () => {
  it('passes the strict server schema and never includes the device mode', () => {
    const body = buildCompleteBody(atFace());
    expect(RegisterCompleteBodySchema.safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty('deviceMode');
    expect(body).not.toHaveProperty('deviceConfirmed');
    expect(body).not.toHaveProperty('passwordConfirm');
  });
});

describe('validateDetails', () => {
  it('accepts good details', () => {
    expect(validateDetails(details)).toEqual({});
  });

  it('catches each problem', () => {
    const errors = validateDetails({
      ...details,
      name: 'R',
      email: 'not-an-email',
      phone: '12',
      emergencyContactName: '',
      emergencyContactPhone: 'abc',
      jobRoleId: '',
      deviceConfirmed: false,
    });
    expect(Object.keys(errors).sort()).toEqual(
      [
        'deviceConfirmed',
        'email',
        'emergencyContactName',
        'emergencyContactPhone',
        'jobRoleId',
        'name',
        'phone',
      ].sort(),
    );
  });

  it('password rules: mismatch, common, contains the email name', () => {
    expect(
      validateDetails({ ...details, passwordConfirm: 'other-password-1' }).passwordConfirm,
    ).toMatch(/do not match/);
    expect(
      validateDetails({ ...details, password: 'password123', passwordConfirm: 'password123' })
        .password,
    ).toMatch(/too common/);
    expect(
      validateDetails({
        ...details,
        password: 'rahul-is-great-9',
        passwordConfirm: 'rahul-is-great-9',
      }).password,
    ).toMatch(/email name/);
  });

  it('validateNewPassword (forgot password)', () => {
    expect(validateNewPassword('a@b.com', 'short', 'short').password).toMatch(/at least 10/);
    expect(validateNewPassword('a@b.com', 'Mango-River-Lamp-73', 'x').confirm).toMatch(/match/);
    expect(validateNewPassword('a@b.com', 'Mango-River-Lamp-73', 'Mango-River-Lamp-73')).toEqual(
      {},
    );
  });
});
