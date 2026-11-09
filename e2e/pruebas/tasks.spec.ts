import { ADMIN } from '../support/env.ts';
import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';
import { uniqueSuffix } from '../support/api.ts';

test(
  'a task is created, assigned, discussed with a mention and moved through its flow',
  { tag: '@mobile' },
  async ({ page, admin }) => {
    const assignee = await admin.createActiveUser('e2e-asignado');
    const title = `E2E tarea ${uniqueSuffix()}`;
    await signIn(page, ADMIN.email, ADMIN.password);
    await page.goto('/tareas/nueva');

    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Tipo').click();
    await page.getByRole('option', { name: 'Ventas', exact: true }).click();
    await page.getByLabel('Asignada a').fill(assignee.name);
    await page.getByRole('option', { name: assignee.name }).click();
    await page.getByLabel('Vence').fill('2030-01-15');
    await page.getByRole('button', { name: 'Guardar' }).click();

    // The detail opens with the first event of the thread and the next step of the flow.
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText(/creó la tarea y se la asignó a/)).toBeVisible();

    // Typing @ lists the people who can see the task; choosing one writes the name and shows the mention.
    const field = page.getByRole('combobox', { name: 'Escribe un comentario' });
    await field.fill('Revisa esto @e2e-asignado');
    await page.getByRole('option', { name: assignee.name }).click();
    await expect(field).toHaveValue(new RegExp(`@${assignee.name} $`));
    await page.getByRole('button', { name: 'Comentar' }).click();
    const comment = page.getByRole('article', { name: /^Comentario de / });
    await expect(comment.getByText(`@${assignee.name}`)).toBeVisible();

    // Moving the task asks first and leaves the change in the thread.
    await page.getByRole('button', { name: /Pasar a «Aceptada»/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText(/cambió el estado de «Asignada» a «Aceptada»/)).toBeVisible();

    await page.goto('/tareas');
    await page.getByLabel(/^Buscar por/).fill(title);
    await expect(page.getByRole('link', { name: title })).toBeVisible();
  },
);
