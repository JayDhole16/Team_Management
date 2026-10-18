import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:secret-pw@localhost:5432/db',
  JWT_SECRET: 'j'.repeat(64),
  REFRESH_TOKEN_SECRET: 'r'.repeat(64),
  CODE_HASH_SECRET: 'c'.repeat(64),
  FACE_ENCRYPTION_KEY: 'ab'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(base);
    expect(env).toMatchObject({
      PORT: 4000,
      HOST: '0.0.0.0',
      NODE_ENV: 'development',
      REGISTRATION_WINDOW_MIN: 30,
      FACE_ENROLLMENT_REQUIRED: false,
      ACCESS_TOKEN_TTL_MIN: 15,
      TRUST_PROXY: false,
      SESSION_AUTOCLOSE_AFTER_SEC: 180,
      SESSION_NO_HEARTBEAT_MAX_HOURS: 12,
    });
  });

  it('coerces numbers and boolean flags', () => {
    const env = parseEnv({ ...base, PORT: '5001', FACE_ENROLLMENT_REQUIRED: 'true' });
    expect(env.PORT).toBe(5001);
    expect(env.FACE_ENROLLMENT_REQUIRED).toBe(true);
  });

  it('names a missing DATABASE_URL', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('rejects short secrets and a malformed face key', () => {
    expect(() => parseEnv({ ...base, CODE_HASH_SECRET: 'short' })).toThrow(/CODE_HASH_SECRET/);
    expect(() => parseEnv({ ...base, FACE_ENCRYPTION_KEY: 'zz'.repeat(32) })).toThrow(
      /FACE_ENCRYPTION_KEY/,
    );
  });

  it('never echoes the value of a bad variable', () => {
    let message = '';
    try {
      parseEnv({ ...base, DATABASE_URL: 'mysql://u:secret-pw@x/db', JWT_SECRET: 'tiny-secret' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('JWT_SECRET');
    expect(message).not.toContain('secret-pw');
    expect(message).not.toContain('tiny-secret');
  });
});
