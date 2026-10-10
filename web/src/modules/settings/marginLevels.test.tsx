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
    expect(within(table).getByText('● Por defecto')).toBeInTheDocument();
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

describe('test cost in the list', () => {
  const handlers = (calls: Call[], extra: Record<string, (call: Call) => Response> = {}) => ({
    'GET /v1/margin-levels': () => Response.json({ data: [STANDARD, HIGHER] }),
    'POST /v1/price/calculate': (call: Call) => {
      calls.push(call);
      return Response.json(PRICE_33);
    },
    ...extra,
  });

  it('adds both prices to every level once a cost is typed, and asks the server only once', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(handlers(calls), READER_ME);
    renderApp(session, '/configuracion/margenes');
    const user = userEvent.setup();

    const table = await screen.findByRole('table', { name: 'Lista de niveles de margen' });
    expect(within(table).queryByText('Precio con IVA')).toBeNull();

    await user.type(screen.getByLabelText('Costo de prueba (con IVA)'), '525,01');

    // The default level shows what the server said; the other one is priced here with the same function.
    expect(await within(table).findByText('Q 807.83')).toBeInTheDocument();
    expect(within(table).getByText('Q 721.28')).toBeInTheDocument();
    expect(within(table).getByText('Q 832.69')).toBeInTheDocument();
    expect(within(table).getByText('Q 743.47')).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Precio sin IVA' })).toBeInTheDocument();
    expect(await screen.findByText(/Precios calculados por el servidor/)).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toEqual({ cost: '525.01' });
  });

  it('prices a changed cost at once with the taxes of the last answer, then confirms it', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      handlers(calls, {
        'POST /v1/price/calculate': (call) => {
          calls.push(call);
          const cost = (call.body as { cost: string }).cost;
          return Response.json(
            cost === '525.01'
              ? PRICE_33
              : { ...PRICE_33, without_vat: '137.00', with_vat: '154.00' },
          );
        },
      }),
      READER_ME,
    );
    renderApp(session, '/configuracion/margenes');
    const user = userEvent.setup();

    const cost = await screen.findByLabelText('Costo de prueba (con IVA)');
    await user.type(cost, '525.01');
    await screen.findByText('Q 807.83');

    await user.clear(cost);
    await user.type(cost, '100');

    // 100 at 35 % is 158.60 con IVA: the preview does not wait for the server. The default level first shows
    // its own preview (153.87) and then what the server says, which wins (the fake answers 154.00).
    expect(await screen.findByText('Q 158.60')).toBeInTheDocument();
    await waitFor(() => expect(calls.at(-1)?.body).toEqual({ cost: '100' }));
    expect(await screen.findByText('Q 154.00')).toBeInTheDocument();
  });

  it('does not ask for a cost that is not a valid amount', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(handlers(calls), READER_ME);
    renderApp(session, '/configuracion/margenes');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Costo de prueba (con IVA)'), '12.34567');

    expect(await screen.findByText(/hasta 4 decimales/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('gives deactivated levels no price', async () => {
    const calls: Call[] = [];
    const gone = { ...HIGHER, is_active: false };
    const { session } = createTestSession(
      handlers(calls, { 'GET /v1/margin-levels': () => Response.json({ data: [STANDARD, gone] }) }),
      READER_ME,
    );
    renderApp(session, '/configuracion/margenes');
    const user = userEvent.setup();

    const table = await screen.findByRole('table', { name: 'Lista de niveles de margen' });
    await user.type(screen.getByLabelText('Costo de prueba (con IVA)'), '525.01');
    await within(table).findByText('Q 807.83');

    expect(within(table).queryByText('Q 832.69')).toBeNull();
    expect(within(table).getAllByText('—')).toHaveLength(2);
  });

  it('shows the state column only when inactive levels can be on the list', async () => {
    const { session } = createTestSession(
      { 'GET /v1/margin-levels': () => Response.json({ data: [STANDARD, HIGHER] }) },
      READER_ME,
    );
    renderApp(session, '/configuracion/margenes');
    const user = userEvent.setup();

    const table = await screen.findByRole('table', { name: 'Lista de niveles de margen' });
    expect(within(table).queryByRole('columnheader', { name: 'Estado' })).toBeNull();
    expect(within(table).getByText('● Por defecto')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: 'Todos' }));

    expect(await screen.findByRole('columnheader', { name: 'Estado' })).toBeInTheDocument();
  });

  it('is one compact line per level on a phone, with the price on the right', async () => {
    setViewportWidth(390);
    const calls: Call[] = [];
    const { session } = createTestSession(handlers(calls), MARGIN_ME);
    renderApp(session, '/configuracion/margenes');
    const user = userEvent.setup();

    const list = await screen.findByLabelText('Lista de niveles de margen');
    // Without a cost the right side says the state, and every action is behind ⋮.
    expect(within(list).getByText('Por defecto')).toBeInTheDocument();
    expect(
      within(list).getByRole('button', { name: 'Acciones de Margen 35 %' }),
    ).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: /^Editar:/ })).toBeNull();

    await user.type(screen.getByLabelText('Costo de prueba (con IVA)'), '525.01');

    expect(await within(list).findByText('Q 807.83')).toBeInTheDocument();
    expect(within(list).getByText('33 % · Por defecto · sin IVA Q 721.28')).toBeInTheDocument();
    expect(within(list).getByText('35 % · sin IVA Q 743.47')).toBeInTheDocument();
    expect(within(list).queryByText('Activo')).toBeNull();
  });
});
