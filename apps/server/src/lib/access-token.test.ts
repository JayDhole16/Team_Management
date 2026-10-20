import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from './access-token';

const SECRET = 'x'.repeat(48);
const now = new Date('2026-10-18T05:00:00Z');

describe('access tokens', () => {
  it('round-trips subject and role', async () => {
    const { token, expiresAt } = await signAccessToken(
      { sub: 'u1', role: 'EMPLOYEE' },
      SECRET,
      now,
      15,
    );
    expect(expiresAt.toISOString()).toBe('2026-10-18T05:15:00.000Z');
    expect(await verifyAccessToken(token, SECRET, now)).toEqual({
      sub: 'u1',
      role: 'EMPLOYEE',
      expiresAt,
    });
  });

  it('rejects an expired token', async () => {
    const { token } = await signAccessToken({ sub: 'u1', role: 'OWNER' }, SECRET, now, 15);
    expect(
      await verifyAccessToken(token, SECRET, new Date(now.getTime() + 16 * 60_000)),
    ).toBeNull();
  });

  it('rejects a token signed with another secret', async () => {
    const { token } = await signAccessToken({ sub: 'u1', role: 'OWNER' }, 'y'.repeat(48), now, 15);
    expect(await verifyAccessToken(token, SECRET, now)).toBeNull();
  });

  it('rejects a token whose role was edited', async () => {
    const { token } = await signAccessToken({ sub: 'u1', role: 'EMPLOYEE' }, SECRET, now, 15);
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: 'u1', role: 'OWNER', iss: 'lk-workforce' }),
    ).toString('base64url');
    expect(await verifyAccessToken(`${header}.${forged}.${signature}`, SECRET, now)).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await verifyAccessToken('not-a-jwt', SECRET, now)).toBeNull();
  });
});
