import type { Locator, Page } from '@playwright/test';

/** The `DataList` of the web app (a table on desktop). Rows and their actions are found by their accessible name. */
export class DataTable {
  constructor(
    private readonly page: Page,
    private readonly label: string,
  ) {}

  row(name: string | RegExp): Locator {
    return this.page.getByRole('table', { name: this.label }).getByRole('row', { name });
  }

  /** Opens the ⋮ menu of a row and chooses one of its actions («Desbloquear»). */
  async choose(label: string, rowName: string): Promise<void> {
    await this.page.getByRole('button', { name: `Acciones de ${rowName}` }).click();
    await this.page.getByRole('menuitem', { name: label }).click();
  }
}
