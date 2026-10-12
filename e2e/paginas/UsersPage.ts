import type { Page } from '@playwright/test';
import { DataTable } from '../componentes/DataTable.ts';

export class UsersPage {
  readonly table: DataTable;

  constructor(private readonly page: Page) {
    this.table = new DataTable(page, 'Lista de usuarios');
  }

  async open(): Promise<void> {
    await this.page.goto('/usuarios');
  }

  async search(text: string): Promise<void> {
    await this.page.getByLabel('Buscar por nombre o correo').fill(text);
  }
}
