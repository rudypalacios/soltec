import { expect } from '@playwright/test';
import { ProductsPage } from './ProductsPage.ts';

/**
 * «Paquetes». The list, the filters, the row actions and the selection work as in Products, so it only says where it
 * lives; the form has the editor of components.
 */
export class BundlesPage extends ProductsPage {
  protected override readonly route = '/paquetes';
  protected override readonly listLabel = 'Lista de paquetes';
  protected override readonly endpoint = '/bundles';

  /** Searches a product by name in «Agregar componente» and adds it to the bundle. */
  async addComponent(name: string): Promise<void> {
    const box = this.page.getByRole('combobox', { name: /^Agregar componente/ });
    await box.fill(name);
    await this.page.getByRole('option', { name: new RegExp(name) }).click();
    await expect(this.page.getByRole('button', { name: `Quitar ${name}` })).toBeVisible();
  }

  /** Writes the quantity of the component that is listed at `position` (from 0). */
  async setQuantity(position: number, quantity: string): Promise<void> {
    await this.page.getByLabel('Cantidad').nth(position).fill(quantity);
  }
}
