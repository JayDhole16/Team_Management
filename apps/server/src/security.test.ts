// Passwords, access codes and tokens must never appear in logs or in later responses.
import { describe, expect, it } from 'vitest';
import { bearer, createHarness, EMPLOYEE_PASSWORD, OWNER } from './test/helpers';

describe('no secrets in logs or responses', () => {
  it('a full owner -> invite -> register -> login -> refresh flow leaks nothing', async () => {
    const h = await createHarness({ captureLogs: true });
    const bodies: string[] = [];
    const track = <T extends { body: string }>(res: T) => {
      bodies.push(res.body);
      return res;
    };

    const ownerLogin = track(
      await h.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: OWNER.email, password: OWNER.password },
      }),
    );
    const owner = ownerLogin.json<{ data: { accessToken: string } }>().data.accessToken;
    const invite = await h.invite(owner, { deviceMode: 'COMPANY_MACBOOK' });
    const claim = await h.claim(invite.code);
    const regToken = claim.json<{ data: { registrationToken: string } }>().data.registrationToken;
    track(await h.claim(invite.code)); // reuse attempt
    track(await h.complete(h.completeBody(regToken)));
    const empLogin = track(
      await h.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'rahul@example.com', password: EMPLOYEE_PASSWORD },
      }),
    );
    const refreshValue = empLogin.cookies.find((c) => c.name === 'lk_refresh')?.value ?? '';
    track(
      await h.app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { lk_refresh: refreshValue },
      }),
    );
    track(await h.app.inject({ method: 'GET', url: '/api/v1/codes', headers: bearer(owner) }));
    track(await h.app.inject({ method: 'GET', url: '/api/v1/employees', headers: bearer(owner) }));

    const logText = h.logs.join('\n');
    expect(h.logs.length).toBeGreaterThan(10);
    const secrets = [
      OWNER.password,
      EMPLOYEE_PASSWORD,
      invite.code,
      invite.code.replace('-', ''),
      regToken,
      refreshValue,
      owner,
    ];
    for (const secret of secrets) {
      expect(secret.length).toBeGreaterThan(5);
      expect(logText).not.toContain(secret);
    }

    // After creation, no response repeats the code, and none exposes hashes or templates.
    const later = bodies.join('\n');
    expect(later).not.toContain(invite.code.replace('-', ''));
    expect(later).not.toMatch(
      /passwordHash|codeHash|claimTokenHash|tokenHash|faceTemplate"|\$argon2/,
    );
    expect(later).not.toContain(EMPLOYEE_PASSWORD);
  });
});
