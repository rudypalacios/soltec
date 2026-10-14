import { ADMIN } from '../support/env.ts';
import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';
import { BundlesPage } from '../paginas/BundlesPage.ts';
import { uniqueSuffix, type AdminApi } from '../support/api.ts';

/** Two products to build bundles from, under a supplier and a group of their own. */
async function makeComponents(admin: AdminApi, suffix: string) {
  const supplier = await admin.createSupplier({
    name: `E2E prov paq ${suffix}`,
    identification_type: 'none',
  });
  const group = await admin.createProductGroup();
  const unitId = await admin.firstUnitId();
  const make = (letter: string, cost: string) =>
    admin.createProduct({
      name: `E2E comp ${suffix} ${letter}`,
      supplier_id: supplier.id,
      group_id: group.id,
      unit_id: unitId,
      cost,
    });
  return { group, first: await make('a', '10'), second: await make('b', '5.50') };
}

test(
  'a bundle goes through its whole life: build it from products, see its derived cost and price, find it by a component, edit, deactivate, reactivate',
  { tag: '@mobile' },
  async ({ page, admin, isMobile }) => {
    const suffix = uniqueSuffix();
    const name = `E2E paquete ${suffix}`;
    const { group, first, second } = await makeComponents(admin, suffix);
    await signIn(page, ADMIN.email, ADMIN.password);
    const bundles = new BundlesPage(page, isMobile);
    await bundles.open();

    await page.getByRole('link', { name: 'Nuevo paquete' }).click();
    await bundles.fillForm({ name });
    await bundles.choose(/^Área y grupo/, group.label);
    await bundles.addComponent(first.name);
    await bundles.addComponent(second.name);
    await bundles.setQuantity(0, '2');
    await bundles.setQuantity(1, '3');
    // 2 × 10.00 + 3 × 5.50: a preview while editing; the server decides the figure on saving.
    await expect(page.getByText(/^Q\s?36\.50$/)).toBeVisible();
    await bundles.save();
    await page.waitForURL((url) => url.pathname === '/paquetes');

    await bundles.search(name);
    await expect(bundles.list.getByText(name, { exact: true })).toBeVisible();
    await expect(bundles.list.getByText(/^PAQ-\d{4,}$/)).toBeVisible();
    // The price comes from the summed cost with the default margin level; a phone card shows only the price.
    if (!isMobile) {
      await expect(bundles.list.getByText(/^Q\s?36\.50$/)).toBeVisible();
    }
    await expect(bundles.list.getByText(/^Q\s?56\.16$/)).toBeVisible();

    // Searching by a component finds the bundle and says which one matched.
    await bundles.search(second.name);
    await expect(bundles.list.getByText(name, { exact: true })).toBeVisible();
    await expect(bundles.list.getByText(`Contiene: ${second.name}`)).toBeVisible();

    await bundles.search(name);
    await bundles.act('Editar', name);
    await bundles.setQuantity(0, '3');
    await bundles.save();
    await page.waitForURL((url) => url.pathname === '/paquetes');
    await bundles.search(name);
    await expect(bundles.list.getByText(/^Q\s?71\.55$/)).toBeVisible();

    await bundles.act('Desactivar', name);
    await bundles.confirm('Desactivar paquete', 'Desactivar');
    await expect(page.getByText('No hay paquetes con esos filtros.')).toBeVisible();
    await bundles.filterByStatus('Inactivos');
    await expect(bundles.list.getByText(name, { exact: true })).toBeVisible();
    await expect(bundles.list.getByText('Inactivo', { exact: true })).toBeVisible();

    await bundles.act('Reactivar', name);
    await bundles.confirm('Reactivar paquete', 'Reactivar');
    await expect(page.getByText('No hay paquetes con esos filtros.')).toBeVisible();
    await bundles.filterByStatus('Activos');
    await expect(bundles.list.getByText(name, { exact: true })).toBeVisible();
  },
);

test(
  'several bundles are deactivated and reactivated together after asking, and the tabs move between products and bundles',
  { tag: '@mobile' },
  async ({ page, admin, isMobile }) => {
    const suffix = uniqueSuffix();
    const { group, first } = await makeComponents(admin, suffix);
    for (const letter of ['uno', 'dos']) {
      await admin.createBundle({
        name: `E2E lote paq ${suffix} ${letter}`,
        group_id: group.id,
        items: [{ product_id: first.id, quantity: '1' }],
      });
    }
    await signIn(page, ADMIN.email, ADMIN.password);
    const bundles = new BundlesPage(page, isMobile);
    await bundles.open();
    await bundles.search(`E2E lote paq ${suffix}`);

    for (const letter of ['uno', 'dos']) {
      await (await bundles.selectRow(`E2E lote paq ${suffix} ${letter}`)).check();
    }
    await expect(page.getByText('2 seleccionados')).toBeVisible();
    await page.getByRole('button', { name: 'Desactivar', exact: true }).click();
    await bundles.confirm('Desactivar paquetes', 'Desactivar');
    await expect(page.getByText(/Se desactivaron 2 paquetes/)).toBeVisible();
    await expect(page.getByText('No hay paquetes con esos filtros.')).toBeVisible();

    await bundles.filterByStatus('Inactivos');
    for (const letter of ['uno', 'dos']) {
      await (await bundles.selectRow(`E2E lote paq ${suffix} ${letter}`)).check();
    }
    await page.getByRole('button', { name: 'Reactivar', exact: true }).click();
    await bundles.confirm('Reactivar paquetes', 'Reactivar');
    await expect(page.getByText(/Se reactivaron 2 paquetes/)).toBeVisible();

    const tabs = page.getByRole('tablist', { name: 'Productos y paquetes' });
    await tabs.getByRole('tab', { name: 'Productos' }).click();
    await page.waitForURL((url) => url.pathname === '/productos');
    await tabs.getByRole('tab', { name: 'Paquetes' }).click();
    await page.waitForURL((url) => url.pathname === '/paquetes');
  },
);

test(
  'whoever only views bundles reaches them from the products item of the menu, with no tabs and nothing to change',
  { tag: '@mobile' },
  async ({ browser, admin, isMobile }) => {
    const suffix = uniqueSuffix();
    const { group, first } = await makeComponents(admin, suffix);
    const name = `E2E paquete lector ${suffix}`;
    await admin.createBundle({
      name,
      group_id: group.id,
      items: [{ product_id: first.id, quantity: '2' }],
    });
    const role = await admin.createRole('E2E lector de paquetes', { bundles: ['view'] }, {});
    const reader = await admin.createActiveUser('e2e-lector-q', role.id);

    const readerPage = await browser.newPage({
      viewport: isMobile ? { width: 390, height: 844 } : undefined,
    });
    await signIn(readerPage, reader.email, reader.password);
    if (isMobile) {
      await readerPage.getByRole('button', { name: /menú/i }).click();
    }
    await readerPage
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Productos' })
      .click();
    await readerPage.waitForURL((url) => url.pathname === '/paquetes');

    const bundles = new BundlesPage(readerPage, isMobile);
    await bundles.search(name);
    await expect(bundles.list.getByText(name, { exact: true })).toBeVisible();
    await expect(readerPage.getByRole('tablist')).toHaveCount(0);
    await expect(readerPage.getByRole('link', { name: 'Nuevo paquete' })).toHaveCount(0);
    await expect(readerPage.getByRole('checkbox', { name: /^Seleccionar/ })).toHaveCount(0);

    // Their costs are part of what the section shows, and nothing in it can be saved.
    await bundles.act('Ver', name);
    await expect(readerPage.getByRole('textbox', { name: /^Nombre/ })).toHaveAttribute(
      'readonly',
      '',
    );
    await expect(readerPage.getByRole('button', { name: 'Guardar' })).toHaveCount(0);
    await readerPage.goto('/paquetes/nuevo');
    await expect(readerPage.getByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
    await readerPage.goto('/productos');
    await expect(readerPage.getByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
  },
);
