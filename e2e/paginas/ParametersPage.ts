import type { Locator, Page } from '@playwright/test';

/**
 * «Configuración › Parámetros» and «Catálogo», which share one screen. A list is a table on a desktop and cards on a phone, and so are its actions (a ⋮ menu
 * or text buttons), so the page object hides the difference. The parameter is chosen from tabs, or from a select on a
 * phone.
 */
export class ParametersPage {
  constructor(
    private readonly page: Page,
    private readonly isMobile: boolean,
    private readonly path = '/configuracion/parametros',
    private readonly selectLabel = 'Parámetro',
  ) {}

  /** The product structure screen: same behavior, other address and select label. */
  static catalog(page: Page, isMobile: boolean): ParametersPage {
    return new ParametersPage(page, isMobile, '/catalogo', 'Sección');
  }

  async open(): Promise<void> {
    await this.page.goto(this.path);
  }

  async choose(label: string): Promise<void> {
    if (this.isMobile) {
      await this.page.getByRole('combobox', { name: this.selectLabel }).click();
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

  /**
   * Types in the search box and waits for the filtered list. The screen asks for the filtered list a moment after
   * the text changes (the text is deferred), and until it arrives it still shows the previous rows, which in a
   * shared database include other scenarios' records. A scenario that acts on a row before that would be acting on
   * a list that is about to change.
   */
  async search(text: string): Promise<void> {
    const filtered = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).searchParams.get('q') === text,
    );
    await this.page.getByLabel('Buscar por nombre').fill(text);
    await filtered;
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
