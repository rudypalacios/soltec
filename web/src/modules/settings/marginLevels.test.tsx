import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, problem, type Call } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const MARGIN_ME = {
  ...ME,
  permissions: { ...ME.permissions, margin_levels: ['view', 'create', 'edit', 'deactivate'] },
  scopes: { ...ME.scopes, margin_levels: 'all' },
};
const READER_ME = {
  ...ME,
  permissions: { margin_levels: ['view'] },
  scopes: { margin_levels: 'all' },
};

const STAMPS = { created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z' };
const STANDARD = {
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000e1',
  name: 'Margen 33 %',
  rate: '0.33000',
  is_default: true,
  sort_order: 1,
  is_active: true,
  version: 1,
  ...STAMPS,
};
const HIGHER = {
  ...STANDARD,
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000e2',
  name: 'Margen 35 %',
  rate: '0.35000',
  is_default: false,
  sort_order: 2,
};

const PRICE_33 = {
  margin_level: { id: STANDARD.id, name: STANDARD.name, rate: STANDARD.rate },
  vat_rate: '0.12000',
  income_tax_rate: '0.03000',
  without_vat: '721.28',
  with_vat: '807.83',
};

afterEach(() => vi.unstubAllGlobals());

describe('margin levels', () => {
  it('lists the levels with their margin and which one is the default', async () => {
    const { session } = createTestSession(
      { 'GET /v1/margin-levels': () => Response.json({ data: [STANDARD, HIGHER] }) },
      MARGIN_ME,
    );
    renderApp(session, '/configuracion/margenes');

    const table = await screen.findByRole('table', { name: 'Lista de niveles de margen' });
    expect(within(table).getByText('Margen 33 %')).toBeInTheDocument();
    expect(within(table).getByText('33 %')).toBeInTheDocument();
    expect(within(table).getByText('35 %')).toBeInTheDocument();
    expect(within(table).getByText('Por defecto')).toBeInTheDocument();
  });

  it('offers the default level only to be edited, and the others to become the default or go', async () => {
    const { session } = createTestSession(
      { 'GET /v1/margin-levels': () => Response.json({ data: [STANDARD, HIGHER] }) },
      MARGIN_ME,
    );
    renderApp(session, '/configuracion/margenes');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Margen 33 %' }));
    expect(await screen.findAllByRole('menuitem')).toHaveLength(1);
    expect(screen.getByRole('menuitem', { name: /Editar/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Acciones de Margen 35 %' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      'Editar',
      'Usar por defecto',
      'Desactivar',
    ]);
  });

  it('shows cards instead of a table on a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(
      { 'GET /v1/margin-levels': () => Response.json({ data: [STANDARD, HIGHER] }) },
      MARGIN_ME,
    );
    renderApp(session, '/configuracion/margenes');

    const cards = await screen.findByLabelText('Lista de niveles de margen');
    expect(within(cards).getByText('Margen 35 %')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('creates a level sending the margin as a rate string', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/margin-levels': () => Response.json({ data: [STANDARD] }),
        'POST /v1/margin-levels': (call) => {
          calls.push(call);
          return Response.json({ ...HIGHER, name: 'Mayorista', rate: '0.20500' }, { status: 201 });
        },
      },
      MARGIN_ME,
    );
    renderApp(session, '/configuracion/margenes');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Nuevo nivel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo nivel de margen' });
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Mayorista');
    await user.type(within(dialog).getByLabelText(/^Margen/), '20,5');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ name: 'Mayorista', rate: '0.20500' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('refuses a margin that is not a percentage before calling the API', async () => {
    const { session, calls } = createTestSession(
      { 'GET /v1/margin-levels': () => Response.json({ data: [STANDARD] }) },
      MARGIN_ME,
    );
    renderApp(session, '/configuracion/margenes');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Nuevo nivel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo nivel de margen' });
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Raro');
    await user.type(within(dialog).getByLabelText(/^Margen/), '100');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(
      await within(dialog).findByText('Escribe un porcentaje entre 0 y 99,999.'),
    ).toBeVisible();
    expect(calls.some((call) => call.method === 'POST' && call.path === '/v1/margin-levels')).toBe(
      false,
    );
  });

  it('says when the name is already taken', async () => {
    const { session } = createTestSession(
      {
        'GET /v1/margin-levels': () => Response.json({ data: [STANDARD] }),
        'POST /v1/margin-levels': () =>
          problem(422, 'validation_failed', [{ field: 'name', code: 'taken' }]),
      },
      MARGIN_ME,
    );
    renderApp(session, '/configuracion/margenes');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Nuevo nivel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo nivel de margen' });
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Margen 33 %');
    await user.type(within(dialog).getByLabelText(/^Margen/), '33');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await within(dialog).findByText('Ya hay un nivel activo con ese nombre.')).toBeVisible();
  });

  it('makes another level the default', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/margin-levels': () => Response.json({ data: [STANDARD, HIGHER] }),
        [`POST /v1/margin-levels/${HIGHER.id}/set-default`]: (call) => {
          calls.push(call);
          return Response.json({ ...HIGHER, is_default: true });
        },
      },
      MARGIN_ME,
    );
    renderApp(session, '/configuracion/margenes');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Margen 35 %' }));
    await user.click(await screen.findByRole('menuitem', { name: /Usar por defecto/ }));

    await waitFor(() => expect(calls).toHaveLength(1));
  });

  it('asks before deactivating a level', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/margin-levels': () => Response.json({ data: [STANDARD, HIGHER] }),
        [`POST /v1/margin-levels/${HIGHER.id}/deactivate`]: (call) => {
          calls.push(call);
          return Response.json({ ...HIGHER, is_active: false });
        },
      },
      MARGIN_ME,
    );
    renderApp(session, '/configuracion/margenes');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Margen 35 %' }));
    await user.click(await screen.findByRole('menuitem', { name: /Desactivar/ }));
    expect(calls).toHaveLength(0);
    await user.click(await screen.findByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
  });

  it('hides the write actions from someone who can only view', async () => {
    const { session } = createTestSession(
      { 'GET /v1/margin-levels': () => Response.json({ data: [STANDARD, HIGHER] }) },
      READER_ME,
    );
    renderApp(session, '/configuracion/margenes');

    await screen.findByRole('table', { name: 'Lista de niveles de margen' });
    expect(screen.queryByRole('button', { name: 'Nuevo nivel' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar:/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Acciones de/ })).toBeNull();
  });

  it('is a section of the settings only for who may view it', async () => {
    const { session } = createTestSession({}, { ...ME });
    renderApp(session, '/configuracion/margenes');

    expect(await screen.findByText(/No tienes permiso/)).toBeInTheDocument();
  });
});

describe('price simulator', () => {
  const handlers = (calls: Call[]) => ({
    'GET /v1/margin-levels': () => Response.json({ data: [STANDARD, HIGHER] }),
    'POST /v1/price/calculate': (call: Call) => {
      calls.push(call);
      return Response.json(PRICE_33);
    },
  });

  it('asks the server and shows the price it answers', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(handlers(calls), READER_ME);
    renderApp(session, '/configuracion/margenes');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Costo'), '525,01');

    expect(await screen.findByText('Q 807.83')).toBeInTheDocument();
    expect(screen.getByText('Q 721.28')).toBeInTheDocument();
    expect(await screen.findByText(/Calculado por el servidor/)).toBeInTheDocument();
    expect(calls.at(-1)?.body).toEqual({ cost: '525.01', margin_level_id: null });
    // Typing is not one request per key.
    expect(calls).toHaveLength(1);
  });

  it('previews another level at once with the rates of the last answer, then confirms it', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        ...handlers(calls),
        'POST /v1/price/calculate': (call) => {
          calls.push(call);
          const body = call.body as { margin_level_id: string | null };
          return Response.json(
            body.margin_level_id === HIGHER.id
              ? {
                  ...PRICE_33,
                  margin_level: { id: HIGHER.id, name: HIGHER.name, rate: HIGHER.rate },
                  without_vat: '743.47',
                  with_vat: '832.69',
                }
              : PRICE_33,
          );
        },
      },
      READER_ME,
    );
    renderApp(session, '/configuracion/margenes');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Costo'), '525.01');
    await screen.findByText('Q 807.83');

    await user.click(screen.getByRole('combobox', { name: 'Nivel de margen' }));
    await user.click(await screen.findByRole('option', { name: /Margen 35 %/ }));

    // The preview (same function as the server's) shows the new figure without waiting for the answer.
    expect(await screen.findByText('Q 832.69')).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.at(-1)?.body).toEqual({ cost: '525.01', margin_level_id: HIGHER.id }),
    );
    expect(await screen.findByText(/Calculado por el servidor/)).toBeInTheDocument();
  });

  it('does not ask for a cost that is not a valid amount', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(handlers(calls), READER_ME);
    renderApp(session, '/configuracion/margenes');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Costo'), '12.34567');

    expect(await screen.findByText(/hasta 4 decimales/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
