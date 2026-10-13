import type { Locator, Page } from '@playwright/test';

/**
 * «Configuración › Parámetros». A list is a table on a desktop and cards on a phone, and so are its actions (a ⋮ menu
 * or text buttons), so the page object hides the difference. The parameter is chosen from tabs, or from a select on a
 * phone.
 */
export class ParametersPage {
  constructor(
    private readonly page: Page,
    private readonly isMobile: boolean,
  ) {}

  async open(): Promise<void> {
    await this.page.goto('/configuracion/parametros');
  }

  async choose(label: string): Promise<void> {
    if (this.isMobile) {
      await this.page.getByRole('combobox', { name: 'Parámetro' }).click();
      await this.page.getByRole('option', { name: label, exact: true }).click();
    } else {
      await this.page.getByRole('tab', { name: label }).click();
    }
  }

  list(label: string): Locator {
    return this.page.getByLabel(label, { exact: true });
  }

  async filterByStatus(label: 'Activos' | 'Inactivos' | 'Todos'): Promise<void> {
    await this.page.getByLabel('Estado', { exact: true }).click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }

  async search(text: string): Promise<void> {
    await this.page.getByLabel('Buscar por nombre').fill(text);
  }

  /** Runs one action of a row («Editar», «Desactivar»). */
  async act(action: string, rowName: string): Promise<void> {
    // A card shows its first action as a button and keeps the rest in the ⋮ menu; a table row keeps all in the menu.
    const direct = this.page.getByRole('button', { name: `${action}: ${rowName}` });
    if (this.isMobile && (await direct.count()) > 0) {
      await direct.click();
      return;
    }
    await this.page.getByRole('button', { name: `Acciones de ${rowName}` }).click();
    await this.page.getByRole('menuitem', { name: action }).click();
  }
}
