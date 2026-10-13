import { ADMIN } from '../support/env.ts';
import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';
import { ParametersPage } from '../paginas/ParametersPage.ts';
import { uniqueSuffix } from '../support/api.ts';

test(
  'a segment goes through its whole life: create, rename, deactivate, find it among the inactive, reactivate',
  { tag: '@mobile' },
  async ({ page, isMobile }) => {
    const suffix = uniqueSuffix();
    const name = `E2E segmento ${suffix}`;
    const renamed = `${name} renombrado`;
    await signIn(page, ADMIN.email, ADMIN.password);
    const parameters = new ParametersPage(page, isMobile);
    await parameters.open();
    await parameters.choose('Segmentos');
    const list = parameters.list('Lista de segmentos');

    await page.getByRole('button', { name: 'Nuevo segmento' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo segmento' });
    await dialog.getByLabel(/^Nombre/).fill(name);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toBeHidden();
    await parameters.search(name);
    await expect(list.getByText(name, { exact: true })).toBeVisible();

    // The same name cannot be used twice among the active ones.
    await page.getByRole('button', { name: 'Nuevo segmento' }).click();
    await dialog.getByLabel(/^Nombre/).fill(name);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog.getByText('Ya hay un segmento activo con ese nombre.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();

    await parameters.act('Editar', name);
    const edit = page.getByRole('dialog', { name: 'Editar segmento' });
    await edit.getByLabel(/^Nombre/).fill(renamed);
    await edit.getByRole('button', { name: 'Guardar' }).click();
    await expect(edit).toBeHidden();
    await parameters.search(renamed);
    await expect(list.getByText(renamed, { exact: true })).toBeVisible();

    await parameters.act('Desactivar', renamed);
    await page
      .getByRole('dialog', { name: 'Desactivar valor' })
      .getByRole('button', { name: 'Desactivar' })
      .click();
    await expect(page.getByText('No hay segmentos con esos filtros.')).toBeVisible();

    await parameters.filterByStatus('Inactivos');
    await expect(list.getByText(renamed, { exact: true })).toBeVisible();

    await parameters.act('Reactivar', renamed);
    await page
      .getByRole('dialog', { name: 'Reactivar valor' })
      .getByRole('button', { name: 'Reactivar' })
      .click();
    await expect(page.getByText('No hay segmentos con esos filtros.')).toBeVisible();
    await parameters.filterByStatus('Activos');
    await expect(list.getByText(renamed, { exact: true })).toBeVisible();
  },
);

test(
  'the migration leaves the starting values in place and the statuses carry their color',
  { tag: '@mobile' },
  async ({ page, isMobile }) => {
    await signIn(page, ADMIN.email, ADMIN.password);
    const parameters = new ParametersPage(page, isMobile);
    await parameters.open();

    await parameters.choose('Tipos de contacto');
    const contactTypes = parameters.list('Lista de tipos de contacto');
    for (const name of ['Comercial', 'Compras', 'Facturación']) {
      await expect(contactTypes.getByText(name, { exact: true })).toBeVisible();
    }

    await parameters.choose('Estados de cliente');
    const statuses = parameters.list('Lista de estados de cliente');
    await expect(statuses.getByText('Perdido', { exact: true })).toBeVisible();
    await expect(statuses.getByTestId('status-dot')).toHaveCount(6);

    await parameters.choose('Segmentos');
    await expect(
      parameters.list('Lista de segmentos').getByText('Retail', { exact: true }),
    ).toBeVisible();

    await parameters.choose('Regímenes fiscales');
    const regimes = parameters.list('Lista de regímenes fiscales');
    await expect(regimes.getByText('Pequeño contribuyente', { exact: true })).toBeVisible();
    await expect(regimes.getByText('General', { exact: true })).toBeVisible();

    // Payment methods start empty: the list says so instead of showing a blank.
    await parameters.choose('Formas de pago');
    await expect(page.getByText('No hay formas de pago con esos filtros.')).toBeVisible();
  },
);
