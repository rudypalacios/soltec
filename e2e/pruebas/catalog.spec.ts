import { ADMIN } from '../support/env.ts';
import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';
import { ParametersPage } from '../paginas/ParametersPage.ts';
import { uniqueSuffix } from '../support/api.ts';

test(
  'an area keeps its groups: it cannot be deactivated while one is active, and a group cannot return under it',
  { tag: '@mobile' },
  async ({ page, isMobile }) => {
    const suffix = uniqueSuffix();
    const area = `E2E área ${suffix}`;
    const group = `E2E grupo ${suffix}`;
    await signIn(page, ADMIN.email, ADMIN.password);
    const catalog = ParametersPage.catalog(page, isMobile);
    await catalog.open();

    await catalog.choose('Áreas');
    await page.getByRole('button', { name: 'Nueva área' }).click();
    const areaDialog = page.getByRole('dialog', { name: 'Nueva área' });
    await areaDialog.getByLabel(/^Nombre/).fill(area);
    await areaDialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(areaDialog).toBeHidden();

    await catalog.choose('Grupos de producto');
    await page.getByRole('button', { name: 'Nuevo grupo de producto' }).click();
    const groupDialog = page.getByRole('dialog', { name: 'Nuevo grupo de producto' });
    await groupDialog.getByLabel(/^Nombre/).fill(group);
    await groupDialog.getByRole('combobox', { name: /Área/ }).click();
    await page.getByRole('option', { name: area, exact: true }).click();
    await groupDialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(groupDialog).toBeHidden();
    await catalog.search(group);
    const groups = catalog.list('Lista de grupos de producto');
    await expect(groups.getByText(group, { exact: true })).toBeVisible();
    await expect(groups.getByText(area, { exact: true })).toBeVisible();

    // The area says why it stays.
    await catalog.choose('Áreas');
    await catalog.search(area);
    await expect(
      catalog.list('Lista de áreas').getByText('1 grupo activo', { exact: true }),
    ).toBeVisible();
    await catalog.act('Desactivar', area);
    await page
      .getByRole('dialog', { name: 'Desactivar valor' })
      .getByRole('button', { name: 'Desactivar' })
      .click();
    await expect(
      page.getByText(
        `No se puede desactivar «${area}»: tiene 1 grupo activo. Desactívalos primero.`,
      ),
    ).toBeVisible();

    // Once the group is inactive the area can go, and then the group cannot come back under it.
    await catalog.choose('Grupos de producto');
    await catalog.search(group);
    await catalog.act('Desactivar', group);
    await page
      .getByRole('dialog', { name: 'Desactivar valor' })
      .getByRole('button', { name: 'Desactivar' })
      .click();
    await expect(page.getByText('No hay grupos de producto con esos filtros.')).toBeVisible();

    await catalog.choose('Áreas');
    await catalog.search(area);
    await catalog.act('Desactivar', area);
    await page
      .getByRole('dialog', { name: 'Desactivar valor' })
      .getByRole('button', { name: 'Desactivar' })
      .click();
    await expect(page.getByText('No hay áreas con esos filtros.')).toBeVisible();

    await catalog.choose('Grupos de producto');
    await catalog.search(group);
    await catalog.filterByStatus('Inactivos');
    await catalog.act('Reactivar', group);
    await page
      .getByRole('dialog', { name: 'Reactivar valor' })
      .getByRole('button', { name: 'Reactivar' })
      .click();
    await expect(
      page.getByText(
        `No se puede reactivar «${group}»: área «${area}» está desactivada. Reactívala primero.`,
      ),
    ).toBeVisible();
  },
);

test(
  'the migration leaves the areas, the unit categories and their units in place',
  { tag: '@mobile' },
  async ({ page, isMobile }) => {
    await signIn(page, ADMIN.email, ADMIN.password);
    const catalog = ParametersPage.catalog(page, isMobile);
    await catalog.open();

    await catalog.choose('Áreas');
    const areas = catalog.list('Lista de áreas');
    for (const name of ['Aire Acondicionado', 'Electricidad', 'Cableado', 'Equipo', 'Otros']) {
      await expect(areas.getByText(name, { exact: true })).toBeVisible();
    }

    await catalog.choose('Categorías de unidad');
    const categories = catalog.list('Lista de categorías de unidad');
    await expect(categories.getByText('Longitud', { exact: true })).toBeVisible();
    await expect(
      categories.getByText('5 unidades activas', { exact: false }).first(),
    ).toBeVisible();

    await catalog.choose('Unidades de medida');
    await catalog.search('Metro cuadrado');
    const units = catalog.list('Lista de unidades de medida');
    await expect(units.getByText('Metro cuadrado', { exact: true })).toBeVisible();
    await expect(units.getByText('Superficie', { exact: true })).toBeVisible();

    // The brands start empty, but other scenarios (a product form creating one) share the database: the list is
    // there, empty or not.
    await catalog.choose('Marcas');
    await expect(
      page.getByLabel('Lista de marcas').or(page.getByText('No hay marcas con esos filtros.')),
    ).toBeVisible();
  },
);

test(
  'whoever edits product groups chooses the area without any access to the areas section',
  { tag: '@mobile' },
  async ({ browser, admin, isMobile }) => {
    const viewport = isMobile ? { width: 390, height: 844 } : undefined;
    // Everything on groups and nothing on areas: the selector must still offer them (ADR-0024).
    const role = await admin.createRole(
      'E2E grupos',
      { product_groups: ['view', 'create', 'edit', 'deactivate'] },
      {},
    );
    const editor = await admin.createActiveUser('e2e-grupos', role.id);
    const group = `E2E grupo ${uniqueSuffix()}`;

    const page = await browser.newPage({ viewport });
    await signIn(page, editor.email, editor.password);
    const catalog = ParametersPage.catalog(page, isMobile);
    await catalog.open();

    await page.getByRole('button', { name: 'Nuevo grupo de producto' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo grupo de producto' });
    await dialog.getByLabel(/^Nombre/).fill(group);
    await dialog.getByRole('combobox', { name: /Área/ }).click();
    // The seeded areas are offered, though this profile cannot even open the section.
    await expect(page.getByRole('option', { name: 'Cableado', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Electricidad', exact: true })).toBeVisible();
    await page.getByRole('option', { name: 'Cableado', exact: true }).click();
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toBeHidden();

    await catalog.search(group);
    const groups = catalog.list('Lista de grupos de producto');
    await expect(groups.getByText(group, { exact: true })).toBeVisible();
    await expect(groups.getByText('Cableado', { exact: true })).toBeVisible();
    // The areas list itself stays closed to this profile: there is no tab for it.
    await expect(page.getByRole('tab', { name: 'Áreas', exact: true })).toHaveCount(0);
  },
);
