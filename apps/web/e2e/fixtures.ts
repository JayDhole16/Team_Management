import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const E2E_API_PORT = 4100;
export const E2E_WEB_PORT = 5174;

/** Throwaway owner of the `_e2e` database, which is re-created on every run. Not a secret. */
export const E2E_OWNER = {
  email: 'owner.e2e@example.com',
  password: 'Teak-Harbor-Violet-58',
};

export const EMPLOYEE_PASSWORD = 'Mango-River-Lamp-73';

export function uniqueEmail(tag: string): string {
  return `emp.${tag}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Log in through the login page and wait for the role's home page. */
export async function loginAs(page: Page, email: string, password: string, home: '/owner' | '/me') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(new RegExp(`${home}$`));
}

/** "01:02:05" -> 3725 */
export function clockToSec(text: string): number {
  const [h, m, s] = text.trim().split(':').map(Number) as [number, number, number];
  return h * 3600 + m * 60 + s;
}

/** Creates an employee through the API (owner invite -> claim -> complete), for tests that only need an account. */
export async function createEmployeeViaApi(request: APIRequestContext) {
  const login = await request.post('/api/v1/auth/login', { data: E2E_OWNER });
  expect(login.ok()).toBeTruthy();
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;

  const invite = await request.post('/api/v1/codes/invite', {
    headers: { authorization: `Bearer ${token}` },
    data: { deviceMode: 'PERSONAL', note: 'api employee' },
  });
  expect(invite.status()).toBe(201);
  const code = ((await invite.json()) as { data: { code: string } }).data.code;

  const claim = await request.post('/api/v1/register/claim', { data: { code } });
  expect(claim.ok()).toBeTruthy();
  const claimed = (await claim.json()) as {
    data: { registrationToken: string; jobRoles: { id: string }[] };
  };
  const consent = await request.get('/api/v1/register/consent');
  const { version } = ((await consent.json()) as { data: { version: string } }).data;

  const email = uniqueEmail('api');
  const complete = await request.post('/api/v1/register/complete', {
    data: {
      token: claimed.data.registrationToken,
      name: 'Api Employee',
      email,
      password: EMPLOYEE_PASSWORD,
      jobRoleId: claimed.data.jobRoles[0]?.id,
      phone: '+91 98765 43210',
      emergencyContactName: 'Someone Else',
      emergencyContactPhone: '+91 91234 56789',
      consentAccepted: true,
      consentVersion: version,
    },
  });
  expect(complete.status()).toBe(201);
  // Log the owner's API login out again so the refresh token does not linger.
  await request.post('/api/v1/auth/logout');
  return { email, password: EMPLOYEE_PASSWORD };
}
