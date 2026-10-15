import { expect, type Locator, type Page } from '@playwright/test';

/**
 * «Contactos». The list is a table on a desktop and cards on a phone, and so are its row actions (a ⋮ menu or text
 * buttons), so the page object hides the difference.
 */
export class ContactsPage {
  constructor(
    private readonly page: Page,
    private readonly isMobile: boolean,
  ) {}

  async open(): Promise<void> {
    await this.page.goto('/contactos');
  }

  get list(): Locator {
    return this.page.getByLabel('Lista de contactos', { exact: true });
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
    // A card shows its first action as a button and keeps the rest in the ⋮ menu; a table row keeps all in the menu.
    const direct = this.page.getByRole('link', { name: `${action}: ${rowName}` });
    if (this.isMobile && (await direct.count()) > 0) {
      await direct.click();
      return;
    }
    await this.page.getByRole('button', { name: `Acciones de ${rowName}` }).click();
    await this.page.getByRole('menuitem', { name: action }).click();
  }

  /**
   * Opens the edit form of a row and waits until it holds that contact. Until the contact arrives from the API the
   * screen is not the form yet, and a step that types right away is lost when the form starts from the server's
   * copy: the save then sends the old values. (A slow runner shows it; `E2E_CPU_THROTTLE=8` reproduces it.)
   */
  async edit(rowName: string): Promise<void> {
    await this.act('Editar', rowName);
    await expect(this.page.getByLabel(/^Nombre/)).toHaveValue(rowName);
  }

  async fillForm(fields: { name?: string; phone?: string; email?: string }): Promise<void> {
    if (fields.name !== undefined) {
      await this.page.getByLabel(/^Nombre/).fill(fields.name);
    }
    if (fields.phone !== undefined) {
      await this.page.getByLabel('Teléfono').fill(fields.phone);
    }
    if (fields.email !== undefined) {
      await this.page.getByLabel('Correo').fill(fields.email);
    }
  }

  async save(): Promise<void> {
    await this.page.getByRole('button', { name: 'Guardar' }).click();
  }
}
