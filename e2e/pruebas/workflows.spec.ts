import { ADMIN } from '../support/env.ts';
import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';
import { WorkflowsPage } from '../paginas/WorkflowsPage.ts';
import { uniqueSuffix } from '../support/api.ts';

test(
  'a state of the task flow is created, linked to the next ones, deactivated and brought back',
  { tag: '@mobile' },
  async ({ page, isMobile }) => {
    const name = `E2E revisión ${uniqueSuffix()}`;
    await signIn(page, ADMIN.email, ADMIN.password);
    const workflows = new WorkflowsPage(page, isMobile);
    await workflows.open();
    const list = workflows.states('Estados de tareas');
    // The seed is there: a flow starts with its states, one of them initial.
    await expect(list.getByText('Asignada', { exact: true }).first()).toBeVisible();
    await expect(list.getByText('Inicial')).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo estado' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo estado' });
    await dialog.getByLabel(/^Nombre/).fill(name);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toBeHidden();
    await expect(list.getByText(name, { exact: true })).toBeVisible();

    // The same name cannot be used twice among the active states of a flow.
    await page.getByRole('button', { name: 'Nuevo estado' }).click();
    await dialog.getByLabel(/^Nombre/).fill(name);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(
      dialog.getByText('Ya hay un estado activo con ese nombre en este flujo.'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();

    await workflows.act('Siguientes estados', name);
    const next = page.getByRole('dialog', { name: `Siguientes estados de «${name}»` });
    await next.getByLabel('Cerrada', { exact: true }).check();
    await next.getByRole('button', { name: 'Guardar' }).click();
    await expect(next).toBeHidden();
    await expect(list.getByText('Cerrada', { exact: true }).first()).toBeVisible();

    await workflows.act('Desactivar', name);
    await page
      .getByRole('dialog', { name: 'Desactivar estado' })
      .getByRole('button', { name: 'Desactivar' })
      .click();
    await expect(page.getByRole('dialog', { name: 'Desactivar estado' })).toBeHidden();
    await expect(list.getByText('Inactivo').first()).toBeVisible();

    await workflows.act('Reactivar', name);
    await page
      .getByRole('dialog', { name: 'Reactivar estado' })
      .getByRole('button', { name: 'Reactivar' })
      .click();
    await expect(page.getByRole('dialog', { name: 'Reactivar estado' })).toBeHidden();
    await expect(list.getByText(name, { exact: true })).toBeVisible();
  },
);

test('the initial state of a flow cannot be deactivated, and the screen says why', async ({
  page,
  isMobile,
}) => {
  await signIn(page, ADMIN.email, ADMIN.password);
  const workflows = new WorkflowsPage(page, isMobile);
  await workflows.open();
  await workflows.choose('Tickets');
  await expect(
    workflows.states('Estados de tickets').getByText('Abierto', { exact: true }),
  ).toBeVisible();

  await workflows.act('Desactivar', 'Abierto');
  await page
    .getByRole('dialog', { name: 'Desactivar estado' })
    .getByRole('button', { name: 'Desactivar' })
    .click();

  await expect(
    page.getByText(
      'No se puede desactivar el estado inicial. Marca otro estado como inicial primero.',
    ),
  ).toBeVisible();
});
