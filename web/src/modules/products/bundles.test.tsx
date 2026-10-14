import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, problem, type Call, type Handler } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const ALL = ['view', 'create', 'edit', 'deactivate'];
const meWith = (permissions: Record<string, string[]>) => ({ ...ME, permissions, scopes: {} });

const STAMPS = { created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z' };
const AREA = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000a1', name: 'Redes' };
const GROUP = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000b1', name: 'Puntos de red' };
const BRAND = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000e1', name: 'Panduit' };
const SUPPLIER = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000c1', name: 'Cables del Sur' };
const LEVEL = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000f1', name: 'Margen 33 %', rate: '0.33000' };
const CABLE = { id: '0192f1c2-7d3a-7a11-8f2e-000000000201', code: 'PRD-0001', name: 'Cable UTP' };
const JACK = { id: '0192f1c2-7d3a-7a11-8f2e-000000000202', code: 'PRD-0002', name: 'Jack RJ45' };
const METER = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000d1', name: 'Metro' };
const UNIT = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000d2', name: 'Unidad' };

const POINT = {
  id: '0192f1c2-7d3a-7a11-8f2e-000000000301',
  code: 'PAQ-0001',
  name: 'Punto de red completo',
  description: 'Cable y conector',
  group: GROUP,
  area: AREA,
  brand: BRAND,
  suppliers: [SUPPLIER],
  component_count: 2,
  cost: '413.2800',
  cost_updated_at: '2026-07-01T10:00:00.000Z',
  cost_is_stale: true,
  has_inactive_components: false,
  inactive_component_count: 0,
  check_availability: false,
  margin_level: LEVEL,
  price_without_vat: '568.10',
  price_with_vat: '636.27',
  is_active: true,
  matched_component: null,
  version: 1,
  ...STAMPS,
};
const KIT = {
  ...POINT,
  id: '0192f1c2-7d3a-7a11-8f2e-000000000302',
  code: 'PAQ-0002',
  name: 'Kit de montaje',
  brand: null,
  component_count: 1,
  cost: '10.0000',
  cost_is_stale: false,
  price_without_vat: '13.74',
  price_with_vat: '15.39',
};

const ITEMS = [
  {
    product: CABLE,
    unit: METER,
    supplier: SUPPLIER,
    quantity: '18.000',
    cost: '22.9600',
    line_cost: '413.2800',
    cost_updated_at: '2026-07-01T10:00:00.000Z',
    cost_is_stale: true,
    is_active: true,
  },
  {
    product: JACK,
    unit: UNIT,
    supplier: SUPPLIER,
    quantity: '2.000',
    cost: '3.5000',
    line_cost: '7.0000',
    cost_updated_at: '2026-10-01T10:00:00.000Z',
    cost_is_stale: false,
    is_active: false,
  },
];
const DETAIL = {
  ...POINT,
  has_inactive_components: true,
  inactive_component_count: 1,
  items: ITEMS,
};

const CANDIDATES = [
  { ...CABLE, cost: '22.9600', unit: METER },
  { ...JACK, cost: '3.5000', unit: UNIT },
];

/** What every screen of bundles reads on the way in: the lists its filters and form choose from. */
const OPTIONS: Record<string, Handler> = {
  'GET /v1/areas/options': () => Response.json({ data: [AREA] }),
  'GET /v1/product-groups/options': () => Response.json({ data: [{ ...GROUP, area_id: AREA.id }] }),
  'GET /v1/brands/options': () => Response.json({ data: [BRAND] }),
  'GET /v1/margin-levels/options': () =>
    Response.json({
      data: [
        { ...LEVEL, is_default: true },
        { id: '0192f1c2-7d3a-7a11-8f2e-0000000000f2', name: 'Margen 35 %', is_default: false },
      ],
    }),
  'GET /v1/suppliers/options': () => Response.json({ data: [{ ...SUPPLIER, code: 'PRV-0001' }] }),
};
const LIST = (rows: unknown[]) => ({
  data: rows,
  meta: { page: 1, per_page: 25, total: rows.length, currency_code: 'GTQ' },
});

afterEach(() => vi.unstubAllGlobals());

describe('bundles list', () => {
  it('shows each bundle with its components, suppliers, cost, derived price and the alerts of its cost', async () => {
    const { session } = createTestSession(
      { ...OPTIONS, 'GET /v1/bundles': () => Response.json(LIST([POINT, KIT])) },
      meWith({ bundles: ALL }),
    );
    renderApp(session, '/paquetes');

    const table = await screen.findByRole('table', { name: 'Lista de paquetes' });
    expect(within(table).getByText('Punto de red completo')).toBeVisible();
    expect(within(table).getByText('PAQ-0001')).toBeVisible();
    expect(within(table).getByText('Panduit · 2 componentes')).toBeVisible();
    expect(within(table).getByText('1 componente')).toBeVisible();
    expect(within(table).getAllByText('Cables del Sur')).toHaveLength(2);
    expect(within(table).getByText(/^Q\s?413\.28$/)).toBeVisible();
    expect(within(table).getByText(/^Q\s?636\.27$/)).toBeVisible();
    expect(within(table).getByText(/^Q\s?568\.10 sin IVA$/)).toBeVisible();
    // Only the bundle with a stale component carries the alert.
    expect(within(table).getAllByText('Desactualizado')).toHaveLength(1);
    expect(await screen.findByText(/2 resultados · Precios desde el costo con «Margen 33 %»/));
  });

  it('says when a bundle has inactive components and which component matched the search', async () => {
    const found = {
      ...POINT,
      has_inactive_components: true,
      inactive_component_count: 2,
      matched_component: { code: 'PRD-0002', name: 'Jack RJ45' },
    };
    const { session } = createTestSession(
      { ...OPTIONS, 'GET /v1/bundles': () => Response.json(LIST([found])) },
      meWith({ bundles: ALL }),
    );
    renderApp(session, '/paquetes');

    const table = await screen.findByRole('table', { name: 'Lista de paquetes' });
    expect(within(table).getByText('Tiene 2 componentes inactivos')).toBeVisible();
    expect(within(table).getByText(/^Contiene:/)).toHaveTextContent('Contiene: Jack RJ45');
  });

  it('tags an inactive bundle so «Todos» tells it apart', async () => {
    const { session } = createTestSession(
      {
        ...OPTIONS,
        'GET /v1/bundles': () => Response.json(LIST([POINT, { ...KIT, is_active: false }])),
      },
      meWith({ bundles: ALL }),
    );
    renderApp(session, '/paquetes');

    const table = await screen.findByRole('table', { name: 'Lista de paquetes' });
    expect(within(table).getAllByText('Inactivo')).toHaveLength(1);
  });

  it('shows cards instead of a table on a phone, with the selection box on each', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(
      { ...OPTIONS, 'GET /v1/bundles': () => Response.json(LIST([POINT])) },
      meWith({ bundles: ALL }),
    );
    renderApp(session, '/paquetes');

    const cards = await screen.findByLabelText('Lista de paquetes');
    expect(within(cards).getByText('Punto de red completo')).toBeVisible();
    expect(within(cards).getByText('PAQ-0001')).toBeVisible();
    expect(within(cards).getByText('Cables del Sur · Puntos de red')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Área' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Seleccionar/ })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    expect(await screen.findByRole('combobox', { name: 'Área' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Elegir' }));
    expect(
      within(cards).getByRole('checkbox', { name: 'Seleccionar Punto de red completo' }),
    ).toBeInTheDocument();
  });

  it('offers only what the permissions allow: whoever only views can look and nothing else', async () => {
    const { session } = createTestSession(
      { ...OPTIONS, 'GET /v1/bundles': () => Response.json(LIST([POINT])) },
      meWith({ bundles: ['view'] }),
    );
    renderApp(session, '/paquetes');
    const user = userEvent.setup();

    await screen.findByRole('table', { name: 'Lista de paquetes' });
    expect(screen.queryByRole('link', { name: /Nuevo paquete/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Seleccionar/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Acciones de Punto de red completo' }));
    expect(await screen.findByRole('menuitem', { name: 'Ver' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Desactivar/ })).not.toBeInTheDocument();
  });

  it('asks the API for each filter, including the margin level and the search by component', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        ...OPTIONS,
        'GET /v1/bundles': (call) => {
          calls.push(call);
          return Response.json(LIST([POINT]));
        },
      },
      meWith({ bundles: ALL }),
    );
    renderApp(session, '/paquetes');
    const user = userEvent.setup();

    expect(await screen.findByLabelText(/Buscar por nombre, código o componente/)).toBeVisible();
    await user.type(screen.getByLabelText(/Buscar por nombre/), 'jack');
    await waitFor(() => expect(calls.at(-1)?.query.get('q')).toBe('jack'));

    await user.click(screen.getByRole('combobox', { name: 'Proveedor' }));
    await user.click(await screen.findByRole('option', { name: 'Cables del Sur' }));
    await waitFor(() => expect(calls.at(-1)?.query.get('supplier_id')).toBe(SUPPLIER.id));

    await user.click(screen.getByRole('combobox', { name: 'Área' }));
    await user.click(await screen.findByRole('option', { name: 'Redes' }));
    await waitFor(() => expect(calls.at(-1)?.query.get('area_id')).toBe(AREA.id));

    await user.click(screen.getByRole('combobox', { name: 'Marca' }));
    await user.click(await screen.findByRole('option', { name: 'Panduit' }));
    await waitFor(() => expect(calls.at(-1)?.query.get('brand_id')).toBe(BRAND.id));

    await user.click(screen.getByRole('checkbox', { name: 'Solo costo desactualizado' }));
    await waitFor(() => expect(calls.at(-1)?.query.get('stale')).toBe('true'));
    await user.click(screen.getByRole('checkbox', { name: 'Agrupar por área y grupo' }));
    await waitFor(() => expect(calls.at(-1)?.query.get('grouped')).toBe('true'));
  });

  it('asks before deactivating one bundle', async () => {
    const calls: string[] = [];
    const { session } = createTestSession(
      {
        ...OPTIONS,
        'GET /v1/bundles': () => Response.json(LIST([POINT])),
        [`POST /v1/bundles/${POINT.id}/deactivate`]: () => {
          calls.push('deactivate');
          return Response.json({ ...POINT, is_active: false });
        },
      },
      meWith({ bundles: ALL }),
    );
    renderApp(session, '/paquetes');
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Acciones de Punto de red completo' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: /Desactivar/ }));
    const confirm = await screen.findByRole('dialog', { name: 'Desactivar paquete' });
    expect(calls).toEqual([]);
    await user.click(within(confirm).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(calls).toEqual(['deactivate']));
  });

  it('says why a bundle cannot be reactivated while its group is deactivated', async () => {
    const { session } = createTestSession(
      {
        ...OPTIONS,
        'GET /v1/bundles': () => Response.json(LIST([{ ...KIT, is_active: false }])),
        [`POST /v1/bundles/${KIT.id}/reactivate`]: () =>
          problem(422, 'validation_failed', [{ field: 'group_id', code: 'parent_inactive' }]),
      },
      meWith({ bundles: ALL }),
    );
    renderApp(session, '/paquetes');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Kit de montaje' }));
    await user.click(await screen.findByRole('menuitem', { name: /Reactivar/ }));
    const confirm = await screen.findByRole('dialog', { name: 'Reactivar paquete' });
    await user.click(within(confirm).getByRole('button', { name: 'Reactivar' }));

    expect(
      await screen.findByText(/No se puede reactivar «Kit de montaje»: su grupo está desactivado/),
    ).toBeVisible();
  });

  it('prices one bundle at another margin level on the server, without saving anything', async () => {
    const levels: (string | null)[] = [];
    const { session } = createTestSession(
      {
        ...OPTIONS,
        'GET /v1/bundles': () => Response.json(LIST([POINT])),
        [`GET /v1/bundles/${POINT.id}`]: (call) => {
          levels.push(call.query.get('margin_level_id'));
          return Response.json({ ...POINT, price_with_vat: '650.00', price_without_vat: '580.00' });
        },
      },
      meWith({ bundles: ['view'] }),
    );
    renderApp(session, '/paquetes');
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Acciones de Punto de red completo' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Ver con otro margen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ver con otro margen' });

    expect(await within(dialog).findByText(/^Q\s?650\.00$/)).toBeVisible();
    expect(levels).toEqual(['0192f1c2-7d3a-7a11-8f2e-0000000000f2']);
  });
});

describe('bundles list: several at once', () => {
  const withBulk = (handlers: Record<string, Handler>) =>
    createTestSession(
      { ...OPTIONS, 'GET /v1/bundles': () => Response.json(LIST([POINT, KIT])), ...handlers },
      meWith({ bundles: ALL }),
    );

  it('selects the rows of the page and offers deactivate and reactivate on them', async () => {
    const { session } = withBulk({});
    renderApp(session, '/paquetes');
    const user = userEvent.setup();

    await screen.findByRole('table', { name: 'Lista de paquetes' });
    expect(screen.queryByText(/seleccionados?$/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar Punto de red completo' }));
    expect(await screen.findByText('1 seleccionado')).toBeVisible();
    await user.click(
      screen.getByRole('checkbox', { name: 'Seleccionar todos los paquetes de la página' }),
    );
    expect(await screen.findByText('2 seleccionados')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeVisible();
    // A bundle has no cost of its own to confirm: that is done on its products.
    expect(screen.queryByRole('button', { name: /revisado/ })).not.toBeInTheDocument();
  });

  it('deactivates the selected bundles after asking and tells what happened', async () => {
    const calls: Call[] = [];
    const { session } = withBulk({
      'POST /v1/bundles/deactivate': (call) => {
        calls.push(call);
        return Response.json({ affected: 1, unchanged: 1, blocked: 0 });
      },
    });
    renderApp(session, '/paquetes');
    const user = userEvent.setup();

    await screen.findByRole('table', { name: 'Lista de paquetes' });
    await user.click(
      screen.getByRole('checkbox', { name: 'Seleccionar todos los paquetes de la página' }),
    );
    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    const confirm = await screen.findByRole('dialog', { name: 'Desactivar paquetes' });
    expect(calls).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ ids: [POINT.id, KIT.id] });
    expect(
      await screen.findByText(/Se desactivaron 1 paquete\. 1 paquete ya estaba así/),
    ).toBeVisible();
    expect(screen.queryByText(/seleccionados?$/)).not.toBeInTheDocument();
  });

  it('reactivates the selection and says which ones their group is holding back', async () => {
    const calls: Call[] = [];
    const { session } = withBulk({
      'POST /v1/bundles/reactivate': (call) => {
        calls.push(call);
        return Response.json({ affected: 1, unchanged: 0, blocked: 1 });
      },
    });
    renderApp(session, '/paquetes');
    const user = userEvent.setup();

    await screen.findByRole('table', { name: 'Lista de paquetes' });
    await user.click(
      screen.getByRole('checkbox', { name: 'Seleccionar todos los paquetes de la página' }),
    );
    await user.click(screen.getByRole('button', { name: 'Reactivar' }));
    const confirm = await screen.findByRole('dialog', { name: 'Reactivar paquetes' });
    await user.click(within(confirm).getByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(
      await screen.findByText(/1 paquete no se pudo reactivar porque su grupo está desactivado/),
    ).toBeVisible();
  });

  it('does not offer selection without the permission to deactivate', async () => {
    const { session } = createTestSession(
      { ...OPTIONS, 'GET /v1/bundles': () => Response.json(LIST([POINT])) },
      meWith({ bundles: ['view', 'edit'] }),
    );
    renderApp(session, '/paquetes');

    await screen.findByRole('table', { name: 'Lista de paquetes' });
    expect(screen.queryByRole('checkbox', { name: /Seleccionar/ })).not.toBeInTheDocument();
  });
});

describe('products and bundles as one section', () => {
  const lists = {
    ...OPTIONS,
    'GET /v1/bundles': () => Response.json(LIST([POINT])),
    'GET /v1/products': () => Response.json({ ...LIST([]), meta: { ...LIST([]).meta } }),
  };

  it('shows the tabs to whoever views both, and moves between the two lists', async () => {
    const { session } = createTestSession(lists, meWith({ products: ALL, bundles: ALL }));
    renderApp(session, '/paquetes');
    const user = userEvent.setup();

    const tabs = await screen.findByRole('tablist', { name: 'Productos y paquetes' });
    expect(within(tabs).getByRole('tab', { name: 'Paquetes' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(within(tabs).getByRole('tab', { name: 'Productos' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/productos$/));
    expect(
      within(await screen.findByRole('tablist', { name: 'Productos y paquetes' })).getByRole(
        'tab',
        {
          name: 'Productos',
        },
      ),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the menu item highlighted on the bundles tab', async () => {
    const { session } = createTestSession(lists, meWith({ products: ALL, bundles: ALL }));
    renderApp(session, '/paquetes');

    await screen.findByRole('table', { name: 'Lista de paquetes' });
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(nav).getByRole('link', { name: 'Productos' })).toHaveClass('active');
  });

  it('has no tabs with only one of the two, and the menu item opens the one that can be viewed', async () => {
    const { session } = createTestSession(lists, meWith({ bundles: ['view'] }));
    renderApp(session, '/paquetes');

    await screen.findByRole('table', { name: 'Lista de paquetes' });
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(nav).getByRole('link', { name: 'Productos' })).toHaveAttribute(
      'href',
      '/paquetes',
    );
    expect(screen.getByRole('heading', { name: 'Paquetes' })).toBeVisible();
  });

  it('has neither the tabs nor the item in the menu for someone who views neither', async () => {
    const { session } = createTestSession(lists, meWith({ suppliers: ['view'] }));
    renderApp(session, '/');

    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
    expect(within(nav).queryByRole('link', { name: 'Productos' })).not.toBeInTheDocument();
  });
});

describe('bundle form', () => {
  const formHandlers = (extra: Record<string, Handler> = {}) => ({
    ...OPTIONS,
    'GET /v1/bundles': () => Response.json(LIST([])),
    ...extra,
  });
  const candidatesHandler =
    (calls: Call[] = []): Handler =>
    (call) => {
      calls.push(call);
      const excluded = (call.query.get('exclude') ?? '').split(',');
      return Response.json({
        data: CANDIDATES.filter((candidate) => !excluded.includes(candidate.id)),
      });
    };

  it('builds a bundle from the products found, previews its cost and sends the components', async () => {
    const created: Call[] = [];
    const searches: Call[] = [];
    const { session } = createTestSession(
      formHandlers({
        'GET /v1/bundles/candidates': candidatesHandler(searches),
        'POST /v1/bundles': (call) => {
          created.push(call);
          return Response.json(POINT, { status: 201 });
        },
      }),
      meWith({ bundles: ALL }),
    );
    renderApp(session, '/paquetes/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Nombre/), '  Punto de red ');
    await user.click(screen.getByRole('combobox', { name: /Área y grupo/ }));
    await user.click(await screen.findByRole('option', { name: 'Redes · Puntos de red' }));

    // Each option shows the name and, under it, the cost and the unit.
    await user.click(screen.getByRole('combobox', { name: /Agregar componente/ }));
    const cable = await screen.findByRole('option', { name: /Cable UTP/ });
    expect(within(cable).getByText(/^Q\s?22\.96 · Metro$/)).toBeVisible();
    await user.click(cable);

    // The product just added is no longer offered.
    await user.click(screen.getByRole('combobox', { name: /Agregar componente/ }));
    await screen.findByRole('option', { name: /Jack RJ45/ });
    expect(screen.queryByRole('option', { name: /Cable UTP/ })).not.toBeInTheDocument();
    expect(searches.at(-1)?.query.get('exclude')).toBe(CABLE.id);
    await user.click(screen.getByRole('option', { name: /Jack RJ45/ }));

    const quantity = screen.getAllByLabelText(/^Cantidad de/)[0] as HTMLElement;
    await user.clear(quantity);
    await user.type(quantity, '18');
    await user.clear(screen.getAllByLabelText(/^Cantidad de/)[1] as HTMLElement);
    await user.type(screen.getAllByLabelText(/^Cantidad de/)[1] as HTMLElement, '2');

    // 18 × 22.96 + 2 × 3.50 = 420.28
    expect(await screen.findByText(/^Q\s?420\.28$/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]?.body).toEqual({
      name: 'Punto de red',
      description: null,
      group_id: GROUP.id,
      brand_id: null,
      items: [
        { product_id: CABLE.id, quantity: '18' },
        { product_id: JACK.id, quantity: '2' },
      ],
    });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/paquetes$/));
  });

  it('never offers a product already in the bundle, even while the list of the last search is still shown', async () => {
    // A server that ignores `exclude` stands for the moment before the new search arrives.
    const { session } = createTestSession(
      formHandlers({ 'GET /v1/bundles/candidates': () => Response.json({ data: CANDIDATES }) }),
      meWith({ bundles: ALL }),
    );
    renderApp(session, '/paquetes/nuevo');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('combobox', { name: /Agregar componente/ }));
    await user.click(await screen.findByRole('option', { name: /Cable UTP/ }));
    await user.click(screen.getByRole('combobox', { name: /Agregar componente/ }));

    await screen.findByRole('option', { name: /Jack RJ45/ });
    expect(screen.queryByRole('option', { name: /Cable UTP/ })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Cantidad de/)).toHaveLength(1);
  });

  it('removes a component, and cannot be saved without a name or without components', async () => {
    const { session } = createTestSession(
      formHandlers({ 'GET /v1/bundles/candidates': candidatesHandler() }),
      meWith({ bundles: ALL }),
    );
    renderApp(session, '/paquetes/nuevo');
    const user = userEvent.setup();

    const save = await screen.findByRole('button', { name: 'Guardar' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText(/^Nombre/), 'X');
    expect(save).toBeDisabled();
    expect(screen.getByText('Todavía no tiene componentes.')).toBeVisible();

    await user.click(screen.getByRole('combobox', { name: /Agregar componente/ }));
    await user.click(await screen.findByRole('option', { name: /Cable UTP/ }));
    expect(save).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Quitar Cable UTP' }));
    expect(save).toBeDisabled();
  });

  it('does not accept a quantity that is not greater than zero', async () => {
    const { session } = createTestSession(
      formHandlers({ 'GET /v1/bundles/candidates': candidatesHandler() }),
      meWith({ bundles: ALL }),
    );
    renderApp(session, '/paquetes/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Nombre/), 'X');
    await user.click(screen.getByRole('combobox', { name: /Agregar componente/ }));
    await user.click(await screen.findByRole('option', { name: /Cable UTP/ }));
    const quantity = screen.getByLabelText(/^Cantidad de/);
    await user.clear(quantity);
    await user.type(quantity, '0');

    expect(await screen.findByText(/Escribe una cantidad con hasta 3 decimales/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('shows what the API refused next to the component it is about', async () => {
    const { session } = createTestSession(
      formHandlers({
        'GET /v1/bundles/candidates': candidatesHandler(),
        'POST /v1/bundles': () =>
          problem(422, 'validation_failed', [
            { field: 'items.0.product_id', code: 'not_found' },
            { field: 'group_id', code: 'not_found' },
          ]),
      }),
      meWith({ bundles: ALL }),
    );
    renderApp(session, '/paquetes/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Nombre/), 'X');
    await user.click(screen.getByRole('combobox', { name: /Agregar componente/ }));
    await user.click(await screen.findByRole('option', { name: /Cable UTP/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/Este producto ya no está activo o no existe/)).toBeVisible();
    expect(await screen.findByText(/Ya no está activo o no existe. Elige otro/)).toBeVisible();
  });

  it('is closed to someone who cannot create', async () => {
    const { session } = createTestSession(formHandlers(), meWith({ bundles: ['view'] }));
    renderApp(session, '/paquetes/nuevo');

    expect(await screen.findByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
  });

  const editHandlers = (extra: Record<string, Handler> = {}) =>
    formHandlers({
      [`GET /v1/bundles/${POINT.id}`]: () => Response.json(DETAIL),
      'GET /v1/bundles/candidates': candidatesHandler(),
      ...extra,
    });

  it('shows the components of a bundle with their unit, warns about the inactive one and edits with the version it read', async () => {
    const saved: Call[] = [];
    const { session } = createTestSession(
      editHandlers({
        [`PATCH /v1/bundles/${POINT.id}`]: (call) => {
          saved.push(call);
          return Response.json(POINT);
        },
      }),
      meWith({ bundles: ALL }),
    );
    renderApp(session, `/paquetes/${POINT.id}/editar`);
    const user = userEvent.setup();

    expect(await screen.findByDisplayValue('Punto de red completo')).toBeVisible();
    expect(screen.getByText('Cable UTP')).toBeVisible();
    expect(screen.getByDisplayValue('18')).toBeVisible();
    expect(screen.getByDisplayValue('2')).toBeVisible();
    expect(screen.getByText('Metro')).toBeVisible();
    expect(screen.getByText(/Hay componentes inactivos/)).toBeVisible();
    expect(screen.getAllByText('Inactivo')).toHaveLength(1);

    await user.clear(screen.getByDisplayValue('18'));
    await user.type(screen.getAllByLabelText(/^Cantidad de/)[0] as HTMLElement, '20');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.body).toMatchObject({
      version: 1,
      group_id: GROUP.id,
      brand_id: BRAND.id,
      items: [
        { product_id: CABLE.id, quantity: '20' },
        { product_id: JACK.id, quantity: '2' },
      ],
    });
  });

  it('lists the components as a table on a desktop, with the total in its last row', async () => {
    const { session } = createTestSession(editHandlers(), meWith({ bundles: ALL }));
    renderApp(session, `/paquetes/${POINT.id}/editar`);

    const table = await screen.findByRole('table', { name: 'Componentes del paquete' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers.slice(0, 5)).toEqual([
      'Código',
      'Componente',
      'Cantidad',
      'Costo unitario',
      'Subtotal',
    ]);
    const rows = within(table).getAllByRole('row');
    // Header, the two components and the total.
    expect(rows).toHaveLength(4);
    expect(within(rows[1] as HTMLElement).getByText('Cable UTP')).toBeVisible();
    expect(within(rows[2] as HTMLElement).getByText('Inactivo')).toBeVisible();
    expect(within(rows[3] as HTMLElement).getByText('Costo del paquete')).toBeVisible();
    expect(within(rows[3] as HTMLElement).getByText(/^Q\s?420\.28$/)).toBeVisible();
  });

  it('lists them as a compact list on a phone, with no table, and the quantity still edits', async () => {
    setViewportWidth(390);
    const saved: Call[] = [];
    const { session } = createTestSession(
      editHandlers({
        [`PATCH /v1/bundles/${POINT.id}`]: (call) => {
          saved.push(call);
          return Response.json(POINT);
        },
      }),
      meWith({ bundles: ALL }),
    );
    renderApp(session, `/paquetes/${POINT.id}/editar`);
    const user = userEvent.setup();

    const list = await screen.findByRole('list', { name: 'Componentes del paquete' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Inactivo')).toBeVisible();
    expect(within(list).getByText(/^× Q\s?22\.96 por metro$/)).toBeVisible();

    const quantity = within(list).getByLabelText('Cantidad de Cable UTP');
    await user.clear(quantity);
    await user.type(quantity, '20');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.body).toMatchObject({
      items: [
        { product_id: CABLE.id, quantity: '20' },
        { product_id: JACK.id, quantity: '2' },
      ],
    });
  });

  it('summarises the cost as a payment form does: rows of label and value, and numbered notes at the bottom', async () => {
    const { session } = createTestSession(editHandlers(), meWith({ bundles: ALL }));
    renderApp(session, `/paquetes/${POINT.id}/editar`);

    const notes = await screen.findByRole('list', { name: 'Notas' });
    const items = within(notes).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/^1Vista previa con los costos actuales/);
    expect(items[1]).toHaveTextContent(/^2Con «Margen 33 %»\. Se calcula desde el costo cada vez/);
    expect(items[2]).toHaveTextContent(
      /^3Es la fecha del componente cuyo costo se revisó hace más tiempo/,
    );
    // Each row carries the mark of its note, and the value is beside the label.
    const price = screen.getByText('Precio con IVA');
    expect(price.querySelector('sup')).toHaveTextContent('2');
    expect(price.nextElementSibling).toHaveTextContent(/^Q\s?636\.27$/);
    const oldest = screen.getByText('Costo más antiguo revisado');
    expect(oldest.querySelector('sup')).toHaveTextContent('3');
    expect(screen.getByText('Costo del paquete').querySelector('sup')).toHaveTextContent('1');
    expect(screen.getByText('Costo desactualizado')).toBeVisible();
  });

  it('has only the note of the preview while the bundle is not saved, and no rows', async () => {
    const { session } = createTestSession(
      formHandlers({ 'GET /v1/bundles/candidates': candidatesHandler() }),
      meWith({ bundles: ALL }),
    );
    renderApp(session, '/paquetes/nuevo');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('combobox', { name: /Agregar componente/ }));
    await user.click(await screen.findByRole('option', { name: /Cable UTP/ }));

    const notes = await screen.findByRole('list', { name: 'Notas' });
    expect(within(notes).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText('Precio con IVA')).not.toBeInTheDocument();
  });

  it('says the cost is computed, not previewed, to whoever only reads the bundle', async () => {
    const { session } = createTestSession(editHandlers(), meWith({ bundles: ['view'] }));
    renderApp(session, `/paquetes/${POINT.id}`);

    const notes = await screen.findByRole('list', { name: 'Notas' });
    expect(within(notes).getAllByRole('listitem')[0]).toHaveTextContent(
      /^1Se calcula con los costos actuales de los componentes; no se guarda\./,
    );
  });

  it('says another person changed the bundle when the version is stale', async () => {
    const { session } = createTestSession(
      editHandlers({ [`PATCH /v1/bundles/${POINT.id}`]: () => problem(409, 'conflict') }),
      meWith({ bundles: ALL }),
    );
    renderApp(session, `/paquetes/${POINT.id}/editar`);
    const user = userEvent.setup();

    await screen.findByDisplayValue('Punto de red completo');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/Otra persona cambió este paquete/)).toBeVisible();
  });

  it('shows the bundle read-only to whoever can only view, with the cost from the server and no way to save', async () => {
    const { session } = createTestSession(editHandlers(), meWith({ bundles: ['view'] }));
    renderApp(session, `/paquetes/${POINT.id}`);

    expect(await screen.findByDisplayValue('Punto de red completo')).toHaveAttribute('readonly');
    expect(screen.getByText('Cable UTP')).toBeVisible();
    // The cost of the line, and the cost of the bundle: the one the server computed.
    expect(screen.getAllByText(/^Q\s?413\.28$/)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Agregar componente/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Quitar/ })).not.toBeInTheDocument();
  });

  it('cannot open the edit screen with only view', async () => {
    const { session } = createTestSession(editHandlers(), meWith({ bundles: ['view'] }));
    renderApp(session, `/paquetes/${POINT.id}/editar`);

    expect(await screen.findByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
  });
});
