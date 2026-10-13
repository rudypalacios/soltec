import { test as base } from '@playwright/test';
import { AdminApi } from './support/api.ts';

/**
 * `admin`: a signed-in API session to prepare data. The browser is a separate session of each scenario.
 *
 * `page` also reports what the API answered with an error and the requests that never completed, in the log of the
 * run. A scenario that fails in CI says what the server did, which the screenshot of a timeout does not. Errors that
 * a scenario provokes on purpose (a 409, a 422) show up too: they are the expected ones in that log.
 */
export const test = base.extend<{ admin: AdminApi }>({
  // Playwright reads the fixtures a function needs from its first parameter, so it must be a destructuring pattern.
  // eslint-disable-next-line no-empty-pattern
  admin: async ({}, use) => {
    await use(await AdminApi.signIn());
  },
  page: async ({ page, context }, use, testInfo) => {
    // E2E_CPU_THROTTLE=6 slows the browser down six times, to reproduce locally what a slow CI runner does to the
    // timing of a scenario (a tab that has not changed yet when the next step already types).
    const throttle = Number(process.env.E2E_CPU_THROTTLE ?? 1);
    if (throttle > 1) {
      const session = await context.newCDPSession(page);
      await session.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    }
    const lines: string[] = [];
    const note = (line: string) => lines.push(`${new Date().toISOString().slice(11, 23)} ${line}`);
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/') && response.status() >= 400) {
        note(`${response.status()} ${response.request().method()} ${url.pathname}${url.search}`);
      }
    });
    page.on('requestfailed', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        note(
          `FAILED ${request.method()} ${url.pathname}${url.search} (${request.failure()?.errorText ?? '?'})`,
        );
      }
    });
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus && lines.length > 0) {
      console.log(`[api-errors] ${testInfo.title}\n${lines.join('\n')}`);
    }
  },
});

export { expect } from '@playwright/test';
