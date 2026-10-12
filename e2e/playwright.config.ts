import { defineConfig, devices } from '@playwright/test';
import { API_PORT, WEB_URL, apiEnvironment } from './support/env.ts';

/**
 * The tests run against a server built for the run: an empty MySQL database, the PHP API, the built web app and a
 * mail sink. Nothing here touches `staging`. The web app must be built first (`npm run build` at the root).
 */
export default defineConfig({
  testDir: './pruebas',
  globalSetup: './support/global-setup.ts',
  // The scenarios share one database; each creates the data it needs with a unique name, so they can run together.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: WEB_URL,
    locale: 'es',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      command: 'node support/mail-sink.ts',
      url: 'http://127.0.0.1:8025/messages',
      reuseExistingServer: !process.env.CI,
    },
    {
      // variables_order: the API reads its settings from $_ENV, which php's built-in server leaves empty by default.
      command: `php support/reset-database.php && php -d variables_order=EGPCS -S 127.0.0.1:${API_PORT} -t ../api/public ../api/public/index.php`,
      port: API_PORT,
      env: apiEnvironment(),
      reuseExistingServer: false,
    },
    {
      command:
        'npm run preview --workspace @soltec/web -- --host 127.0.0.1 --port 4173 --strictPort',
      cwd: '..',
      port: 4173,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
