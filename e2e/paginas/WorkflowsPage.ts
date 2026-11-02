import { expect, type Locator, type Page } from '@playwright/test';

/**
 * «Configuración › Flujos de estado». A state is a row of a table on a desktop and a card on a phone, and so are its
 * actions (a ⋮ menu or text buttons), so the page object hides the difference.
 */
export class WorkflowsPage {
  constructor(
    private readonly page: Page,
    private readonly isMobile: boolean,
  ) {}

  async open(): Promise<void> {
    await this.page.goto('/configuracion/flujos');
  }

  /** Picks the flow and waits until the screen shows it, as the tabs of the parameters do. */
  async choose(label: 'Tareas' | 'Tickets'): Promise<void> {
    const tab = this.page.getByRole('tab', { name: label, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }

  states(label: string): Locator {
    return this.page.getByLabel(label, { exact: true });
  }

  /** Runs one action of a state («Editar», «Siguientes estados», «Desactivar»). */
  async act(action: string, stateName: string): Promise<void> {
    const direct = this.page.getByRole('button', { name: `${action}: ${stateName}` });
    if (this.isMobile && (await direct.count()) > 0) {
      await direct.click();
      return;
    }
    await this.page.getByRole('button', { name: `Acciones de ${stateName}` }).click();
    await this.page.getByRole('menuitem', { name: action }).click();
  }
}
