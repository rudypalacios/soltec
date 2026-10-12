import { ADMIN } from '../support/env.ts';
import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';
import { LoginPage } from '../paginas/LoginPage.ts';

test('an active user signs in and reloads the page without losing the session', async ({
  page,
  admin,
}) => {
  const user = await admin.createActiveUser();

  await signIn(page, user.email, user.password);
  await page.reload();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toHaveCount(0);
});

test('a wrong password is refused with the same message as an unknown account', async ({
  page,
}) => {
  const login = new LoginPage(page);
  await login.open();

  await login.submit(ADMIN.email, 'not-the-password-1');
  await expect(login.error).toHaveText('Correo o contraseña incorrectos.');

  await login.submit('nobody@example.test', 'not-the-password-1');
  await expect(login.error).toHaveText('Correo o contraseña incorrectos.');
});
