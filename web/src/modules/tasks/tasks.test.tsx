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

    await user.click(
      await screen.findByRole('button', { name: 'Estado: Asignada. Cambiar estado' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Aceptada' }));
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

    await user.click(
      await screen.findByRole('button', { name: 'Estado: Asignada. Cambiar estado' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Aceptada' }));
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

  it('lets the author take a photo off a comment they edit and sends the photos that stay', async () => {
    const PHOTO_A = '0192f1c2-7d3a-7a11-8f2e-0000000000a1';
    const PHOTO_B = '0192f1c2-7d3a-7a11-8f2e-0000000000a2';
    const mine = {
      ...COMMENT,
      author: { id: ME.id, name: ME.name },
      mentions: [],
      body: 'Dos fotos',
      file_ids: [PHOTO_A, PHOTO_B],
    };
    const patches: Call[] = [];
    const { session } = createTestSession(
      handlers({
        [`GET /v1/tasks/${TASK.id}/thread`]: () => thread([mine]),
        [`GET /v1/files/${PHOTO_A}/content`]: () => problem(404, 'not_found'),
        [`GET /v1/files/${PHOTO_B}/content`]: () => problem(404, 'not_found'),
        [`PATCH /v1/thread-entries/${mine.id}`]: (call) => {
          patches.push(call);
          return Response.json({ ...mine, file_ids: [PHOTO_A], version: 2 });
        },
      }),
      meWith(),
    );
    renderApp(session, `/tareas/${TASK.id}`);
    const user = userEvent.setup();

    const comment = await screen.findByRole('article', { name: `Comentario de ${ME.name}` });
    await user.click(within(comment).getByRole('button', { name: 'Editar' }));
    await user.click(await screen.findByRole('button', { name: 'Quitar «Foto 2»' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]?.body).toMatchObject({ body: 'Dos fotos', file_ids: [PHOTO_A], version: 1 });
  });

  it('offers a single state control that lists every step the flow allows', async () => {
    const many = {
      ...TASK,
      next_states: [
        ...TASK.next_states,
        { id: '0192f1c2-7d3a-7a11-8f2e-0000000000d3', name: 'Rechazada', color: '#B3261E' },
        { id: '0192f1c2-7d3a-7a11-8f2e-0000000000d4', name: 'En espera', color: '#9A5800' },
      ],
    };
    const { session } = createTestSession(
      handlers({ [`GET /v1/tasks/${TASK.id}`]: () => Response.json(many) }),
      meWith(),
    );
    renderApp(session, `/tareas/${TASK.id}`);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Estado: Asignada. Cambiar estado' }),
    );
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Aceptada', 'Rechazada', 'En espera']);
    // The steps are not buttons on the page any more.
    expect(screen.queryByRole('button', { name: /Pasar a/ })).not.toBeInTheDocument();
  });

  it('keeps the state as a dropdown that stays closed when the person has no step to take', async () => {
    const closed = { ...TASK, next_states: [] };
    const { session } = createTestSession(
      handlers({ [`GET /v1/tasks/${TASK.id}`]: () => Response.json(closed) }),
      meWith(),
    );
    renderApp(session, `/tareas/${TASK.id}`);

    const control = await screen.findByRole('button', { name: 'Estado: Asignada' });
    expect(control).toBeDisabled();
    expect(screen.getByText('No tienes pasos que dar en esta tarea.')).toBeVisible();
  });

  it('puts the state inside the details panel, above who and when', async () => {
    const { session } = createTestSession(handlers(), meWith());
    renderApp(session, `/tareas/${TASK.id}`);

    const details = await screen.findByRole('complementary', { name: 'Detalles' });
    expect(
      within(details).getByRole('button', { name: 'Estado: Asignada. Cambiar estado' }),
    ).toBeVisible();
    expect(within(details).getByText('Andrés Asignado')).toBeVisible();
  });

  it('opens the photos of one comment as a gallery and moves only among them', async () => {
    Object.assign(URL, { createObjectURL: () => 'blob:photo', revokeObjectURL: () => {} });
    const A = '0192f1c2-7d3a-7a11-8f2e-0000000000b1';
    const B = '0192f1c2-7d3a-7a11-8f2e-0000000000b2';
    const OTHER = '0192f1c2-7d3a-7a11-8f2e-0000000000b3';
    const base = { ...COMMENT, mentions: [] };
    const two = {
      ...base,
      id: '0192f1c2-7d3a-7a11-8f2e-0000000000e8',
      body: 'Dos',
      file_ids: [A, B],
    };
    const one = {
      ...base,
      id: '0192f1c2-7d3a-7a11-8f2e-0000000000e9',
      body: 'Una',
      file_ids: [OTHER],
    };
    const image = () => new Response(new Blob(['x'], { type: 'image/webp' }));
    const { session } = createTestSession(
      handlers({
        [`GET /v1/tasks/${TASK.id}/thread`]: () => thread([one, two]),
        [`GET /v1/files/${A}/content`]: image,
        [`GET /v1/files/${B}/content`]: image,
        [`GET /v1/files/${OTHER}/content`]: image,
      }),
      meWith(),
    );
    renderApp(session, `/tareas/${TASK.id}`);
    const user = userEvent.setup();

    // In reading order: the photo of the first comment, then the two of the second.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Ver la foto en grande' })).toHaveLength(3),
    );
    const thumbnails = screen.getAllByRole('button', { name: 'Ver la foto en grande' });
    await user.click(thumbnails[1] as HTMLElement);

    const gallery = await screen.findByRole('dialog', { name: 'Galería de fotos' });
    expect(within(gallery).getByText('1 / 2')).toBeVisible();
    // The strip lists this comment's two photos, not the three of the thread.
    expect(within(gallery).getAllByRole('button', { name: /^Ver la foto \d$/ })).toHaveLength(2);

    await user.keyboard('{ArrowRight}');
    expect(within(gallery).getByText('2 / 2')).toBeVisible();
    await user.keyboard('{ArrowRight}');
    expect(within(gallery).getByText('1 / 2')).toBeVisible();
    await user.click(within(gallery).getByRole('button', { name: 'Ver la foto 2' }));
    expect(within(gallery).getByText('2 / 2')).toBeVisible();

    await user.click(within(gallery).getByRole('button', { name: 'Cerrar la galería' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Galería de fotos' })).not.toBeInTheDocument(),
    );
  });

  it('shows Tareas to a person with no task permission and lists what they were asked to do', async () => {
    const { session } = createTestSession(
      { 'GET /v1/tasks': () => Response.json(page([TASK])) },
      meWith({}),
    );
    renderApp(session, '/tareas');

    const table = await screen.findByRole('table', { name: 'Lista de tareas' });
    expect(within(table).getByRole('link', { name: 'Instalar el equipo' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Tareas' })).toBeVisible();
    expect(screen.queryByRole('link', { name: /Nueva tarea/ })).not.toBeInTheDocument();
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

describe('new task', () => {
  it('lets the person assign the task to themselves and creates it', async () => {
    const posts: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/task-types/options': () => Response.json({ data: [TASK.task_type] }),
        'GET /v1/tasks/assignee-options': () => Response.json({ data: [ANDRES] }),
        'POST /v1/tasks': (call) => {
          posts.push(call);
          return Response.json(TASK, { status: 201 });
        },
        [`GET /v1/tasks/${TASK.id}`]: () => Response.json(TASK),
        [`GET /v1/tasks/${TASK.id}/thread`]: () => thread([]),
      },
      meWith(),
    );
    renderApp(session, '/tareas/nueva');
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText(/¿Qué hay que hacer\?/),
      'Dar seguimiento al cobro',
    );
    await user.click(screen.getByRole('combobox', { name: /Tipo/ }));
    await user.click(await screen.findByRole('option', { name: 'Ventas' }));
    await user.click(screen.getByRole('button', { name: 'Asignármela a mí' }));
    expect(screen.getByRole('combobox', { name: /Asignada a/ })).toHaveValue(ME.name);
    expect(screen.queryByRole('button', { name: 'Asignármela a mí' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Vence/), '2030-01-15');
    await user.click(screen.getByRole('button', { name: 'Crear tarea' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body).toMatchObject({
      title: 'Dar seguimiento al cobro',
      assignee_id: ME.id,
      due_date: '2030-01-15',
    });
  });
});
