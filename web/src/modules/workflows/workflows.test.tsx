import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestSession, ME, problem, type Call, type Handler } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';
import { transitionPairs, type WorkflowState } from './workflowFlows';

const ALL = ['view', 'create', 'edit', 'deactivate'];
const withAccess = (actions: string[] = ALL) => ({
  ...ME,
  permissions: { workflow_states: actions },
  scopes: {},
});

const STAMPS = { created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z' };
const id = (n: number) => `0192f1c2-7d3a-7a11-8f2e-00000000c0${String(n).padStart(2, '0')}`;
const state = (n: number, fields: Partial<WorkflowState>): WorkflowState => ({
  id: id(n),
  workflow: 'task',
  name: `Estado ${n}`,
  color: '#0B6BB0',
  sort_order: n,
  is_initial: false,
  is_terminal: false,
  board_column_id: id(100 + n),
  transitions_to: [],
  is_active: true,
  version: 1,
  ...STAMPS,
  ...fields,
});

const ASSIGNED = state(1, { name: 'Asignada', is_initial: true, transitions_to: [id(2), id(4)] });
const ACCEPTED = state(2, { name: 'Aceptada', color: '#00796B', transitions_to: [id(3)] });
const RUNNING = state(3, { name: 'En ejecución', color: '#9A5800' });
const REJECTED = state(4, { name: 'Rechazada', color: '#B3261E', transitions_to: [id(1)] });
const CLOSED = state(5, { name: 'Cerrada', color: '#7C8996', is_terminal: true });
const OLD = state(6, { name: 'Archivada', is_active: false, is_terminal: true });
const TASKS = [ASSIGNED, ACCEPTED, RUNNING, REJECTED, CLOSED, OLD];
const listOf = (states: WorkflowState[]) => () => Response.json({ data: states });

/** One column per state, as the migration leaves a flow: the screen reads the columns next to the states. */
const columnsOf = (states: WorkflowState[]) => () =>
  Response.json({
    data: states.map((each, index) => ({
      id: each.board_column_id,
      workflow: each.workflow,
      name: each.name,
      sort_order: index + 1,
      color: each.color,
      is_final: each.is_terminal,
      state_ids: each.is_active ? [each.id] : [],
    })),
  });

const workflowSession = (
  handlers: Record<string, Handler>,
  me: Parameters<typeof createTestSession>[1],
) =>
  createTestSession(
    {
      'GET /v1/workflows/task/board-columns': columnsOf(TASKS),
      'GET /v1/workflows/ticket/board-columns': () => Response.json({ data: [] }),
      ...handlers,
    },
    me,
  );

describe('flows of states', () => {
  it('lists the states with their function, destinations and activity', async () => {
    const { session } = workflowSession(
      { 'GET /v1/workflows/task/states': listOf(TASKS) },
      withAccess(['view']),
    );
    renderApp(session, '/configuracion/flujos');

    const table = await screen.findByRole('table', { name: 'Estados de tareas' });
    const rowOf = (name: string) => {
      const row = within(table)
        .getAllByRole('row')
        .find((candidate) => within(candidate).queryAllByRole('cell')[0]?.textContent === name);
      return within(row ?? table.ownerDocument.body);
    };
    expect(rowOf('Asignada').getByText('Inicial')).toBeVisible();
    expect(rowOf('Asignada').getByText('Aceptada, Rechazada')).toBeVisible();
    expect(rowOf('Cerrada').getByText('Final')).toBeVisible();
    expect(rowOf('Archivada').getByText('Inactivo')).toBeVisible();
    expect(screen.getAllByTestId('state-dot')[0]).toHaveStyle({ backgroundColor: '#0B6BB0' });
    // Read-only: nothing to add, order or change.
    expect(screen.queryByRole('button', { name: 'Nuevo estado' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ordenar estados' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument();
  });

  it('switches to the ticket flow from the tabs', async () => {
    const ticket = state(20, { workflow: 'ticket', name: 'Abierto', is_initial: true });
    const { session } = workflowSession(
      {
        'GET /v1/workflows/task/states': listOf(TASKS),
        'GET /v1/workflows/ticket/states': listOf([ticket]),
      },
      withAccess(['view']),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await screen.findByRole('table', { name: 'Estados de tareas' });
    await user.click(screen.getByRole('tab', { name: 'Tickets' }));

    expect(await screen.findByRole('table', { name: 'Estados de tickets' })).toBeVisible();
    expect(screen.getByText('Abierto')).toBeVisible();
  });

  it('shows the section in Configuración only to who may view it', async () => {
    const { session } = workflowSession({}, { ...ME, permissions: {}, scopes: {} });
    renderApp(session, '/configuracion/flujos');

    expect(await screen.findByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
  });

  it('creates a state at the end of the flow', async () => {
    const calls: Call[] = [];
    const { session } = workflowSession(
      {
        'GET /v1/workflows/task/states': listOf(TASKS),
        'POST /v1/workflows/task/states': (call) => {
          calls.push(call);
          return Response.json(state(7, { name: 'En revisión', color: '#6B4FA3' }), {
            status: 201,
          });
        },
      },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Nuevo estado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo estado' });
    // A new state is never the initial one, so the option is not even offered.
    expect(within(dialog).queryByLabelText(/Estado inicial/)).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Nombre/), ' En revisión ');
    await user.click(within(dialog).getByRole('radio', { name: 'Morado' }));
    await user.click(within(dialog).getByLabelText(/Estado final/));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ name: 'En revisión', color: '#6B4FA3', is_terminal: true });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('says when the name is already taken', async () => {
    const { session } = workflowSession(
      {
        'GET /v1/workflows/task/states': listOf(TASKS),
        'POST /v1/workflows/task/states': () =>
          problem(422, 'validation_failed', [{ field: 'name', code: 'taken' }]),
      },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Nuevo estado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo estado' });
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Aceptada');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(
      await within(dialog).findByText('Ya hay un estado activo con ese nombre en este flujo.'),
    ).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Nuevo estado' })).toBeVisible();
  });

  it('edits a state with the version it read and can make it the initial one', async () => {
    const calls: Call[] = [];
    const { session } = workflowSession(
      {
        'GET /v1/workflows/task/states': listOf(TASKS),
        [`PATCH /v1/workflows/task/states/${ACCEPTED.id}`]: (call) => {
          calls.push(call);
          return Response.json({ ...ACCEPTED, is_initial: true, version: 2 });
        },
      },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Aceptada' }));
    await user.click(await screen.findByRole('menuitem', { name: /Editar/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar estado' });
    await user.click(within(dialog).getByLabelText(/Estado inicial/));
    // The initial state cannot also be final.
    expect(within(dialog).getByLabelText(/Estado final/)).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      version: 1,
      name: 'Aceptada',
      color: '#00796B',
      is_terminal: false,
      is_initial: true,
    });
  });

  it('explains that the current initial state is changed by choosing another', async () => {
    const { session } = workflowSession(
      { 'GET /v1/workflows/task/states': listOf(TASKS) },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Asignada' }));
    await user.click(await screen.findByRole('menuitem', { name: /Editar/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar estado' });

    expect(within(dialog).getByLabelText(/Estado inicial/)).toBeDisabled();
    expect(
      within(dialog).getByText('Para cambiarlo, marca otro estado como inicial.'),
    ).toBeVisible();
  });

  it('sets the next states of a state and sends the whole flow', async () => {
    const calls: Call[] = [];
    const { session } = workflowSession(
      {
        'GET /v1/workflows/task/states': listOf(TASKS),
        'PUT /v1/workflows/task/transitions': (call) => {
          calls.push(call);
          return Response.json({ data: TASKS });
        },
      },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Aceptada' }));
    await user.click(await screen.findByRole('menuitem', { name: /Siguientes estados/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Siguientes estados de «Aceptada»' });
    // The inactive state and the state itself are not offered.
    expect(within(dialog).queryByLabelText('Archivada')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Aceptada')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('En ejecución')).toBeChecked();
    await user.click(within(dialog).getByLabelText('En ejecución'));
    await user.click(within(dialog).getByLabelText('Cerrada'));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      transitions: [
        { from_id: ASSIGNED.id, to_id: ACCEPTED.id },
        { from_id: ASSIGNED.id, to_id: REJECTED.id },
        { from_id: ACCEPTED.id, to_id: CLOSED.id },
        { from_id: REJECTED.id, to_id: ASSIGNED.id },
      ],
    });
  });

  it('orders the states without saving until asked', async () => {
    const calls: Call[] = [];
    const { session } = workflowSession(
      {
        'GET /v1/workflows/task/states': listOf(TASKS),
        'PUT /v1/workflows/task/states/order': (call) => {
          calls.push(call);
          return Response.json({ data: TASKS });
        },
      },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Ordenar estados' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ordenar estados' });
    const save = within(dialog).getByRole('button', { name: 'Guardar orden' });
    expect(save).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Subir «Asignada»' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Bajar «Asignada»' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Bajar «Cerrada»' })).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'Subir «Aceptada»' }));
    expect(calls).toHaveLength(0);
    await user.click(save);

    await waitFor(() => expect(calls).toHaveLength(1));
    // The inactive state is not part of the order.
    expect(calls[0]?.body).toEqual({
      ids: [ACCEPTED.id, ASSIGNED.id, RUNNING.id, REJECTED.id, CLOSED.id],
    });
  });

  it('asks before deactivating and sends nothing if the person backs out', async () => {
    let called = false;
    const { session } = workflowSession(
      {
        'GET /v1/workflows/task/states': listOf(TASKS),
        [`POST /v1/workflows/task/states/${RUNNING.id}/deactivate`]: () => {
          called = true;
          return Response.json({ ...RUNNING, is_active: false });
        },
      },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de En ejecución' }));
    await user.click(await screen.findByRole('menuitem', { name: /Desactivar/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Desactivar estado' });
    expect(dialog).toHaveTextContent('Los registros que ya están en este estado lo conservan.');
    expect(called).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(called).toBe(false);
  });

  it('says why the initial state cannot be deactivated', async () => {
    const { session } = workflowSession(
      {
        'GET /v1/workflows/task/states': listOf(TASKS),
        [`POST /v1/workflows/task/states/${ASSIGNED.id}/deactivate`]: () =>
          problem(409, 'state_is_initial'),
      },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Asignada' }));
    await user.click(await screen.findByRole('menuitem', { name: /Desactivar/ }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Desactivar estado' })).getByRole('button', {
        name: 'Desactivar',
      }),
    );

    expect(
      await screen.findByText(
        'No se puede desactivar el estado inicial. Marca otro estado como inicial primero.',
      ),
    ).toBeVisible();
  });

  it('reactivates an inactive state after confirming', async () => {
    const calls: Call[] = [];
    const { session } = workflowSession(
      {
        'GET /v1/workflows/task/states': listOf(TASKS),
        [`POST /v1/workflows/task/states/${OLD.id}/reactivate`]: (call) => {
          calls.push(call);
          return Response.json({ ...OLD, is_active: true });
        },
      },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Archivada' }));
    await user.click(await screen.findByRole('menuitem', { name: /Reactivar/ }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Reactivar estado' })).getByRole('button', {
        name: 'Reactivar',
      }),
    );

    await waitFor(() => expect(calls).toHaveLength(1));
  });

  it('works on a phone with cards and the same tabs', async () => {
    setViewportWidth(390);
    const { session } = workflowSession(
      {
        'GET /v1/workflows/task/states': listOf([
          { ...ASSIGNED, name: 'Pendiente de que el técnico confirme la visita en el sitio' },
          OLD,
        ]),
      },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');

    expect(await screen.findByLabelText('Estados de tareas')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Flujos de estado' })).toBeVisible();
    expect(
      screen.getByText('Pendiente de que el técnico confirme la visita en el sitio'),
    ).toBeVisible();
  });
});

describe('board columns', () => {
  // The test before this one leaves a phone-sized window behind.
  beforeEach(() => setViewportWidth(1280));

  it('shows the column of each state next to it', async () => {
    const { session } = workflowSession(
      { 'GET /v1/workflows/task/states': listOf(TASKS) },
      withAccess(['view']),
    );
    renderApp(session, '/configuracion/flujos');

    const table = await screen.findByRole('table', { name: 'Estados de tareas' });
    expect(within(table).getByRole('columnheader', { name: 'Columna del tablero' })).toBeVisible();
    // The fake gives each state a column named like it.
    expect(within(table).getAllByText('Aceptada').length).toBeGreaterThan(1);
    expect(screen.queryByRole('button', { name: 'Configurar tablero' })).not.toBeInTheDocument();
  });

  it('groups states into one column and sends the arrangement only on Guardar', async () => {
    setViewportWidth(390);
    const calls: Call[] = [];
    const { session } = workflowSession(
      {
        'GET /v1/workflows/task/states': listOf(TASKS),
        'PUT /v1/workflows/task/board-columns': (call) => {
          calls.push(call);
          return Response.json({ data: [] });
        },
      },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Configurar tablero' }));
    const dialog = await screen.findByRole('dialog', { name: 'Configurar tablero' });
    const save = within(dialog).getByRole('button', { name: 'Guardar' });
    expect(save).toBeDisabled();

    // Aceptada and En ejecución share a column called «En curso»: the first one is renamed, the second moves in.
    const nameFields = within(dialog).getAllByLabelText('Nombre de la columna');
    await user.clear(nameFields[1] as HTMLElement);
    await user.type(nameFields[1] as HTMLElement, 'En curso');
    await user.click(within(dialog).getByRole('combobox', { name: 'Columna de «En ejecución»' }));
    await user.click(await screen.findByRole('option', { name: 'En curso' }));

    // The column «En ejecución» had is gone, and nothing was sent yet.
    expect(within(dialog).getAllByLabelText('Nombre de la columna')).toHaveLength(4);
    expect(calls).toHaveLength(0);
    await user.click(save);

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      columns: [
        { id: id(101), name: 'Asignada', state_ids: [id(1)] },
        { id: id(102), name: 'En curso', state_ids: [id(2), id(3)] },
        { id: id(104), name: 'Rechazada', state_ids: [id(4)] },
        { id: id(105), name: 'Cerrada', state_ids: [id(5)] },
      ],
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('starts a new column for a state and reorders the columns', async () => {
    setViewportWidth(390);
    const calls: Call[] = [];
    const { session } = workflowSession(
      {
        'GET /v1/workflows/task/states': listOf(TASKS),
        'PUT /v1/workflows/task/board-columns': (call) => {
          calls.push(call);
          return Response.json({ data: [] });
        },
      },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Configurar tablero' }));
    const dialog = await screen.findByRole('dialog', { name: 'Configurar tablero' });
    // It is the fourth of five active columns: three steps up put it first.
    for (let step = 0; step < 3; step += 1) {
      await user.click(
        within(dialog).getByRole('button', { name: 'Subir la columna «Rechazada»' }),
      );
    }
    expect(
      within(dialog).getByRole('button', { name: 'Subir la columna «Rechazada»' }),
    ).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    const names = (calls[0]?.body as { columns: { name: string }[] }).columns.map((c) => c.name);
    expect(names).toEqual(['Rechazada', 'Asignada', 'Aceptada', 'En ejecución', 'Cerrada']);
  });

  it('refuses an empty or repeated name before sending anything', async () => {
    setViewportWidth(390);
    const { session } = workflowSession(
      { 'GET /v1/workflows/task/states': listOf(TASKS) },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Configurar tablero' }));
    const dialog = await screen.findByRole('dialog', { name: 'Configurar tablero' });
    const fields = within(dialog).getAllByLabelText('Nombre de la columna');
    await user.clear(fields[1] as HTMLElement);
    expect(within(dialog).getByText('Escribe un nombre.')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeDisabled();

    await user.type(fields[1] as HTMLElement, ' asignada ');
    expect(within(dialog).getByText('Otra columna ya tiene ese nombre.')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('shows lanes with a handle for each column and state on a desktop, and no selectors', async () => {
    const { session } = workflowSession(
      { 'GET /v1/workflows/task/states': listOf(TASKS) },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Configurar tablero' }));
    const dialog = await screen.findByRole('dialog', { name: 'Configurar tablero' });
    const lanes = within(dialog).getByRole('list', { name: 'Columnas del tablero' });
    expect(
      within(lanes).getByRole('button', { name: 'Arrastrar la columna «Aceptada»' }),
    ).toBeVisible();
    expect(
      within(lanes).getByRole('button', { name: 'Arrastrar el estado «Aceptada»' }),
    ).toBeVisible();
    expect(within(lanes).getAllByLabelText('Nombre de la columna')).toHaveLength(5);
    expect(
      within(lanes).getByText('Suelta aquí un estado para crear una columna nueva'),
    ).toBeVisible();
    // Dragging is how a desktop moves a state: the phone's selectors are not there until the list is asked for.
    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Usar la lista (sin arrastrar)' }));
    expect(within(dialog).getByRole('combobox', { name: 'Columna de «Aceptada»' })).toBeVisible();
    expect(
      within(dialog).queryByRole('list', { name: 'Columnas del tablero' }),
    ).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Volver al arrastre' }));
    expect(within(dialog).getByRole('list', { name: 'Columnas del tablero' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('offers «Una columna nueva» only to a state that shares its column, and sends it without an id', async () => {
    setViewportWidth(390);
    const calls: Call[] = [];
    const { session } = workflowSession(
      {
        'GET /v1/workflows/task/states': listOf(TASKS),
        'GET /v1/workflows/task/board-columns': () =>
          Response.json({
            data: [
              {
                id: id(101),
                workflow: 'task',
                name: 'Por hacer',
                sort_order: 1,
                color: '#0B6BB0',
                is_final: false,
                state_ids: [id(1), id(2)],
              },
              {
                id: id(103),
                workflow: 'task',
                name: 'En ejecución',
                sort_order: 2,
                color: '#9A5800',
                is_final: false,
                state_ids: [id(3), id(4), id(5)],
              },
            ],
          }),
        'PUT /v1/workflows/task/board-columns': (call) => {
          calls.push(call);
          return Response.json({ data: [] });
        },
      },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Configurar tablero' }));
    const dialog = await screen.findByRole('dialog', { name: 'Configurar tablero' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Columna de «Rechazada»' }));
    await user.click(await screen.findByRole('option', { name: 'Una columna nueva' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      columns: [
        { id: id(101), name: 'Por hacer', state_ids: [id(1), id(2)] },
        { id: id(103), name: 'En ejecución', state_ids: [id(3), id(5)] },
        { id: null, name: 'Rechazada', state_ids: [id(4)] },
      ],
    });
  });

  it('tells the person when the flow changed while they edited', async () => {
    setViewportWidth(390);
    const { session } = workflowSession(
      {
        'GET /v1/workflows/task/states': listOf(TASKS),
        'PUT /v1/workflows/task/board-columns': () =>
          problem(422, 'validation_failed', [{ field: 'state_ids', code: 'invalid' }]),
      },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Configurar tablero' }));
    const dialog = await screen.findByRole('dialog', { name: 'Configurar tablero' });
    await user.click(within(dialog).getByRole('button', { name: 'Bajar la columna «Asignada»' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await within(dialog).findByText(/cambiaron mientras editabas/)).toBeVisible();
    expect(dialog).toBeVisible();
  });

  it('lets a new state join an existing column', async () => {
    const calls: Call[] = [];
    const { session } = workflowSession(
      {
        'GET /v1/workflows/task/states': listOf(TASKS),
        'POST /v1/workflows/task/states': (call) => {
          calls.push(call);
          return Response.json(state(7, { name: 'En revisión' }), { status: 201 });
        },
      },
      withAccess(),
    );
    renderApp(session, '/configuracion/flujos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Nuevo estado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo estado' });
    await user.type(within(dialog).getByLabelText(/Nombre/), 'En revisión');
    await user.click(within(dialog).getByRole('combobox', { name: 'Columna del tablero' }));
    await user.click(await screen.findByRole('option', { name: 'En ejecución' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ name: 'En revisión', board_column_id: id(103) });
  });
});

describe('transitionPairs', () => {
  it('replaces the destinations of one state and keeps the rest, skipping inactive states', () => {
    const inactive = state(9, { name: 'Vieja', is_active: false, transitions_to: [id(1)] });

    expect(transitionPairs([ASSIGNED, ACCEPTED, inactive], ACCEPTED.id, [id(1)])).toEqual([
      { from_id: id(1), to_id: id(2) },
      { from_id: id(1), to_id: id(4) },
      { from_id: id(2), to_id: id(1) },
    ]);
  });
});
