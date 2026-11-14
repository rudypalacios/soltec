import { ADMIN } from '../support/env.ts';
import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';
import { uniqueSuffix } from '../support/api.ts';

// A 1×1 picture: enough for the browser to shrink it and for the server to accept it.
const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test(
  'a task is created, assigned, discussed with a mention and moved through its flow',
  { tag: '@mobile' },
  async ({ page, admin }) => {
    const assignee = await admin.createActiveUser('e2e-asignado');
    const title = `E2E tarea ${uniqueSuffix()}`;
    await signIn(page, ADMIN.email, ADMIN.password);
    await page.goto('/tareas/nueva');

    await page.getByLabel('¿Qué hay que hacer?').fill(title);
    await page.getByLabel('Tipo').click();
    await page.getByRole('option', { name: 'Ventas', exact: true }).click();
    await page.getByLabel('Asignada a').fill(assignee.name);
    await page.getByRole('option', { name: assignee.name }).click();
    await page.getByLabel('Vence').fill('2030-01-15');
    await page.getByRole('button', { name: 'Crear tarea' }).click();

    // The detail opens with the first event of the thread and the next step of the flow.
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText(/creó la tarea y se la asignó a/)).toBeVisible();

    // Typing @ lists the people who can see the task; choosing one writes the name and shows the mention.
    const field = page.getByRole('combobox', { name: 'Escribe un comentario' });
    await field.fill('Revisa esto @e2e-asignado');
    await page.getByRole('option', { name: assignee.name }).click();
    await expect(field).toHaveValue(new RegExp(`@${assignee.name} $`));
    await page.getByLabel('Elegir fotos').setInputFiles([
      { name: 'uno.png', mimeType: 'image/png', buffer: PHOTO },
      { name: 'dos.png', mimeType: 'image/png', buffer: PHOTO },
    ]);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await page.getByRole('button', { name: 'Comentar' }).click();
    const comment = page.getByRole('article', { name: /^Comentario de / });
    await expect(comment.getByText(`@${assignee.name}`)).toBeVisible();

    // Touching a photo opens the gallery of this comment's photos, on a dark background.
    await comment.getByRole('button', { name: 'Ver la foto en grande' }).first().click();
    const gallery = page.getByRole('dialog', { name: 'Galería de fotos' });
    await expect(gallery.getByText('1 / 2')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(gallery.getByText('2 / 2')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(gallery).toBeHidden();

    // Moving the task asks first and leaves the change in the thread.
    await page.getByRole('button', { name: /^Estado: Asignada/ }).click();
    await page.getByRole('menuitem', { name: 'Aceptada' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText(/cambió el estado de «Asignada» a «Aceptada»/)).toBeVisible();

    await page.goto('/tareas');
    await page.getByLabel(/^Buscar por/).fill(title);
    await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
  },
);

test(
  'the board shows a task in the column of its state and the card opens it',
  { tag: '@mobile' },
  async ({ page, admin, isMobile }) => {
    const assignee = await admin.createActiveUser('e2e-tablero');
    const prefix = `E2E tablero ${uniqueSuffix()}`;
    const title = `${prefix} cableado`;
    await admin.createTask(title, assignee.id);
    await admin.createTask(`${prefix} cotización`, assignee.id);
    await signIn(page, ADMIN.email, ADMIN.password);

    await page.goto('/tareas');
    await page.getByRole('button', { name: 'Tablero' }).click();
    await page.getByLabel(/^Buscar por/).fill(prefix);
    // On a phone the first column is the open tab; on a desktop every column is on the screen.
    if (isMobile) {
      await expect(page.getByRole('tab', { name: 'Asignada (2)' })).toBeVisible();
    } else {
      await expect(page.getByRole('region', { name: 'Asignada' }).getByRole('link')).toHaveCount(2);
    }

    // The card is a link to the task, where the state is changed.
    await page.getByRole('link', { name: title, exact: true }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await page.getByRole('button', { name: /^Estado: Asignada/ }).click();
    await page.getByRole('menuitem', { name: 'Aceptada' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText(/cambió el estado de «Asignada» a «Aceptada»/)).toBeVisible();

    // Back to the tasks the board is still the view, and the card has moved to the next column.
    await page.getByRole('link', { name: 'Tareas', exact: true }).first().click();
    await page.getByLabel(/^Buscar por/).fill(prefix);
    if (isMobile) {
      await page.getByRole('tab', { name: /^Aceptada/ }).click();
      await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
    } else {
      await expect(
        page.getByRole('region', { name: 'Aceptada' }).getByRole('link', { name: title }),
      ).toBeVisible();
    }

    // The board is configured from the board itself: the dialog opens and, with nothing changed, cannot be saved.
    await page.getByRole('button', { name: 'Configurar tablero' }).click();
    const configure = page.getByRole('dialog', { name: 'Configurar tablero' });
    await expect(configure.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    await configure.getByRole('button', { name: 'Cancelar' }).click();
    await expect(configure).toBeHidden();
  },
);
