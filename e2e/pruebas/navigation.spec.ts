import { ADMIN } from '../support/env.ts';
import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';

test(
  'the menu is grouped, remembers what was folded and finds a screen by its name',
  { tag: '@mobile' },
  async ({ page, isMobile }) => {
    await signIn(page, ADMIN.email, ADMIN.password);
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    const openMenu = async () => {
      if (isMobile) {
        await page.getByRole('button', { name: 'Abrir el menú' }).click();
      }
    };
    const group = (name: string) => nav.getByRole('button', { name, exact: true });

    // Every group starts open, each with its screens.
    await openMenu();
    await expect(group('Administración')).toHaveAttribute('aria-expanded', 'true');
    await expect(nav.getByRole('link', { name: 'Usuarios' })).toBeVisible();

    // Folding one hides its screens and is still so after reloading the page.
    await group('Administración').click();
    await expect(nav.getByRole('link', { name: 'Usuarios' })).toBeHidden();
    await page.reload();
    await openMenu();
    await expect(group('Administración')).toHaveAttribute('aria-expanded', 'false');

    // A screen is found by part of its name, with the keyboard on a desktop and from the menu on a phone.
    if (isMobile) {
      await nav.getByRole('button', { name: 'Buscar pantalla' }).click();
    } else {
      await page.keyboard.press('Control+k');
    }
    const dialog = page.getByRole('dialog', { name: 'Buscar pantalla' });
    await dialog.getByRole('combobox', { name: 'Buscar pantalla' }).fill('flujos');
    await expect(dialog.getByRole('option', { name: /Flujos de estado/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/configuracion\/flujos$/);

    // The group of the screen the person is on cannot stay folded, and the top bar says where they are.
    if (!isMobile) {
      await expect(page.getByLabel('Ruta')).toHaveText('Administración › Configuración');
    }
    await openMenu();
    await expect(group('Administración')).toHaveAttribute('aria-expanded', 'true');
    await expect(nav.getByRole('link', { name: 'Configuración' })).toBeVisible();
  },
);
