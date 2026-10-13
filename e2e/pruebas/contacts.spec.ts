import { ADMIN } from '../support/env.ts';
import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';
import { ContactsPage } from '../paginas/ContactsPage.ts';
import { uniqueSuffix } from '../support/api.ts';

test(
  'a contact goes through its whole life: create, edit, deactivate, find it among the inactive, reactivate',
  { tag: '@mobile' },
  async ({ page, isMobile }) => {
    const name = `E2E contacto ${uniqueSuffix()}`;
    await signIn(page, ADMIN.email, ADMIN.password);
    const contacts = new ContactsPage(page, isMobile);
    await contacts.open();

    await page.getByRole('link', { name: 'Nuevo contacto' }).click();
    await contacts.fillForm({ name, phone: '2222-3333', email: 'Contacto@Example.com' });
    await contacts.save();
    await page.waitForURL((url) => url.pathname === '/contactos');
    await contacts.search(name);
    // The code comes from the numbering and the email is kept in lower case.
    await expect(contacts.list.getByText(/^CON-\d{4,}$/)).toBeVisible();
    await expect(contacts.list.getByText('contacto@example.com')).toBeVisible();

    await contacts.act('Editar', name);
    await contacts.fillForm({ phone: '5555-6666' });
    await contacts.save();
    await page.waitForURL((url) => url.pathname === '/contactos');
    await contacts.search(name);
    await expect(contacts.list.getByText('5555-6666')).toBeVisible();

    await contacts.act('Desactivar', name);
    await page
      .getByRole('dialog', { name: 'Desactivar contacto' })
      .getByRole('button', { name: 'Desactivar' })
      .click();
    await expect(page.getByText('No hay contactos con esos filtros.')).toBeVisible();

    await contacts.filterByStatus('Inactivos');
    await expect(contacts.list.getByText(name, { exact: true })).toBeVisible();

    await contacts.act('Reactivar', name);
    await page
      .getByRole('dialog', { name: 'Reactivar contacto' })
      .getByRole('button', { name: 'Reactivar' })
      .click();
    await expect(page.getByText('No hay contactos con esos filtros.')).toBeVisible();
    await contacts.filterByStatus('Activos');
    await expect(contacts.list.getByText(name, { exact: true })).toBeVisible();
  },
);

test(
  'with the scope of their own contacts an adviser does not see the ones another adviser entered',
  { tag: '@mobile' },
  async ({ browser, admin, isMobile }) => {
    const permissions = { contacts: ['view', 'create', 'edit', 'deactivate'] };
    const role = await admin.createRole('E2E asesor', permissions, { contacts: 'own' });
    const ana = await admin.createActiveUser('e2e-ana', role.id);
    const bea = await admin.createActiveUser('e2e-bea', role.id);
    const anaContact = `Contacto de Ana ${uniqueSuffix()}`;
    const beaContact = `Contacto de Bea ${uniqueSuffix()}`;

    const anaPage = await browser.newPage({
      viewport: isMobile ? { width: 390, height: 844 } : undefined,
    });
    await signIn(anaPage, ana.email, ana.password);
    const anaContacts = new ContactsPage(anaPage, isMobile);
    await anaContacts.open();
    await anaPage.getByRole('link', { name: 'Nuevo contacto' }).click();
    await anaContacts.fillForm({ name: anaContact });
    await anaContacts.save();
    await anaPage.waitForURL((url) => url.pathname === '/contactos');

    const beaPage = await browser.newPage({
      viewport: isMobile ? { width: 390, height: 844 } : undefined,
    });
    await signIn(beaPage, bea.email, bea.password);
    const beaContacts = new ContactsPage(beaPage, isMobile);
    await beaContacts.open();
    await beaPage.getByRole('link', { name: 'Nuevo contacto' }).click();
    await beaContacts.fillForm({ name: beaContact });
    await beaContacts.save();
    await beaPage.waitForURL((url) => url.pathname === '/contactos');

    // Each one sees only what they entered, even when searching for the other's.
    await anaContacts.search('Contacto de');
    await expect(anaContacts.list.getByText(anaContact, { exact: true })).toBeVisible();
    await expect(anaPage.getByText(beaContact, { exact: true })).toHaveCount(0);
    await beaContacts.search('Contacto de');
    await expect(beaContacts.list.getByText(beaContact, { exact: true })).toBeVisible();
    await expect(beaPage.getByText(anaContact, { exact: true })).toHaveCount(0);

    // Who has the wider scope sees both, and the owner column says whose each one is.
    const staff = await browser.newPage({
      viewport: isMobile ? { width: 390, height: 844 } : undefined,
    });
    await signIn(staff, ADMIN.email, ADMIN.password);
    const staffContacts = new ContactsPage(staff, isMobile);
    await staffContacts.open();
    await staffContacts.search('Contacto de');
    await expect(staffContacts.list.getByText(anaContact, { exact: true })).toBeVisible();
    await expect(staffContacts.list.getByText(beaContact, { exact: true })).toBeVisible();
  },
);
