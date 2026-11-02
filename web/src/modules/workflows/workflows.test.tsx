import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createTestSession, ME, problem, type Call } from '../../test/fakeApi';
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

describe('flows of states', () => {
  it('lists the states with their function, destinations and activity', async () => {
    const { session } = createTestSession(
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
    const { session } = createTestSession(
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
    const { session } = createTestSession({}, { ...ME, permissions: {}, scopes: {} });
    renderApp(session, '/configuracion/flujos');

    expect(await screen.findByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
  });

  it('creates a state at the end of the flow', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
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
    const { session } = createTestSession(
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
    const { session } = createTestSession(
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
    const { session } = createTestSession(
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
    const { session } = createTestSession(
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
    const { session } = createTestSession(
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
    const { session } = createTestSession(
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
    const { session } = createTestSession(
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
    const { session } = createTestSession(
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
    const { session } = createTestSession(
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
