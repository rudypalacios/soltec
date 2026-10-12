import type { Page } from '@playwright/test';
import { LoginPage } from '../paginas/LoginPage.ts';

/** Signs in through the screen and waits for the home page, which proves the session was accepted. */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  const login = new LoginPage(page);
  await login.open();
  await login.submit(email, password);
  await page.waitForURL((url) => url.pathname === '/');
}
