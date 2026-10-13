import type { Locator, Page } from '@playwright/test';

/**
 * The permission matrix of a profile. The checkboxes and the scope are found by their accessible name, which is the
 * same on a desktop (a table per section) and on a phone (one continuous table): a scenario runs on both.
 */
export class PermissionMatrix {
  constructor(private readonly page: Page) {}

  /** The region of the matrix, so a module name is not confused with the same word in the side menu. */
  get root(): Locator {
    return this.page.getByRole('region', { name: 'Permisos' });
  }

  /** «Editar» of «Usuarios». */
  action(action: string, module: string): Locator {
    return this.root.getByRole('checkbox', { name: `${action} ${module}` });
  }

  /** The scope select of a module, only when it can be used: a module without owned data has none, and one without access has it disabled. */
  usableScope(module: string): Locator {
    return this.root.getByRole('combobox', { name: `Alcance de ${module}`, disabled: false });
  }

  get onlyWithAccess(): Locator {
    return this.root.getByRole('checkbox', { name: 'Solo con acceso' });
  }

  module(name: string): Locator {
    return this.root.getByText(name, { exact: true });
  }

  async chooseScope(module: string, option: string): Promise<void> {
    await this.usableScope(module).click();
    await this.page.getByRole('option', { name: option }).click();
  }
}
