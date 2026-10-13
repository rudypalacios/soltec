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
    // Wait for the filtered list (the contact itself) before reading its details: until it renders, the list still
    // shows the previous rows, which in a shared database include other scenarios' contacts.
    await expect(contacts.list.getByText(name, { exact: true })).toBeVisible();
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
    // One suffix for both, so a search for it finds only this scenario's contacts however many others exist.
    const suffix = uniqueSuffix();
    const anaContact = `Contacto de Ana ${suffix}`;
    const beaContact = `Contacto de Bea ${suffix}`;

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
    await anaContacts.search(suffix);
    await expect(anaContacts.list.getByText(anaContact, { exact: true })).toBeVisible();
    await expect(anaPage.getByText(beaContact, { exact: true })).toHaveCount(0);
    await beaContacts.search(suffix);
    await expect(beaContacts.list.getByText(beaContact, { exact: true })).toBeVisible();
    await expect(beaPage.getByText(anaContact, { exact: true })).toHaveCount(0);

    // Who has the wider scope sees both, and the owner column says whose each one is.
    const staff = await browser.newPage({
      viewport: isMobile ? { width: 390, height: 844 } : undefined,
    });
    await signIn(staff, ADMIN.email, ADMIN.password);
    const staffContacts = new ContactsPage(staff, isMobile);
    await staffContacts.open();
    await staffContacts.search(suffix);
    await expect(staffContacts.list.getByText(anaContact, { exact: true })).toBeVisible();
    await expect(staffContacts.list.getByText(beaContact, { exact: true })).toBeVisible();
  },
);

test(
  'a team lead hands a contact to someone of their team and is not offered anyone outside it',
  { tag: '@mobile' },
  async ({ browser, admin, isMobile }) => {
    const viewport = isMobile ? { width: 390, height: 844 } : undefined;
    const permissions = { contacts: ['view', 'create', 'edit', 'deactivate'] };
    const leadRole = await admin.createRole('E2E jefe', permissions, { contacts: 'team' });
    const adviserRole = await admin.createRole('E2E asesor', permissions, { contacts: 'own' });
    const lead = await admin.createActiveUser('e2e-jefe', leadRole.id);
    const member = await admin.createActiveUser('e2e-equipo', adviserRole.id, lead.id);
    const outsider = await admin.createActiveUser('e2e-ajeno', adviserRole.id);
    const name = `Contacto del equipo ${uniqueSuffix()}`;

    const memberPage = await browser.newPage({ viewport });
    await signIn(memberPage, member.email, member.password);
    const memberContacts = new ContactsPage(memberPage, isMobile);
    await memberContacts.open();
    await memberPage.getByRole('link', { name: 'Nuevo contacto' }).click();
    await memberContacts.fillForm({ name });
    await memberContacts.save();
    await memberPage.waitForURL((url) => url.pathname === '/contactos');
    await memberContacts.search(name);
    await expect(memberContacts.list.getByText(name, { exact: true })).toBeVisible();

    // The lead sees it (it is of their team) and can choose among their team only: the outsider is not even listed.
    const leadPage = await browser.newPage({ viewport });
    await signIn(leadPage, lead.email, lead.password);
    const leadContacts = new ContactsPage(leadPage, isMobile);
    await leadContacts.open();
    await leadContacts.search(name);
    await leadContacts.act('Editar', name);
    const owner = leadPage.getByRole('combobox', { name: /Responsable/ });
    await expect(owner).toHaveValue(member.name);
    await owner.click();
    await expect(leadPage.getByRole('option', { name: lead.name })).toBeVisible();
    await expect(leadPage.getByRole('option', { name: member.name })).toBeVisible();
    await expect(leadPage.getByRole('option', { name: outsider.name })).toHaveCount(0);

    await leadPage.getByRole('option', { name: lead.name }).click();
    await leadContacts.save();
    await leadPage.waitForURL((url) => url.pathname === '/contactos');
    await leadContacts.search(name);
    // A card prefixes its details with the column name («Responsable: …»), so the name is not the whole text.
    await expect(leadContacts.list.getByText(lead.name)).toBeVisible();

    // Once handed over, it leaves the list of the member who had it.
    await memberPage.reload();
    await memberContacts.search(name);
    await expect(memberPage.getByText(name, { exact: true })).toHaveCount(0);
  },
);
