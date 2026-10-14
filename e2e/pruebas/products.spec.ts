import { ADMIN } from '../support/env.ts';
import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';
import { ProductsPage } from '../paginas/ProductsPage.ts';
import { uniqueSuffix } from '../support/api.ts';

test(
  'a product goes through its whole life: create, see its derived price, edit, review the cost, deactivate, reactivate',
  { tag: '@mobile' },
  async ({ page, admin, isMobile }) => {
    const suffix = uniqueSuffix();
    const name = `E2E producto ${suffix}`;
    const supplier = await admin.createSupplier({
      name: `E2E prov ${suffix}`,
      identification_type: 'none',
    });
    const group = await admin.createProductGroup();
    await signIn(page, ADMIN.email, ADMIN.password);
    const products = new ProductsPage(page, isMobile);
    await products.open();

    await page.getByRole('link', { name: 'Nuevo producto' }).click();
    await products.fillForm({ name, cost: '22.96' });
    await products.chooseSupplier(supplier.name);
    await products.choose(/^Área y grupo/, group.label);
    await products.choose(/^Unidad de medida/, 'Unidad');
    await products.save();
    await page.waitForURL((url) => url.pathname === '/productos');
    await products.search(name);
    await expect(products.list.getByText(name, { exact: true })).toBeVisible();
    // The code comes from the numbering; the price is derived from the cost with the default margin level.
    await expect(products.list.getByText(/^PRD-\d{4,}$/)).toBeVisible();
    await expect(products.list.getByText(/^Q\s?35\.33$/)).toBeVisible();

    await products.act('Editar', name);
    await products.fillForm({ cost: '30' });
    await products.save();
    await page.waitForURL((url) => url.pathname === '/productos');
    await products.search(name);
    if (!isMobile) {
      await expect(products.list.getByText(/^Q\s?30\.00$/)).toBeVisible();
    }
    await expect(products.list.getByText(/^Q\s?46\.16$/)).toBeVisible();

    await products.act('Marcar costo como revisado', name);
    await products.confirm('Marcar costo como revisado', 'Marcar como revisado');
    await expect(page.getByText(`Se marcó el costo de «${name}» como revisado.`)).toBeVisible();

    await products.act('Desactivar', name);
    await products.confirm('Desactivar producto', 'Desactivar');
    await expect(page.getByText('No hay productos con esos filtros.')).toBeVisible();
    await products.filterByStatus('Inactivos');
    await expect(products.list.getByText(name, { exact: true })).toBeVisible();

    await products.act('Reactivar', name);
    await products.confirm('Reactivar producto', 'Reactivar');
    await expect(page.getByText('No hay productos con esos filtros.')).toBeVisible();
    await products.filterByStatus('Activos');
    await expect(products.list.getByText(name, { exact: true })).toBeVisible();
  },
);

test(
  'several products are deactivated and reactivated together from the selection',
  { tag: '@mobile' },
  async ({ page, admin, isMobile }) => {
    const suffix = uniqueSuffix();
    const supplier = await admin.createSupplier({
      name: `E2E bloque ${suffix}`,
      identification_type: 'none',
    });
    const group = await admin.createProductGroup();
    const unitId = await admin.firstUnitId();
    for (const letter of ['a', 'b']) {
      await admin.createProduct({
        name: `E2E lote ${suffix} ${letter}`,
        supplier_id: supplier.id,
        group_id: group.id,
        unit_id: unitId,
        cost: '10',
      });
    }
    await signIn(page, ADMIN.email, ADMIN.password);
    const products = new ProductsPage(page, isMobile);
    await products.open();
    await products.search(`E2E lote ${suffix}`);
    await expect(products.list.getByText(`E2E lote ${suffix} a`, { exact: true })).toBeVisible();

    await (await products.selectRow(`E2E lote ${suffix} a`)).check();
    await (await products.selectRow(`E2E lote ${suffix} b`)).check();
    await expect(page.getByText('2 seleccionados')).toBeVisible();
    await page.getByRole('button', { name: 'Desactivar', exact: true }).click();
    await products.confirm('Desactivar productos', 'Desactivar');
    await expect(page.getByText(/Se desactivaron 2 productos/)).toBeVisible();

    await products.filterByStatus('Inactivos');
    await expect(products.list.getByText(`E2E lote ${suffix} a`, { exact: true })).toBeVisible();
    await (await products.selectRow(`E2E lote ${suffix} a`)).check();
    await (await products.selectRow(`E2E lote ${suffix} b`)).check();
    await page.getByRole('button', { name: 'Reactivar', exact: true }).click();
    await products.confirm('Reactivar productos', 'Reactivar');
    await expect(page.getByText(/Se reactivaron 2 productos/)).toBeVisible();
  },
);

test(
  'a supplier takes its products down with it, they do not return alone, and they are reactivated together',
  { tag: '@mobile' },
  async ({ page, admin, isMobile }) => {
    const suffix = uniqueSuffix();
    const supplier = await admin.createSupplier({
      name: `E2E cascada ${suffix}`,
      identification_type: 'none',
    });
    const group = await admin.createProductGroup();
    const unitId = await admin.firstUnitId();
    const names = [`E2E cascada ${suffix} uno`, `E2E cascada ${suffix} dos`];
    for (const name of names) {
      await admin.createProduct({
        name,
        supplier_id: supplier.id,
        group_id: group.id,
        unit_id: unitId,
        cost: '5',
      });
    }
    await admin.setSupplierActive(supplier.id, false);
    await signIn(page, ADMIN.email, ADMIN.password);
    const products = new ProductsPage(page, isMobile);
    await products.open();
    await products.search(`E2E cascada ${suffix}`);
    await products.filterByStatus('Inactivos');
    await expect(products.list.getByText(names[0] ?? '', { exact: true })).toBeVisible();

    // While the supplier is off, a product cannot come back by itself and the screen says why.
    await products.act('Reactivar', names[0] ?? '');
    await products.confirm('Reactivar producto', 'Reactivar');
    await expect(
      page.getByText(/su proveedor está desactivado\. Reactiva primero al proveedor/),
    ).toBeVisible();

    // The supplier comes back alone, and its products stay where they were.
    await admin.setSupplierActive(supplier.id, true);
    await page.reload();
    await products.search(`E2E cascada ${suffix}`);
    await products.filterByStatus('Inactivos');
    await expect(products.list.getByText(names[0] ?? '', { exact: true })).toBeVisible();

    await products.filterBySupplier(supplier.name);
    await page.getByRole('button', { name: /Reactivar los desactivados por el proveedor/ }).click();
    await page
      .getByRole('dialog', { name: 'Reactivar los productos del proveedor' })
      .getByRole('button', { name: 'Reactivar' })
      .click();
    await expect(page.getByText(/Se reactivaron 2 productos/)).toBeVisible();
  },
);

test(
  'whoever only views products sees them without any access to suppliers, groups or brands',
  { tag: '@mobile' },
  async ({ browser, admin, isMobile }) => {
    const suffix = uniqueSuffix();
    const supplier = await admin.createSupplier({
      name: `E2E lector ${suffix}`,
      identification_type: 'none',
    });
    const group = await admin.createProductGroup();
    const name = `E2E solo ver ${suffix}`;
    await admin.createProduct({
      name,
      supplier_id: supplier.id,
      group_id: group.id,
      unit_id: await admin.firstUnitId(),
      cost: '8',
    });
    const role = await admin.createRole('E2E lector de productos', { products: ['view'] }, {});
    const reader = await admin.createActiveUser('e2e-lector-p', role.id);

    const readerPage = await browser.newPage({
      viewport: isMobile ? { width: 390, height: 844 } : undefined,
    });
    await signIn(readerPage, reader.email, reader.password);
    const products = new ProductsPage(readerPage, isMobile);
    await products.open();
    await products.search(name);
    await expect(products.list.getByText(name, { exact: true })).toBeVisible();

    // Nothing to create, change or select; the filters are filled from lists any internal user may read.
    await expect(readerPage.getByRole('link', { name: 'Nuevo producto' })).toHaveCount(0);
    await expect(readerPage.getByRole('checkbox', { name: /^Seleccionar/ })).toHaveCount(0);
    await products.openFilters();
    await readerPage.getByRole('combobox', { name: 'Área' }).click();
    await expect(readerPage.getByRole('option').nth(1)).toBeVisible();
    await readerPage.keyboard.press('Escape');

    await products.act('Ver', name);
    await expect(readerPage.getByLabel(/^Nombre/)).toHaveValue(name);
    await expect(readerPage.getByLabel(/^Nombre/)).toHaveAttribute('readonly', '');
    await expect(readerPage.getByRole('button', { name: 'Guardar' })).toHaveCount(0);

    await readerPage.goto('/productos/nuevo');
    await expect(readerPage.getByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
    await readerPage.goto('/configuracion/parametros');
    await expect(readerPage.getByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
  },
);

test('whoever edits products creates a brand from the form only with the permission of brands', async ({
  browser,
  admin,
}) => {
  const suffix = uniqueSuffix();
  const supplier = await admin.createSupplier({
    name: `E2E marca ${suffix}`,
    identification_type: 'none',
  });
  const group = await admin.createProductGroup();
  const product = await admin.createProduct({
    name: `E2E editar ${suffix}`,
    supplier_id: supplier.id,
    group_id: group.id,
    unit_id: await admin.firstUnitId(),
    cost: '3',
  });
  const editRole = await admin.createRole(
    'E2E editor de productos',
    { products: ['view', 'edit'] },
    {},
  );
  const brandRole = await admin.createRole(
    'E2E editor con marcas',
    { products: ['view', 'edit'], brands: ['view', 'create'] },
    {},
  );
  const editor = await admin.createActiveUser('e2e-editor-p', editRole.id);
  const brander = await admin.createActiveUser('e2e-marcas-p', brandRole.id);

  const editorPage = await browser.newPage();
  await signIn(editorPage, editor.email, editor.password);
  await editorPage.goto(`/productos/${product.id}/editar`);
  // The group and the unit the product has are there, chosen from lists that need no access to their sections.
  await expect(editorPage.getByRole('combobox', { name: /^Área y grupo/ })).toHaveText(group.label);
  await expect(editorPage.getByRole('button', { name: 'Crear marca' })).toHaveCount(0);
  await expect(editorPage.getByRole('button', { name: 'Crear grupo' })).toHaveCount(0);

  const branderPage = await browser.newPage();
  await signIn(branderPage, brander.email, brander.password);
  await branderPage.goto(`/productos/${product.id}/editar`);
  await branderPage.getByRole('button', { name: 'Crear marca' }).click();
  const brandName = `Marca ${suffix}`;
  const dialog = branderPage.getByRole('dialog', { name: 'Nueva marca' });
  await dialog.getByLabel(/^Nombre/).fill(brandName);
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await expect(branderPage.getByRole('combobox', { name: /^Marca/ })).toHaveText(brandName);
});

test(
  'the list groups by area and group, and prices a product at another margin level',
  { tag: '@mobile' },
  async ({ page, admin, isMobile }) => {
    const suffix = uniqueSuffix();
    const supplier = await admin.createSupplier({
      name: `E2E lista ${suffix}`,
      identification_type: 'none',
    });
    const group = await admin.createProductGroup();
    const unitId = await admin.firstUnitId();
    const name = `E2E lista ${suffix} cable`;
    await admin.createProduct({
      name,
      supplier_id: supplier.id,
      group_id: group.id,
      unit_id: unitId,
      cost: '22.96',
    });
    await signIn(page, ADMIN.email, ADMIN.password);
    const products = new ProductsPage(page, isMobile);
    await products.open();
    await products.search(`E2E lista ${suffix}`);
    await expect(products.list.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText(/^1 resultado/)).toBeVisible();

    await products.openFilters();
    await page.getByRole('checkbox', { name: 'Agrupar por área y grupo' }).check();
    await expect(products.list.getByText(group.label.split(' · ')[0] ?? '').first()).toBeVisible();

    await products.act('Ver con otro margen', name);
    const dialog = page.getByRole('dialog', { name: 'Ver con otro margen' });
    await expect(dialog.getByText(/^Q\s?\d+\.\d{2}$/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Cerrar' }).click();
  },
);
