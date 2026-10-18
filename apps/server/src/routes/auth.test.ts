import { ApiErrorSchema, AuthTokenResponseSchema } from '@lk/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { bearer, createHarness, EMPLOYEE_PASSWORD, OWNER, type Harness } from '../test/helpers';

function refreshCookie(res: { cookies: { name: string; value: string; secure?: boolean }[] }) {
  const cookie = res.cookies.find((c) => c.name === 'lk_refresh');
  if (!cookie) throw new Error('no refresh cookie');
  return cookie;
}

describe('auth', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });

  const loginReq = (email: string, password: string, ip = '10.0.0.1') =>
    h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
      remoteAddress: ip,
    });

  it('login returns an access token and sets an httpOnly, SameSite=Strict refresh cookie', async () => {
    const res = await loginReq(OWNER.email.toUpperCase(), OWNER.password);
    expect(res.statusCode).toBe(200);
    const data = AuthTokenResponseSchema.parse(res.json<{ data: unknown }>().data);
    expect(data.user).toMatchObject({ email: OWNER.email, role: 'OWNER' });
    const cookie = res.cookies.find((c) => c.name === 'lk_refresh');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/v1/auth' });
    // The refresh token is only in the cookie, never in the body.
    expect(res.body).not.toContain(cookie?.value);
  });

  it('wrong password and unknown email get the same error', async () => {
    const wrong = await loginReq(OWNER.email, 'Wrong-Password-123');
    const unknown = await loginReq('nobody@test.local', 'Wrong-Password-123');
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json()).toEqual(wrong.json());
    expect(ApiErrorSchema.parse(wrong.json()).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('blocks an IP after 10 failed logins in 15 minutes', async () => {
    // Different emails, so only the per-IP counter (not the per-account one) is reached.
    for (let i = 0; i < 10; i++) {
      const res = await loginReq(`guess${i}@test.local`, 'Wrong-Password-123', '5.5.5.5');
      expect(res.statusCode).toBe(401);
    }
    expect((await loginReq(OWNER.email, OWNER.password, '5.5.5.5')).statusCode).toBe(429);
    expect((await loginReq(OWNER.email, OWNER.password, '5.5.5.6')).statusCode).toBe(200);
  });

  it('locks one account after 10 wrong passwords even from many IPs, and alerts the owner', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await loginReq(OWNER.email, 'Wrong-Password-123', `20.0.0.${i}`)).statusCode).toBe(
        401,
      );
    }
    expect((await loginReq(OWNER.email, OWNER.password, '20.0.1.1')).statusCode).toBe(429);
    expect(h.events.alerts.map((a) => a.kind)).toEqual(['LOGIN_ACCOUNT_LOCKED']);
    expect(await h.db.auditLog.count({ where: { action: 'auth.login_account_locked' } })).toBe(1);
    // Other accounts are unaffected; the lock lifts after 15 minutes.
    h.clock.advanceMinutes(15);
    expect((await loginReq(OWNER.email, OWNER.password, '20.0.1.1')).statusCode).toBe(200);
  });

  it('marks the refresh cookie Secure when the request came over HTTPS', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: OWNER.email, password: OWNER.password },
      // Without TRUST_PROXY the header is ignored, so this stays plain HTTP...
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(refreshCookie(res).secure).toBeFalsy();

    const proxied = await createHarness({ env: { TRUST_PROXY: 'true' } });
    const viaTunnel = await proxied.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: OWNER.email, password: OWNER.password },
      headers: { 'x-forwarded-proto': 'https' },
    });
    // ...behind a trusted proxy reporting HTTPS it is Secure.
    expect(refreshCookie(viaTunnel).secure).toBe(true);
  });

  it('GET /auth/me returns the signed-in user without secrets', async () => {
    const token = await h.ownerToken();
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: bearer(token),
    });
    expect(res.json<{ data: { email: string } }>().data.email).toBe(OWNER.email);
    expect(res.body).not.toMatch(/passwordHash|password_hash|argon2/);
  });

  it('refresh rotates the token: the new one works, the old one is rejected', async () => {
    const login = await loginReq(OWNER.email, OWNER.password);
    const first = refreshCookie(login);
    const refreshed = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { lk_refresh: first.value },
    });
    expect(refreshed.statusCode).toBe(200);
    const second = refreshCookie(refreshed);
    expect(second.value).not.toBe(first.value);

    const reuse = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { lk_refresh: first.value },
    });
    expect(reuse.statusCode).toBe(401);
    // Reusing a revoked token ends all sessions (possible theft), including the new one.
    const afterTheft = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { lk_refresh: second.value },
    });
    expect(afterTheft.statusCode).toBe(401);
    // Both the stolen token and the (now revoked) new one count as reuse.
    expect(new Set(h.events.alerts.map((a) => a.kind))).toEqual(new Set(['REFRESH_TOKEN_REUSE']));
    expect(await h.db.auditLog.count({ where: { action: 'auth.refresh_token_reuse' } })).toBe(2);
  });

  it('refresh without a cookie or after expiry gets 401', async () => {
    expect((await h.app.inject({ method: 'POST', url: '/api/v1/auth/refresh' })).statusCode).toBe(
      401,
    );
    const login = await loginReq(OWNER.email, OWNER.password);
    h.clock.advanceMinutes(31 * 24 * 60);
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { lk_refresh: refreshCookie(login).value },
    });
    expect(res.statusCode).toBe(401);
  });

  it('logout revokes the refresh token and clears the cookie', async () => {
    const login = await loginReq(OWNER.email, OWNER.password);
    const cookie = refreshCookie(login);
    const out = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { lk_refresh: cookie.value },
    });
    expect(out.statusCode).toBe(200);
    expect(refreshCookie(out).value).toBe('');
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { lk_refresh: cookie.value },
    });
    expect(res.statusCode).toBe(401);
  });

  it('a deactivated employee cannot log in, and their existing access token stops working at once', async () => {
    const { userId, email, accessToken, ownerToken } = await h.registerEmployee();
    const deactivate = await h.app.inject({
      method: 'POST',
      url: `/api/v1/employees/${userId}/deactivate`,
      headers: bearer(ownerToken),
    });
    expect(deactivate.statusCode).toBe(200);

    const me = await h.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: bearer(accessToken),
    });
    expect(me.statusCode).toBe(401);
    const login = await loginReq(email, EMPLOYEE_PASSWORD);
    expect(login.statusCode).toBe(403);
    expect(ApiErrorSchema.parse(login.json()).error.code).toBe('ACCOUNT_DEACTIVATED');
  });
});
