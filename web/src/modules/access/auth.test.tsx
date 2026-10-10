import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, problem, type Call } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const loginOk = (restricted = false) => ({
  'POST /v1/auth/login': () =>
    Response.json({
      access_token: 'token',
      token_type: 'Bearer',
      expires_in: 900,
      password_change_required: restricted,
      device_id: '0192f1c2-7d3a-7a11-8f2e-0000000000d1',
      user: ME,
    }),
});

const where = () => screen.getByTestId('where').textContent;

async function signIn(email = 'ana@example.com', password = 'una contraseña larga') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/^Correo/), email);
  await user.type(screen.getByLabelText(/^Contraseña/), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return user;
}

afterEach(() => vi.unstubAllGlobals());

describe('signing in', () => {
  it('sends an anonymous visitor to the login and brings them back after signing in', async () => {
    const { session } = createTestSession(
      {
        ...loginOk(),
        'GET /v1/users': () =>
          Response.json({ data: [], meta: { page: 1, per_page: 25, total: 0 } }),
      },
      null,
    );
    renderApp(session, '/usuarios');

    await waitFor(() => expect(where()).toBe('/ingresar'));
    await signIn();

    expect(await screen.findByRole('heading', { name: 'Usuarios' })).toBeInTheDocument();
    expect(where()).toBe('/usuarios');
  });

  it('says so when the credentials are wrong and stays on the login', async () => {
    const { session } = createTestSession(
      { 'POST /v1/auth/login': () => problem(401, 'invalid_credentials') },
      null,
    );
    renderApp(session, '/ingresar');

    await signIn('ana@example.com', 'incorrecta');

    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeInTheDocument();
    expect(where()).toBe('/ingresar');
    expect(screen.getByLabelText(/^Contraseña/)).toHaveValue('');
  });

  it('tells the person when the server is not ready to sign anyone in', async () => {
    const { session } = createTestSession(
      { 'POST /v1/auth/login': () => problem(503, 'auth_not_configured') },
      null,
    );
    renderApp(session, '/ingresar');

    await signIn();

    expect(await screen.findByText(/El servidor aún no está listo/)).toBeInTheDocument();
  });

  it('says the service cannot be reached when the network fails', async () => {
    const { session } = createTestSession(
      {
        'POST /v1/auth/login': () => {
          throw new TypeError('network down');
        },
      },
      null,
    );
    renderApp(session, '/ingresar');

    await signIn();

    expect(await screen.findByText(/No se pudo contactar con el servicio/)).toBeInTheDocument();
  });

  it('goes to the home screen by default', async () => {
    const { session } = createTestSession(loginOk(), null);
    renderApp(session, '/ingresar');

    await signIn();

    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(where()).toBe('/');
  });

  it('ignores a destination that leaves the application', async () => {
    const { session } = createTestSession(loginOk(), null);
    renderApp(session, { pathname: '/ingresar', state: { from: '//evil.example/phish' } });

    await signIn();

    await screen.findByRole('heading', { name: 'Hola, Ana' });
    expect(where()).toBe('/');
  });

  it('does not show the login to someone who is already signed in', async () => {
    const { session } = createTestSession({}, ME);
    renderApp(session, '/ingresar');

    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
  });

  it('shows a spinner while it recovers the session of a reloaded page', async () => {
    const { session } = createTestSession({}, ME);
    renderApp(session, '/usuarios');

    expect(screen.getByLabelText('Recuperando tu sesión')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByLabelText('Recuperando tu sesión')).not.toBeInTheDocument(),
    );
  });
});

describe('the temporary password', () => {
  it('keeps the person on the change screen, without the menu, until it is changed', async () => {
    const { session } = createTestSession({}, ME, { restricted: true });
    renderApp(session, '/usuarios');

    expect(await screen.findByRole('heading', { name: 'Cambiar contraseña' })).toBeInTheDocument();
    expect(where()).toBe('/cambiar-contrasena');
    expect(screen.getByText(/temporal o venció/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('sends a login that needs the change straight to it', async () => {
    const { session } = createTestSession(loginOk(true), null);
    renderApp(session, '/ingresar');

    await signIn();

    await waitFor(() => expect(where()).toBe('/cambiar-contrasena'));
  });

  it('changes it, renews the session and opens the application', async () => {
    let changed: Call | undefined;
    let refreshes = 0;
    const { session } = createTestSession(
      {
        'POST /v1/auth/password/change': (call) => {
          changed = call;
          return new Response(null, { status: 204 });
        },
        'POST /v1/auth/refresh': () => {
          refreshes += 1;
          return Response.json({
            access_token: 'token',
            token_type: 'Bearer',
            expires_in: 900,
            // The first refresh restores the restricted session; the second, after the change, lifts it.
            password_change_required: refreshes === 1,
          });
        },
      },
      ME,
    );
    renderApp(session, '/cambiar-contrasena');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Contraseña actual/), 'temporal-123456');
    await user.type(screen.getByLabelText(/^Contraseña nueva/), 'mi-clave-nueva-segura');
    await user.type(screen.getByLabelText(/^Repite/), 'mi-clave-nueva-segura');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(changed?.body).toEqual({
      current_password: 'temporal-123456',
      new_password: 'mi-clave-nueva-segura',
    });
    expect(where()).toBe('/');
  });

  it('drops the mismatch message once the confirmation matches', async () => {
    const { session } = createTestSession({}, ME);
    renderApp(session, '/cambiar-contrasena');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Contraseña actual/), 'temporal-123456');
    await user.type(screen.getByLabelText(/^Contraseña nueva/), 'mi-clave-nueva-segura');
    const repeat = screen.getByLabelText(/^Repite/);
    await user.type(repeat, 'otra-clave-distinta');
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeDisabled();

    await user.clear(repeat);
    await user.type(repeat, 'mi-clave-nueva-segura');

    expect(screen.queryByText('Las contraseñas no coinciden.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeEnabled();
  });

  it('does not send the form when the two new passwords differ', async () => {
    const { session, calls } = createTestSession({}, ME);
    renderApp(session, '/cambiar-contrasena');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Contraseña actual/), 'temporal-123456');
    await user.type(screen.getByLabelText(/^Contraseña nueva/), 'mi-clave-nueva-segura');
    await user.type(screen.getByLabelText(/^Repite/), 'otra-clave-distinta');

    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeDisabled();
    expect(calls.some((call) => call.path === '/v1/auth/password/change')).toBe(false);
  });

  it('shows what the server rejected next to its field', async () => {
    const { session } = createTestSession(
      {
        'POST /v1/auth/password/change': () =>
          problem(422, 'validation_failed', [
            { field: 'current_password', code: 'current_password_incorrect' },
            { field: 'new_password', code: 'too_short' },
          ]),
      },
      ME,
    );
    renderApp(session, '/cambiar-contrasena');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Contraseña actual/), 'equivocada');
    await user.type(screen.getByLabelText(/^Contraseña nueva/), 'corta');
    await user.type(screen.getByLabelText(/^Repite/), 'corta');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText('La contraseña actual no es correcta.')).toBeInTheDocument();
    expect(screen.getByText('Debe tener al menos 12 caracteres.')).toBeInTheDocument();
    expect(where()).toBe('/cambiar-contrasena');
  });
});

describe('the application frame', () => {
  it('shows only the menu entries the user may open', async () => {
    const reader = { ...ME, permissions: { users: ['view'] }, scopes: {} };
    const { session } = createTestSession({}, reader);
    renderApp(session, '/');

    const navigation = await screen.findByRole('navigation', { name: 'Navegación principal' });
    expect(within(navigation).getByText('Usuarios')).toBeInTheDocument();
    expect(within(navigation).queryByText('Perfiles')).not.toBeInTheDocument();
  });

  it('refuses a screen the user has no permission for', async () => {
    const reader = { ...ME, permissions: { users: ['view'] }, scopes: {} };
    const { session } = createTestSession({}, reader);
    renderApp(session, '/perfiles');

    expect(
      await screen.findByText('No tienes permiso para ver esta pantalla.'),
    ).toBeInTheDocument();
  });

  it('signs out from the account menu and returns to the login', async () => {
    const { session, calls } = createTestSession({
      'POST /v1/auth/logout': () => new Response(null, { status: 204 }),
    });
    renderApp(session, '/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Cuenta de Ana Pérez/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(where()).toBe('/ingresar'));
    expect(calls.some((call) => call.path === '/v1/auth/logout')).toBe(true);
  });

  it('opens the menu behind a button on a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession({});
    renderApp(session, '/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Abrir el menú' }));

    expect(await screen.findByRole('link', { name: 'Usuarios' })).toBeVisible();
  });

  it('says when a screen does not exist', async () => {
    const { session } = createTestSession({});
    renderApp(session, '/no-existe');

    expect(await screen.findByText('Esa pantalla no existe.')).toBeInTheDocument();
  });
});
