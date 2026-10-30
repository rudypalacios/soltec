import { ADMIN } from '../support/env.ts';
import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';
import { LoginPage } from '../paginas/LoginPage.ts';
import { UsersPage } from '../paginas/UsersPage.ts';

// The default policy locks the account after 3 failed attempts (security_settings).
const FAILED_ATTEMPTS = 3;

test('an administrator unlocks an account that failed to sign in too many times', async ({
  browser,
  admin,
}) => {
  const user = await admin.createActiveUser('lockout');

  const visitor = await browser.newPage();
  const login = new LoginPage(visitor);
  await login.open();
  for (let attempt = 0; attempt < FAILED_ATTEMPTS; attempt += 1) {
    await login.submit(user.email, 'not-the-password-1');
    await expect(login.error).toBeVisible();
  }
  // Locked: not even the right password gets in, and the message does not say why.
  await login.submit(user.email, user.password);
  await expect(login.error).toHaveText('Correo o contraseña incorrectos.');

  const staff = await browser.newPage();
  await signIn(staff, ADMIN.email, ADMIN.password);
  const users = new UsersPage(staff);
  await users.open();
  await users.search(user.email);
  await expect(users.table.row(new RegExp(user.name))).toContainText('Bloqueado');
  await users.table.choose('Desbloquear', user.name);
  await staff
    .getByRole('dialog', { name: 'Desbloquear usuario' })
    .getByRole('button', { name: 'Desbloquear' })
    .click();
  await expect(staff.getByRole('alert')).toContainText(
    `${user.name} ya puede iniciar sesión de nuevo.`,
  );

  await login.submit(user.email, user.password);
  await visitor.waitForURL((url) => url.pathname === '/');
});
