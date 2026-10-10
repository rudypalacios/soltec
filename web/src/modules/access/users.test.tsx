import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, page, problem, type Call } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const OTHER = {
  id: '0192f1c2-7d3a-7a11-8f2e-00000000000b',
  type: 'internal',
  name: 'Luis Gómez',
  email: 'luis@example.com',
  roles: [{ id: '0192f1c2-7d3a-7a11-8f2e-0000000000b1', code: null, name: 'Ventas' }],
  department: null,
  manager: null,
  is_active: true,
  must_change_password: false,
  invitation_pending: false,
  password_changed_at: '2026-10-01T10:00:00.000Z',
  last_login_at: null,
  locked_until: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  version: 1,
};
const SELF = {
  ...OTHER,
  id: ME.id,
  name: ME.name,
  email: ME.email,
  roles: ME.roles,
  last_login_at: '2026-10-09T12:00:00.000Z',
};
const INACTIVE = {
  ...OTHER,
  id: '0192f1c2-7d3a-7a11-8f2e-00000000000c',
  name: 'Marta Ruiz',
  email: 'marta@example.com',
  is_active: false,
};

const list = (...users: object[]) => ({
  'GET /v1/users': () => Response.json(page(users)),
});

afterEach(() => vi.unstubAllGlobals());

describe('users list', () => {
  it('shows each user with their profiles and status in a table on a desktop', async () => {
    const { session } = createTestSession(list(SELF, OTHER, INACTIVE));
    renderApp(session, '/usuarios');

    const table = await screen.findByRole('table', { name: 'Lista de usuarios' });
    expect(within(table).getByText('Luis Gómez')).toBeInTheDocument();
    expect(within(table).getByText('luis@example.com')).toBeInTheDocument();
    expect(within(table).getAllByText('Ventas')).toHaveLength(2);
    expect(within(table).getByText('Inactivo')).toBeInTheDocument();
    expect(within(table).getAllByText('Nunca')).toHaveLength(2);
  });

  it('shows cards instead of a table on a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(list(SELF, OTHER));
    renderApp(session, '/usuarios');

    const cards = await screen.findByLabelText('Lista de usuarios');
    expect(within(cards).getByText('Luis Gómez')).toBeInTheDocument();
    expect(within(cards).getByText(/Último acceso: Nunca/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('asks the API for the page, the search and the status the person chose', async () => {
    const { session, calls } = createTestSession(list(OTHER));
    renderApp(session, '/usuarios');
    const user = userEvent.setup();

    await screen.findByText('Luis Gómez');
    await user.type(screen.getByLabelText('Buscar por nombre o correo'), 'luis');
    await user.click(screen.getByLabelText('Estado'));
    await user.click(await screen.findByRole('option', { name: 'Inactivos' }));

    await waitFor(() => {
      const last = calls.filter((call) => call.path === '/v1/users').at(-1);
      expect(last?.query.get('q')).toBe('luis');
      expect(last?.query.get('status')).toBe('inactive');
      expect(last?.query.get('page')).toBe('1');
    });
  });

  it('says when nothing matches and when the list cannot be loaded', async () => {
    const empty = createTestSession(list());
    const { unmount } = renderApp(empty.session, '/usuarios');
    expect(await screen.findByText('No hay usuarios con esos filtros.')).toBeInTheDocument();
    unmount();

    const failing = createTestSession({ 'GET /v1/users': () => problem(403, 'forbidden') });
    renderApp(failing.session, '/usuarios');
    expect(await screen.findByText('No tienes permiso para hacer esto.')).toBeInTheDocument();
  });

  it('offers to create users only to whoever may', async () => {
    const reader = { ...ME, permissions: { users: ['view'] }, scopes: {} };
    const { session } = createTestSession(list(OTHER), reader);
    renderApp(session, '/usuarios');

    await screen.findByText('Luis Gómez');
    expect(screen.queryByRole('link', { name: 'Nuevo usuario' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument();
  });

  it('offers no action on the own account', async () => {
    const { session } = createTestSession(list(SELF, OTHER));
    renderApp(session, '/usuarios');

    await screen.findByText('Luis Gómez');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: `Acciones de ${ME.name}` }));

    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Desactivar' })).not.toBeInTheDocument();
  });
});

describe('deactivating and reactivating', () => {
  async function openAction(label: string, buttonName: string) {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: buttonName }));
    await user.click(await screen.findByRole('menuitem', { name: label }));
    return user;
  }

  it('asks first and then deactivates', async () => {
    let call: Call | undefined;
    const deactivate = `POST /v1/users/${OTHER.id}/deactivate`;
    const { session } = createTestSession({
      ...list(OTHER),
      [deactivate]: (received) => {
        call = received;
        return Response.json({ ...OTHER, is_active: false });
      },
    });
    renderApp(session, '/usuarios');

    const user = await openAction('Desactivar', 'Acciones de Luis Gómez');
    expect(await screen.findByText(/no podrá iniciar sesión/)).toBeInTheDocument();
    expect(call).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(call).toBeDefined());
  });

  it('does nothing when the person cancels', async () => {
    const { session, calls } = createTestSession(list(OTHER));
    renderApp(session, '/usuarios');

    const user = await openAction('Desactivar', 'Acciones de Luis Gómez');
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(calls.some((call) => call.method === 'POST' && call.path.includes('deactivate'))).toBe(
      false,
    );
  });

  it('reactivates an inactive user', async () => {
    let reactivated = false;
    const { session } = createTestSession({
      ...list(INACTIVE),
      [`POST /v1/users/${INACTIVE.id}/reactivate`]: () => {
        reactivated = true;
        return Response.json({ ...INACTIVE, is_active: true });
      },
    });
    renderApp(session, '/usuarios');

    const user = await openAction('Reactivar', 'Acciones de Marta Ruiz');
    await user.click(await screen.findByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(reactivated).toBe(true));
  });

  it('explains why the server refused', async () => {
    const { session } = createTestSession({
      ...list(OTHER),
      [`POST /v1/users/${OTHER.id}/deactivate`]: () => problem(409, 'last_admin'),
    });
    renderApp(session, '/usuarios');

    const user = await openAction('Desactivar', 'Acciones de Luis Gómez');
    await user.click(await screen.findByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText(/debe quedar al menos un administrador activo/),
    ).toBeInTheDocument();
  });

  it('works from the card on a phone', async () => {
    setViewportWidth(390);
    let deactivated = false;
    const { session } = createTestSession({
      ...list(OTHER),
      [`POST /v1/users/${OTHER.id}/deactivate`]: () => {
        deactivated = true;
        return Response.json({ ...OTHER, is_active: false });
      },
    });
    renderApp(session, '/usuarios');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Desactivar: Luis Gómez' }));
    await user.click(await screen.findByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(deactivated).toBe(true));
  });
});

describe('creating a user', () => {
  const ROLE = {
    id: '0192f1c2-7d3a-7a11-8f2e-0000000000b1',
    code: null,
    name: 'Ventas',
    description: null,
    user_type: 'internal',
    is_system: false,
    is_active: true,
    permissions: {},
    scopes: {},
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-01T10:00:00.000Z',
    version: 1,
  };

  async function fillForm(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText(/^Nombre/), 'Nueva Persona');
    await user.type(screen.getByLabelText(/^Correo/), 'nueva@example.com');
    await user.click(screen.getByLabelText(/^Perfiles/));
    await user.click(await screen.findByRole('option', { name: 'Ventas' }));
  }

  it('sends the data, then says the invitation was emailed', async () => {
    let created: Call | undefined;
    const { session } = createTestSession({
      'GET /v1/roles': () => Response.json(page([ROLE])),
      'POST /v1/users': (call) => {
        created = call;
        return Response.json(
          {
            ...OTHER,
            name: 'Nueva Persona',
            email: 'nueva@example.com',
            invitation_pending: true,
            invitation_sent: true,
          },
          { status: 201 },
        );
      },
    });
    renderApp(session, '/usuarios/nuevo');
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Crear y enviar invitación' }));

    expect(await screen.findByRole('heading', { name: 'Usuario creado' })).toBeInTheDocument();
    expect(created?.body).toEqual({
      name: 'Nueva Persona',
      email: 'nueva@example.com',
      role_ids: [ROLE.id],
      department_id: null,
      manager_id: null,
    });
    expect(screen.getByText(/Enviamos la invitación a nueva@example.com/)).toBeInTheDocument();
    expect(screen.queryByText(/contraseña temporal/i)).not.toBeInTheDocument();
  });

  it('warns when the user exists but the email could not be sent', async () => {
    const { session } = createTestSession({
      'GET /v1/roles': () => Response.json(page([ROLE])),
      'POST /v1/users': () =>
        Response.json(
          { ...OTHER, invitation_pending: true, invitation_sent: false },
          { status: 201 },
        ),
    });
    renderApp(session, '/usuarios/nuevo');
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Crear y enviar invitación' }));

    expect(await screen.findByText(/el correo no pudo salir/)).toBeInTheDocument();
  });

  it('asks only for active internal profiles', async () => {
    const { session, calls } = createTestSession({
      'GET /v1/roles': () => Response.json(page([ROLE])),
    });
    renderApp(session, '/usuarios/nuevo');

    await screen.findByLabelText(/^Nombre/);
    await waitFor(() => expect(calls.some((call) => call.path === '/v1/roles')).toBe(true));
    const request = calls.find((call) => call.path === '/v1/roles');
    expect(request?.query.get('status')).toBe('active');
    expect(request?.query.get('user_type')).toBe('internal');
  });

  it('keeps the button off until the form is complete', async () => {
    const { session } = createTestSession({ 'GET /v1/roles': () => Response.json(page([ROLE])) });
    renderApp(session, '/usuarios/nuevo');
    const user = userEvent.setup();

    const create = await screen.findByRole('button', { name: 'Crear y enviar invitación' });
    expect(create).toBeDisabled();
    await fillForm(user);
    expect(create).toBeEnabled();
  });

  it('shows what the server rejected next to each field', async () => {
    const { session } = createTestSession({
      'GET /v1/roles': () => Response.json(page([ROLE])),
      'POST /v1/users': () =>
        problem(422, 'validation_failed', [
          { field: 'email', code: 'taken' },
          { field: 'role_ids', code: 'not_found' },
        ]),
    });
    renderApp(session, '/usuarios/nuevo');
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Crear y enviar invitación' }));

    expect(await screen.findByText('Ya está en uso.')).toBeInTheDocument();
    expect(screen.getByText('Algún perfil ya no existe o está inactivo.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Usuario creado' })).not.toBeInTheDocument();
  });

  it('is closed to whoever may not create users', async () => {
    const reader = { ...ME, permissions: { users: ['view'] }, scopes: {} };
    const { session } = createTestSession({}, reader);
    renderApp(session, '/usuarios/nuevo');

    expect(
      await screen.findByText('No tienes permiso para ver esta pantalla.'),
    ).toBeInTheDocument();
  });
});

describe('pending invitations', () => {
  const PENDING = { ...OTHER, invitation_pending: true, password_changed_at: null };

  it('marks a user who has not accepted yet and offers to resend', async () => {
    let sent = false;
    const { session } = createTestSession({
      ...list(PENDING),
      [`POST /v1/users/${PENDING.id}/invite`]: () => {
        sent = true;
        return new Response(null, { status: 204 });
      },
    });
    renderApp(session, '/usuarios');
    const user = userEvent.setup();

    expect(await screen.findByText('Invitación pendiente')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Acciones de Luis Gómez' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Reenviar invitación' }));

    await waitFor(() => expect(sent).toBe(true));
    expect(
      await screen.findByText(/Enviamos la invitación a luis@example.com/),
    ).toBeInTheDocument();
  });

  it('does not offer to resend to someone who already has a password', async () => {
    const { session } = createTestSession(list(OTHER));
    renderApp(session, '/usuarios');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Luis Gómez' }));

    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Reenviar invitación' })).not.toBeInTheDocument();
  });

  it('explains when the mail server refused the message', async () => {
    const { session } = createTestSession({
      ...list(PENDING),
      [`POST /v1/users/${PENDING.id}/invite`]: () => problem(502, 'mail_send_failed'),
    });
    renderApp(session, '/usuarios');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Luis Gómez' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Reenviar invitación' }));

    expect(await screen.findByText(/servidor de correo rechazó/)).toBeInTheDocument();
  });

  it('resends from the card on a phone', async () => {
    setViewportWidth(390);
    let sent = false;
    const { session } = createTestSession({
      ...list(PENDING),
      [`POST /v1/users/${PENDING.id}/invite`]: () => {
        sent = true;
        return new Response(null, { status: 204 });
      },
    });
    renderApp(session, '/usuarios');
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Reenviar invitación: Luis Gómez' }),
    );

    await waitFor(() => expect(sent).toBe(true));
  });
});

describe('editing a user', () => {
  const ROLE = {
    id: '0192f1c2-7d3a-7a11-8f2e-0000000000b1',
    code: null,
    name: 'Ventas',
    description: null,
    user_type: 'internal',
    is_system: false,
    is_active: true,
    permissions: {},
    scopes: {},
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-01T10:00:00.000Z',
    version: 1,
  };
  const handlers = (extra: Record<string, (call: Call) => Response> = {}) => ({
    ...list(OTHER),
    'GET /v1/roles': () => Response.json(page([ROLE])),
    [`GET /v1/users/${OTHER.id}`]: () => Response.json(OTHER),
    ...extra,
  });

  it('loads the user, sends only what the form holds with the version, and returns to the list', async () => {
    let patched: Call | undefined;
    const { session } = createTestSession(
      handlers({
        [`PATCH /v1/users/${OTHER.id}`]: (call) => {
          patched = call;
          return Response.json({ ...OTHER, name: 'Luis G.', version: 2 });
        },
      }),
    );
    renderApp(session, `/usuarios/${OTHER.id}/editar`);
    const user = userEvent.setup();

    const name = await screen.findByLabelText(/^Nombre/);
    expect(name).toHaveValue('Luis Gómez');
    await user.clear(name);
    await user.type(name, 'Luis G.');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/usuarios'));
    // Without permission on departments the field is hidden and not sent; the manager is always sent.
    expect(patched?.body).toEqual({
      version: 1,
      name: 'Luis G.',
      email: 'luis@example.com',
      role_ids: [ROLE.id],
      manager_id: null,
    });
  });

  it('warns that changing the email of a pending invitation breaks the old link', async () => {
    const pending = { ...OTHER, invitation_pending: true };
    const { session } = createTestSession(
      handlers({ [`GET /v1/users/${OTHER.id}`]: () => Response.json(pending) }),
    );
    renderApp(session, `/usuarios/${OTHER.id}/editar`);
    const user = userEvent.setup();

    const email = await screen.findByLabelText(/^Correo/);
    expect(screen.queryByText(/deja de servir/)).not.toBeInTheDocument();
    await user.type(email, 'x');

    expect(await screen.findByText(/deja de servir/)).toBeInTheDocument();
  });

  it('shows what the server rejected and the reason of a refusal', async () => {
    const { session } = createTestSession(
      handlers({
        [`PATCH /v1/users/${OTHER.id}`]: () =>
          problem(422, 'validation_failed', [{ field: 'email', code: 'taken' }]),
      }),
    );
    renderApp(session, `/usuarios/${OTHER.id}/editar`);
    const user = userEvent.setup();

    await screen.findByLabelText(/^Nombre/);
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Ya está en uso.')).toBeInTheDocument();
  });

  it('explains a stale version', async () => {
    const { session } = createTestSession(
      handlers({ [`PATCH /v1/users/${OTHER.id}`]: () => problem(409, 'conflict') }),
    );
    renderApp(session, `/usuarios/${OTHER.id}/editar`);
    const user = userEvent.setup();

    await screen.findByLabelText(/^Nombre/);
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText(/Otra persona cambió a este usuario/)).toBeInTheDocument();
  });

  it('is closed to whoever may not edit users', async () => {
    const reader = { ...ME, permissions: { users: ['view'] }, scopes: {} };
    const { session } = createTestSession({}, reader);
    renderApp(session, `/usuarios/${OTHER.id}/editar`);

    expect(
      await screen.findByText('No tienes permiso para ver esta pantalla.'),
    ).toBeInTheDocument();
  });
});

describe('department and direct manager of a user', () => {
  const ORG_ME = {
    ...ME,
    permissions: { ...ME.permissions, departments: ['view'] },
    scopes: { ...ME.scopes, departments: 'all' },
  };
  const ROLE = {
    id: '0192f1c2-7d3a-7a11-8f2e-0000000000b1',
    code: null,
    name: 'Ventas',
    description: null,
    user_type: 'internal',
    is_system: false,
    is_active: true,
    permissions: {},
    scopes: {},
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-01T10:00:00.000Z',
    version: 1,
  };
  const SALES = {
    id: '0192f1c2-7d3a-7a11-8f2e-0000000000d1',
    name: 'Comercial',
    is_active: true,
    active_user_count: 2,
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-01T10:00:00.000Z',
    version: 1,
  };
  const BOSS = { ...OTHER, id: '0192f1c2-7d3a-7a11-8f2e-0000000000e1', name: 'Jefa Uno' };

  it('asks for the department and lets the person pick a manager when creating a user', async () => {
    let created: Call | undefined;
    const { session } = createTestSession(
      {
        'GET /v1/roles': () => Response.json(page([ROLE])),
        'GET /v1/departments': () => Response.json(page([SALES])),
        'GET /v1/users': () => Response.json(page([BOSS])),
        'POST /v1/users': (call) => {
          created = call;
          return Response.json({ ...OTHER, invitation_sent: true }, { status: 201 });
        },
      },
      ORG_ME,
    );
    renderApp(session, '/usuarios/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Nombre/), 'Nueva Persona');
    await user.type(screen.getByLabelText(/^Correo/), 'nueva@example.com');
    await user.click(screen.getByLabelText(/^Perfiles/));
    await user.click(await screen.findByRole('option', { name: 'Ventas' }));
    const submit = screen.getByRole('button', { name: 'Crear y enviar invitación' });
    // The department is required in the form while there are departments to choose from.
    expect(submit).toBeDisabled();

    await user.click(screen.getByLabelText(/^Departamento/));
    await user.click(await screen.findByRole('option', { name: 'Comercial' }));
    await user.click(screen.getByLabelText(/^Jefe directo/));
    await user.click(await screen.findByRole('option', { name: 'Jefa Uno' }));
    await user.click(submit);

    await screen.findByRole('heading', { name: 'Usuario creado' });
    expect(created?.body).toMatchObject({ department_id: SALES.id, manager_id: BOSS.id });
  });

  it('explains a manager who reports to the user', async () => {
    const placed = { ...OTHER, department: { id: SALES.id, name: SALES.name } };
    const { session } = createTestSession(
      {
        'GET /v1/roles': () => Response.json(page([ROLE])),
        'GET /v1/departments': () => Response.json(page([SALES])),
        'GET /v1/users': () => Response.json(page([placed, BOSS])),
        [`GET /v1/users/${OTHER.id}`]: () => Response.json(placed),
        [`PATCH /v1/users/${OTHER.id}`]: () =>
          problem(422, 'validation_failed', [{ field: 'manager_id', code: 'cycle' }]),
      },
      ORG_ME,
    );
    renderApp(session, `/usuarios/${OTHER.id}/editar`);
    const user = userEvent.setup();

    expect(await screen.findByLabelText(/^Departamento/)).toHaveValue('Comercial');
    await user.click(screen.getByLabelText(/^Jefe directo/));
    // Nobody is offered as their own manager.
    expect(screen.queryByRole('option', { name: 'Luis Gómez' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Jefa Uno' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await screen.findByText('Esa persona depende de este usuario: no puede ser su jefe.'),
    ).toBeInTheDocument();
  });

  it('shows the department in the list and filters by the one in the address', async () => {
    const placed = { ...OTHER, department: { id: SALES.id, name: SALES.name } };
    const { session, calls } = createTestSession(
      {
        'GET /v1/departments': () => Response.json(page([SALES])),
        'GET /v1/users': () => Response.json(page([placed])),
      },
      ORG_ME,
    );
    renderApp(session, `/usuarios?departamento=${SALES.id}`);

    const table = await screen.findByRole('table', { name: 'Lista de usuarios' });
    expect(within(table).getByText('Comercial')).toBeInTheDocument();
    const listCall = calls.find((call) => call.path === '/v1/users');
    expect(listCall?.query.get('department_id')).toBe(SALES.id);
  });
});
