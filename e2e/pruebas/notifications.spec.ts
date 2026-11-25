import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';
import { uniqueSuffix } from '../support/api.ts';

test(
  'a person who is given a task sees it in the bell, and the notification itself opens the task',
  { tag: '@mobile' },
  async ({ page, admin }) => {
    const assignee = await admin.createActiveUser('e2e-aviso');
    const title = `E2E aviso ${uniqueSuffix()}`;
    const task = await admin.createTask(title, assignee.id);
    await signIn(page, assignee.email, assignee.password);

    // The bell counts what is unread; its panel lists it, and each row is the link to what it is about.
    await page.getByRole('button', { name: 'Notificaciones, 1 sin leer' }).click();
    const panel = page.getByRole('dialog', { name: 'Notificaciones' });
    await panel.getByRole('link', { name: new RegExp(`te asignó la tarea «${title}»`) }).click();

    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/tareas/${task.id}$`));
    // Opening it marked it read: the counter is gone, and the full list still has it.
    await expect(page.getByRole('button', { name: 'Notificaciones', exact: true })).toBeVisible();
    await page.goto('/notificaciones');
    await expect(page.getByRole('link', { name: new RegExp(`«${title}»`) })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Solo sin leer' }).check();
    await expect(page.getByText('No tienes notificaciones sin leer.')).toBeVisible();
  },
);
