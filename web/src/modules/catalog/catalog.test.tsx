import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, page, problem, type Call } from '../../test/fakeApi';
import { renderApp } from '../../test/render';

const ALL = ['view', 'create', 'edit', 'deactivate'];
const RESOURCES = ['brands', 'areas', 'product_groups', 'unit_categories', 'units_of_measure'];
const withAccess = (resources: string[], actions: string[] = ALL) => ({
  ...ME,
  permissions: Object.fromEntries(resources.map((resource) => [resource, actions])),
  scopes: {},
});

const STAMPS = { created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z' };
const WIRING = {
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000c1',
  name: 'Cableado',
  is_active: true,
  version: 1,
  active_group_count: 2,
  ...STAMPS,
};
const POWER = {
  ...WIRING,
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000c2',
  name: 'Electricidad',
  active_group_count: 0,
};
const RETIRED = {
  ...WIRING,
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000c3',
  name: 'Retirada',
  is_active: false,
  active_group_count: 0,
};
const GROUP = {
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000d1',
  name: 'Conectores',
  is_active: true,
  version: 1,
  area: { id: WIRING.id, name: WIRING.name },
  ...STAMPS,
};

afterEach(() => vi.unstubAllGlobals());

const areasHandler = { 'GET /v1/areas': () => Response.json(page([WIRING, POWER, RETIRED])) };

describe('catalog structure', () => {
  it('opens on the first list the user may view, from the Catálogo entry of the menu', async () => {
    const { session } = createTestSession(
      { 'GET /v1/product-groups': () => Response.json(page([GROUP])), ...areasHandler },
      withAccess(['areas', 'product_groups'], ['view']),
    );
    renderApp(session, '/catalogo');

    expect(await screen.findByRole('heading', { name: 'Catálogo' })).toBeVisible();
    expect(await screen.findByRole('table', { name: 'Lista de áreas' })).toBeVisible();
    const tabs = screen.getByRole('tablist', { name: 'Catálogo' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Áreas', 'Grupos de producto']);
    expect(
      within(screen.getByRole('navigation', { name: 'Navegación principal' })).getByRole('link', {
        name: 'Catálogo',
      }),
    ).toBeVisible();
  });

  it('hides the Catálogo entry from someone without access to any of its lists', async () => {
    const { session } = createTestSession({}, withAccess(['segments']));
    renderApp(session, '/catalogo');

    expect(await screen.findByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Catálogo' })).not.toBeInTheDocument();
  });

  it('shows how many active groups each area has', async () => {
    const { session } = createTestSession(areasHandler, withAccess(RESOURCES));
    renderApp(session, '/catalogo?parametro=areas');

    const table = await screen.findByRole('table', { name: 'Lista de áreas' });
    expect(within(table).getByText('2 grupos activos')).toBeVisible();
    expect(within(table).getAllByText('0 grupos activos')).toHaveLength(2);
  });

  it('shows the area of each group and filters by it', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/product-groups': (call) => {
          calls.push(call);
          return Response.json(page([GROUP]));
        },
        ...areasHandler,
      },
      withAccess(RESOURCES),
    );
    renderApp(session, '/catalogo?parametro=product-groups');
    const user = userEvent.setup();

    const table = await screen.findByRole('table', { name: 'Lista de grupos de producto' });
    expect(within(table).getByText('Conectores')).toBeVisible();
    expect(within(table).getByText('Cableado')).toBeVisible();

    await user.click(screen.getByRole('combobox', { name: 'Área' }));
    await user.click(await screen.findByRole('option', { name: 'Electricidad' }));

    await waitFor(() => expect(calls.at(-1)?.query.get('area_id')).toBe(POWER.id));
  });

  it('creates a group under an active area and sends its id', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/product-groups': () => Response.json(page([GROUP])),
        'POST /v1/product-groups': (call) => {
          calls.push(call);
          return Response.json({ ...GROUP, name: 'Cables' }, { status: 201 });
        },
        ...areasHandler,
      },
      withAccess(RESOURCES),
    );
    renderApp(session, '/catalogo?parametro=product-groups');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Nuevo grupo de producto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo grupo de producto' });
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Cables');
    // Without an area the group cannot be saved.
    expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeDisabled();
    await user.click(within(dialog).getByRole('combobox', { name: /Área/ }));
    // Only active areas are offered.
    expect(screen.queryByRole('option', { name: 'Retirada' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Electricidad' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ name: 'Cables', area_id: POWER.id });
  });

  it('keeps the area a group already had even when it was deactivated since', async () => {
    const calls: Call[] = [];
    const orphan = { ...GROUP, area: { id: RETIRED.id, name: RETIRED.name } };
    const { session } = createTestSession(
      {
        'GET /v1/product-groups': () => Response.json(page([orphan])),
        [`PATCH /v1/product-groups/${orphan.id}`]: (call) => {
          calls.push(call);
          return Response.json({ ...orphan, name: 'Conectores 2', version: 2 });
        },
        ...areasHandler,
      },
      withAccess(RESOURCES),
    );
    renderApp(session, '/catalogo?parametro=product-groups');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Conectores' }));
    await user.click(await screen.findByRole('menuitem', { name: /Editar/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar grupo de producto' });
    await user.type(within(dialog).getByLabelText(/Nombre/), ' 2');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ name: 'Conectores 2', area_id: RETIRED.id, version: 1 });
  });

  it('offers the areas from the options list to whoever edits groups without any access to areas', async () => {
    const calls: Call[] = [];
    const { session, calls: all } = createTestSession(
      {
        'GET /v1/product-groups': () => Response.json(page([GROUP])),
        // Only the active areas, with id and name: it is all a selector needs.
        'GET /v1/areas/options': () =>
          Response.json({
            data: [
              { id: WIRING.id, name: WIRING.name },
              { id: POWER.id, name: POWER.name },
            ],
          }),
        'POST /v1/product-groups': (call) => {
          calls.push(call);
          return Response.json({ ...GROUP, name: 'Cables' }, { status: 201 });
        },
      },
      // Everything on groups and nothing on areas.
      withAccess(['product_groups']),
    );
    renderApp(session, '/catalogo');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Nuevo grupo de producto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo grupo de producto' });
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Cables');
    await user.click(within(dialog).getByRole('combobox', { name: /Área/ }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'Cableado',
      'Electricidad',
    ]);
    await user.click(screen.getByRole('option', { name: 'Electricidad' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ name: 'Cables', area_id: POWER.id });
    // The complete list of areas is the administration of that section: it was never asked for.
    expect(all.some((call) => call.path === '/v1/areas')).toBe(false);
  });

  it('keeps asking for the complete list of areas from whoever may view them', async () => {
    const { session, calls } = createTestSession(
      { 'GET /v1/product-groups': () => Response.json(page([GROUP])), ...areasHandler },
      withAccess(['product_groups', 'areas']),
    );
    renderApp(session, '/catalogo?parametro=product-groups');

    await screen.findByRole('table', { name: 'Lista de grupos de producto' });
    await waitFor(() => expect(calls.some((call) => call.path === '/v1/areas')).toBe(true));
    expect(calls.some((call) => call.path === '/v1/areas/options')).toBe(false);
  });

  it('says how many active groups keep an area from being deactivated', async () => {
    const { session } = createTestSession(
      {
        ...areasHandler,
        [`POST /v1/areas/${WIRING.id}/deactivate`]: () =>
          problem(409, 'area_in_use', undefined, { active_group_count: 2 }),
      },
      withAccess(['areas']),
    );
    renderApp(session, '/catalogo');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Cableado' }));
    await user.click(await screen.findByRole('menuitem', { name: /Desactivar/ }));
    const confirm = await screen.findByRole('dialog', { name: 'Desactivar valor' });
    await user.click(within(confirm).getByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText(
        'No se puede desactivar «Cableado»: tiene 2 grupos activos. Desactívalos primero.',
      ),
    ).toBeVisible();
  });

  it('explains that a group cannot come back under an inactive area', async () => {
    const inactive = { ...GROUP, is_active: false, area: { id: RETIRED.id, name: RETIRED.name } };
    const { session } = createTestSession(
      {
        'GET /v1/product-groups': () => Response.json(page([inactive])),
        ...areasHandler,
        [`POST /v1/product-groups/${inactive.id}/reactivate`]: () =>
          problem(422, 'validation_failed', [{ field: 'area_id', code: 'parent_inactive' }]),
      },
      withAccess(RESOURCES),
    );
    renderApp(session, '/catalogo?parametro=product-groups');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Conectores' }));
    await user.click(await screen.findByRole('menuitem', { name: /Reactivar/ }));
    const confirm = await screen.findByRole('dialog', { name: 'Reactivar valor' });
    await user.click(within(confirm).getByRole('button', { name: 'Reactivar' }));

    expect(
      await screen.findByText(
        'No se puede reactivar «Conectores»: área «Retirada» está desactivada. Reactívala primero.',
      ),
    ).toBeVisible();
  });

  it('limits a unit name to the 60 characters the API accepts', async () => {
    const { session } = createTestSession(
      {
        'GET /v1/unit-categories': () => Response.json(page([])),
        'GET /v1/units-of-measure': () => Response.json(page([])),
      },
      withAccess(['unit_categories', 'units_of_measure']),
    );
    renderApp(session, '/catalogo?parametro=units-of-measure');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Nueva unidad de medida' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva unidad de medida' });

    expect(within(dialog).getByLabelText(/Nombre/)).toHaveAttribute('maxlength', '60');
    expect(within(dialog).getByRole('combobox', { name: /Categoría/ })).toBeVisible();
  });
});
