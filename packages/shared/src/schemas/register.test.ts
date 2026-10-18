import { describe, expect, it } from 'vitest';
import { CodeInputSchema, formatCode, normalizeCode } from './codes';
import { CONSENT_VERSION } from './consent';
import { EmployeePatchBodySchema } from './employees';
import { RegisterCompleteBodySchema } from './register';

const valid = {
  token: 'tok',
  name: 'Rahul Sharma',
  email: 'Rahul@Example.com',
  password: 'Mango-River-Lamp-73',
  jobRoleId: '7b0f1c9e-2a8d-4c3e-9f1a-1b2c3d4e5f60',
  phone: '+91 98765 43210',
  emergencyContactName: 'Sunita Sharma',
  emergencyContactPhone: '9123456789',
  consentAccepted: true,
  consentVersion: CONSENT_VERSION,
};

describe('access code input', () => {
  it('is case-insensitive and ignores dashes and spaces', () => {
    expect(normalizeCode('k7m4-q9xb')).toBe('K7M4Q9XB');
    expect(CodeInputSchema.parse(' k7m4 q9xb ')).toBe('K7M4Q9XB');
  });

  it('formats as XXXX-XXXX', () => {
    expect(formatCode('K7M4Q9XB')).toBe('K7M4-Q9XB');
  });
});

describe('RegisterCompleteBodySchema', () => {
  it('accepts a full body and lowercases the email', () => {
    expect(RegisterCompleteBodySchema.parse(valid).email).toBe('rahul@example.com');
  });

  it('rejects deviceMode: the employee can never set it', () => {
    const result = RegisterCompleteBodySchema.safeParse({ ...valid, deviceMode: 'PERSONAL' });
    expect(result.success).toBe(false);
  });

  it('rejects any other unknown field (e.g. role)', () => {
    expect(RegisterCompleteBodySchema.safeParse({ ...valid, role: 'OWNER' }).success).toBe(false);
  });

  it.each(['phone', 'emergencyContactName', 'emergencyContactPhone'])('requires %s', (field) => {
    const body = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== field));
    expect(RegisterCompleteBodySchema.safeParse(body).success).toBe(false);
  });

  it('requires consent to be accepted', () => {
    expect(RegisterCompleteBodySchema.safeParse({ ...valid, consentAccepted: false }).success).toBe(
      false,
    );
  });

  it('rejects a bad phone number', () => {
    expect(RegisterCompleteBodySchema.safeParse({ ...valid, phone: 'call me' }).success).toBe(
      false,
    );
  });

  it('enforces name length 2-80', () => {
    expect(RegisterCompleteBodySchema.safeParse({ ...valid, name: 'R' }).success).toBe(false);
    expect(RegisterCompleteBodySchema.safeParse({ ...valid, name: 'R'.repeat(81) }).success).toBe(
      false,
    );
  });
});

describe('EmployeePatchBodySchema', () => {
  it('limits the idle interval to 5-120 minutes', () => {
    expect(EmployeePatchBodySchema.safeParse({ idleIntervalMin: 5 }).success).toBe(true);
    expect(EmployeePatchBodySchema.safeParse({ idleIntervalMin: 120 }).success).toBe(true);
    expect(EmployeePatchBodySchema.safeParse({ idleIntervalMin: 4 }).success).toBe(false);
    expect(EmployeePatchBodySchema.safeParse({ idleIntervalMin: 121 }).success).toBe(false);
  });

  it('rejects an empty patch and unknown fields', () => {
    expect(EmployeePatchBodySchema.safeParse({}).success).toBe(false);
    expect(EmployeePatchBodySchema.safeParse({ role: 'OWNER' }).success).toBe(false);
  });
});
