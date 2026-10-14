import type { Locator, Page } from '@playwright/test';

/**
 * «Productos». A table on a desktop and cards on a phone, so the page object hides how a row action and the selection
 * box are reached.
 */
export class ProductsPage {
  constructor(
    private readonly page: Page,
    private readonly isMobile: boolean,
  ) {}

  async open(): Promise<void> {
    await this.page.goto('/productos');
  }

  get list(): Locator {
    return this.page.getByLabel('Lista de productos', { exact: true });
  }

  /** Types in the search box and waits for the filtered list, so the scenario never acts on the previous rows. */
  async search(text: string): Promise<void> {
    const filtered = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname.endsWith('/products') &&
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

  /** The box that selects one row. */
  selectRow(name: string): Locator {
    return this.page.getByRole('checkbox', { name: `Seleccionar ${name}` });
  }

  /** Picks a supplier in the filter or in the form, searching for it by name. */
  async chooseSupplier(name: string): Promise<void> {
    const box = this.page.getByRole('combobox', { name: /^Proveedor/ });
    await box.fill(name);
    await this.page.getByRole('option', { name, exact: true }).click();
  }

  async fillForm(fields: { name?: string; cost?: string }): Promise<void> {
    if (fields.name !== undefined) {
      await this.page.getByLabel(/^Nombre/).fill(fields.name);
    }
    if (fields.cost !== undefined) {
      await this.page.getByLabel(/^Costo con IVA/).fill(fields.cost);
    }
  }

  async choose(label: RegExp | string, option: string): Promise<void> {
    await this.page.getByRole('combobox', { name: label }).click();
    await this.page.getByRole('option', { name: option, exact: true }).click();
  }

  async save(): Promise<void> {
    await this.page.getByRole('button', { name: 'Guardar' }).click();
  }
}
