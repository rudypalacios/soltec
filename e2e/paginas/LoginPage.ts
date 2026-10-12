import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/ingresar');
  }

  async submit(email: string, password: string): Promise<void> {
    await this.page.getByLabel('Correo').fill(email);
    await this.page.getByLabel('Contraseña').fill(password);
    await this.page.getByRole('button', { name: 'Entrar' }).click();
  }

  /** The error under the form, or null when there is none. */
  get error() {
    return this.page.getByRole('alert');
  }
}
