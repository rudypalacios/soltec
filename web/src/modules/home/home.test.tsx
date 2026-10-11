import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestSession, ME, problem } from '../../test/fakeApi';
import { renderApp } from '../../test/render';

const dashboard = (...codes: string[]) => ({
  'GET /v1/dashboard': () => Response.json({ data: codes.map((code) => ({ code })) }),
});

describe('home screen', () => {
  it('greets the person and draws the widgets in the order the server sends them', async () => {
    const { session } = createTestSession(dashboard('service_status', 'quick_links'));
    renderApp(session, '/');

    await screen.findByRole('heading', { name: 'Hola, Ana' });
    const status = await screen.findByText('El servicio está en línea.');
    const shortcuts = await screen.findByText('Cuentas y perfiles de las personas');
    // The status comes before the shortcuts in the page.
    expect(
      status.compareDocumentPosition(shortcuts) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows only the widgets the profile has', async () => {
    const { session } = createTestSession(dashboard('quick_links'));
    renderApp(session, '/');

    expect(await screen.findByText('Cuentas y perfiles de las personas')).toBeInTheDocument();
    expect(screen.queryByText('El servicio está en línea.')).not.toBeInTheDocument();
  });

  it('offers shortcuts only to the screens the user may open', async () => {
    const reader = { ...ME, permissions: { users: ['view'] }, scopes: {} };
    const { session } = createTestSession(dashboard('quick_links'), reader);
    renderApp(session, '/');

    expect(await screen.findByText('Cuentas y perfiles de las personas')).toBeInTheDocument();
    expect(screen.queryByText('Qué puede hacer cada perfil')).not.toBeInTheDocument();
  });

  it('says so when the profile has nothing on the home screen', async () => {
    const { session } = createTestSession(dashboard());
    renderApp(session, '/');

    expect(await screen.findByText(/Tu perfil aún no tiene nada en el inicio/)).toBeInTheDocument();
  });

  it('says why when the widgets cannot be loaded', async () => {
    const { session } = createTestSession({
      'GET /v1/dashboard': () => problem(500, 'internal_error'),
    });
    renderApp(session, '/');

    expect(await screen.findByText(/Ocurrió un error inesperado/)).toBeInTheDocument();
  });

  it('still points whoever may edit it to the missing company data', async () => {
    const editor = {
      ...ME,
      permissions: { ...ME.permissions, company: ['view', 'edit'] },
      scopes: { ...ME.scopes, company: 'all' },
    };
    const { session } = createTestSession(dashboard(), editor);
    renderApp(session, '/');

    expect(await screen.findByText(/Faltan los datos de la empresa/)).toBeInTheDocument();
  });
});
