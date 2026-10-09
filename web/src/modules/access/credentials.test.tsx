import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createTestSession, problem, type Call } from '../../test/fakeApi';
import { renderApp } from '../../test/render';

const TOKEN = 'ab'.repeat(32);
const NO_SESSION = null;
const noContent = () => new Response(null, { status: 204 });

describe('accepting an invitation', () => {
  const route = `/aceptar-invitacion#token=${TOKEN}`;

  it('sends the token of the link with the new password and then offers to sign in', async () => {
    let call: Call | undefined;
    const { session } = createTestSession(
      {
        'POST /v1/auth/invitations/accept': (received) => {
          call = received;
          return noContent();
        },
      },
      NO_SESSION,
    );
    renderApp(session, route);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Contraseña nueva/), 'a long enough passphrase');
    await user.type(screen.getByLabelText(/^Repite la contraseña/), 'a long enough passphrase');
    await user.click(screen.getByRole('button', { name: 'Activar cuenta' }));

    expect(await screen.findByText(/Tu cuenta está activa/)).toBeInTheDocument();
    expect(call?.body).toEqual({ token: TOKEN, password: 'a long enough passphrase' });
    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute(
      'href',
      '/ingresar',
    );
  });

  it('removes the token from the address bar', async () => {
    const { session } = createTestSession({}, NO_SESSION);
    renderApp(session, route);

    await screen.findByLabelText(/^Contraseña nueva/);

    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent(/^\/aceptar-invitacion$/),
    );
  });

  it('does not send anything while the two passwords differ', async () => {
    let sent = false;
    const { session } = createTestSession(
      {
        'POST /v1/auth/invitations/accept': () => {
          sent = true;
          return noContent();
        },
      },
      NO_SESSION,
    );
    renderApp(session, route);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Contraseña nueva/), 'a long enough passphrase');
    await user.type(screen.getByLabelText(/^Repite la contraseña/), 'a different passphrase');
    await user.click(screen.getByRole('button', { name: 'Activar cuenta' }));

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(sent).toBe(false);
  });

  it('shows what the server rejected under the password', async () => {
    const { session } = createTestSession(
      {
        'POST /v1/auth/invitations/accept': () =>
          problem(422, 'validation_failed', [{ field: 'password', code: 'too_short' }]),
      },
      NO_SESSION,
    );
    renderApp(session, route);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Contraseña nueva/), 'short');
    await user.type(screen.getByLabelText(/^Repite la contraseña/), 'short');
    await user.click(screen.getByRole('button', { name: 'Activar cuenta' }));

    expect(await screen.findByText('Debe tener al menos 12 caracteres.')).toBeInTheDocument();
  });

  it.each([
    ['link_invalid', /Este enlace ya no sirve/],
    ['link_expired', /Este enlace venció/],
  ])('explains a %s link', async (code, message) => {
    const { session } = createTestSession(
      { 'POST /v1/auth/invitations/accept': () => problem(400, code) },
      NO_SESSION,
    );
    renderApp(session, route);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Contraseña nueva/), 'a long enough passphrase');
    await user.type(screen.getByLabelText(/^Repite la contraseña/), 'a long enough passphrase');
    await user.click(screen.getByRole('button', { name: 'Activar cuenta' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('says the link is incomplete when there is no token', async () => {
    const { session } = createTestSession({}, NO_SESSION);
    renderApp(session, '/aceptar-invitacion');

    expect(await screen.findByText(/El enlace está incompleto/)).toBeInTheDocument();
  });
});

describe('resetting a password', () => {
  it('sends the token with the new password', async () => {
    let call: Call | undefined;
    const { session } = createTestSession(
      {
        'POST /v1/auth/password/reset': (received) => {
          call = received;
          return noContent();
        },
      },
      NO_SESSION,
    );
    renderApp(session, `/restablecer-contrasena#token=${TOKEN}`);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Contraseña nueva/), 'a long enough passphrase');
    await user.type(screen.getByLabelText(/^Repite la contraseña/), 'a long enough passphrase');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    expect(
      await screen.findByText(/se cerró tu sesión en todos tus dispositivos/),
    ).toBeInTheDocument();
    expect(call?.body).toEqual({ token: TOKEN, password: 'a long enough passphrase' });
  });
});

describe('forgetting the password', () => {
  it('is reachable from the sign-in screen', async () => {
    const { session } = createTestSession({}, NO_SESSION);
    renderApp(session, '/ingresar');

    expect(await screen.findByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute(
      'href',
      '/recuperar-contrasena',
    );
  });

  it('asks for the email and gives the same answer whatever the account is', async () => {
    let call: Call | undefined;
    const { session } = createTestSession(
      {
        'POST /v1/auth/password/forgot': (received) => {
          call = received;
          return noContent();
        },
      },
      NO_SESSION,
    );
    renderApp(session, '/recuperar-contrasena');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Correo/), ' ana@example.com ');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByText(/Si hay una cuenta activa con ese correo/)).toBeInTheDocument();
    expect(call?.body).toEqual({ email: 'ana@example.com' });
  });

  it('shows a malformed email as a field error', async () => {
    const { session } = createTestSession(
      {
        'POST /v1/auth/password/forgot': () =>
          problem(422, 'validation_failed', [{ field: 'email', code: 'invalid' }]),
      },
      NO_SESSION,
    );
    renderApp(session, '/recuperar-contrasena');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Correo/), 'nope');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByText('No es válido.')).toBeInTheDocument();
  });
});
