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
    // On a desktop the name shows twice: as the state and as its board column.
    await expect(list.getByText(name, { exact: true }).first()).toBeVisible();

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
    // On a desktop the name shows twice: as the state and as its board column.
    await expect(list.getByText(name, { exact: true }).first()).toBeVisible();
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
    workflows.states('Estados de tickets').getByText('Abierto', { exact: true }).first(),
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

test(
  'two states of the ticket flow are grouped into one column of the board',
  { tag: '@mobile' },
  async ({ page, isMobile }) => {
    const first = `E2E col A ${uniqueSuffix()}`;
    const second = `E2E col B ${uniqueSuffix()}`;
    await signIn(page, ADMIN.email, ADMIN.password);
    const workflows = new WorkflowsPage(page, isMobile);
    await workflows.open();
    // The ticket flow belongs to this scenario: the board of tasks, which others read, stays as it is.
    await workflows.choose('Tickets');

    for (const name of [first, second]) {
      await page.getByRole('button', { name: 'Nuevo estado' }).click();
      const dialog = page.getByRole('dialog', { name: 'Nuevo estado' });
      await dialog.getByLabel(/^Nombre/).fill(name);
      await dialog.getByRole('button', { name: 'Guardar' }).click();
      await expect(dialog).toBeHidden();
    }

    await page.getByRole('button', { name: 'Columnas del tablero' }).click();
    const columns = page.getByRole('dialog', { name: 'Columnas del tablero' });
    // Each state started a column of its own, named like it.
    await expect(columns.getByRole('combobox', { name: `Columna de «${second}»` })).toHaveText(
      second,
    );
    await columns.getByRole('combobox', { name: `Columna de «${second}»` }).click();
    await page.getByRole('option', { name: first, exact: true }).click();
    // Nothing is saved until Guardar.
    await columns.getByRole('button', { name: 'Guardar' }).click();
    await expect(columns).toBeHidden();

    await page.getByRole('button', { name: 'Columnas del tablero' }).click();
    await expect(columns.getByRole('combobox', { name: `Columna de «${second}»` })).toHaveText(
      first,
    );
    await expect(columns.getByRole('combobox', { name: `Columna de «${first}»` })).toHaveText(
      first,
    );
  },
);
