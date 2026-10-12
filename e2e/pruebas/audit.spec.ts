import { ADMIN } from '../support/env.ts';
import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';
import { LoginPage } from '../paginas/LoginPage.ts';
import { AuditPage } from '../paginas/AuditPage.ts';

test('the audit log shows the lockout of an account with the name of the record', async ({
  page,
  browser,
  admin,
}) => {
  const user = await admin.createActiveUser('audit');

  const visitor = await browser.newPage();
  const login = new LoginPage(visitor);
  await login.open();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await login.submit(user.email, 'not-the-password-1');
    await expect(login.error).toBeVisible();
  }

  await signIn(page, ADMIN.email, ADMIN.password);
  const audit = new AuditPage(page);
  await audit.open();

  await expect(audit.table.row(new RegExp(`Bloqueo de cuenta.*${user.name}`))).toBeVisible();
});
