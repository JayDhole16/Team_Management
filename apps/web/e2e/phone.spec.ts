import { INVALID_CODE_MESSAGE } from '@lk/shared';
import { expect, test, type Page } from '@playwright/test';
import { E2E_OWNER, loginAs } from './fixtures';

// Runs only in the "phone" project (390 px wide, touch).

async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('public pages fit a phone screen', async ({ page }) => {
  for (const path of ['/login', '/register', '/forgot-password']) {
    await page.goto(path);
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expectNoSideScroll(page);
  }
});

test('owner pages work at phone width with the bottom tab bar', async ({ page, browser }) => {
  await loginAs(page, E2E_OWNER.email, E2E_OWNER.password, '/owner');
  const tabs = page.getByTestId('tab-bar');
  await expect(tabs).toBeVisible();
  for (const name of ['Overview', 'Employees', 'Invites', 'More']) {
    await expect(tabs.getByRole('link', { name })).toBeVisible();
  }
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();

  const headings: Record<string, RegExp> = {
    Employees: /^Employees$/,
    Invites: /^Invites and codes$/,
    More: /^More$/,
    Overview: /^Hello, /,
  };
  for (const [name, heading] of Object.entries(headings)) {
    await tabs.getByRole('link', { name }).click();
    // Measure the new page, not the old one or a spinner.
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectNoSideScroll(page);
  }

  // Add new employee works on a phone; the code is big and the buttons easy to tap.
  await tabs.getByRole('link', { name: 'Employees' }).click();
  await page.getByRole('button', { name: 'Add new employee' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add new employee' });
  await dialog.getByRole('radio', { name: /Company MacBook/ }).check();
  await dialog.getByRole('button', { name: 'Generate code' }).click();
  await expect(dialog.getByTestId('access-code')).toBeVisible();
  const codeText = (await dialog.getByTestId('access-code').innerText()).trim();
  for (const name of ['Copy', 'Revoke', 'Done']) {
    const box = await dialog.getByRole('button', { name, exact: true }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await expectNoSideScroll(page);

  // Revoke from the panel works too.
  await dialog.getByRole('button', { name: 'Revoke' }).click();
  await expect(dialog.getByText('Revoked. This code no longer works.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();

  // A revoked code gets the same generic message as a wrong or expired one.
  const visitor = await browser.newPage();
  await visitor.goto('/register');
  await visitor.getByLabel('Access code').fill(codeText);
  await visitor.getByRole('button', { name: 'Continue' }).click();
  await expect(visitor.getByRole('alert')).toHaveText(INVALID_CODE_MESSAGE);
  await visitor.close();
});
