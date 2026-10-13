import { ADMIN } from '../support/env.ts';
import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';
import { SuppliersPage } from '../paginas/SuppliersPage.ts';
import { uniqueSuffix } from '../support/api.ts';

/** A NIT with a valid check digit (module 11), different on every call so scenarios never collide on it. */
function validNit(): string {
  const body = String(1_000_000 + Math.floor(Math.random() * 8_999_999));
  const sum = [...body].reduce(
    (total, digit, index) => total + Number(digit) * (body.length + 1 - index),
    0,
  );
  const check = (11 - (sum % 11)) % 11;
  return `${body}-${check === 10 ? 'K' : check}`;
}

test(
  'a supplier goes through its whole life: create with a person, refuse a repeated NIT, edit, deactivate, reactivate',
  { tag: '@mobile' },
  async ({ page, isMobile }) => {
    const suffix = uniqueSuffix();
    const name = `E2E proveedor ${suffix}`;
    const nit = validNit();
    await signIn(page, ADMIN.email, ADMIN.password);
    const suppliers = new SuppliersPage(page, isMobile);
    await suppliers.open();

    await page.getByRole('link', { name: 'Nuevo proveedor' }).click();
    await suppliers.fillBasics({ name, nit, creditDays: '30' });
    await suppliers.addContact({
      name: `Ana ${suffix}`,
      jobTitle: 'Ventas',
      email: 'Ana@Example.com',
    });
    await suppliers.save();
    await page.waitForURL((url) => url.pathname === '/proveedores');
    await suppliers.search(name);
    await expect(suppliers.list.getByText(name, { exact: true })).toBeVisible();
    // The code comes from the numbering and the NIT is shown with its hyphen.
    await expect(suppliers.list.getByText(/^PRV-\d{4,}$/)).toBeVisible();
    await expect(suppliers.list.getByText(`NIT ${nit}`)).toBeVisible();

    // The same NIT cannot be registered twice, and the message does not say whose it is.
    await page.getByRole('link', { name: 'Nuevo proveedor' }).click();
    await suppliers.fillBasics({ name: `Otro ${suffix}`, nit: nit.replace('-', '') });
    await suppliers.save();
    await expect(page.getByText(/Consulta con tu jefe directo o con administración/)).toBeVisible();
    await expect(page.getByText(name)).toHaveCount(0);
    await page.getByRole('link', { name: 'Cancelar' }).click();

    await suppliers.search(name);
    await suppliers.act('Editar', name);
    // The person entered before is still there, with the data as typed.
    await expect(page.getByLabel('Correo').last()).toHaveValue('ana@example.com');
    await suppliers.fillBasics({ creditDays: '45' });
    await suppliers.save();
    await page.waitForURL((url) => url.pathname === '/proveedores');
    await suppliers.search(name);
    await expect(suppliers.list.getByText('45 días')).toBeVisible();

    await suppliers.act('Desactivar', name);
    await page
      .getByRole('dialog', { name: 'Desactivar proveedor' })
      .getByRole('button', { name: 'Desactivar' })
      .click();
    await expect(page.getByText('No hay proveedores con esos filtros.')).toBeVisible();

    await suppliers.filterByStatus('Inactivos');
    await expect(suppliers.list.getByText(name, { exact: true })).toBeVisible();
    await suppliers.act('Reactivar', name);
    await page
      .getByRole('dialog', { name: 'Reactivar proveedor' })
      .getByRole('button', { name: 'Reactivar' })
      .click();
    await expect(page.getByText('No hay proveedores con esos filtros.')).toBeVisible();
  },
);

test(
  'someone who can only view suppliers sees them with their people, without any access to contacts or contact types',
  { tag: '@mobile' },
  async ({ browser, admin, isMobile }) => {
    const suffix = uniqueSuffix();
    const name = `E2E solo lectura ${suffix}`;
    await admin.createSupplier({
      name,
      identification_type: 'none',
      contacts: [{ name: `Beto ${suffix}`, job_title: 'Compras' }],
    });
    const role = await admin.createRole('E2E lector de proveedores', { suppliers: ['view'] }, {});
    const reader = await admin.createActiveUser('e2e-lector', role.id);

    const readerPage = await browser.newPage({
      viewport: isMobile ? { width: 390, height: 844 } : undefined,
    });
    await signIn(readerPage, reader.email, reader.password);
    const suppliers = new SuppliersPage(readerPage, isMobile);
    await suppliers.open();
    await suppliers.search(name);
    await expect(suppliers.list.getByText(name, { exact: true })).toBeVisible();

    // No way to create, and the only row action is to look.
    await expect(readerPage.getByRole('link', { name: 'Nuevo proveedor' })).toHaveCount(0);
    await suppliers.act('Ver', name);
    await expect(readerPage.getByLabel(/^Nombre comercial/)).toHaveValue(name);
    await expect(readerPage.getByLabel(/^Nombre comercial/)).toHaveAttribute('readonly', '');
    // The people of the supplier are there whole, and nothing offers to change them.
    await expect(readerPage.locator(`input[value="Beto ${suffix}"]`)).toBeVisible();
    await expect(readerPage.getByLabel('Cargo')).toHaveValue('Compras');
    await expect(readerPage.getByRole('button', { name: 'Guardar' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Agregar contacto' })).toHaveCount(0);

    // The sections they were not given are closed, but the options of the supplier form never needed them.
    await readerPage.goto('/configuracion/parametros');
    await expect(readerPage.getByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
    await readerPage.goto('/proveedores/nuevo');
    await expect(readerPage.getByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
  },
);

test('whoever may edit suppliers picks a contact type without access to its section, and creates one only with its permission', async ({
  browser,
  admin,
}) => {
  const suffix = uniqueSuffix();
  const name = `E2E tipos ${suffix}`;
  const supplier = await admin.createSupplier({
    name,
    identification_type: 'none',
    contacts: [{ name: `Carla ${suffix}` }],
  });
  const editRole = await admin.createRole(
    'E2E editor de proveedores',
    { suppliers: ['view', 'edit'] },
    {},
  );
  const typeRole = await admin.createRole(
    'E2E editor con tipos',
    { suppliers: ['view', 'edit'], contact_types: ['view', 'create'] },
    {},
  );
  const editor = await admin.createActiveUser('e2e-editor', editRole.id);
  const typist = await admin.createActiveUser('e2e-tipos', typeRole.id);

  const editorPage = await browser.newPage();
  await signIn(editorPage, editor.email, editor.password);
  await editorPage.goto(`/proveedores/${supplier.id}/editar`);
  await editorPage.getByRole('combobox', { name: 'Tipo de contacto' }).click();
  // The seeded types are offered although this profile cannot even open the contact types section.
  await expect(editorPage.getByRole('option', { name: 'Compras' })).toBeVisible();
  await editorPage.keyboard.press('Escape');
  await expect(editorPage.getByRole('button', { name: 'Crear tipo de contacto' })).toHaveCount(0);
  await expect(editorPage.getByRole('link', { name: 'Configuración' })).toHaveCount(0);

  const typistPage = await browser.newPage();
  await signIn(typistPage, typist.email, typist.password);
  await typistPage.goto(`/proveedores/${supplier.id}/editar`);
  await typistPage.getByRole('button', { name: 'Crear tipo de contacto' }).click();
  const typeName = `Logística ${suffix}`;
  const dialog = typistPage.getByRole('dialog', { name: 'Nuevo tipo de contacto' });
  await dialog.getByLabel(/^Nombre/).fill(typeName);
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await expect(typistPage.getByRole('combobox', { name: 'Tipo de contacto' })).toHaveText(typeName);
});
