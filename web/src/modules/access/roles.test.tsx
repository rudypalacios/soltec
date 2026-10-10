import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, page, problem, type Call, type Handler } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const BASE_ROLE = {
  code: null,
  description: null,
  user_type: 'internal',
  is_system: false,
  is_active: true,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  version: 3,
};
const ADMIN = {
  ...BASE_ROLE,
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000a1',
  code: 'admin',
  name: 'Administrador',
  description: 'Acceso total.',
  is_system: true,
  version: 1,
  permissions: {
    users: ['create', 'deactivate', 'edit', 'view'],
    roles: ['create', 'deactivate', 'edit', 'view'],
  },
  scopes: { users: 'all', roles: 'all' },
};
const SALES = {
  ...BASE_ROLE,
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000b1',
  name: 'Ventas',
  description: 'Equipo comercial',
  permissions: { users: ['view'] },
  scopes: { users: 'own' },
};
const RETIRED = {
  ...SALES,
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000b2',
  name: 'Retirado',
  is_active: false,
};

const catalogs: Record<string, Handler> = {
  'GET /v1/resources': () =>
    Response.json({
      data: [
        { code: 'roles', name: 'Perfiles' },
        { code: 'users', name: 'Usuarios' },
      ],
    }),
  // The API returns them alphabetically; the form shows them in reading order.
  'GET /v1/permissions': () =>
    Response.json({
      data: [
        { code: 'create', name: 'Crear' },
        { code: 'deactivate', name: 'Desactivar' },
        { code: 'edit', name: 'Editar' },
        { code: 'view', name: 'Ver' },
      ],
    }),
};

afterEach(() => vi.unstubAllGlobals());

describe('roles list', () => {
  it('shows system and custom profiles with what can be done to each', async () => {
    const { session } = createTestSession({
      'GET /v1/roles': () => Response.json(page([ADMIN, SALES])),
    });
    renderApp(session, '/perfiles');

    const table = await screen.findByRole('table', { name: 'Lista de perfiles' });
    expect(within(table).getByText('Sistema')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Ver Administrador' })).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Editar Ventas' })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Desactivar Ventas' })).toBeInTheDocument();
    expect(
      within(table).queryByRole('button', { name: 'Desactivar Administrador' }),
    ).not.toBeInTheDocument();
  });

  it('shows cards on a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession({
      'GET /v1/roles': () => Response.json(page([ADMIN, SALES])),
    });
    renderApp(session, '/perfiles');

    const cards = await screen.findByLabelText('Lista de perfiles');
    expect(within(cards).getByText('Equipo comercial')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('only lets whoever may deactivate or edit do so', async () => {
    const reader = { ...ME, permissions: { roles: ['view'] }, scopes: {} };
    const { session } = createTestSession(
      { 'GET /v1/roles': () => Response.json(page([SALES])) },
      reader,
    );
    renderApp(session, '/perfiles');

    expect(await screen.findByRole('link', { name: 'Ver Ventas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desactivar Ventas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nuevo perfil' })).not.toBeInTheDocument();
  });

  it('explains that a profile still in use cannot be deactivated', async () => {
    const { session } = createTestSession({
      'GET /v1/roles': () => Response.json(page([SALES])),
      [`POST /v1/roles/${SALES.id}/deactivate`]: () => problem(409, 'conflict'),
    });
    renderApp(session, '/perfiles');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Desactivar Ventas' }));
    await user.click(await screen.findByRole('button', { name: 'Desactivar' }));

    expect(await screen.findByText(/hay usuarios activos con este perfil/)).toBeInTheDocument();
  });

  it('reactivates an inactive profile', async () => {
    let reactivated = false;
    const { session } = createTestSession({
      'GET /v1/roles': () => Response.json(page([RETIRED])),
      [`POST /v1/roles/${RETIRED.id}/reactivate`]: () => {
        reactivated = true;
        return Response.json({ ...RETIRED, is_active: true });
      },
    });
    renderApp(session, '/perfiles');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Reactivar Retirado' }));
    await user.click(await screen.findByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(reactivated).toBe(true));
  });
});

describe('creating a role', () => {
  it('builds the matrix from the catalogs and sends it', async () => {
    let created: Call | undefined;
    const { session } = createTestSession({
      ...catalogs,
      'GET /v1/roles': () => Response.json(page([])),
      'POST /v1/roles': (call) => {
        created = call;
        return Response.json({ ...SALES, id: 'new' }, { status: 201 });
      },
    });
    renderApp(session, '/perfiles/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Nombre/), '  Compras ');
    await user.click(screen.getByRole('checkbox', { name: 'Ver Usuarios' }));
    await user.click(screen.getByRole('checkbox', { name: 'Editar Usuarios' }));
    await user.click(screen.getByRole('checkbox', { name: 'Ver Perfiles' }));
    await user.click(screen.getByRole('checkbox', { name: 'Ver Perfiles' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(created).toBeDefined());
    expect(created?.body).toEqual({
      name: 'Compras',
      description: null,
      user_type: 'internal',
      permissions: { users: ['view', 'edit'] },
      scopes: { users: 'own' },
    });
    expect(await screen.findByText('Perfil guardado.')).toBeInTheDocument();
  });

  it('shows the verbs in reading order, not alphabetically', async () => {
    const { session } = createTestSession(catalogs);
    renderApp(session, '/perfiles/nuevo');

    const table = await screen.findByRole('table', { name: 'Permisos del perfil' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headers).toEqual([
      'Módulo',
      'Ver',
      'Crear',
      'Editar',
      'Desactivar',
      'Alcance de los datos',
    ]);
  });

  it('sends the scope that was chosen', async () => {
    let created: Call | undefined;
    const { session } = createTestSession({
      ...catalogs,
      'POST /v1/roles': (call) => {
        created = call;
        return Response.json({ ...SALES }, { status: 201 });
      },
    });
    renderApp(session, '/perfiles/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Nombre/), 'Supervisión');
    await user.click(screen.getByRole('checkbox', { name: 'Ver Usuarios' }));
    await user.click(screen.getByRole('combobox', { name: 'Alcance de Usuarios' }));
    await user.click(await screen.findByRole('option', { name: 'Todo' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(created).toBeDefined());
    expect(created?.body).toMatchObject({ scopes: { users: 'all' } });
  });

  it('offers the team scope', async () => {
    let created: Call | undefined;
    const { session } = createTestSession({
      ...catalogs,
      'POST /v1/roles': (call) => {
        created = call;
        return Response.json({ ...SALES }, { status: 201 });
      },
    });
    renderApp(session, '/perfiles/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Nombre/), 'Supervisión');
    await user.click(screen.getByRole('checkbox', { name: 'Ver Usuarios' }));
    await user.click(screen.getByRole('combobox', { name: 'Alcance de Usuarios' }));
    await user.click(await screen.findByRole('option', { name: 'Su equipo' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(created?.body).toMatchObject({ scopes: { users: 'team' } }));
  });

  it('cannot choose the scope of a module with no permission', async () => {
    const { session } = createTestSession(catalogs);
    renderApp(session, '/perfiles/nuevo');

    expect(await screen.findByRole('combobox', { name: 'Alcance de Usuarios' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('needs a name', async () => {
    const { session } = createTestSession(catalogs);
    renderApp(session, '/perfiles/nuevo');

    expect(await screen.findByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('shows a rejected name next to its field', async () => {
    const { session } = createTestSession({
      ...catalogs,
      'POST /v1/roles': () => problem(422, 'validation_failed', [{ field: 'name', code: 'taken' }]),
    });
    renderApp(session, '/perfiles/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Nombre/), 'Ventas');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Ya está en uso.')).toBeInTheDocument();
  });

  it('uses one card per module on a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(catalogs);
    renderApp(session, '/perfiles/nuevo');

    const cards = await screen.findByLabelText('Permisos del perfil');
    expect(within(cards).getByText('Usuarios')).toBeInTheDocument();
    expect(within(cards).getByText('Perfiles')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(within(cards).getAllByRole('checkbox')).toHaveLength(8);
  });
});

describe('editing a role', () => {
  it('starts from the role as the server has it and sends the version it read', async () => {
    let saved: Call | undefined;
    const { session } = createTestSession({
      ...catalogs,
      [`GET /v1/roles/${SALES.id}`]: () => Response.json(SALES),
      [`PATCH /v1/roles/${SALES.id}`]: (call) => {
        saved = call;
        return Response.json({ ...SALES, version: 4 });
      },
      'GET /v1/roles': () => Response.json(page([SALES])),
    });
    renderApp(session, `/perfiles/${SALES.id}`);
    const user = userEvent.setup();

    expect(await screen.findByLabelText(/^Nombre/)).toHaveValue('Ventas');
    expect(screen.getByRole('checkbox', { name: 'Ver Usuarios' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Editar Usuarios' })).not.toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Editar Usuarios' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(saved).toBeDefined());
    expect(saved?.body).toEqual({
      version: 3,
      name: 'Ventas',
      description: 'Equipo comercial',
      permissions: { users: ['view', 'edit'] },
      scopes: { users: 'own' },
    });
  });

  it('clears the description when it is emptied', async () => {
    let saved: Call | undefined;
    const { session } = createTestSession({
      ...catalogs,
      [`GET /v1/roles/${SALES.id}`]: () => Response.json(SALES),
      [`PATCH /v1/roles/${SALES.id}`]: (call) => {
        saved = call;
        return Response.json(SALES);
      },
      'GET /v1/roles': () => Response.json(page([SALES])),
    });
    renderApp(session, `/perfiles/${SALES.id}`);
    const user = userEvent.setup();

    await user.clear(await screen.findByLabelText(/^Descripción/));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(saved).toBeDefined());
    expect(saved?.body).toMatchObject({ description: null });
  });

  it('tells the person someone else changed the role meanwhile', async () => {
    const { session } = createTestSession({
      ...catalogs,
      [`GET /v1/roles/${SALES.id}`]: () => Response.json(SALES),
      [`PATCH /v1/roles/${SALES.id}`]: () => problem(409, 'conflict'),
    });
    renderApp(session, `/perfiles/${SALES.id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText(/Otra persona cambió este perfil mientras lo editabas/),
    ).toBeInTheDocument();
  });

  it('shows a system profile read-only, without a save button', async () => {
    const { session } = createTestSession({
      ...catalogs,
      [`GET /v1/roles/${ADMIN.id}`]: () => Response.json(ADMIN),
    });
    renderApp(session, `/perfiles/${ADMIN.id}`);

    expect(await screen.findByText(/no se puede modificar/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nombre/)).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Ver Usuarios' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver' })).toBeInTheDocument();
  });

  it('shows a profile read-only to whoever may only view profiles', async () => {
    const reader = { ...ME, permissions: { roles: ['view'] }, scopes: {} };
    const { session } = createTestSession(
      { ...catalogs, [`GET /v1/roles/${SALES.id}`]: () => Response.json(SALES) },
      reader,
    );
    renderApp(session, `/perfiles/${SALES.id}`);

    expect(await screen.findByLabelText(/^Nombre/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });

  it('says so when the profile does not exist', async () => {
    const { session } = createTestSession({
      ...catalogs,
      'GET /v1/roles/0192f1c2-7d3a-7a11-8f2e-0000000000ff': () => problem(404, 'not_found'),
    });
    renderApp(session, '/perfiles/0192f1c2-7d3a-7a11-8f2e-0000000000ff');

    expect(await screen.findByText('No se encontró el registro.')).toBeInTheDocument();
  });
});
