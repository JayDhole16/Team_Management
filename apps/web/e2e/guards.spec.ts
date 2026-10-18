import { expect, test } from '@playwright/test';
import { E2E_OWNER, createEmployeeViaApi, loginAs } from './fixtures';

test('an employee cannot open owner pages by URL, and owner content never flashes', async ({
  page,
  request,
}) => {
  const employee = await createEmployeeViaApi(request);

  // Record if an owner-only heading is EVER added to the page, even for a moment.
  await page.addInitScript(() => {
    const w = window as unknown as { __sawOwnerPage?: boolean };
    new MutationObserver(() => {
      for (const h of document.querySelectorAll('h1')) {
        const text = h.textContent?.trim() ?? '';
        if (text === 'Employees' || text === 'Invites and codes' || text.startsWith('Hello, '))
          w.__sawOwnerPage = true;
      }
      if (document.querySelector('a[href="/owner/invites"]')) w.__sawOwnerPage = true;
    }).observe(document, { childList: true, subtree: true });
  });

  await loginAs(page, employee.email, employee.password, '/me');
  for (const path of ['/owner', '/owner/employees', '/owner/invites']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole('heading', { name: 'My Day' })).toBeVisible();
  }
  expect(
    await page.evaluate(() => (window as { __sawOwnerPage?: boolean }).__sawOwnerPage),
  ).toBeUndefined();

  // The server refuses too, not just the UI: an employee token gets 403 on owner routes.
  const login = await request.post('/api/v1/auth/login', { data: employee });
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;
  const owners = await request.get('/api/v1/employees', {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(owners.status()).toBe(403);
  await request.post('/api/v1/auth/logout');
});

test('signed-out visitors are sent to the login page', async ({ page }) => {
  await page.goto('/me');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/owner/employees');
  await expect(page).toHaveURL(/\/login$/);
});

test('the owner is kept out of employee pages', async ({ page }) => {
  await loginAs(page, E2E_OWNER.email, E2E_OWNER.password, '/owner');
  await page.goto('/me');
  await expect(page).toHaveURL(/\/owner$/);
});

test('log out ends the session: a reload stays signed out', async ({ page }) => {
  await loginAs(page, E2E_OWNER.email, E2E_OWNER.password, '/owner');
  await page.goto('/owner/more');
  await page.getByRole('button', { name: 'Log out' }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.reload();
  await page.goto('/owner');
  await expect(page).toHaveURL(/\/login$/);
});
