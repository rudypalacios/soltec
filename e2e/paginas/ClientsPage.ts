import type { Locator, Page } from '@playwright/test';

/**
 * «Clientes». Like the other lists it is a table on a desktop and cards on a phone, and the page object hides the
 * difference in how a row action is reached.
 */
export class ClientsPage {
  constructor(
    private readonly page: Page,
    private readonly isMobile: boolean,
  ) {}

  async open(): Promise<void> {
    await this.page.goto('/clientes');
  }

  get list(): Locator {
    return this.page.getByLabel('Lista de clientes', { exact: true });
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

  /** Runs one action of a row («Ver», «Editar»). */
  async act(action: string, rowName: string): Promise<void> {
    const direct = this.page.getByRole('link', { name: `${action}: ${rowName}` });
    if (this.isMobile && (await direct.count()) > 0) {
      await direct.click();
      return;
    }
    await this.page.getByRole('button', { name: `Acciones de ${rowName}` }).click();
    await this.page.getByRole('menuitem', { name: action }).click();
  }

  async fillBasics(fields: { name?: string; nit?: string }): Promise<void> {
    if (fields.name !== undefined) {
      await this.page.getByLabel(/^Nombre comercial/).fill(fields.name);
    }
    if (fields.nit !== undefined) {
      await this.page.getByRole('combobox', { name: 'Identificación' }).click();
      await this.page.getByRole('option', { name: 'NIT', exact: true }).click();
      await this.page.getByLabel(/^Número de NIT/).fill(fields.nit);
    }
  }

  async save(): Promise<void> {
    await this.page.getByRole('button', { name: 'Guardar' }).click();
  }
}
