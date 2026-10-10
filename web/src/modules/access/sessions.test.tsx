import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, problem } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const LAPTOP = {
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000d1',
  platform: 'web',
  name: 'Chrome en Windows',
  last_seen_at: '2026-10-09T12:00:00.000Z',
  created_at: '2026-10-08T09:00:00.000Z',
  current: true,
};
const PHONE = {
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000d2',
  platform: 'android',
  name: 'Pixel 8',
  last_seen_at: null,
  created_at: '2026-10-01T09:00:00.000Z',
  current: false,
};
const devices = (...rows: object[]) => ({
  'GET /v1/me/devices': () => Response.json({ data: rows }),
});

afterEach(() => vi.unstubAllGlobals());

describe('my sessions', () => {
  it('lists the devices and marks the one in use', async () => {
    const { session } = createTestSession(devices(LAPTOP, PHONE));
    renderApp(session, '/cuenta/sesiones');

    const table = await screen.findByRole('table', { name: 'Lista de sesiones abiertas' });
    expect(within(table).getByText('Chrome en Windows')).toBeInTheDocument();
    expect(within(table).getByText('Esta sesión')).toBeInTheDocument();
    expect(within(table).getByText('Pixel 8')).toBeInTheDocument();
    expect(within(table).getByText('Android')).toBeInTheDocument();
    expect(within(table).getByText('Nunca')).toBeInTheDocument();
  });

  it('offers to close only the other sessions, never the one in use', async () => {
    const { session } = createTestSession(devices(LAPTOP, PHONE));
    renderApp(session, '/cuenta/sesiones');

    await screen.findByText('Pixel 8');

    expect(
      screen.queryByRole('button', { name: 'Acciones de Chrome en Windows' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acciones de Pixel 8' })).toBeInTheDocument();
  });

  it('asks first and then closes the session', async () => {
    let closed = false;
    const { session, calls } = createTestSession({
      ...devices(LAPTOP, PHONE),
      [`DELETE /v1/me/devices/${PHONE.id}`]: () => {
        closed = true;
        return new Response(null, { status: 204 });
      },
    });
    renderApp(session, '/cuenta/sesiones');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Pixel 8' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Cerrar sesión' }));
    expect(await screen.findByText(/Se cerrará la sesión de Pixel 8/)).toBeInTheDocument();
    expect(closed).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(closed).toBe(true));
    // The list is read again afterwards.
    await waitFor(() =>
      expect(
        calls.filter((call) => call.method === 'GET' && call.path === '/v1/me/devices'),
      ).toHaveLength(2),
    );
  });

  it('closes nothing when the person backs out', async () => {
    const { session, calls } = createTestSession(devices(LAPTOP, PHONE));
    renderApp(session, '/cuenta/sesiones');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Pixel 8' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Cerrar sesión' }));
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('says so when the session could not be closed', async () => {
    const { session } = createTestSession({
      ...devices(LAPTOP, PHONE),
      [`DELETE /v1/me/devices/${PHONE.id}`]: () => problem(404, 'not_found'),
    });
    renderApp(session, '/cuenta/sesiones');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Pixel 8' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Cerrar sesión' }));
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByText('No se encontró el registro.')).toBeInTheDocument();
  });

  it('shows cards on a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(devices(LAPTOP, PHONE));
    renderApp(session, '/cuenta/sesiones');

    const cards = await screen.findByLabelText('Lista de sesiones abiertas');
    expect(within(cards).getByText('Pixel 8')).toBeInTheDocument();
    expect(within(cards).getByText('Esta sesión')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('is reached from the account menu', async () => {
    const { session } = createTestSession(devices(LAPTOP));
    renderApp(session, '/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: `Cuenta de ${ME.name}` }));
    await user.click(await screen.findByRole('menuitem', { name: 'Mis sesiones' }));

    expect(await screen.findByRole('heading', { name: 'Mis sesiones' })).toBeInTheDocument();
  });

  it('is not offered to a session that must change its password first', async () => {
    const { session } = createTestSession({}, ME, { restricted: true });
    renderApp(session, '/cambiar-contrasena');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: `Cuenta de Mi cuenta` }));

    expect(await screen.findByRole('menuitem', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Mis sesiones' })).not.toBeInTheDocument();
  });
});
