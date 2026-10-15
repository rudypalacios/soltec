import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, page, problem, type Call } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const ALL = ['view', 'create', 'edit', 'deactivate'];
const RESOURCES = [
  'contact_types',
  'client_statuses',
  'segments',
  'tax_regimes',
  'payment_methods',
];
const withAccess = (resources: string[], actions: string[] = ALL) => ({
  ...ME,
  permissions: Object.fromEntries(resources.map((resource) => [resource, actions])),
  scopes: {},
});
const EVERYTHING = withAccess(RESOURCES);

const STAMPS = { created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z' };
const SEGMENT = {
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000b1',
  name: 'Restaurantes',
  is_active: true,
  version: 1,
  ...STAMPS,
};
const STATUS = {
  ...SEGMENT,
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000b2',
  name: 'Perdido',
  color: '#B3261E',
};

afterEach(() => vi.unstubAllGlobals());

describe('catalog parameters', () => {
  it('opens on the first parameter the user may view and offers only those', async () => {
    const { session } = createTestSession(
      { 'GET /v1/segments': () => Response.json(page([SEGMENT])) },
      withAccess(['segments', 'tax_regimes'], ['view']),
    );
    renderApp(session, '/configuracion/parametros');

    expect(await screen.findByRole('table', { name: 'Lista de segmentos' })).toBeInTheDocument();
    const tabs = screen.getByRole('tablist', { name: 'Parámetros' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Segmentos', 'Regímenes fiscales']);
    // Read-only: no way to add or change anything.
    expect(screen.queryByRole('button', { name: /Nuevo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument();
  });

  it('shows nothing to someone who cannot view any of them', async () => {
    const { session } = createTestSession({}, withAccess([]));
    renderApp(session, '/configuracion/parametros');

    expect(await screen.findByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
  });

  it('switches parameter from the tabs', async () => {
    const { session } = createTestSession(
      {
        'GET /v1/contact-types': () => Response.json(page([])),
        'GET /v1/client-statuses': () => Response.json(page([STATUS])),
      },
      EVERYTHING,
    );
    renderApp(session, '/configuracion/parametros');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Estados de cliente' }));

    expect(await screen.findByRole('table', { name: 'Lista de estados de cliente' })).toBeVisible();
  });

  it('paints a dot with the status color beside its name', async () => {
    const { session } = createTestSession(
      { 'GET /v1/client-statuses': () => Response.json(page([STATUS])) },
      withAccess(['client_statuses']),
    );
    renderApp(session, '/configuracion/parametros');

    const dot = await screen.findByTestId('status-dot');
    expect(dot).toHaveStyle({ backgroundColor: '#B3261E' });
    expect(dot.parentElement).toHaveTextContent('Perdido');
  });

  it('uses scrollable tabs and cards instead of a table on a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(
      { 'GET /v1/contact-types': () => Response.json(page([{ ...SEGMENT, name: 'Compras' }])) },
      EVERYTHING,
    );
    renderApp(session, '/configuracion/parametros');

    expect(await screen.findByLabelText('Lista de tipos de contacto')).toBeVisible();
    expect(screen.getByRole('tablist', { name: 'Parámetros' })).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'Parámetro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('creates a segment without sending a color', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/segments': () => Response.json(page([SEGMENT])),
        'POST /v1/segments': (call) => {
          calls.push(call);
          return Response.json({ ...SEGMENT, name: 'Salud' }, { status: 201 });
        },
      },
      withAccess(['segments']),
    );
    renderApp(session, '/configuracion/parametros');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Nuevo segmento' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo segmento' });
    expect(within(dialog).queryByRole('radiogroup')).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Nombre/), '  Salud ');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ name: 'Salud' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('creates a status with the chosen color', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/client-statuses': () => Response.json(page([STATUS])),
        'POST /v1/client-statuses': (call) => {
          calls.push(call);
          return Response.json({ ...STATUS, name: 'Nuevo', color: '#6B4FA3' }, { status: 201 });
        },
      },
      withAccess(['client_statuses']),
    );
    renderApp(session, '/configuracion/parametros');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Nuevo estado de cliente' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo estado de cliente' });
    expect(within(dialog).getAllByRole('radio')).toHaveLength(8);
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Nuevo');
    await user.click(within(dialog).getByRole('radio', { name: 'Morado' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ name: 'Nuevo', color: '#6B4FA3' });
  });

  it('edits a status with the version it read and keeps a color outside the palette', async () => {
    const calls: Call[] = [];
    const custom = { ...STATUS, color: '#123456' };
    const { session } = createTestSession(
      {
        'GET /v1/client-statuses': () => Response.json(page([custom])),
        [`PATCH /v1/client-statuses/${custom.id}`]: (call) => {
          calls.push(call);
          return Response.json({ ...custom, name: 'Perdido cliente', version: 2 });
        },
      },
      withAccess(['client_statuses']),
    );
    renderApp(session, '/configuracion/parametros');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Perdido' }));
    await user.click(await screen.findByRole('menuitem', { name: /Editar/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar estado de cliente' });
    // The eight of the palette plus the saved one, already selected.
    expect(within(dialog).getAllByRole('radio')).toHaveLength(9);
    expect(within(dialog).getByRole('radio', { name: 'Personalizado #123456' })).toBeChecked();
    await user.type(within(dialog).getByLabelText(/Nombre/), ' cliente');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ name: 'Perdido cliente', color: '#123456', version: 1 });
  });

  it('says when the name is already taken', async () => {
    const { session } = createTestSession(
      {
        'GET /v1/segments': () => Response.json(page([SEGMENT])),
        'POST /v1/segments': () =>
          problem(422, 'validation_failed', [{ field: 'name', code: 'taken' }]),
      },
      withAccess(['segments']),
    );
    renderApp(session, '/configuracion/parametros');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Nuevo segmento' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo segmento' });
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Restaurantes');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(
      await within(dialog).findByText('Ya hay un segmento activo con ese nombre.'),
    ).toBeVisible();
  });

  it('marks an inactive value like an inactive product: the row wash and the pill in its own column', async () => {
    const inactive = { ...SEGMENT, id: '0192f1c2-7d3a-7a11-8f2e-0000000000b3', is_active: false };
    const { session } = createTestSession(
      { 'GET /v1/segments': () => Response.json(page([SEGMENT, inactive])) },
      withAccess(['segments']),
    );
    renderApp(session, '/configuracion/parametros');

    const table = await screen.findByRole('table', { name: 'Lista de segmentos' });
    const pill = within(table).getByText('Inactivo');
    expect(pill).toHaveStyle({ backgroundColor: '#FCE8E6' });
    // The pill sits in the «Estado» cell, and its row carries the wash of an inactive record.
    expect(pill.closest('td')).toBe(pill.closest('tr')?.lastElementChild?.previousElementSibling);
    expect(pill.closest('tr')).toHaveStyle({ backgroundColor: 'rgba(179, 38, 30, 0.045)' });
    expect(within(table).getByText('Activo').closest('tr')).not.toHaveStyle({
      backgroundColor: 'rgba(179, 38, 30, 0.045)',
    });
  });

  it('puts the create button on the row of the search and the status filter', async () => {
    const { session } = createTestSession(
      { 'GET /v1/segments': () => Response.json(page([SEGMENT])) },
      withAccess(['segments']),
    );
    renderApp(session, '/configuracion/parametros');

    const button = await screen.findByRole('button', { name: 'Nuevo segmento' });
    const search = screen.getByRole('searchbox', { name: 'Buscar por nombre' });
    expect(button.closest('div[class*="MuiBox-root"]')?.parentElement).toBe(
      search.closest('.MuiTextField-root')?.parentElement,
    );
  });

  it('asks before deactivating and reactivates an inactive value', async () => {
    const calls: Call[] = [];
    const inactive = { ...SEGMENT, id: '0192f1c2-7d3a-7a11-8f2e-0000000000b3', is_active: false };
    const { session } = createTestSession(
      {
        'GET /v1/segments': () => Response.json(page([SEGMENT, inactive])),
        [`POST /v1/segments/${SEGMENT.id}/deactivate`]: (call) => {
          calls.push(call);
          return Response.json({ ...SEGMENT, is_active: false });
        },
        [`POST /v1/segments/${inactive.id}/reactivate`]: (call) => {
          calls.push(call);
          return Response.json({ ...inactive, is_active: true });
        },
      },
      withAccess(['segments']),
    );
    renderApp(session, '/configuracion/parametros');
    const user = userEvent.setup();

    const [active, retired] = await screen.findAllByRole('button', { name: /Acciones de/ });
    await user.click(active as HTMLElement);
    await user.click(await screen.findByRole('menuitem', { name: /Desactivar/ }));
    const confirm = await screen.findByRole('dialog', { name: 'Desactivar valor' });
    expect(calls).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(retired as HTMLElement);
    await user.click(await screen.findByRole('menuitem', { name: /Reactivar/ }));
    const reactivate = await screen.findByRole('dialog', { name: 'Reactivar valor' });
    await user.click(within(reactivate).getByRole('button', { name: 'Reactivar' }));
    await waitFor(() => expect(calls).toHaveLength(2));
  });

  it('is one of the sections of Configuración', async () => {
    const { session } = createTestSession(
      { 'GET /v1/segments': () => Response.json(page([SEGMENT])) },
      withAccess(['segments'], ['view']),
    );
    renderApp(session, '/configuracion');

    expect(await screen.findByRole('tab', { name: 'Parámetros' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Lista de segmentos' })).toBeVisible();
  });
});
