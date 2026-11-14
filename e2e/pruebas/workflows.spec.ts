import type { Locator, Page } from '@playwright/test';
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

// Desktop only, and one scenario: the ticket flow is shared by everything that runs in parallel, and saving the board
// replaces the arrangement of the whole flow, so two scenarios writing it at once would trip over each other. The
// list a phone uses instead of dragging is covered by the unit tests.
test('the columns of the ticket board are arranged by dragging, or from the list', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Dragging is the desktop editor.');
  const first = `E2E col A ${uniqueSuffix()}`;
  const second = `E2E col B ${uniqueSuffix()}`;
  const third = `E2E col C ${uniqueSuffix()}`;
  await signIn(page, ADMIN.email, ADMIN.password);
  const workflows = new WorkflowsPage(page, isMobile);
  await workflows.open();
  // The ticket flow belongs to this scenario: the board of tasks, which others read, stays as it is.
  await workflows.choose('Tickets');
  for (const name of [first, second, third]) {
    await page.getByRole('button', { name: 'Nuevo estado' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo estado' });
    await dialog.getByLabel(/^Nombre/).fill(name);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toBeHidden();
  }

  await page.getByRole('button', { name: 'Configurar tablero' }).click();
  const columns = page.getByRole('dialog', { name: 'Configurar tablero' });
  const lanes = columns.getByRole('list', { name: 'Columnas del tablero' });
  const names = columns.getByLabel('Nombre de la columna');
  const scrollTo = (end: 'start' | 'end') =>
    lanes.evaluate((element, where) => {
      element.scrollLeft = where === 'end' ? element.scrollWidth : 0;
    }, end);
  const laneOf = (state: string) =>
    lanes
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: `Arrastrar el estado «${state}»` }) })
      .first();
  const before = await names.count();

  // A lane dragged onto the one before it takes its place. The first lanes are the flow's own, in view at the start.
  await scrollTo('start');
  await dragBetween(
    page,
    columns.getByRole('button', { name: 'Arrastrar la columna «Cerrado»' }),
    laneOf('Resuelto'),
  );
  await expect(names.nth(2)).toHaveValue('Cerrado');
  await expect(names.nth(3)).toHaveValue('Resuelto');

  // A state dragged onto the lane of another groups them there. The three new lanes are at the end.
  await scrollTo('end');
  await dragBetween(
    page,
    columns.getByRole('button', { name: `Arrastrar el estado «${second}»` }),
    laneOf(first),
  );
  await expect(names).toHaveCount(before - 1);
  await expect(laneOf(first).getByRole('button', { name: /^Arrastrar el estado/ })).toHaveCount(2);

  // Without dragging (what the keyboard and a screen reader use): the list picks the column of each state.
  await columns.getByRole('button', { name: 'Usar la lista (sin arrastrar)' }).click();
  await columns.getByRole('combobox', { name: `Columna de «${third}»` }).click();
  await page.getByRole('option', { name: first, exact: true }).click();
  await expect(names).toHaveCount(before - 2);
  await columns.getByRole('button', { name: 'Volver al arrastre' }).click();

  // Nothing is saved until Guardar, and what was arranged is what comes back.
  await columns.getByRole('button', { name: 'Guardar' }).click();
  await expect(columns).toBeHidden();
  await page.getByRole('button', { name: 'Configurar tablero' }).click();
  await expect(names).toHaveCount(before - 2);
  await expect(names.nth(2)).toHaveValue('Cerrado');
  await scrollTo('end');
  await expect(laneOf(first).getByRole('button', { name: /^Arrastrar el estado/ })).toHaveCount(3);
});

/**
 * Drags with the mouse in small steps, the way a person does, so the drag sensor sees real movement. `hover` waits
 * for the handle to stop moving (the dialog is still opening when the test gets here) before the button goes down.
 * Near the edge of the dialog the lanes scroll by themselves, so the destination is measured again after a pause,
 * as a person would look again before letting go.
 */
async function dragBetween(page: Page, from: Locator, to: Locator): Promise<void> {
  await from.hover();
  const start = await from.boundingBox();
  if (!start) {
    throw new Error('Nothing to drag.');
  }
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2 + 12, {
    steps: 4,
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const end = await to.boundingBox();
    if (!end) {
      throw new Error('Nowhere to drop it.');
    }
    await page.mouse.move(end.x + end.width / 2, end.y + 24, { steps: 15 });
    await page.waitForTimeout(500);
  }
  await page.mouse.up();
}
