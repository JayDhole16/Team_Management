import { NO_PLAIN_VERSION_MESSAGE } from '@lk/shared';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  E2E_OWNER,
  createEmployeeViaApi,
  expectNoSideScroll,
  loginAs,
  setOllamaDown,
} from './fixtures';

// BUILD_PLAN Phase 6. The fake Ollama (apps/server/src/test/fake-ollama.ts) answers P3 with a
// blocker when the update mentions "waiting"; the second test switches it off.

const UPDATE_FIELD = 'What did you do, what is next, is anything stopping you?';
const PLAIN = 'The login fix is done. Next is the cart page.';
const BLOCKER = 'Waiting for the payment API key from the client.';

/** Owner API: sends a direct task to the employee with this email; returns the employee id. */
async function sendDirectTask(request: APIRequestContext, email: string, title: string) {
  const login = await request.post('/api/v1/auth/login', { data: E2E_OWNER });
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;
  const headers = { authorization: `Bearer ${token}` };
  const list = await request.get('/api/v1/employees', { headers });
  const employees = ((await list.json()) as { data: { id: string; email: string }[] }).data;
  const employee = employees.find((e) => e.email === email);
  expect(employee).toBeDefined();
  const task = await request.post('/api/v1/tasks/direct', {
    headers,
    data: {
      assigneeId: employee?.id,
      textOriginal: 'Login theek karo',
      title,
      descriptionTechnical: 'Fix the login error after a correct password.',
      priority: 'HIGH',
    },
  });
  expect(task.status()).toBe(201);
  await request.post('/api/v1/auth/logout');
  return employee?.id ?? '';
}

/** "Updates (3 unread)" -> 3 */
async function unreadInHeading(page: Page): Promise<number> {
  const heading = page.getByRole('heading', { level: 1, name: /^Updates \(\d+ unread\)$/ });
  await expect(heading).toBeVisible();
  return Number((await heading.textContent())?.match(/\((\d+) unread\)/)?.[1]);
}

test('employee previews and sends an update; the owner reads it in plain words and marks it read', async ({
  page,
  browser,
  request,
}, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now()}`;
  const devName = `Dev ${tag}`;
  const dev = await createEmployeeViaApi(request, { name: devName });
  const taskTitle = `Fix login ${tag}`;
  const employeeId = await sendDirectTask(request, dev.email, taskTitle);
  const technical = `Fixed the JWT refresh race in the auth middleware ${tag}; waiting on the payment API key.`;

  // --- Employee: write, preview, send ---
  const empContext = await browser.newContext({ viewport: page.viewportSize() });
  const emp = await empContext.newPage();
  await loginAs(emp, dev.email, dev.password, '/me');
  await emp.goto('/me/updates');
  await emp.getByLabel(UPDATE_FIELD).fill(technical);
  await emp.getByLabel('Task (optional)').selectOption({ label: taskTitle });
  await emp.getByRole('button', { name: 'Preview plain version' }).click();
  await expect(emp.getByText('What the owner will read')).toBeVisible();
  await expect(emp.getByText(PLAIN)).toBeVisible();
  await expect(emp.getByText(BLOCKER)).toBeVisible();
  await expectNoSideScroll(emp);

  // Editing the text drops the preview: what is sent is always what was previewed.
  await emp.getByLabel(UPDATE_FIELD).fill(`${technical} Also`);
  await expect(emp.getByText('What the owner will read')).toBeHidden();
  await emp.getByLabel(UPDATE_FIELD).fill(technical);
  await emp.getByRole('button', { name: 'Preview plain version' }).click();
  await emp.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(emp.getByText('Update sent to the owner.')).toBeVisible();
  await expect(emp.getByLabel(UPDATE_FIELD)).toHaveValue('');
  const mine = emp.locator('li').filter({ hasText: PLAIN });
  await expect(mine.getByText('Unread')).toBeVisible();

  // --- Owner: plain text first, original hidden, blocker highlighted ---
  await loginAs(page, E2E_OWNER.email, E2E_OWNER.password, '/owner');
  await expect(page.getByTestId('nav-badge').filter({ visible: true })).toBeVisible();
  await page.goto(`/owner/updates?employeeId=${employeeId}`);
  const before = await unreadInHeading(page);
  expect(before).toBeGreaterThanOrEqual(1);
  const card = page.locator('li').filter({ hasText: devName });
  await expect(card.getByText(PLAIN)).toBeVisible();
  await expect(card.getByText(`Task: ${taskTitle}`)).toBeVisible();
  await expect(card.getByText(`Blocker: ${BLOCKER}`)).toBeVisible();
  await expect(card.getByText(technical)).toBeHidden();
  await card.getByText('Show original (technical)').click();
  await expect(card.getByText(technical)).toBeVisible();
  await expectNoSideScroll(page);

  await card.getByRole('button', { name: 'Mark as read' }).click();
  await expect(card.getByText('Read', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Mark as read' })).toBeHidden();
  expect(await unreadInHeading(page)).toBe(before - 1);

  // --- The employee sees that it was read ---
  await emp.reload();
  await expect(
    emp.locator('li').filter({ hasText: PLAIN }).getByText('Read', { exact: true }),
  ).toBeVisible();
  await empContext.close();
});

test('with the AI offline the employee sends the technical text and the owner is told why', async ({
  page,
  browser,
  request,
}, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now()}`;
  const devName = `Offline ${tag}`;
  const dev = await createEmployeeViaApi(request, { name: devName });
  const technical = `Refactored the cart reducer ${tag}`;

  await setOllamaDown(request, true);
  try {
    const empContext = await browser.newContext({ viewport: page.viewportSize() });
    const emp = await empContext.newPage();
    await loginAs(emp, dev.email, dev.password, '/me');
    await emp.goto('/me/updates');
    await expect(emp.getByText('The AI assistant is offline')).toBeVisible();
    await expect(emp.getByRole('button', { name: 'Preview plain version' })).toBeDisabled();
    await emp.getByLabel(UPDATE_FIELD).fill(technical);
    await emp.getByRole('button', { name: 'Send without plain version' }).click();
    await expect(emp.getByText('Update sent to the owner.')).toBeVisible();
    await empContext.close();

    await loginAs(page, E2E_OWNER.email, E2E_OWNER.password, '/owner');
    await page.goto('/owner/updates');
    await page.getByLabel('Employee').selectOption({ label: devName });
    const card = page.locator('li').filter({ hasText: devName });
    await expect(card.getByText(NO_PLAIN_VERSION_MESSAGE)).toBeVisible();
    await expect(card.getByText(technical)).toBeVisible(); // shown directly, no toggle
    await card.getByRole('button', { name: 'Mark as read' }).click();
    await expect(card.getByText('Read', { exact: true })).toBeVisible();
  } finally {
    await setOllamaDown(request, false);
  }
});
