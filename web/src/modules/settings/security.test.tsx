import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, problem, type Call } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const EDITOR_ME = {
  ...ME,
  permissions: { security_settings: ['view', 'edit'] },
  scopes: { security_settings: 'all' },
};
const READER_ME = {
  ...ME,
  permissions: { security_settings: ['view'] },
  scopes: { security_settings: 'all' },
};

const SECURITY = {
  web_idle_minutes: 30,
  mobile_refresh_days: 30,
  max_failed_attempts: 3,
  lockout_minutes: 15,
  password_expiry_days: 90,
  password_min_length: 12,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  version: 1,
};

afterEach(() => vi.unstubAllGlobals());

describe('security settings', () => {
  it('shows the current parameters', async () => {
    const { session } = createTestSession(
      { 'GET /v1/settings/security': () => Response.json(SECURITY) },
      EDITOR_ME,
    );
    renderApp(session, '/configuracion/seguridad');

    expect(await screen.findByLabelText(/^Intentos fallidos/)).toHaveValue('3');
    expect(screen.getByLabelText(/^Minutos que dura el bloqueo/)).toHaveValue('15');
    expect(screen.getByLabelText(/^Días para que venza/)).toHaveValue('90');
    expect(screen.getByLabelText(/^Largo mínimo/)).toHaveValue('12');
    expect(screen.getByLabelText(/^Minutos de inactividad/)).toHaveValue('30');
    expect(screen.getByLabelText(/^Días que dura la sesión/)).toHaveValue('30');
  });

  it('sends every parameter with the version it read and shows the saved ones', async () => {
    let call: Call | undefined;
    const { session } = createTestSession(
      {
        'GET /v1/settings/security': () => Response.json(SECURITY),
        'PATCH /v1/settings/security': (received) => {
          call = received;
          return Response.json({ ...SECURITY, max_failed_attempts: 5, version: 2 });
        },
      },
      EDITOR_ME,
    );
    renderApp(session, '/configuracion/seguridad');
    const user = userEvent.setup();

    const attempts = await screen.findByLabelText(/^Intentos fallidos/);
    await user.clear(attempts);
    await user.type(attempts, '5');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Se guardaron los valores.')).toBeInTheDocument();
    expect(call?.body).toEqual({
      version: 1,
      web_idle_minutes: 30,
      mobile_refresh_days: 30,
      max_failed_attempts: 5,
      lockout_minutes: 15,
      password_expiry_days: 90,
      password_min_length: 12,
    });
  });

  it('checks the limits before asking the server', async () => {
    const { session, calls } = createTestSession(
      { 'GET /v1/settings/security': () => Response.json(SECURITY) },
      EDITOR_ME,
    );
    renderApp(session, '/configuracion/seguridad');
    const user = userEvent.setup();

    const attempts = await screen.findByLabelText(/^Intentos fallidos/);
    await user.clear(attempts);
    await user.type(attempts, '2');
    const length = screen.getByLabelText(/^Largo mínimo/);
    await user.clear(length);
    await user.type(length, '8');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Escribe un número entero entre 3 y 20.')).toBeInTheDocument();
    expect(screen.getByText('Escribe un número entero entre 12 y 72.')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
  });

  it('explains a stale version', async () => {
    const { session } = createTestSession(
      {
        'GET /v1/settings/security': () => Response.json(SECURITY),
        'PATCH /v1/settings/security': () => problem(409, 'conflict'),
      },
      EDITOR_ME,
    );
    renderApp(session, '/configuracion/seguridad');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/Otra persona cambió estos valores/)).toBeInTheDocument();
  });

  it('asks to review the values when the server rejects one', async () => {
    const { session } = createTestSession(
      {
        'GET /v1/settings/security': () => Response.json(SECURITY),
        'PATCH /v1/settings/security': () =>
          problem(422, 'validation_failed', [{ field: 'lockout_minutes', code: 'out_of_range' }]),
      },
      EDITOR_ME,
    );
    renderApp(session, '/configuracion/seguridad');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Revisa los valores e inténtalo de nuevo.')).toBeInTheDocument();
  });

  it('is read-only for whoever may only view it', async () => {
    const { session } = createTestSession(
      { 'GET /v1/settings/security': () => Response.json(SECURITY) },
      READER_ME,
    );
    renderApp(session, '/configuracion/seguridad');

    expect(await screen.findByLabelText(/^Intentos fallidos/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });

  it('is closed to whoever may not view it, and absent from the sections', async () => {
    const other = { ...ME, permissions: { company: ['view'] }, scopes: { company: 'all' } };
    const { session } = createTestSession(
      { 'GET /v1/settings/company': () => Response.json({ trade_name: '' }) },
      other,
    );
    renderApp(session, '/configuracion/seguridad');

    await screen.findByRole('tab', { name: 'Empresa' });
    expect(screen.queryByRole('tab', { name: 'Seguridad' })).not.toBeInTheDocument();
    expect(screen.getByText('No tienes permiso para ver esta pantalla.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Intentos fallidos/)).not.toBeInTheDocument();
  });

  it('is a tab on a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(
      { 'GET /v1/settings/security': () => Response.json(SECURITY) },
      EDITOR_ME,
    );
    renderApp(session, '/configuracion/seguridad');

    expect(await screen.findByRole('tab', { name: 'Seguridad' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Intentos fallidos/)).toBeInTheDocument());
  });
});
