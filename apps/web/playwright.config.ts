import { defineConfig, devices } from '@playwright/test';
import { E2E_API_PORT, E2E_FAKE_OLLAMA_PORT, E2E_OWNER, E2E_WEB_PORT } from './e2e/fixtures';

/**
 * End-to-end tests. Starts its own API (port 4100) on a fresh `<db>_e2e` database and its own
 * Vite server (port 5174), so it never touches your dev data or a running `pnpm dev`.
 * Needs Docker's database running and, once, `pnpm --filter web exec playwright install chromium`.
 */
export default defineConfig({
  testDir: './e2e',
  // One shared database: run test files one after another.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${E2E_WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /phone\.spec\.ts/,
    },
    {
      // The owner dashboard must work on a phone (390 px wide).
      name: 'phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: devices['Pixel 7'].userAgent,
      },
    },
  ],
  webServer: [
    {
      command: 'npx tsx src/test/e2e-server.ts',
      cwd: '../server',
      url: `http://127.0.0.1:${E2E_API_PORT}/api/v1/health`,
      env: {
        E2E_API_PORT: String(E2E_API_PORT),
        E2E_FAKE_OLLAMA_PORT: String(E2E_FAKE_OLLAMA_PORT),
        E2E_OWNER_EMAIL: E2E_OWNER.email,
        E2E_OWNER_PASSWORD: E2E_OWNER.password,
      },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      command: `npx vite --port ${E2E_WEB_PORT} --strictPort`,
      url: `http://localhost:${E2E_WEB_PORT}`,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${E2E_API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
