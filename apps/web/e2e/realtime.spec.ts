import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  E2E_OWNER,
  E2E_WEB_PORT,
  createEmployeeViaApi,
  expectNoSideScroll,
  loginAs,
} from './fixtures';

// BUILD_PLAN Phase 7: a simulated idle event beeps on the owner dashboard with the right name;
// status changes arrive live; alerts stay until acknowledged; the employee gets a task toast.
// The "heartbeats stop -> Offline" path needs the 3-minute auto-close and is covered by the
// server test (live.test.ts) and by `pnpm sim:agent` by hand.

declare global {
  interface Window {
    __beeps: number;
  }
}

/** Replaces Web Audio with a counter: every beep starts two tones. */
async function stubAudio(page: Page) {
  await page.addInitScript(() => {
    window.__beeps = 0;
    class FakeAudioContext {
      state = 'suspended';
      currentTime = 0;
      destination = {};
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      createOscillator() {
        return {
          type: '',
          frequency: { value: 0 },
          connect: (node: unknown) => node,
          start: () => {
            window.__beeps += 1;
          },
          stop: () => undefined,
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
          connect: (node: unknown) => node,
        };
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  });
}

const beeps = (page: Page) => page.evaluate(() => window.__beeps / 2);

/** Plays the employee's desktop agent through the API (like `pnpm sim:agent`). */
async function employeeAgent(api: APIRequestContext, email: string, password: string) {
  const login = await api.post('/api/v1/auth/login', { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;
  const headers = { authorization: `Bearer ${token}` };
  const post = async (url: string, data?: object) => {
    const res = await api.post(url, { headers, data });
    expect(res.ok(), `${url}: ${res.status()}`).toBeTruthy();
  };
  return {
    start: () => post('/api/v1/sessions/start'),
    stop: () => post('/api/v1/sessions/stop'),
    heartbeat: (state = 'ACTIVE') =>
      post('/api/v1/agent/heartbeat', { heartbeats: [{ at: new Date().toISOString(), state }] }),
    idle: (reason: string) =>
      post('/api/v1/agent/idle-event', { at: new Date().toISOString(), reason }),
    logout: () => post('/api/v1/auth/logout'),
  };
}

function liveCard(page: Page, name: string) {
  return page.getByTestId('live-card').filter({ hasText: name });
}

test('idle alert beeps with the name; status is live; the alert stays until acknowledged', async ({
  page,
  playwright,
}, testInfo) => {
  const name = `Live ${testInfo.project.name} ${Date.now() % 100_000}`;
  const employee = await createEmployeeViaApi(page.request, { name });
  const api = await playwright.request.newContext({
    baseURL: `http://localhost:${E2E_WEB_PORT}`,
  });
  const agent = await employeeAgent(api, employee.email, employee.password);

  await stubAudio(page);
  await loginAs(page, E2E_OWNER.email, E2E_OWNER.password, '/owner');
  if (testInfo.project.name === 'phone') {
    await page.getByTestId('tab-bar').getByRole('link', { name: 'Live' }).click();
  } else {
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Live status' })
      .click();
  }
  await expect(page).toHaveURL(/\/owner\/live$/);
  await expect(liveCard(page, name)).toHaveAttribute('data-status', 'OFFLINE');

  // Browsers block sound until a click: "Enable alerts" unlocks it and plays a test beep.
  await page.getByRole('button', { name: 'Enable alerts' }).first().click();
  await expect(page.getByTestId('sound-on')).toBeVisible();
  expect(await beeps(page)).toBe(1);

  // Session + agent heartbeat: Working, with no "Agent not running" warning.
  await agent.start();
  await agent.heartbeat();
  await expect(liveCard(page, name)).toHaveAttribute('data-status', 'WORKING');
  await expect(liveCard(page, name)).not.toContainText('Agent not running');

  // The idle event: beep + toast with the employee's name and reason, live status Idle.
  await agent.idle('NO_FACE');
  const toast = page.getByTestId('toast').filter({ hasText: name });
  await expect(toast).toContainText(`${name}: nobody at the camera`);
  await expect.poll(() => beeps(page)).toBe(2);
  await expect(liveCard(page, name)).toHaveAttribute('data-status', 'IDLE');
  await expectNoSideScroll(page);

  // The alert is in the list and stays there until acknowledged, also after a reload.
  await toast.getByRole('link', { name: 'Open alerts' }).click();
  await expect(page).toHaveURL(/\/owner\/alerts$/);
  const alertCard = page
    .locator('li')
    .filter({ hasText: name })
    .filter({ hasText: 'Nobody at the camera' });
  await expect(alertCard).toBeVisible();
  await page.reload();
  await expect(alertCard).toBeVisible();
  await expectNoSideScroll(page);
  await alertCard.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(alertCard).toHaveCount(0);
  await page.reload();
  await expect(alertCard).toHaveCount(0);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(alertCard).toContainText('Acknowledged');

  // Stop (break) and logout reach the live board without a reload.
  await page.goto('/owner/live');
  await agent.stop();
  await expect(liveCard(page, name)).toHaveAttribute('data-status', 'ON_BREAK');
  await agent.start();
  await expect(liveCard(page, name)).toHaveAttribute('data-status', 'WORKING');
  // No heartbeat in this new session yet: the agent warning shows.
  await expect(liveCard(page, name)).toContainText('Agent not running');
  await agent.logout();
  await expect(liveCard(page, name)).toHaveAttribute('data-status', 'OFFLINE');
  await api.dispose();
});

test('the employee gets a toast for a new task; the owner one for a registration', async ({
  page,
  browser,
  request,
}, testInfo) => {
  // Owner on the Overview: a new registration pops up.
  await loginAs(page, E2E_OWNER.email, E2E_OWNER.password, '/owner');
  const name = `Toast ${testInfo.project.name} ${Date.now() % 100_000}`;
  const employee = await createEmployeeViaApi(request, { name });
  await expect(page.getByTestId('toast').filter({ hasText: name })).toContainText(
    'New employee registered',
  );

  // The employee, signed in elsewhere, gets a toast when the owner sends a task.
  const empContext = await browser.newContext(testInfo.project.use);
  const empPage = await empContext.newPage();
  await loginAs(empPage, employee.email, employee.password, '/me');

  const login = await request.post('/api/v1/auth/login', { data: E2E_OWNER });
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;
  const headers = { authorization: `Bearer ${token}` };
  const list = await request.get('/api/v1/employees', { headers });
  const employees = ((await list.json()) as { data: { id: string; email: string }[] }).data;
  const assigneeId = employees.find((e) => e.email === employee.email)?.id;
  const title = `Toast task ${Date.now() % 100_000}`;
  const task = await request.post('/api/v1/tasks/direct', {
    headers,
    data: {
      assigneeId,
      textOriginal: 'Banner banao',
      title,
      descriptionTechnical: 'Design the festival banner.',
      priority: 'MEDIUM',
    },
  });
  expect(task.status()).toBe(201);
  await request.post('/api/v1/auth/logout');

  const toast = empPage.getByTestId('toast').filter({ hasText: 'New task assigned' });
  await expect(toast).toBeVisible();
  await toast.getByRole('link', { name: 'Open My tasks' }).click();
  await expect(empPage.getByText(title)).toBeVisible();
  await empContext.close();
});
