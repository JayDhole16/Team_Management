import { LLM_UNAVAILABLE_MESSAGE } from '@lk/shared';
import { expect, test, type Page } from '@playwright/test';
import {
  E2E_OWNER,
  createEmployeeViaApi,
  expectNoSideScroll,
  loginAs,
  setOllamaDown,
} from './fixtures';

// BUILD_PLAN Phase 5. The API talks to a fake Ollama with fixed answers
// (apps/server/src/test/fake-ollama.ts), which the second test switches off.

/** The board card of a task, in whichever layout is showing (columns or the phone list). */
function boardCard(page: Page, title: string) {
  return page.getByTestId('board-task').filter({ hasText: title, visible: true });
}

test('brief -> AI tasks -> edit -> assign -> employee completes -> owner sees it completed', async ({
  page,
  browser,
  request,
}, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now()}`;
  const devName = `Dev ${tag}`;
  const dev = await createEmployeeViaApi(request, {
    name: devName,
    roleKey: 'frontend_developer',
  });
  const taskTitle = `Build the cart page ${tag}`;

  // --- Owner: a vague brief gets questions, not tasks ---
  await loginAs(page, E2E_OWNER.email, E2E_OWNER.password, '/owner');
  await page.goto('/owner/projects');
  await page.getByRole('link', { name: 'New project' }).click();
  const brief = page.getByLabel('Describe the project in your own words');
  await brief.fill('Ek website chahiye VAGUE');
  await page.getByRole('button', { name: 'Generate tasks with AI' }).click();
  await expect(page.getByRole('heading', { name: 'The AI needs more details' })).toBeVisible();
  await expect(page.getByText('What should the website sell or show?')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tasks (0)' })).toBeVisible();

  // --- A real brief: the AI suggests tasks; the owner edits, removes and adds ---
  await brief.fill('Mujhe ek online kapdon ki dukaan ki website chahiye, cart aur UPI ke saath.');
  page.once('dialog', (dialog) => void dialog.accept()); // "replace your edits?"
  await page.getByRole('button', { name: 'Generate again' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('Clothing store website');
  await expect(page.getByRole('heading', { name: 'Tasks (3)' })).toBeVisible();
  await expect(page.getByText('Check the role')).toBeVisible(); // the unknown "video_wizard"

  await expectNoSideScroll(page);
  await page.getByLabel('Task title').first().fill(taskTitle);
  await page.getByRole('button', { name: 'Remove task 3' }).click();
  await page.getByRole('button', { name: 'Add a task' }).click();
  await page.getByLabel('Task title').nth(2).fill('Size guide page');
  await page.getByLabel('Task description').nth(2).fill('A static page with the size chart.');
  await page.getByRole('button', { name: 'Save project' }).click();

  await expect(page).toHaveURL(/\/owner\/projects\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Clothing store website' }),
  ).toBeVisible();
  const card = page.locator('section[aria-label="Tasks"] > *').filter({ hasText: taskTitle });
  await expect(card.getByText('Not sent yet')).toBeVisible();
  await expectNoSideScroll(page);

  // --- Assign: the role filter starts at the task's role ---
  await card.getByRole('button', { name: 'Assign' }).click();
  const dialog = page.getByRole('dialog', { name: 'Assign task' });
  await expect(dialog.getByLabel('Role').locator('option:checked')).toHaveText(
    'Frontend Developer',
  );
  await dialog.getByLabel('Search by name').fill(tag);
  await dialog.getByRole('radio', { name: new RegExp(devName) }).check();
  await dialog.getByRole('button', { name: 'Send with project summary' }).click();
  await expect(dialog).toBeHidden();
  await expect(card.getByText('Pending')).toBeVisible();
  await expect(card.getByText(devName)).toBeVisible();

  // --- Employee: sees the task with the project summary, starts and completes it ---
  const empContext = await browser.newContext({ viewport: page.viewportSize() });
  const emp = await empContext.newPage();
  await loginAs(emp, dev.email, dev.password, '/me');
  await expect(emp.getByRole('heading', { name: 'Next task' })).toBeVisible();
  await expect(emp.getByText(taskTitle)).toBeVisible();
  await emp.goto('/me/tasks');
  const myCard = emp.getByRole('tabpanel').getByRole('listitem').filter({ hasText: taskTitle });
  await expect(myCard.getByText('Project: Clothing store website')).toBeVisible();
  await expect(myCard.getByText(/online clothing store with a product list/)).toBeVisible();
  await expectNoSideScroll(emp);
  await myCard.getByRole('button', { name: 'Start' }).click();
  await emp.getByRole('tab', { name: /In progress/ }).click();
  await myCard.getByRole('button', { name: 'Complete' }).click();
  await emp.getByRole('tab', { name: /Completed/ }).click();
  await expect(myCard.getByRole('button', { name: 'Reopen' })).toBeVisible();
  await empContext.close();

  // --- Owner: the board shows it under Completed ---
  await page.goto('/owner/tasks');
  await page.getByLabel('Employee').selectOption({ label: devName });
  await expectNoSideScroll(page);
  if (testInfo.project.name === 'phone') {
    await page.getByLabel('Show').selectOption({ label: 'Completed (1)' });
    await expect(boardCard(page, taskTitle).getByText('Completed', { exact: true })).toBeVisible();
  } else {
    const column = page.getByRole('region', { name: 'Completed' });
    await expect(column.getByTestId('board-task').filter({ hasText: taskTitle })).toBeVisible();
  }
});

test('with Ollama stopped, the owner writes a project and a direct task by hand', async ({
  page,
  browser,
  request,
}, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now()}`;
  const devName = `Manual ${tag}`;
  const dev = await createEmployeeViaApi(request, {
    name: devName,
    roleKey: 'frontend_developer',
  });
  const projectTask = `Fix the footer links ${tag}`;
  const directTask = `Update the contact number ${tag}`;

  await setOllamaDown(request, true);
  try {
    // --- Project typed by hand ---
    await loginAs(page, E2E_OWNER.email, E2E_OWNER.password, '/owner');
    await page.goto('/owner/projects/new');
    await page
      .getByLabel('Describe the project in your own words')
      .fill('Website ke footer theek karo');
    await page.getByRole('button', { name: 'Generate tasks with AI' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: LLM_UNAVAILABLE_MESSAGE }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Write it by hand' }).click();
    await page.getByLabel('Project name').fill(`Footer fixes ${tag}`);
    await page.getByLabel('Summary for employees').fill('Small fixes in the website footer.');
    await page.getByLabel('Task title').fill(projectTask);
    await page.getByLabel('Task description').fill('Three links in the footer go to 404 pages.');
    await page.getByRole('button', { name: 'Save project' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: `Footer fixes ${tag}` }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Assign' }).click();
    const assign = page.getByRole('dialog', { name: 'Assign task' });
    await assign.getByLabel('Role').selectOption({ label: 'All roles' });
    await assign.getByLabel('Search by name').fill(tag);
    await assign.getByRole('radio', { name: new RegExp(devName) }).check();
    await assign.getByRole('button', { name: 'Send with project summary' }).click();
    await expect(assign).toBeHidden();

    // --- Direct task typed by hand ---
    await page.goto('/owner/tasks');
    await page.getByRole('button', { name: 'Direct task' }).click();
    const direct = page.getByRole('dialog', { name: 'Direct task' });
    await direct.getByLabel('Employee').selectOption({ label: `${devName} (Frontend Developer)` });
    await direct
      .getByLabel('What needs to be done? (plain words)')
      .fill('Contact page pe naya number daalo');
    await direct.getByRole('button', { name: 'Make technical version' }).click();
    await expect(direct.getByRole('alert')).toContainText('not available');
    await direct.getByRole('button', { name: 'Write it myself' }).click();
    await direct.getByLabel('Task title').fill(directTask);
    await direct.getByLabel('Task description').fill('Replace the phone number on /contact.');
    await direct.getByRole('button', { name: 'Send task' }).click();
    await expect(direct).toBeHidden();
    await page.getByLabel('Employee').selectOption({ label: devName });
    await expect(boardCard(page, directTask)).toBeVisible();

    // --- The employee gets both ---
    const empContext = await browser.newContext({ viewport: page.viewportSize() });
    const emp = await empContext.newPage();
    await loginAs(emp, dev.email, dev.password, '/me');
    await emp.goto('/me/tasks');
    await expect(emp.getByRole('tab', { name: 'Pending (2)' })).toBeVisible();
    await expect(emp.getByText(projectTask)).toBeVisible();
    await expect(emp.getByText(directTask)).toBeVisible();
    await expect(emp.getByText('Direct task from the owner')).toBeVisible();
    await empContext.close();
  } finally {
    await setOllamaDown(request, false);
  }
});
