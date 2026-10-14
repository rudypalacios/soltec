import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, page, problem, type Call } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const ALL = ['view', 'create', 'edit', 'deactivate'];
const meWith = (permissions: Record<string, string[]>) => ({ ...ME, permissions, scopes: {} });

const STAMPS = { created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z' };
const COMPRAS = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000c1', name: 'Compras' };
const CABLES = {
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000f1',
  code: 'PRV-0001',
  name: 'Cables del Sur',
  legal_name: 'Cables del Sur, S. A.',
  identification_type: 'nit' as const,
  identification: '6647912-6',
  credit_days: 30,
  credit_limit: '15000.50',
  is_active: true,
  version: 1,
  ...STAMPS,
};
const ACEROS = {
  ...CABLES,
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000f2',
  code: 'PRV-0002',
  name: 'Aceros',
  legal_name: null,
  identification_type: 'none' as const,
  identification: null,
  credit_days: null,
  credit_limit: null,
};
const CABLES_DETAIL = {
  ...CABLES,
  addresses: [
    {
      label: 'Oficina',
      address: '5a avenida 10-20',
      zone: 'Zona 10',
      country: null,
      is_primary: true,
    },
  ],
  contacts: [
    {
      name: 'Ana López',
      job_title: 'Ventas',
      contact_type: COMPRAS,
      phone: null,
      mobile: '5555-1111',
      email: 'ana@example.com',
      address: null,
      zone: null,
      country: null,
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('suppliers list', () => {
  it('shows each supplier with its code, identification and credit', async () => {
    const { session } = createTestSession(
      { 'GET /v1/suppliers': () => Response.json(page([CABLES, ACEROS])) },
      meWith({ suppliers: ALL }),
    );
    renderApp(session, '/proveedores');

    const table = await screen.findByRole('table', { name: 'Lista de proveedores' });
    expect(within(table).getByText('Cables del Sur')).toBeVisible();
    expect(within(table).getByText('PRV-0001')).toBeVisible();
    expect(within(table).getByText('NIT 6647912-6')).toBeVisible();
    expect(within(table).getByText('30 días')).toBeVisible();
    expect(within(table).getByText('Cables del Sur, S. A.')).toBeVisible();
  });

  it('shows cards instead of a table on a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(
      { 'GET /v1/suppliers': () => Response.json(page([CABLES])) },
      meWith({ suppliers: ALL }),
    );
    renderApp(session, '/proveedores');

    const cards = await screen.findByLabelText('Lista de proveedores');
    expect(within(cards).getByText('Cables del Sur')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers only a view link to someone who can only view', async () => {
    const { session } = createTestSession(
      { 'GET /v1/suppliers': () => Response.json(page([CABLES])) },
      meWith({ suppliers: ['view'] }),
    );
    renderApp(session, '/proveedores');
    const user = userEvent.setup();

    await screen.findByRole('table', { name: 'Lista de proveedores' });
    expect(screen.queryByRole('link', { name: /Nuevo proveedor/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Acciones de Cables del Sur' }));
    expect(await screen.findByRole('menuitem', { name: /Ver/ })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Desactivar/ })).not.toBeInTheDocument();
  });

  it('offers each action only with its own permission', async () => {
    const { session } = createTestSession(
      { 'GET /v1/suppliers': () => Response.json(page([CABLES])) },
      meWith({ suppliers: ['view', 'edit'] }),
    );
    renderApp(session, '/proveedores');
    const user = userEvent.setup();

    await screen.findByRole('table', { name: 'Lista de proveedores' });
    expect(screen.queryByRole('link', { name: /Nuevo proveedor/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Acciones de Cables del Sur' }));
    expect(await screen.findByRole('menuitem', { name: /Editar/ })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /Desactivar/ })).not.toBeInTheDocument();
  });

  it('searches through the API', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/suppliers': (call) => {
          calls.push(call);
          return Response.json(page([CABLES]));
        },
      },
      meWith({ suppliers: ALL }),
    );
    renderApp(session, '/proveedores');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Buscar por nombre/), 'cables');

    await waitFor(() => expect(calls.at(-1)?.query.get('q')).toBe('cables'));
    expect(calls.at(-1)?.query.get('status')).toBe('active');
  });

  it('asks before deactivating and reports a refusal to reactivate', async () => {
    const calls: Call[] = [];
    const retired = { ...ACEROS, is_active: false };
    const { session } = createTestSession(
      {
        'GET /v1/suppliers': () => Response.json(page([CABLES, retired])),
        [`POST /v1/suppliers/${CABLES.id}/deactivate`]: (call) => {
          calls.push(call);
          return Response.json({ ...CABLES, is_active: false });
        },
        [`POST /v1/suppliers/${ACEROS.id}/reactivate`]: () => problem(409, 'identification_taken'),
      },
      meWith({ suppliers: ALL }),
    );
    renderApp(session, '/proveedores');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Cables del Sur' }));
    await user.click(await screen.findByRole('menuitem', { name: /Desactivar/ }));
    const confirm = await screen.findByRole('dialog', { name: 'Desactivar proveedor' });
    expect(calls).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Acciones de Aceros' }));
    await user.click(await screen.findByRole('menuitem', { name: /Reactivar/ }));
    const reactivate = await screen.findByRole('dialog', { name: 'Reactivar proveedor' });
    await user.click(within(reactivate).getByRole('button', { name: 'Reactivar' }));
    expect(
      await screen.findByText(/Ya existe un registro activo con esta identificación/),
    ).toBeVisible();
  });
});

describe('supplier form', () => {
  it('creates a supplier with an address and a person, sending nothing for the empty optional fields', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/suppliers': () => Response.json(page([])),
        'GET /v1/contact-types/options': () => Response.json({ data: [COMPRAS] }),
        'POST /v1/suppliers': (call) => {
          calls.push(call);
          return Response.json(CABLES_DETAIL, { status: 201 });
        },
      },
      meWith({ suppliers: ALL }),
    );
    renderApp(session, '/proveedores/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Nombre comercial/), '  Cables del Sur ');
    await user.type(screen.getByLabelText(/Número de NIT/), '6647912-6');
    await user.type(screen.getByLabelText('Días de crédito'), '30');
    await user.click(screen.getByRole('button', { name: 'Agregar dirección' }));
    await user.type(screen.getByLabelText(/Etiqueta/), 'Oficina');
    await user.type(
      screen.getByLabelText(/^Dirección/, { selector: 'input[required]' }),
      '5a avenida',
    );
    await user.click(screen.getByRole('button', { name: 'Agregar contacto' }));
    await user.type(screen.getByLabelText(/^Nombre$|^Nombre \*/), 'Ana López');
    await user.click(screen.getByRole('combobox', { name: 'Tipo de contacto' }));
    await user.click(await screen.findByRole('option', { name: 'Compras' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      name: 'Cables del Sur',
      legal_name: null,
      identification_type: 'nit',
      identification: '6647912-6',
      credit_days: 30,
      credit_limit: null,
      addresses: [
        { label: 'Oficina', address: '5a avenida', zone: null, country: null, is_primary: true },
      ],
      contacts: [
        {
          name: 'Ana López',
          job_title: null,
          contact_type_id: COMPRAS.id,
          phone: null,
          mobile: null,
          email: null,
          address: null,
          zone: null,
          country: null,
        },
      ],
    });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/proveedores$/));
  });

  it('hides the number when there is no identification and sends none', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'POST /v1/suppliers': (call) => {
          calls.push(call);
          return Response.json(CABLES_DETAIL, { status: 201 });
        },
      },
      meWith({ suppliers: ALL }),
    );
    renderApp(session, '/proveedores/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Nombre comercial/), 'Aceros');
    await user.click(screen.getByRole('combobox', { name: 'Identificación' }));
    await user.click(await screen.findByRole('option', { name: 'Sin identificación' }));
    expect(screen.queryByLabelText(/Número de/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ identification_type: 'none', identification: null });
  });

  it('cannot be saved without a name', async () => {
    const { session } = createTestSession({}, meWith({ suppliers: ALL }));
    renderApp(session, '/proveedores/nuevo');

    expect(await screen.findByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('explains a repeated identification without saying whose it is', async () => {
    const { session } = createTestSession(
      { 'POST /v1/suppliers': () => problem(409, 'identification_taken') },
      meWith({ suppliers: ALL }),
    );
    renderApp(session, '/proveedores/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Nombre comercial/), 'Otro');
    await user.type(screen.getByLabelText(/Número de NIT/), '6647912-6');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText(/Consulta con tu jefe directo o con administración/),
    ).toBeVisible();
  });

  it('offers to reactivate the deactivated supplier that holds the identification', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/suppliers': () => Response.json(page([])),
        'POST /v1/suppliers': () =>
          problem(409, 'identification_inactive', undefined, {
            inactive_supplier_id: CABLES.id,
            inactive_supplier_name: 'Cables del Sur',
          }),
        [`POST /v1/suppliers/${CABLES.id}/reactivate`]: (call) => {
          calls.push(call);
          return Response.json(CABLES);
        },
        [`GET /v1/suppliers/${CABLES.id}`]: () => Response.json(CABLES_DETAIL),
        'GET /v1/contact-types/options': () => Response.json({ data: [COMPRAS] }),
      },
      meWith({ suppliers: ALL }),
    );
    renderApp(session, '/proveedores/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Nombre comercial/), 'Otro');
    await user.type(screen.getByLabelText(/Número de NIT/), '6647912-6');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText(/Ya existe un registro inactivo con esta identificación/),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reactivar «Cables del Sur»' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    // The existing supplier is the one to correct.
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent(`/proveedores/${CABLES.id}/editar`),
    );
  });

  it('only explains it when the API does not say which supplier holds the identification', async () => {
    const { session } = createTestSession(
      { 'POST /v1/suppliers': () => problem(409, 'identification_inactive') },
      meWith({ suppliers: ['view', 'create'] }),
    );
    renderApp(session, '/proveedores/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Nombre comercial/), 'Otro');
    await user.type(screen.getByLabelText(/Número de NIT/), '6647912-6');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/Pide a administración que lo reactive/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Reactivar/ })).not.toBeInTheDocument();
  });

  it('shows what the API refused next to the row and field it belongs to', async () => {
    const { session } = createTestSession(
      {
        'POST /v1/suppliers': () =>
          problem(422, 'validation_failed', [
            { field: 'identification', code: 'invalid' },
            { field: 'contacts.0.email', code: 'invalid' },
          ]),
      },
      meWith({ suppliers: ALL }),
    );
    renderApp(session, '/proveedores/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Nombre comercial/), 'Otro');
    await user.type(screen.getByLabelText(/Número de NIT/), '123');
    await user.click(screen.getByRole('button', { name: 'Agregar contacto' }));
    await user.type(screen.getByLabelText(/^Nombre$|^Nombre \*/), 'Ana');
    await user.type(screen.getByLabelText('Correo'), 'no-es-correo');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/No es un NIT o CUI válido/)).toBeVisible();
    expect(await screen.findByText(/Escribe un correo válido/)).toBeVisible();
  });

  it('is closed to someone who cannot create or edit', async () => {
    const { session } = createTestSession({}, meWith({ suppliers: ['view'] }));
    renderApp(session, '/proveedores/nuevo');
    expect(await screen.findByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
  });

  it('edits with the version it read and keeps the rows', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        [`GET /v1/suppliers/${CABLES.id}`]: () => Response.json(CABLES_DETAIL),
        'GET /v1/suppliers': () => Response.json(page([CABLES])),
        'GET /v1/contact-types/options': () => Response.json({ data: [COMPRAS] }),
        [`PATCH /v1/suppliers/${CABLES.id}`]: (call) => {
          calls.push(call);
          return Response.json({ ...CABLES_DETAIL, version: 2 });
        },
      },
      meWith({ suppliers: ALL }),
    );
    renderApp(session, `/proveedores/${CABLES.id}/editar`);
    const user = userEvent.setup();

    const name = await screen.findByLabelText(/Nombre comercial/);
    expect(name).toHaveValue('Cables del Sur');
    expect(screen.getByDisplayValue('Ana López')).toBeVisible();
    await user.clear(name);
    await user.type(name, 'Cables del Norte');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({
      version: 1,
      name: 'Cables del Norte',
      identification: '6647912-6',
      credit_limit: '15000.50',
    });
    expect((calls[0]?.body as { contacts: unknown[] }).contacts).toHaveLength(1);
  });

  it('removes a person from the set', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        [`GET /v1/suppliers/${CABLES.id}`]: () => Response.json(CABLES_DETAIL),
        'GET /v1/suppliers': () => Response.json(page([CABLES])),
        'GET /v1/contact-types/options': () => Response.json({ data: [COMPRAS] }),
        [`PATCH /v1/suppliers/${CABLES.id}`]: (call) => {
          calls.push(call);
          return Response.json({ ...CABLES_DETAIL, contacts: [], version: 2 });
        },
      },
      meWith({ suppliers: ALL }),
    );
    renderApp(session, `/proveedores/${CABLES.id}/editar`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Quitar contacto 1' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect((calls[0]?.body as { contacts: unknown[] }).contacts).toEqual([]);
  });
});

describe('supplier with only view access', () => {
  it('shows the data, the address and the people whole, with no way to save', async () => {
    const calls: string[] = [];
    const { session } = createTestSession(
      {
        [`GET /v1/suppliers/${CABLES.id}`]: () => Response.json(CABLES_DETAIL),
        // Nothing on contacts or contact types: the people belong to the supplier.
        'GET /v1/contact-types': () => {
          calls.push('contact-types');
          return problem(403, 'forbidden');
        },
        'GET /v1/contacts': () => {
          calls.push('contacts');
          return problem(403, 'forbidden');
        },
      },
      meWith({ suppliers: ['view'] }),
    );
    renderApp(session, `/proveedores/${CABLES.id}`);

    expect(await screen.findByDisplayValue('Cables del Sur')).toHaveAttribute('readonly');
    expect(screen.getByDisplayValue('Ana López')).toBeVisible();
    expect(screen.getByDisplayValue('Ventas')).toBeVisible();
    expect(screen.getByDisplayValue('5a avenida 10-20')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar contacto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quitar/ })).not.toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('cannot open the edit screen', async () => {
    const { session } = createTestSession({}, meWith({ suppliers: ['view'] }));
    renderApp(session, `/proveedores/${CABLES.id}/editar`);
    expect(await screen.findByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
  });
});

describe('contact types inside the supplier form', () => {
  const withEdit = (
    permissions: Record<string, string[]>,
    handlers: Record<string, (call: Call) => Response> = {},
  ) =>
    createTestSession(
      {
        [`GET /v1/suppliers/${CABLES.id}`]: () => Response.json(CABLES_DETAIL),
        'GET /v1/contact-types/options': () => Response.json({ data: [COMPRAS] }),
        ...handlers,
      },
      meWith(permissions),
    );

  it('fills the selector from the options without any access to the contact types section', async () => {
    const paths: string[] = [];
    const { session } = withEdit(
      { suppliers: ['view', 'edit'] },
      {
        'GET /v1/contact-types': (call) => {
          paths.push(call.path);
          return problem(403, 'forbidden');
        },
      },
    );
    renderApp(session, `/proveedores/${CABLES.id}/editar`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('combobox', { name: 'Tipo de contacto' }));
    expect(await screen.findByRole('option', { name: 'Compras' })).toBeVisible();
    expect(paths).toEqual([]);
  });

  it('offers to create a type only with contact_types.create', async () => {
    const without = withEdit({ suppliers: ['view', 'edit'] });
    const first = renderApp(without.session, `/proveedores/${CABLES.id}/editar`);
    await screen.findByLabelText(/Nombre comercial/);
    expect(
      screen.queryByRole('button', { name: 'Crear tipo de contacto' }),
    ).not.toBeInTheDocument();
    first.unmount();

    const withCreate = withEdit({ suppliers: ['view', 'edit'], contact_types: ['view', 'create'] });
    renderApp(withCreate.session, `/proveedores/${CABLES.id}/editar`);
    expect(await screen.findByRole('button', { name: 'Crear tipo de contacto' })).toBeVisible();
  });

  it('creates a type from the form and puts it on the person', async () => {
    const calls: Call[] = [];
    const { session } = withEdit(
      { suppliers: ['view', 'edit'], contact_types: ['view', 'create'] },
      {
        'POST /v1/contact-types': (call) => {
          calls.push(call);
          return Response.json(
            {
              id: '0192f1c2-7d3a-7a11-8f2e-0000000000c2',
              name: 'Logística',
              is_active: true,
              version: 1,
              ...STAMPS,
            },
            { status: 201 },
          );
        },
      },
    );
    renderApp(session, `/proveedores/${CABLES.id}/editar`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Crear tipo de contacto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo tipo de contacto' });
    await user.type(within(dialog).getByLabelText(/Nombre/), 'Logística');
    await user.click(within(dialog).getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ name: 'Logística' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // The supplier itself was not saved by the dialog.
    expect(screen.getByRole('combobox', { name: 'Tipo de contacto' })).toHaveTextContent(
      'Logística',
    );
  });
});
