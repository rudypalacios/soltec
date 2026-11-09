import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, page, problem, type Call } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const ALL = ['view', 'create', 'edit', 'deactivate'];
const meWith = (permissions: Record<string, string[]> = { tasks: ALL, thread_entries: ALL }) => ({
  ...ME,
  permissions,
  scopes: { tasks: 'own' },
});

const STAMPS = { created_at: '2026-11-01T10:00:00.000Z', updated_at: '2026-11-01T10:00:00.000Z' };
const ANDRES = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000b1', name: 'Andrés Asignado' };
const TASK = {
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000f1',
  title: 'Instalar el equipo',
  description: 'En la sucursal de la zona 10',
  task_type: { id: '0192f1c2-7d3a-7a11-8f2e-0000000000c1', name: 'Ventas' },
  owner: { id: ME.id, name: ME.name },
  assignee: ANDRES,
  due_date: '2020-01-15',
  proposed_due_date: null,
  state: {
    id: '0192f1c2-7d3a-7a11-8f2e-0000000000d1',
    name: 'Asignada',
    color: '#0B6BB0',
    is_terminal: false,
  },
  next_states: [{ id: '0192f1c2-7d3a-7a11-8f2e-0000000000d2', name: 'Aceptada', color: '#00796B' }],
  is_active: true,
  version: 1,
  ...STAMPS,
};
const EVENT = {
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000e1',
  kind: 'event',
  author: { id: ME.id, name: ME.name },
  body: null,
  event: {
    type: 'created',
    data: { assignee: ANDRES, due_date: '2020-01-15' },
  },
  visibility: 'internal',
  mentions: [],
  file_ids: [],
  is_edited: false,
  is_active: true,
  version: 1,
  ...STAMPS,
};
const COMMENT = {
  ...EVENT,
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000e2',
  kind: 'comment',
  author: ANDRES,
  body: `Listo @[${ME.id}], ya llegué`,
  event: null,
  mentions: [{ id: ME.id, name: ME.name }],
};
afterEach(() => vi.unstubAllGlobals());

const thread = (entries: unknown[]) =>
  Response.json({ data: entries, meta: { limit: 30, next_cursor: null } });

describe('tasks list', () => {
  it('shows each task with its type, assignee, due date and state, and marks the late ones', async () => {
    const { session } = createTestSession(
      { 'GET /v1/tasks': () => Response.json(page([TASK])) },
      meWith(),
    );
    renderApp(session, '/tareas');

    const table = await screen.findByRole('table', { name: 'Lista de tareas' });
    expect(within(table).getByRole('link', { name: 'Instalar el equipo' })).toBeVisible();
    expect(within(table).getByText('Ventas')).toBeVisible();
    expect(within(table).getByText('Andrés Asignado')).toBeVisible();
    expect(within(table).getByText(/vencida/)).toBeVisible();
    expect(within(table).getByText('Asignada')).toBeVisible();
  });

  it('shows cards on a phone and sends the relation filter to the API', async () => {
    setViewportWidth(390);
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/tasks': (call) => {
          calls.push(call);
          return Response.json(page([TASK]));
        },
      },
      meWith(),
    );
    renderApp(session, '/tareas');
    const user = userEvent.setup();

    expect(await screen.findByLabelText('Lista de tareas')).toBeVisible();
    await user.click(screen.getByRole('combobox', { name: 'Mostrar' }));
    await user.click(await screen.findByRole('option', { name: 'Asignadas a mí' }));

    await waitFor(() => expect(calls.at(-1)?.query.get('relation')).toBe('assigned'));
  });

  it('hides the create button without the permission', async () => {
    const { session } = createTestSession(
      { 'GET /v1/tasks': () => Response.json(page([TASK])) },
      meWith({ tasks: ['view'] }),
    );
    renderApp(session, '/tareas');

    await screen.findByRole('table', { name: 'Lista de tareas' });
    expect(screen.queryByRole('link', { name: /Nueva tarea/ })).not.toBeInTheDocument();
  });
});

describe('task detail', () => {
  const handlers = (extra: Record<string, (call: Call) => Response | Promise<Response>> = {}) => ({
    [`GET /v1/tasks/${TASK.id}`]: () => Response.json(TASK),
    [`GET /v1/tasks/${TASK.id}/thread`]: () => thread([COMMENT, EVENT]),
    ...extra,
  });

  it('shows the task, its events in words and its comments with the mention named', async () => {
    const { session } = createTestSession(handlers(), meWith());
    renderApp(session, `/tareas/${TASK.id}`);

    expect(await screen.findByRole('heading', { name: 'Instalar el equipo' })).toBeVisible();
    expect(screen.getByText('Vencida')).toBeVisible();
    expect(await screen.findByText(/creó la tarea y se la asignó a Andrés Asignado/)).toBeVisible();
    const comment = screen.getByRole('article', { name: 'Comentario de Andrés Asignado' });
    expect(within(comment).getByText(`@${ME.name}`)).toBeVisible();
    expect(within(comment).queryByText(/Editar/)).not.toBeInTheDocument();
  });

  it('asks before moving the task and sends the reason', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      handlers({
        [`POST /v1/tasks/${TASK.id}/transition`]: (call) => {
          calls.push(call);
          return Response.json({ ...TASK, version: 2 });
        },
      }),
      meWith(),
    );
    renderApp(session, `/tareas/${TASK.id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Pasar a «Aceptada»/ }));
    const dialog = await screen.findByRole('dialog');
    expect(calls).toHaveLength(0);
    await user.type(within(dialog).getByLabelText(/Motivo/), 'Ya tengo el material');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({
      state_id: '0192f1c2-7d3a-7a11-8f2e-0000000000d2',
      version: 1,
      reason: 'Ya tengo el material',
    });
  });

  it('tells the person when the step belongs to the other one', async () => {
    const { session } = createTestSession(
      handlers({ [`POST /v1/tasks/${TASK.id}/transition`]: () => problem(403, 'forbidden') }),
      meWith(),
    );
    renderApp(session, `/tareas/${TASK.id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Pasar a «Aceptada»/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirmar' }),
    );

    expect(await screen.findByText('Ese paso le corresponde a la otra persona.')).toBeVisible();
  });

  it('mentions a person with @, sends the mark and lists who is mentioned', async () => {
    const posts: Call[] = [];
    const queries: string[] = [];
    const { session } = createTestSession(
      handlers({
        [`GET /v1/tasks/${TASK.id}/mention-options`]: (call) => {
          queries.push(call.query.get('q') ?? '');
          return Response.json({ data: [ANDRES] });
        },
        [`POST /v1/tasks/${TASK.id}/thread`]: (call) => {
          posts.push(call);
          return Response.json({ ...COMMENT, body: 'ok' }, { status: 201 });
        },
      }),
      meWith(),
    );
    renderApp(session, `/tareas/${TASK.id}`);
    const user = userEvent.setup();

    const field = await screen.findByRole('combobox', { name: 'Escribe un comentario' });
    await user.type(field, 'Hola @An');
    const option = await screen.findByRole('option', { name: 'Andrés Asignado' });
    expect(queries.at(-1)).toBe('An');
    await user.click(option);

    expect(field).toHaveValue('Hola @Andrés Asignado ');
    expect(screen.getByText('Menciona a:')).toBeVisible();
    await user.type(field, 'revisa esto');
    await user.click(screen.getByRole('button', { name: 'Comentar' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body).toMatchObject({
      body: `Hola @[${ANDRES.id}] revisa esto`,
      file_ids: [],
    });
    expect(field).toHaveValue('');
  });

  it('closes the mention list with Escape and picks with the keyboard', async () => {
    const { session } = createTestSession(
      handlers({
        [`GET /v1/tasks/${TASK.id}/mention-options`]: () => Response.json({ data: [ANDRES] }),
      }),
      meWith(),
    );
    renderApp(session, `/tareas/${TASK.id}`);
    const user = userEvent.setup();

    const field = await screen.findByRole('combobox', { name: 'Escribe un comentario' });
    await user.type(field, '@');
    expect(await screen.findByRole('option', { name: 'Andrés Asignado' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('option', { name: 'Andrés Asignado' })).not.toBeInTheDocument();

    await user.clear(field);
    await user.type(field, '@');
    await screen.findByRole('option', { name: 'Andrés Asignado' });
    await user.keyboard('{Enter}');
    expect(field).toHaveValue('@Andrés Asignado ');
  });

  it('lets the author edit and remove only their own comments', async () => {
    const mine = { ...COMMENT, author: { id: ME.id, name: ME.name }, mentions: [] };
    const { session } = createTestSession(
      handlers({ [`GET /v1/tasks/${TASK.id}/thread`]: () => thread([mine]) }),
      meWith(),
    );
    renderApp(session, `/tareas/${TASK.id}`);

    const comment = await screen.findByRole('article', { name: `Comentario de ${ME.name}` });
    expect(within(comment).getByRole('button', { name: 'Editar' })).toBeVisible();
    expect(within(comment).getByRole('button', { name: 'Quitar' })).toBeVisible();
  });

  it('does not offer the composer without the permission to comment', async () => {
    const { session } = createTestSession(
      handlers(),
      meWith({ tasks: ALL, thread_entries: ['view'] }),
    );
    renderApp(session, `/tareas/${TASK.id}`);

    await screen.findByRole('heading', { name: 'Instalar el equipo' });
    expect(
      screen.queryByRole('combobox', { name: 'Escribe un comentario' }),
    ).not.toBeInTheDocument();
  });
});
