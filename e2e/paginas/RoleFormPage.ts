import type { Page } from '@playwright/test';
import { PermissionMatrix } from '../componentes/PermissionMatrix.ts';

export class RoleFormPage {
  readonly matrix: PermissionMatrix;

  constructor(private readonly page: Page) {
    this.matrix = new PermissionMatrix(page);
  }

  async openNew(): Promise<void> {
    await this.page.goto('/perfiles/nuevo');
  }

  async open(roleId: string): Promise<void> {
    await this.page.goto(`/perfiles/${roleId}`);
  }

  get name() {
    return this.page.getByLabel(/^Nombre/);
  }

  get save() {
    return this.page.getByRole('button', { name: 'Guardar' });
  }
}
