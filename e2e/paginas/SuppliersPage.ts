import type { Locator, Page } from '@playwright/test';

/**
 * «Proveedores». Like the other lists it is a table on a desktop and cards on a phone, and the page object hides
 * the difference in how a row action is reached.
 */
export class SuppliersPage {
  constructor(
    private readonly page: Page,
    private readonly isMobile: boolean,
  ) {}

  async open(): Promise<void> {
    await this.page.goto('/proveedores');
  }

  get list(): Locator {
    return this.page.getByLabel('Lista de proveedores', { exact: true });
  }

  /** Types in the search box and waits for the filtered list, so the scenario never acts on the previous rows. */
  async search(text: string): Promise<void> {
    const filtered = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).searchParams.get('q') === text &&
        response.ok(),
    );
    await this.page.getByLabel(/^Buscar por/).fill(text);
    await filtered;
  }

  async filterByStatus(label: 'Activos' | 'Inactivos' | 'Todos'): Promise<void> {
    await this.page.getByLabel('Estado', { exact: true }).click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }

  /** Runs one action of a row («Editar», «Desactivar»). */
  async act(action: string, rowName: string): Promise<void> {
    const direct = this.page.getByRole('link', { name: `${action}: ${rowName}` });
    if (this.isMobile && (await direct.count()) > 0) {
      await direct.click();
      return;
    }
    await this.page.getByRole('button', { name: `Acciones de ${rowName}` }).click();
    await this.page.getByRole('menuitem', { name: action }).click();
  }

  async fillBasics(fields: { name?: string; nit?: string; creditDays?: string }): Promise<void> {
    if (fields.name !== undefined) {
      await this.page.getByLabel(/^Nombre comercial/).fill(fields.name);
    }
    if (fields.nit !== undefined) {
      await this.page.getByLabel(/^Número de NIT/).fill(fields.nit);
    }
    if (fields.creditDays !== undefined) {
      await this.page.getByLabel('Días de crédito').fill(fields.creditDays);
    }
  }

  /** Adds a person and fills the name, the job title and the email. */
  async addContact(fields: { name: string; jobTitle?: string; email?: string }): Promise<void> {
    await this.page.getByRole('button', { name: 'Agregar contacto' }).click();
    await this.page
      .getByLabel(/^Nombre(?! comercial)/)
      .last()
      .fill(fields.name);
    if (fields.jobTitle !== undefined) {
      await this.page.getByLabel('Cargo').last().fill(fields.jobTitle);
    }
    if (fields.email !== undefined) {
      await this.page.getByLabel('Correo').last().fill(fields.email);
    }
  }

  async save(): Promise<void> {
    await this.page.getByRole('button', { name: 'Guardar' }).click();
  }
}
