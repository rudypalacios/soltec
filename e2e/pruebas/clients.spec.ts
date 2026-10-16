import { ADMIN } from '../support/env.ts';
import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';
import { ClientsPage } from '../paginas/ClientsPage.ts';
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
  'a client goes through its whole life: registered as a prospect, refused a repeated NIT, converted, deactivated and reactivated instead of registered again',
  { tag: '@mobile' },
  async ({ page, isMobile }) => {
    const suffix = uniqueSuffix();
    const name = `E2E cliente ${suffix}`;
    const nit = validNit();
    await signIn(page, ADMIN.email, ADMIN.password);
    const clients = new ClientsPage(page, isMobile);
    await clients.open();

    await page.getByRole('link', { name: 'Nuevo prospecto' }).click();
    await clients.fillBasics({ name, nit });
    await clients.save();
    // It lands on the client's own screen, a prospect with the signed-in user as its only adviser.
    await page.waitForURL((url) => /^\/clientes\/[0-9a-f-]{36}$/.test(url.pathname));
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText(/^CLI-\d{4,}$/)).toBeVisible();
    await expect(page.getByText(/Un prospecto tiene un solo asesor/)).toBeVisible();

    // The same NIT cannot be registered twice, and the message does not say whose it is.
    await page.goto('/clientes/nuevo');
    await clients.fillBasics({ name: `Otro ${suffix}`, nit: nit.replace('-', '') });
    await clients.save();
    await expect(page.getByText(/Consulta con tu jefe directo o con administración/)).toBeVisible();
    await expect(page.getByText(name)).toHaveCount(0);

    // Converting asks for the billing profile and nothing changes before the dialog is confirmed.
    await clients.open();
    await clients.search(name);
    await clients.act('Ver', name);
    await page.getByRole('button', { name: 'Convertir en cliente' }).click();
    const dialog = page.getByRole('dialog', { name: 'Convertir en cliente de venta' });
    await expect(dialog.getByRole('button', { name: 'Convertir en cliente' })).toBeDisabled();
    await dialog.getByLabel(/^Nombre fiscal/).fill(`${name}, S. A.`);
    await dialog.getByRole('combobox', { name: /^Régimen fiscal/ }).click();
    await page.getByRole('option').first().click();
    await dialog.getByRole('button', { name: 'Convertir en cliente' }).click();
    await expect(page.getByText(`«${name}» ahora es un cliente de venta.`)).toBeVisible();
    await expect(page.getByText(`${name}, S. A.`)).toBeVisible();

    await page.getByRole('button', { name: 'Desactivar' }).click();
    await page
      .getByRole('dialog', { name: 'Desactivar cliente' })
      .getByRole('button', { name: 'Desactivar' })
      .click();
    await expect(page.getByRole('button', { name: 'Reactivar' })).toBeVisible();

    // A deactivated client keeps its NIT: to register it again the existing one is reactivated.
    await page.goto('/clientes/nuevo');
    await clients.fillBasics({ name: `Otro ${suffix}`, nit });
    await clients.save();
    await expect(page.getByText(/Ese cliente ya está registrado y está inactivo/)).toBeVisible();
    await page.getByRole('button', { name: `Reactivar «${name}»` }).click();
    await page.waitForURL((url) => /\/clientes\/[^/]+\/editar$/.test(url.pathname));
    await expect(page.getByLabel(/^Nombre comercial/)).toHaveValue(name);
  },
);

test(
  'an adviser sees only the clients they work with, and the advisers of a shared customer are administered only by its responsible one',
  { tag: '@mobile' },
  async ({ browser, admin, isMobile }) => {
    const suffix = uniqueSuffix();
    const mine = `E2E propio ${suffix}`;
    const hidden = `E2E ajeno ${suffix}`;
    const shared = `E2E compartido ${suffix}`;
    const role = await admin.createRole(
      'E2E asesor',
      { clients: ['view', 'create', 'edit'], contacts: ['view', 'create', 'edit'] },
      { clients: 'own', contacts: 'own' },
    );
    const adviser = await admin.createActiveUser('e2e-asesor', role.id);

    await admin.createClient({ name: hidden });
    const customer = await admin.createClient({ name: shared });
    const converted = await admin.convertClient(customer.id, customer.version);
    await admin.addClientSeller(converted.id, adviser.id);

    const adviserPage = await browser.newPage({
      viewport: isMobile ? { width: 390, height: 844 } : undefined,
    });
    await signIn(adviserPage, adviser.email, adviser.password);
    const clients = new ClientsPage(adviserPage, isMobile);
    await clients.open();
    await adviserPage.getByRole('link', { name: 'Nuevo prospecto' }).click();
    await clients.fillBasics({ name: mine });
    await clients.save();
    await adviserPage.waitForURL((url) => /^\/clientes\/[0-9a-f-]{36}$/.test(url.pathname));

    await clients.open();
    await clients.search('E2E');
    await expect(clients.list.getByText(mine, { exact: true })).toBeVisible();
    await expect(clients.list.getByText(shared, { exact: true })).toBeVisible();
    // A client of someone else does not exist for this adviser, in the list or by its address.
    await expect(clients.list.getByText(hidden, { exact: true })).toHaveCount(0);

    // The shared customer shows its advisers, but this adviser is not the responsible one and cannot change them.
    await clients.act('Ver', shared);
    await expect(adviserPage.getByRole('heading', { name: shared })).toBeVisible();
    await expect(adviserPage.getByText('Responsable', { exact: true })).toBeVisible();
    await expect(adviserPage.getByRole('button', { name: 'Agregar' })).toHaveCount(0);
    await expect(adviserPage.getByRole('button', { name: 'Reasignar a otro asesor' })).toHaveCount(
      0,
    );
  },
);
