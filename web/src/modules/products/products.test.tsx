import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, page, problem, type Call, type Handler } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const ALL = ['view', 'create', 'edit', 'deactivate'];
const meWith = (permissions: Record<string, string[]>) => ({ ...ME, permissions, scopes: {} });

const STAMPS = { created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z' };
const AREA = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000a1', name: 'Aire Acondicionado' };
const GROUP = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000b1', name: 'Conectores' };
const UNIT = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000d1', name: 'Unidad' };
const BRAND = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000e1', name: 'Panduit' };
const SUPPLIER = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000c1', name: 'Cables del Sur' };
const LEVEL = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000f1', name: 'Margen 33 %', rate: '0.33000' };
const OTHER_LEVEL = {
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000f2',
  name: 'Margen 35 %',
  rate: '0.35000',
};

const RJ45 = {
  id: '0192f1c2-7d3a-7a11-8f2e-000000000101',
  code: 'PRD-0001',
  name: 'Conector RJ45',
  description: 'Categoría 6',
  supplier: SUPPLIER,
  group: GROUP,
  area: AREA,
  brand: BRAND,
  unit: UNIT,
  cost: '22.9600',
  cost_updated_at: '2026-07-01T10:00:00.000Z',
  cost_is_stale: true,
  margin_level: LEVEL,
  price_without_vat: '31.54',
  price_with_vat: '35.33',
  check_availability: true,
  is_active: true,
  deactivation_reason: null,
  version: 1,
  ...STAMPS,
};
const CABLE = {
  ...RJ45,
  id: '0192f1c2-7d3a-7a11-8f2e-000000000102',
  code: 'PRD-0002',
  name: 'Cable UTP',
  brand: null,
  cost: '1.5000',
  cost_is_stale: false,
  price_without_vat: '2.06',
  price_with_vat: '2.31',
  check_availability: false,
};

/** What every screen of products reads on the way in: the lists its filters and form choose from. */
const OPTIONS: Record<string, Handler> = {
  'GET /v1/areas/options': () => Response.json({ data: [AREA] }),
  'GET /v1/product-groups/options': () => Response.json({ data: [{ ...GROUP, area_id: AREA.id }] }),
  'GET /v1/brands/options': () => Response.json({ data: [BRAND] }),
  'GET /v1/units-of-measure/options': () => Response.json({ data: [UNIT] }),
  'GET /v1/margin-levels/options': () =>
    Response.json({
      data: [
        { ...LEVEL, is_default: true },
        { ...OTHER_LEVEL, is_default: false },
      ],
    }),
  'GET /v1/suppliers/options': () => Response.json({ data: [{ ...SUPPLIER, code: 'PRV-0001' }] }),
};

afterEach(() => vi.unstubAllGlobals());

describe('products list', () => {
  it('shows each product with its supplier, cost, derived price and the stale-cost alert', async () => {
    const { session } = createTestSession(
      { ...OPTIONS, 'GET /v1/products': () => Response.json(page([RJ45, CABLE])) },
      meWith({ products: ALL }),
    );
    renderApp(session, '/productos');

    const table = await screen.findByRole('table', { name: 'Lista de productos' });
    expect(within(table).getByText('Conector RJ45')).toBeVisible();
    expect(within(table).getByText('PRD-0001')).toBeVisible();
    expect(within(table).getAllByText('Cables del Sur')).toHaveLength(2);
    expect(within(table).getAllByText('Aire Acondicionado · Conectores')).toHaveLength(2);
    // The cost reads as an amount, not as the four decimals the API stores.
    expect(within(table).getByText('22.96')).toBeVisible();
    expect(within(table).getByText('35.33')).toBeVisible();
    expect(within(table).getByText('1.50')).toBeVisible();
    // Only the product whose cost is stale carries the alert.
    expect(within(table).getAllByText('Costo desactualizado')).toHaveLength(1);
    expect(
      await screen.findByText(/Los precios se calculan desde el costo con «Margen 33 %»/),
    ).toBeVisible();
  });

  it('shows cards instead of a table on a phone, with the selection box on each', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(
      { ...OPTIONS, 'GET /v1/products': () => Response.json(page([RJ45])) },
      meWith({ products: ALL }),
    );
    renderApp(session, '/productos');

    const cards = await screen.findByLabelText('Lista de productos');
    expect(within(cards).getByText('Conector RJ45')).toBeVisible();
    expect(
      within(cards).getByRole('checkbox', { name: 'Seleccionar Conector RJ45' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers only what the permissions allow: whoever only views can look and nothing else', async () => {
    const { session } = createTestSession(
      { ...OPTIONS, 'GET /v1/products': () => Response.json(page([RJ45])) },
      meWith({ products: ['view'] }),
    );
    renderApp(session, '/productos');
    const user = userEvent.setup();

    await screen.findByRole('table', { name: 'Lista de productos' });
    expect(screen.queryByRole('link', { name: /Nuevo producto/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Seleccionar/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Acciones de Conector RJ45' }));
    expect(await screen.findByRole('menuitem', { name: /Ver/ })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Desactivar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /revisado/ })).not.toBeInTheDocument();
  });

  it('asks the API for each filter, including the margin level the prices are computed with', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        ...OPTIONS,
        'GET /v1/products': (call) => {
          calls.push(call);
          return Response.json(page([RJ45]));
        },
      },
      meWith({ products: ALL }),
    );
    renderApp(session, '/productos');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Buscar por nombre/), 'rj');
    await waitFor(() => expect(calls.at(-1)?.query.get('q')).toBe('rj'));

    await user.click(screen.getByRole('combobox', { name: 'Área' }));
    await user.click(await screen.findByRole('option', { name: 'Aire Acondicionado' }));
    await waitFor(() => expect(calls.at(-1)?.query.get('area_id')).toBe(AREA.id));

    await user.click(screen.getByRole('combobox', { name: 'Marca' }));
    await user.click(await screen.findByRole('option', { name: 'Panduit' }));
    await waitFor(() => expect(calls.at(-1)?.query.get('brand_id')).toBe(BRAND.id));

    await user.click(screen.getByRole('checkbox', { name: 'Solo costo desactualizado' }));
    await waitFor(() => expect(calls.at(-1)?.query.get('stale')).toBe('true'));

    expect(calls.at(-1)?.query.has('margin_level_id')).toBe(false);
    await user.click(screen.getByRole('combobox', { name: 'Precios con margen' }));
    await user.click(await screen.findByRole('option', { name: 'Margen 35 %' }));
    await waitFor(() => expect(calls.at(-1)?.query.get('margin_level_id')).toBe(OTHER_LEVEL.id));
    expect(await screen.findByText(/con «Margen 35 %»/)).toBeVisible();
  });

  it('marks the cost of a product as reviewed from its row', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        ...OPTIONS,
        'GET /v1/products': () => Response.json(page([RJ45])),
        [`POST /v1/products/${RJ45.id}/confirm-cost`]: (call) => {
          calls.push(call);
          return Response.json({ ...RJ45, cost_is_stale: false });
        },
      },
      meWith({ products: ['view', 'edit'] }),
    );
    renderApp(session, '/productos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Conector RJ45' }));
    await user.click(await screen.findByRole('menuitem', { name: /Marcar costo como revisado/ }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(
      await screen.findByText(/Se marcó el costo de «Conector RJ45» como revisado/),
    ).toBeVisible();
  });

  it('asks before deactivating one product and reactivates without asking', async () => {
    const calls: string[] = [];
    const inactive = { ...CABLE, is_active: false, deactivation_reason: 'manual' };
    const { session } = createTestSession(
      {
        ...OPTIONS,
        'GET /v1/products': () => Response.json(page([RJ45, inactive])),
        [`POST /v1/products/${RJ45.id}/deactivate`]: () => {
          calls.push('deactivate');
          return Response.json({ ...RJ45, is_active: false });
        },
        [`POST /v1/products/${CABLE.id}/reactivate`]: () => {
          calls.push('reactivate');
          return Response.json(CABLE);
        },
      },
      meWith({ products: ALL }),
    );
    renderApp(session, '/productos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Conector RJ45' }));
    await user.click(await screen.findByRole('menuitem', { name: /Desactivar/ }));
    const confirm = await screen.findByRole('dialog', { name: 'Desactivar producto' });
    expect(calls).toEqual([]);
    await user.click(within(confirm).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(calls).toEqual(['deactivate']));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Acciones de Cable UTP' }));
    await user.click(await screen.findByRole('menuitem', { name: /Reactivar/ }));
    await waitFor(() => expect(calls).toEqual(['deactivate', 'reactivate']));
  });

  it('says why a product cannot be reactivated while its supplier is deactivated', async () => {
    const inactive = { ...CABLE, is_active: false, deactivation_reason: 'supplier' };
    const { session } = createTestSession(
      {
        ...OPTIONS,
        'GET /v1/products': () => Response.json(page([inactive])),
        [`POST /v1/products/${CABLE.id}/reactivate`]: () =>
          problem(422, 'validation_failed', [{ field: 'supplier_id', code: 'parent_inactive' }]),
      },
      meWith({ products: ALL }),
    );
    renderApp(session, '/productos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Cable UTP' }));
    await user.click(await screen.findByRole('menuitem', { name: /Reactivar/ }));

    expect(
      await screen.findByText(/No se puede reactivar «Cable UTP»: su proveedor está desactivado/),
    ).toBeVisible();
  });
});

describe('products list: several at once', () => {
  const withBulk = (handlers: Record<string, Handler>, permissions = ALL) =>
    createTestSession(
      { ...OPTIONS, 'GET /v1/products': () => Response.json(page([RJ45, CABLE])), ...handlers },
      meWith({ products: permissions }),
    );

  it('selects the rows of the page and offers the actions on them', async () => {
    const { session } = withBulk({});
    renderApp(session, '/productos');
    const user = userEvent.setup();

    await screen.findByRole('table', { name: 'Lista de productos' });
    expect(screen.queryByText(/seleccionados?$/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar Conector RJ45' }));
    expect(await screen.findByText('1 seleccionado')).toBeVisible();
    await user.click(
      screen.getByRole('checkbox', { name: 'Seleccionar todos los productos de la página' }),
    );
    expect(await screen.findByText('2 seleccionados')).toBeVisible();
    await user.click(
      screen.getByRole('checkbox', { name: 'Seleccionar todos los productos de la página' }),
    );
    expect(screen.queryByText(/seleccionados?$/)).not.toBeInTheDocument();
  });

  it('deactivates the selected products after asking and tells what happened', async () => {
    const calls: Call[] = [];
    const { session } = withBulk({
      'POST /v1/products/deactivate': (call) => {
        calls.push(call);
        return Response.json({ affected: 1, unchanged: 1, blocked: 0 });
      },
    });
    renderApp(session, '/productos');
    const user = userEvent.setup();

    await screen.findByRole('table', { name: 'Lista de productos' });
    await user.click(
      screen.getByRole('checkbox', { name: 'Seleccionar todos los productos de la página' }),
    );
    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    const confirm = await screen.findByRole('dialog', { name: 'Desactivar productos' });
    expect(calls).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ ids: [RJ45.id, CABLE.id] });
    expect(
      await screen.findByText(/Se desactivaron 1 producto\. 1 producto ya estaba así/),
    ).toBeVisible();
    // The selection starts over once it was used.
    expect(screen.queryByText(/seleccionados?$/)).not.toBeInTheDocument();
  });

  it('reactivates the selection and says which ones its supplier is holding back', async () => {
    const calls: Call[] = [];
    const { session } = withBulk({
      'POST /v1/products/reactivate': (call) => {
        calls.push(call);
        return Response.json({ affected: 1, unchanged: 0, blocked: 1 });
      },
    });
    renderApp(session, '/productos');
    const user = userEvent.setup();

    await screen.findByRole('table', { name: 'Lista de productos' });
    await user.click(
      screen.getByRole('checkbox', { name: 'Seleccionar todos los productos de la página' }),
    );
    await user.click(screen.getByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(
      await screen.findByText(
        /1 producto no se pudo reactivar porque su proveedor está desactivado/,
      ),
    ).toBeVisible();
  });

  it('marks the cost of the selected products as reviewed', async () => {
    const calls: Call[] = [];
    const { session } = withBulk(
      {
        'POST /v1/products/confirm-cost': (call) => {
          calls.push(call);
          return Response.json({ affected: 2, unchanged: 0, blocked: 0 });
        },
      },
      ['view', 'edit'],
    );
    renderApp(session, '/productos');
    const user = userEvent.setup();

    await screen.findByRole('table', { name: 'Lista de productos' });
    await user.click(
      screen.getByRole('checkbox', { name: 'Seleccionar todos los productos de la página' }),
    );
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Marcar costo como revisado' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ ids: [RJ45.id, CABLE.id] });
    expect(await screen.findByText(/Se marcó el costo de 2 productos/)).toBeVisible();
  });

  it('reactivates what a supplier took down with it, after asking', async () => {
    const calls: Call[] = [];
    const { session } = withBulk({
      'POST /v1/products/reactivate': (call) => {
        calls.push(call);
        return Response.json({ affected: 3, unchanged: 0, blocked: 0 });
      },
    });
    renderApp(session, '/productos');
    const user = userEvent.setup();

    await screen.findByRole('table', { name: 'Lista de productos' });
    expect(
      screen.queryByRole('button', { name: /Reactivar los desactivados/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Proveedor' }));
    await user.click(await screen.findByRole('option', { name: 'Cables del Sur' }));
    // Only meaningful where inactive products are listed.
    expect(
      screen.queryByRole('button', { name: /Reactivar los desactivados/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Estado' }));
    await user.click(await screen.findByRole('option', { name: 'Inactivos' }));
    await user.click(
      await screen.findByRole('button', { name: /Reactivar los desactivados por el proveedor/ }),
    );
    const confirm = await screen.findByRole('dialog', {
      name: 'Reactivar los productos del proveedor',
    });
    expect(calls).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Reactivar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ supplier_id: SUPPLIER.id });
    expect(await screen.findByText(/Se reactivaron 3 productos/)).toBeVisible();
  });
});

describe('product form', () => {
  const formHandlers = (extra: Record<string, Handler> = {}) => ({
    ...OPTIONS,
    'GET /v1/products': () => Response.json(page([])),
    ...extra,
  });

  it('creates a product with its supplier, group, unit and cost, and sends nothing for what is empty', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      formHandlers({
        'POST /v1/products': (call) => {
          calls.push(call);
          return Response.json(RJ45, { status: 201 });
        },
      }),
      meWith({ products: ALL }),
    );
    renderApp(session, '/productos/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Nombre/), '  Conector RJ45 ');
    await user.click(screen.getByRole('combobox', { name: /Proveedor/ }));
    await user.click(await screen.findByRole('option', { name: 'Cables del Sur' }));
    await user.click(screen.getByRole('combobox', { name: /Área y grupo/ }));
    await user.click(
      await screen.findByRole('option', { name: 'Aire Acondicionado · Conectores' }),
    );
    await user.click(screen.getByRole('combobox', { name: /Unidad de medida/ }));
    await user.click(await screen.findByRole('option', { name: 'Unidad' }));
    await user.type(screen.getByLabelText(/Costo con IVA/), '22.96');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      name: 'Conector RJ45',
      description: null,
      supplier_id: SUPPLIER.id,
      group_id: GROUP.id,
      brand_id: null,
      unit_id: UNIT.id,
      cost: '22.96',
      check_availability: false,
    });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/productos$/));
  });

  it('cannot be saved without a name', async () => {
    const { session } = createTestSession(formHandlers(), meWith({ products: ALL }));
    renderApp(session, '/productos/nuevo');

    expect(await screen.findByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('shows what the API refused next to its field', async () => {
    const { session } = createTestSession(
      formHandlers({
        'POST /v1/products': () =>
          problem(422, 'validation_failed', [
            { field: 'cost', code: 'out_of_range' },
            { field: 'supplier_id', code: 'not_found' },
          ]),
      }),
      meWith({ products: ALL }),
    );
    renderApp(session, '/productos/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/^Nombre/), 'X');
    await user.type(screen.getByLabelText(/Costo con IVA/), '0');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('El costo debe ser mayor que cero.')).toBeVisible();
    expect(await screen.findByText(/Ya no está activo o no existe/)).toBeVisible();
  });

  it('is closed to someone who cannot create', async () => {
    const { session } = createTestSession(formHandlers(), meWith({ products: ['view'] }));
    renderApp(session, '/productos/nuevo');

    expect(await screen.findByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
  });

  it('offers to create a brand or a group only with the permission of that section, and uses what was created', async () => {
    const calls: Call[] = [];
    const created = {
      id: '0192f1c2-7d3a-7a11-8f2e-0000000000e2',
      name: 'Nueva marca',
      is_active: true,
      version: 1,
      ...STAMPS,
    };
    const { session } = createTestSession(
      formHandlers({
        'POST /v1/brands': (call) => {
          calls.push(call);
          return Response.json(created, { status: 201 });
        },
      }),
      meWith({ products: ALL, brands: ['view', 'create'] }),
    );
    renderApp(session, '/productos/nuevo');
    const user = userEvent.setup();

    await screen.findByLabelText(/^Nombre/);
    expect(screen.queryByRole('button', { name: 'Crear grupo' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Registrar un proveedor nuevo/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Crear marca' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva marca' });
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Nueva marca');
    await user.click(within(dialog).getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ name: 'Nueva marca' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('links to the supplier registration only for whoever can create suppliers', async () => {
    const { session } = createTestSession(
      formHandlers(),
      meWith({ products: ALL, suppliers: ['view', 'create'] }),
    );
    renderApp(session, '/productos/nuevo');

    expect(
      await screen.findByRole('link', { name: /Registrar un proveedor nuevo/ }),
    ).toHaveAttribute('href', '/proveedores/nuevo');
  });

  const editHandlers = (extra: Record<string, Handler> = {}) =>
    formHandlers({
      [`GET /v1/products/${RJ45.id}`]: () => Response.json(RJ45),
      ...extra,
    });

  it('edits with the version it read, and does not claim the cost was reviewed unless asked', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      editHandlers({
        [`PATCH /v1/products/${RJ45.id}`]: (call) => {
          calls.push(call);
          return Response.json({ ...RJ45, version: 2 });
        },
      }),
      meWith({ products: ALL }),
    );
    renderApp(session, `/productos/${RJ45.id}/editar`);
    const user = userEvent.setup();

    const name = await screen.findByLabelText(/^Nombre/);
    expect(name).toHaveValue('Conector RJ45');
    expect(screen.getByLabelText(/Costo con IVA/)).toHaveValue('22.96');
    expect(screen.getByText('Costo desactualizado')).toBeVisible();
    expect(screen.getByText(/Precio con IVA: 35.33 con «Margen 33 %»/)).toBeVisible();
    await user.clear(name);
    await user.type(name, 'Conector RJ45 Cat 6');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({
      version: 1,
      name: 'Conector RJ45 Cat 6',
      cost: '22.96',
      brand_id: BRAND.id,
      cost_reviewed: false,
    });
  });

  it('sends that the cost was reviewed when the box is ticked', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      editHandlers({
        [`PATCH /v1/products/${RJ45.id}`]: (call) => {
          calls.push(call);
          return Response.json({ ...RJ45, version: 2 });
        },
      }),
      meWith({ products: ALL }),
    );
    renderApp(session, `/productos/${RJ45.id}/editar`);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('checkbox', { name: 'El costo sigue igual (revisado)' }),
    );
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ cost: '22.96', cost_reviewed: true });
  });

  it('leaves the review box checked and locked once the cost itself changes, since that already updates it', async () => {
    const { session } = createTestSession(editHandlers(), meWith({ products: ALL }));
    renderApp(session, `/productos/${RJ45.id}/editar`);
    const user = userEvent.setup();

    const box = await screen.findByRole('checkbox', { name: 'El costo sigue igual (revisado)' });
    expect(box).not.toBeChecked();
    const cost = screen.getByLabelText(/Costo con IVA/);
    await user.clear(cost);
    await user.type(cost, '25');

    expect(box).toBeChecked();
    expect(box).toBeDisabled();
  });

  it('shows the product read-only to whoever can only view, with no way to save', async () => {
    const { session } = createTestSession(editHandlers(), meWith({ products: ['view'] }));
    renderApp(session, `/productos/${RJ45.id}`);

    expect(await screen.findByDisplayValue('Conector RJ45')).toHaveAttribute('readonly');
    expect(screen.getByDisplayValue('Categoría 6')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'El costo sigue igual (revisado)' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Crear/ })).not.toBeInTheDocument();
  });

  it('cannot open the edit screen with only view', async () => {
    const { session } = createTestSession(editHandlers(), meWith({ products: ['view'] }));
    renderApp(session, `/productos/${RJ45.id}/editar`);

    expect(await screen.findByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
  });
});
