import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const url = 'postgresql://u:secret-pw@localhost:5432/db';

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv({ DATABASE_URL: url });
    expect(env).toMatchObject({ PORT: 4000, HOST: '0.0.0.0', NODE_ENV: 'development' });
  });

  it('coerces PORT', () => {
    expect(parseEnv({ DATABASE_URL: url, PORT: '5001' }).PORT).toBe(5001);
  });

  it('names a missing DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('never echoes the value of a bad variable', () => {
    let message = '';
    try {
      parseEnv({ DATABASE_URL: 'mysql://u:secret-pw@x/db' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('secret-pw');
  });
});
