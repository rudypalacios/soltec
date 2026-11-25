import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, problem, type Call } from '../../test/fakeApi';
import { renderApp } from '../../test/render';

const TASK_ID = '0192f1c2-7d3a-7a11-8f2e-0000000000a1';
const notice = (n: number, patch: Record<string, unknown> = {}) => ({
  id: `0192f1c2-7d3a-7a11-8f2e-00000000010${n}`,
  type: 'assigned',
  subject: { type: 'task', id: TASK_ID, title: `Tarea ${n}` },
  actor: { id: ME.id, name: 'Olga Owner' },
  data: {},
  is_read: false,
  read_at: null,
  created_at: '2026-11-25T11:00:00.000Z',
  ...patch,
});
const list = (data: unknown[], unread: number, next: string | null = null) => ({
  data,
  meta: { limit: 25, next_cursor: next, unread_count: unread },
});
const updates = (unread: number) => () =>
  Response.json({ unread_count: unread, new_count: null, server_time: '2026-11-25T12:00:00.000Z' });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the bell', () => {
  it('shows how many notifications are unread', async () => {
    const { session } = createTestSession({
      'GET /v1/updates': updates(3),
      'GET /v1/tasks': () => Response.json({}),
    });
    renderApp(session, '/');

    expect(
      await screen.findByRole('button', { name: 'Notificaciones, 3 sin leer' }),
    ).toBeInTheDocument();
  });

  it('opens the notification itself: a click marks it read and goes to the task, with no separate link', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession({
      'GET /v1/updates': updates(1),
      'GET /v1/notifications': () =>
        Response.json(list([notice(1), notice(2, { is_read: true })], 1)),
      'POST /v1/notifications/0192f1c2-7d3a-7a11-8f2e-000000000101/read': (call) => {
        calls.push(call);
        return Response.json(notice(1, { is_read: true }));
      },
    });
    renderApp(session, '/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /^Notificaciones/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Notificaciones' });
    const row = await within(dialog).findByRole('link', {
      name: /Olga Owner te asignó la tarea «Tarea 1»/,
    });
    expect(row).toHaveAttribute('href', `/tareas/${TASK_ID}`);
    await user.click(row);

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.getByTestId('where')).toHaveTextContent(`/tareas/${TASK_ID}`);
  });

  it('does not ask to mark a notification that was already read', async () => {
    const marks: Call[] = [];
    const { session, calls } = createTestSession({
      'GET /v1/notifications': () => Response.json(list([notice(2, { is_read: true })], 0)),
    });
    renderApp(session, '/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /^Notificaciones/ }));
    await user.click(await screen.findByRole('link', { name: /Tarea 2/ }));

    marks.push(...calls.filter((call) => call.path.endsWith('/read')));
    expect(marks).toEqual([]);
  });

  it('marks all as read at once, with no confirmation', async () => {
    const marked: Call[] = [];
    const { session } = createTestSession({
      'GET /v1/updates': updates(2),
      'GET /v1/notifications': () => Response.json(list([notice(1), notice(2)], 2)),
      'POST /v1/notifications/read-all': (call) => {
        marked.push(call);
        return Response.json({ marked: 2 });
      },
    });
    renderApp(session, '/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /^Notificaciones/ }));
    await user.click(await screen.findByRole('button', { name: 'Marcar todas como leídas' }));

    await waitFor(() => expect(marked).toHaveLength(1));
  });

  it('says so when there is nothing', async () => {
    const { session } = createTestSession({
      'GET /v1/notifications': () => Response.json(list([], 0)),
    });
    renderApp(session, '/');

    await userEvent.setup().click(await screen.findByRole('button', { name: /^Notificaciones/ }));

    expect(await screen.findByText('No tienes notificaciones.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeDisabled();
  });
});

describe('/notificaciones', () => {
  it('lists them newest first and asks for older ones with the cursor', async () => {
    const seen: Call[] = [];
    const { session } = createTestSession({
      'GET /v1/notifications': (call) => {
        seen.push(call);
        return Response.json(
          call.query.get('before')
            ? list([notice(3)], 2)
            : list([notice(1), notice(2)], 2, notice(2).id),
        );
      },
    });
    renderApp(session, '/notificaciones');
    const user = userEvent.setup();

    expect(await screen.findByText(/«Tarea 1»/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver más' }));

    expect(await screen.findByText(/«Tarea 3»/)).toBeInTheDocument();
    expect(seen.at(-1)?.query.get('before')).toBe(notice(2).id);
    expect(screen.queryByRole('button', { name: 'Ver más' })).not.toBeInTheDocument();
  });

  it('filters the unread ones', async () => {
    const seen: Call[] = [];
    const { session } = createTestSession({
      'GET /v1/notifications': (call) => {
        seen.push(call);
        return Response.json(list([notice(1)], 1));
      },
    });
    renderApp(session, '/notificaciones');

    await userEvent.setup().click(await screen.findByRole('checkbox', { name: 'Solo sin leer' }));

    await waitFor(() =>
      expect(seen.some((call) => call.query.get('unread') === 'true')).toBe(true),
    );
  });

  it('explains a failure', async () => {
    const { session } = createTestSession({
      'GET /v1/notifications': () => problem(500, 'internal_error'),
    });
    renderApp(session, '/notificaciones');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('/configuracion/notificaciones', () => {
  const SETTINGS = {
    due_reminder_hour: 8,
    last_run_at: '2026-11-25T11:00:00.000Z',
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    version: 1,
  };
  const editor = {
    ...ME,
    permissions: { notification_settings: ['view', 'edit'] },
    scopes: {},
  };

  it('changes the hour of the reminders', async () => {
    const saved: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/settings/notifications': () => Response.json(SETTINGS),
        'PATCH /v1/settings/notifications': (call) => {
          saved.push(call);
          return Response.json({ ...SETTINGS, due_reminder_hour: 9, version: 2 });
        },
      },
      editor,
    );
    renderApp(session, '/configuracion/notificaciones');
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('combobox', { name: 'Hora de los avisos de vencimiento' }),
    );
    await user.click(await screen.findByRole('option', { name: '09:00' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Se guardó la hora.')).toBeInTheDocument();
    expect(saved[0]?.body).toEqual({ version: 1, due_reminder_hour: 9 });
  });

  it('warns that the hourly job never ran', async () => {
    const { session } = createTestSession(
      { 'GET /v1/settings/notifications': () => Response.json({ ...SETTINGS, last_run_at: null }) },
      editor,
    );
    renderApp(session, '/configuracion/notificaciones');

    expect(await screen.findByText(/todavía no ha corrido/)).toBeInTheDocument();
  });

  it('is read-only for whoever cannot edit', async () => {
    const { session } = createTestSession(
      { 'GET /v1/settings/notifications': () => Response.json(SETTINGS) },
      { ...editor, permissions: { notification_settings: ['view'] } },
    );
    renderApp(session, '/configuracion/notificaciones');

    expect(await screen.findByText(/Última corrida del proceso/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });
});
