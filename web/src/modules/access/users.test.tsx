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
  is_active: true,
  must_change_password: false,
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
    expect(screen.getByRole('button', { name: 'Acciones de Luis Gómez' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: `Acciones de ${ME.name}` }),
    ).not.toBeInTheDocument();
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

    await user.click(await screen.findByRole('button', { name: 'Desactivar a Luis Gómez' }));
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

  it('sends the data, then shows the temporary password once', async () => {
    let created: Call | undefined;
    const { session } = createTestSession({
      'GET /v1/roles': () => Response.json(page([ROLE])),
      'POST /v1/users': (call) => {
        created = call;
        return Response.json(
          { ...OTHER, name: 'Nueva Persona', email: 'nueva@example.com' },
          { status: 201 },
        );
      },
    });
    renderApp(session, '/usuarios/nuevo');
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));

    expect(await screen.findByRole('heading', { name: 'Usuario creado' })).toBeInTheDocument();
    const body = created?.body as {
      initial_password: string;
      role_ids: string[];
      email: string;
      name: string;
    };
    expect(body).toMatchObject({
      name: 'Nueva Persona',
      email: 'nueva@example.com',
      role_ids: [ROLE.id],
    });
    expect(body.initial_password).toHaveLength(16);
    expect(screen.getByText(body.initial_password)).toBeInTheDocument();
    expect(screen.getByText(/no se vuelve a mostrar/)).toBeInTheDocument();
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

    expect(await screen.findByRole('button', { name: 'Crear usuario' })).toBeDisabled();
    await fillForm(user);
    expect(screen.getByRole('button', { name: 'Crear usuario' })).toBeEnabled();
  });

  it('shows what the server rejected next to each field', async () => {
    const { session } = createTestSession({
      'GET /v1/roles': () => Response.json(page([ROLE])),
      'POST /v1/users': () =>
        problem(422, 'validation_failed', [
          { field: 'email', code: 'taken' },
          { field: 'initial_password', code: 'too_short' },
        ]),
    });
    renderApp(session, '/usuarios/nuevo');
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));

    expect(await screen.findByText('Ya está en uso.')).toBeInTheDocument();
    expect(screen.getByText('Debe tener al menos 12 caracteres.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Usuario creado' })).not.toBeInTheDocument();
  });

  it('generates another password on request', async () => {
    const { session } = createTestSession({ 'GET /v1/roles': () => Response.json(page([ROLE])) });
    renderApp(session, '/usuarios/nuevo');
    const user = userEvent.setup();

    const field = await screen.findByLabelText(/^Contraseña temporal/);
    const first = (field as HTMLInputElement).value;
    await user.click(screen.getByRole('button', { name: 'Generar' }));

    expect((field as HTMLInputElement).value).not.toBe(first);
    expect((field as HTMLInputElement).value).toHaveLength(16);
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
