import { INVALID_CODE_MESSAGE } from '@lk/shared';
import { expect, test } from '@playwright/test';
import { E2E_OWNER, EMPLOYEE_PASSWORD, clockToSec, loginAs, uniqueEmail } from './fixtures';

// BUILD_PLAN Phase 3: owner generates code -> employee registers -> logs in -> timer runs ->
// stop -> resume. Runs on desktop and at phone width.
test('owner invites, employee registers, and the work timer runs', async ({
  page,
  browser,
}, testInfo) => {
  const note = `E2E ${testInfo.project.name} ${Date.now()}`;
  const employeeName = `Test ${testInfo.project.name === 'phone' ? 'Phone' : 'Desktop'} Employee`;
  const employeeEmail = uniqueEmail(testInfo.project.name);

  // --- Owner creates an invite code ---
  await loginAs(page, E2E_OWNER.email, E2E_OWNER.password, '/owner');
  await page
    .getByRole('link', { name: 'Employees', exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Employees' })).toBeVisible();
  await page.getByRole('button', { name: 'Add new employee' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add new employee' });
  await dialog.getByRole('button', { name: 'Generate code' }).click();
  await expect(dialog.getByText('Choose the device type.')).toBeVisible(); // required, no default
  await dialog.getByRole('radio', { name: /Personal laptop/ }).check();
  await dialog.getByLabel('Note (optional)').fill(note);
  await dialog.getByRole('button', { name: 'Generate code' }).click();

  const codeText = (await dialog.getByTestId('access-code').innerText()).trim();
  expect(codeText).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  await expect(dialog.getByText(/Expires in (10:00|09:[0-5]\d)/)).toBeVisible();
  await expect(dialog.getByText(/shown only once/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();

  // The code is shown only once: gone from the page and not in the invites list.
  await expect(page.getByText(codeText)).toHaveCount(0);
  await page.goto('/owner/invites');
  const inviteRow = page.getByRole('listitem').filter({ hasText: note });
  await expect(inviteRow.getByText('Waiting')).toBeVisible();
  await expect(page.getByText(codeText)).toHaveCount(0);

  // --- New employee registers in a separate browser ---
  const empContext = await browser.newContext();
  const emp = await empContext.newPage();
  await emp.goto('/login');
  await emp.getByRole('link', { name: 'Register as employee' }).click();

  await emp.getByLabel('Access code').fill('ABCD-EFGH');
  await emp.getByRole('button', { name: 'Continue' }).click();
  await expect(emp.getByRole('alert')).toHaveText(INVALID_CODE_MESSAGE);

  await emp.getByLabel('Access code').fill(codeText.toLowerCase()); // case-insensitive
  await emp.getByRole('button', { name: 'Continue' }).click();
  await expect(emp.getByRole('heading', { name: 'Your details' })).toBeVisible();
  await expect(emp.getByText('Personal laptop')).toBeVisible(); // read-only, set by the owner
  await emp.getByLabel('Full name').fill(employeeName);
  await emp.getByLabel('Email').fill(employeeEmail);
  await emp.getByLabel('Password', { exact: true }).fill(EMPLOYEE_PASSWORD);
  await emp.getByLabel('Password again').fill(EMPLOYEE_PASSWORD);
  await emp.getByLabel('Job role').selectOption({ index: 1 });
  await emp.getByLabel('Phone', { exact: true }).fill('+91 98765 43210');
  await emp.getByLabel('Emergency contact name').fill('Sunita Sharma');
  await emp.getByLabel('Emergency contact phone').fill('+91 91234 56789');
  await emp.getByLabel('This is my own laptop').check();
  await emp.getByRole('button', { name: 'Continue' }).click();

  await expect(emp.getByRole('heading', { name: 'Consent' })).toBeVisible();
  await expect(emp.getByText(/Profile photo/)).toBeVisible();
  await emp.getByLabel('I have read this and I agree').check();
  await emp.getByRole('button', { name: 'Continue' }).click();

  await expect(emp.getByTestId('face-placeholder')).toBeVisible();
  await emp.getByRole('button', { name: 'Finish registration' }).click();
  await expect(emp.getByText('You are registered.')).toBeVisible();
  await emp.getByRole('link', { name: 'Log in' }).click();

  // --- Employee logs in: the session starts and the timer runs ---
  await emp.getByLabel('Email').fill(employeeEmail);
  await emp.getByLabel('Password', { exact: true }).fill(EMPLOYEE_PASSWORD);
  await emp.getByRole('button', { name: 'Log in' }).click();
  await expect(emp).toHaveURL(/\/me$/);
  const timer = emp.getByTestId('session-timer');
  await expect(timer).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(emp.getByText('Working', { exact: true })).toBeVisible();
  const t1 = clockToSec(await timer.innerText());
  await expect.poll(async () => clockToSec(await timer.innerText())).toBeGreaterThanOrEqual(t1 + 2);

  // Reload keeps the timer (derived from the server's start time, not reset to zero).
  const beforeReload = clockToSec(await timer.innerText());
  await emp.reload();
  await expect(timer).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  expect(clockToSec(await timer.innerText())).toBeGreaterThanOrEqual(beforeReload);

  // Nothing secret is kept in browser storage (the password, or any token).
  const stored = await emp.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  );
  expect(stored).not.toContain(EMPLOYEE_PASSWORD);
  expect(stored).not.toContain('eyJ'); // JWT prefix

  // Stop (break) and Resume.
  await emp.getByRole('button', { name: 'Stop session (break)' }).click();
  await expect(emp.getByText('On break', { exact: true })).toBeVisible();
  await expect(timer).toHaveText('--:--:--');
  await emp.getByRole('button', { name: 'Resume' }).click();
  await expect(emp.getByText('Working', { exact: true })).toBeVisible();
  await expect(timer).toHaveText(/^00:00:\d{2}$/); // a new session starts from zero

  // --- Owner sees the code used and the new employee ---
  await page.goto('/owner/invites');
  await expect(
    page.getByRole('listitem').filter({ hasText: note }).getByText('Used'),
  ).toBeVisible();
  await page.goto('/owner/employees');
  await expect(page.getByText(employeeName).filter({ visible: true })).toBeVisible();

  await empContext.close();
});
