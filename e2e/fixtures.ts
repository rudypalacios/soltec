import { test as base } from '@playwright/test';
import { AdminApi } from './support/api.ts';

/** `admin`: a signed-in API session to prepare data. The browser is a separate session of each scenario. */
export const test = base.extend<{ admin: AdminApi }>({
  // Playwright reads the fixtures a function needs from its first parameter, so it must be a destructuring pattern.
  // eslint-disable-next-line no-empty-pattern
  admin: async ({}, use) => {
    await use(await AdminApi.signIn());
  },
});

export { expect } from '@playwright/test';
