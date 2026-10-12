import type { Page } from '@playwright/test';
import { DataTable } from '../componentes/DataTable.ts';

export class AuditPage {
  readonly table: DataTable;

  constructor(private readonly page: Page) {
    this.table = new DataTable(page, 'Movimientos registrados');
  }

  async open(): Promise<void> {
    await this.page.goto('/auditoria');
  }
}
