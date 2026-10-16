import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, page, problem, type Call, type Handler } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const ALL = ['view', 'create', 'edit', 'deactivate'];
const meWith = (permissions: Record<string, string[]>, scopes: Record<string, string> = {}) => ({
  ...ME,
  permissions,
  scopes: { clients: 'own', contacts: 'own', ...scopes },
});

const STAMPS = { created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z' };
const ANA = { id: ME.id, name: 'Ana Pérez' };
const LUIS = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000b2', name: 'Luis Gómez' };
const ACTIVO = {
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000d1',
  name: 'Activo (nuevo)',
  color: '#00796B',
};
const RETAIL = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000d2', name: 'Retail' };
const GENERAL = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000d3', name: 'General' };
const COMERCIAL = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000d4', name: 'Comercial' };
const LONG =
  'Corporación Distribuidora Centroamericana de Equipos Eléctricos, Refrigeración Industrial y Servicios Técnicos Especializados, Sociedad Anónima';

const SOL = {
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000c1',
  code: 'CLI-0001',
  type: 'prospect' as const,
  name: 'Restaurante El Sol',
  identification_type: 'none' as const,
  identification: null,
  status: ACTIVO,
  segment: RETAIL,
  area: null,
  margin_level: null,
  converted_at: null,
  is_active: true,
  responsible: ANA,
  seller_count: 1,
  version: 1,
  ...STAMPS,
};
const SOL_DETAIL = {
  ...SOL,
  addresses: [
    {
      label: 'Oficina',
      address: '5a avenida 10-20',
      zone: 'Zona 10',
      country: null,
      is_primary: true,
    },
  ],
  billing_profile: null,
  sellers: [{ user: ANA, is_responsible: true }],
  contacts: [],
};
const MUNDO = {
  ...SOL,
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000c2',
  code: 'CLI-0002',
  type: 'customer' as const,
  name: LONG,
  identification_type: 'nit' as const,
  identification: '6647912-6',
  responsible: LUIS,
  seller_count: 3,
  is_active: false,
};
const MUNDO_DETAIL = {
  ...MUNDO,
  is_active: true,
  addresses: [],
  billing_profile: {
    legal_name: 'Mundo, S. A.',
    tax_regime: GENERAL,
    payment_method: null,
    credit_days: 30,
    credit_limit: '15000.50',
  },
  sellers: [
    { user: LUIS, is_responsible: true },
    { user: ANA, is_responsible: false },
  ],
  contacts: [
    { contact: { id: 'p1', code: 'CON-0001', name: 'Roberto Mejía' }, contact_type: COMERCIAL },
  ],
};

/** What every screen of clients asks for as soon as it opens. */
const OPTIONS: Record<string, Handler> = {
  'GET /v1/client-statuses/options': () => Response.json({ data: [ACTIVO] }),
  'GET /v1/segments/options': () => Response.json({ data: [RETAIL] }),
  'GET /v1/areas/options': () => Response.json({ data: [] }),
  'GET /v1/margin-levels/options': () => Response.json({ data: [] }),
  'GET /v1/tax-regimes/options': () => Response.json({ data: [GENERAL] }),
  'GET /v1/payment-methods/options': () => Response.json({ data: [] }),
  'GET /v1/contact-types/options': () => Response.json({ data: [COMERCIAL] }),
  'GET /v1/clients/seller-options': () => Response.json({ data: [ANA, LUIS] }),
  'GET /v1/clients/similar': () => Response.json({ data: [] }),
};

afterEach(() => vi.unstubAllGlobals());

describe('clients list', () => {
  it('shows each client with its type, status, identification and responsible adviser', async () => {
    const { session } = createTestSession(
      { ...OPTIONS, 'GET /v1/clients': () => Response.json(page([SOL, MUNDO])) },
      meWith({ clients: ALL }),
    );
    renderApp(session, '/clientes');

    const table = await screen.findByRole('table', { name: 'Lista de clientes' });
    expect(within(table).getByText('Restaurante El Sol')).toBeVisible();
    expect(within(table).getByText('CLI-0001')).toBeVisible();
    expect(within(table).getByText('Prospecto')).toBeVisible();
    expect(within(table).getAllByText('Activo (nuevo)')).toHaveLength(2);
    expect(within(table).getByText('Luis Gómez')).toBeVisible();
    expect(within(table).getByText('+2')).toBeVisible();
    expect(within(table).getByText(/NIT 6647912-6/)).toBeVisible();
    // The inactive one is marked like in every list.
    expect(within(table).getByText('Inactivo')).toBeVisible();
  });

  it('shows the whole name on a card of a phone, and the adviser with the number of others', async () => {
    setViewportWidth(360);
    const { session } = createTestSession(
      { ...OPTIONS, 'GET /v1/clients': () => Response.json(page([MUNDO])) },
      meWith({ clients: ALL }),
    );
    renderApp(session, '/clientes');

    const card = await screen.findByTestId('client-card');
    expect(within(card).getByText(LONG)).toBeVisible();
    expect(within(card).getByText('Luis Gómez')).toBeVisible();
    expect(within(card).getByText('+2')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('sends the filters to the API', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        ...OPTIONS,
        'GET /v1/clients': (call) => {
          calls.push(call);
          return Response.json(page([SOL]));
        },
      },
      meWith({ clients: ALL }),
    );
    renderApp(session, '/clientes');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Buscar por nombre/), 'sol');
    await waitFor(() => expect(calls.at(-1)?.query.get('q')).toBe('sol'));
    await user.click(screen.getByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Clientes' }));
    await waitFor(() => expect(calls.at(-1)?.query.get('type')).toBe('customer'));
    expect(calls.at(-1)?.query.get('status')).toBe('active');
  });

  it('offers each action only with its own permission', async () => {
    const { session } = createTestSession(
      { ...OPTIONS, 'GET /v1/clients': () => Response.json(page([SOL])) },
      meWith({ clients: ['view'] }),
    );
    renderApp(session, '/clientes');
    const user = userEvent.setup();

    await screen.findByRole('table', { name: 'Lista de clientes' });
    expect(screen.queryByRole('link', { name: /Nuevo prospecto/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reasignar cartera' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Acciones de Restaurante El Sol' }));
    expect(await screen.findByRole('menuitem', { name: /Ver/ })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Desactivar/ })).not.toBeInTheDocument();
  });

  it('offers «Reasignar cartera» only with a scope that reaches other advisers', async () => {
    const handlers = { ...OPTIONS, 'GET /v1/clients': () => Response.json(page([SOL])) };
    const own = createTestSession(handlers, meWith({ clients: ALL }, { clients: 'own' }));
    const { unmount } = renderApp(own.session, '/clientes');
    await screen.findByRole('table', { name: 'Lista de clientes' });
    expect(screen.queryByRole('button', { name: 'Reasignar cartera' })).not.toBeInTheDocument();
    unmount();

    const team = createTestSession(handlers, meWith({ clients: ALL }, { clients: 'team' }));
    renderApp(team.session, '/clientes');
    expect(await screen.findByRole('button', { name: 'Reasignar cartera' })).toBeVisible();
  });

  it('asks before deactivating', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        ...OPTIONS,
        'GET /v1/clients': () => Response.json(page([SOL])),
        [`POST /v1/clients/${SOL.id}/deactivate`]: (call) => {
          calls.push(call);
          return Response.json({ ...SOL_DETAIL, is_active: false });
        },
      },
      meWith({ clients: ALL }),
    );
    renderApp(session, '/clientes');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Restaurante El Sol' }));
    await user.click(await screen.findByRole('menuitem', { name: /Desactivar/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Desactivar cliente' });
    expect(calls).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(calls).toHaveLength(1));
  });

  it('hands over a portfolio only after the person confirms, and tells what moved', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        ...OPTIONS,
        'GET /v1/clients': (call) =>
          Response.json(call.query.has('seller_id') ? page([SOL], 14) : page([SOL])),
        'POST /v1/clients/reassign': (call) => {
          calls.push(call);
          return Response.json({ clients_reassigned: 14, contacts_moved: 9, contacts_kept: 3 });
        },
      },
      meWith({ clients: ALL }, { clients: 'all' }),
    );
    renderApp(session, '/clientes');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Reasignar cartera' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reasignar cartera' });
    const next = within(dialog).getByRole('button', { name: 'Continuar' });
    expect(next).toBeDisabled();
    await user.click(within(dialog).getByRole('combobox', { name: /Entregar la cartera de/ }));
    await user.click(await screen.findByRole('option', { name: 'Ana Pérez' }));
    await user.click(within(dialog).getByRole('combobox', { name: /^A/ }));
    await user.click(await screen.findByRole('option', { name: 'Luis Gómez' }));
    await user.click(next);

    // The second step says what is about to move, and nothing has been sent yet.
    expect(
      await screen.findByText(/Se reasignarán 14 clientes de Ana Pérez a Luis Gómez/),
    ).toBeVisible();
    expect(calls).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Sí, reasignar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      from_user_id: ANA.id,
      to_user_id: LUIS.id,
      move_contacts: true,
    });
    expect(await screen.findByText(/Se entregaron 14 clientes/)).toBeVisible();
    expect(screen.getByText(/3 contactos se quedaron con su dueño/)).toBeVisible();
  });
});

describe('client form', () => {
  it('registers a prospect sending only what was typed, and goes to its screen', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        ...OPTIONS,
        'GET /v1/clients/similar': () => Response.json({ data: [] }),
        'POST /v1/clients': (call) => {
          calls.push(call);
          return Response.json(SOL_DETAIL, { status: 201 });
        },
        [`GET /v1/clients/${SOL.id}`]: () => Response.json(SOL_DETAIL),
      },
      meWith({ clients: ALL }),
    );
    renderApp(session, '/clientes/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Nombre comercial/), '  Restaurante El Sol ');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      name: 'Restaurante El Sol',
      identification_type: 'none',
      identification: null,
      status_id: null,
      segment_id: null,
      area_id: null,
      margin_level_id: null,
      addresses: [],
    });
    expect(await screen.findByTestId('where')).toHaveTextContent(`/clientes/${SOL.id}`);
  });

  it('warns of clients with a similar name before saving', async () => {
    const { session } = createTestSession(
      {
        ...OPTIONS,
        'GET /v1/clients/similar': () =>
          Response.json({ data: [{ id: SOL.id, code: SOL.code, name: SOL.name }] }),
      },
      meWith({ clients: ALL }),
    );
    renderApp(session, '/clientes/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Nombre comercial/), 'Restaurante');

    expect(await screen.findByText('Ya tienes clientes con un nombre parecido')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Restaurante El Sol' })).toBeVisible();
  });

  it('says an active identification exists without saying whose it is', async () => {
    const { session } = createTestSession(
      { ...OPTIONS, 'POST /v1/clients': () => problem(409, 'identification_taken') },
      meWith({ clients: ALL }),
    );
    renderApp(session, '/clientes/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Nombre comercial/), 'Otro');
    await user.click(screen.getByRole('combobox', { name: 'Identificación' }));
    await user.click(await screen.findByRole('option', { name: 'NIT' }));
    await user.type(screen.getByLabelText(/Número de NIT/), '6647912-6');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText(/Consulta con tu jefe directo o con administración/),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /Reactivar/ })).not.toBeInTheDocument();
  });

  it('offers to reactivate the inactive client that holds the identification, when the API names it', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        ...OPTIONS,
        'POST /v1/clients': () =>
          problem(409, 'identification_inactive', undefined, {
            inactive_client_id: MUNDO.id,
            inactive_client_name: 'Industrias del Norte',
          }),
        [`POST /v1/clients/${MUNDO.id}/reactivate`]: (call) => {
          calls.push(call);
          return Response.json(MUNDO_DETAIL);
        },
        [`GET /v1/clients/${MUNDO.id}`]: () => Response.json(MUNDO_DETAIL),
      },
      meWith({ clients: ALL }),
    );
    renderApp(session, '/clientes/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Nombre comercial/), 'Otra vez');
    await user.click(screen.getByRole('combobox', { name: 'Identificación' }));
    await user.click(await screen.findByRole('option', { name: 'NIT' }));
    await user.type(screen.getByLabelText(/Número de NIT/), '6647912-6');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await user.click(
      await screen.findByRole('button', { name: 'Reactivar «Industrias del Norte»' }),
    );

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(await screen.findByTestId('where')).toHaveTextContent(`/clientes/${MUNDO.id}/editar`);
  });

  it('asks a customer for its billing profile when editing', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        ...OPTIONS,
        [`GET /v1/clients/${MUNDO.id}`]: () => Response.json(MUNDO_DETAIL),
        [`PATCH /v1/clients/${MUNDO.id}`]: (call) => {
          calls.push(call);
          return Response.json(MUNDO_DETAIL);
        },
      },
      meWith({ clients: ALL }),
    );
    renderApp(session, `/clientes/${MUNDO.id}/editar`);
    const user = userEvent.setup();

    const legalName = await screen.findByLabelText(/Nombre fiscal/);
    expect(legalName).toHaveValue('Mundo, S. A.');
    await user.clear(screen.getByLabelText('Días de crédito'));
    await user.type(screen.getByLabelText('Días de crédito'), '45');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({
      version: 1,
      billing_profile: {
        legal_name: 'Mundo, S. A.',
        tax_regime_id: GENERAL.id,
        payment_method_id: null,
        credit_days: 45,
        credit_limit: '15000.50',
      },
    });
  });

  it('keeps a user without permission to create out of the form', async () => {
    const { session } = createTestSession(OPTIONS, meWith({ clients: ['view'] }));
    renderApp(session, '/clientes/nuevo');

    expect(await screen.findByText(/No tienes permiso/)).toBeVisible();
  });
});

describe('client screen', () => {
  const open = (
    client: typeof SOL_DETAIL | typeof MUNDO_DETAIL,
    handlers: Record<string, Handler> = {},
    me = meWith({ clients: ALL, contacts: ['view', 'create'] }),
  ) =>
    createTestSession(
      { ...OPTIONS, [`GET /v1/clients/${client.id}`]: () => Response.json(client), ...handlers },
      me,
    );

  it('shows the data, the billing profile, the advisers and the people the person may see', async () => {
    const { session } = open(MUNDO_DETAIL);
    renderApp(session, `/clientes/${MUNDO.id}`);

    expect(await screen.findByRole('heading', { name: LONG })).toBeVisible();
    expect(screen.getByText('NIT 6647912-6')).toBeVisible();
    expect(screen.getByText('Mundo, S. A.')).toBeVisible();
    expect(screen.getByText(/30 días · límite 15,000.50/)).toBeVisible();
    expect(screen.getByText('Luis Gómez')).toBeVisible();
    expect(screen.getByText('Roberto Mejía')).toBeVisible();
    expect(screen.getByText('Comercial')).toBeVisible();
  });

  it('offers each action only with its own permission', async () => {
    const { session } = open(SOL_DETAIL, {}, meWith({ clients: ['view'] }));
    renderApp(session, `/clientes/${SOL.id}`);

    await screen.findByRole('heading', { name: 'Restaurante El Sol' });
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Convertir en cliente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar' })).not.toBeInTheDocument();
  });

  it('converts a prospect only after asking for the identification and the billing profile', async () => {
    const calls: Call[] = [];
    const { session } = open(SOL_DETAIL, {
      [`POST /v1/clients/${SOL.id}/convert`]: (call) => {
        calls.push(call);
        return Response.json(MUNDO_DETAIL);
      },
    });
    renderApp(session, `/clientes/${SOL.id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Convertir en cliente' }));
    const dialog = await screen.findByRole('dialog', { name: 'Convertir en cliente de venta' });
    const submit = within(dialog).getByRole('button', { name: 'Convertir en cliente' });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Nombre fiscal/), 'Restaurante El Sol, S. A.');
    await user.click(within(dialog).getByRole('combobox', { name: /Régimen fiscal/ }));
    await user.click(await screen.findByRole('option', { name: 'General' }));
    expect(calls).toHaveLength(0);
    await user.click(submit);

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      version: 1,
      identification_type: 'none',
      identification: null,
      billing_profile: {
        legal_name: 'Restaurante El Sol, S. A.',
        tax_regime_id: GENERAL.id,
        payment_method_id: null,
        credit_days: null,
        credit_limit: null,
      },
    });
  });

  it('does not offer to share a prospect and says why', async () => {
    const { session } = open(SOL_DETAIL);
    renderApp(session, `/clientes/${SOL.id}`);

    expect(await screen.findByText(/Un prospecto tiene un solo asesor/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Agregar' })).not.toBeInTheDocument();
  });

  it('adds an adviser to a customer after the dialog is confirmed', async () => {
    const calls: Call[] = [];
    const { session } = open(
      { ...MUNDO_DETAIL, responsible: ANA, sellers: [{ user: ANA, is_responsible: true }] },
      {
        [`POST /v1/clients/${MUNDO.id}/sellers`]: (call) => {
          calls.push(call);
          return Response.json(MUNDO_DETAIL);
        },
      },
    );
    renderApp(session, `/clientes/${MUNDO.id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Agregar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Agregar asesor' });
    await user.click(within(dialog).getByRole('combobox', { name: /Asesor/ }));
    await user.click(await screen.findByRole('option', { name: 'Luis Gómez' }));
    expect(calls).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Agregar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ user_id: LUIS.id });
  });

  it('lets only the responsible adviser or a wider scope administer the advisers', async () => {
    // Ana is an adviser of the client but not the responsible one, and her scope is her own clients.
    const { session } = open(MUNDO_DETAIL);
    renderApp(session, `/clientes/${MUNDO.id}`);

    await screen.findByRole('heading', { name: LONG });
    expect(screen.queryByRole('button', { name: 'Agregar' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reasignar a otro asesor' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Acciones de (Luis|Ana)/ }),
    ).not.toBeInTheDocument();
  });

  it('asks before removing an adviser or making another one responsible', async () => {
    const calls: Call[] = [];
    const { session } = open(
      {
        ...MUNDO_DETAIL,
        responsible: ANA,
        sellers: [
          { user: ANA, is_responsible: true },
          { user: LUIS, is_responsible: false },
        ],
      },
      {
        [`POST /v1/clients/${MUNDO.id}/responsible`]: (call) => {
          calls.push(call);
          return Response.json(MUNDO_DETAIL);
        },
        [`DELETE /v1/clients/${MUNDO.id}/sellers/${LUIS.id}`]: () =>
          problem(409, 'responsible_required'),
      },
    );
    renderApp(session, `/clientes/${MUNDO.id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Luis Gómez' }));
    await user.click(await screen.findByRole('menuitem', { name: /Hacer responsable/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Hacer responsable' });
    expect(calls).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Hacer responsable' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ user_id: LUIS.id });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Acciones de Luis Gómez' }));
    await user.click(await screen.findByRole('menuitem', { name: /Quitar/ }));
    const remove = await screen.findByRole('dialog', { name: 'Quitar asesor' });
    await user.click(within(remove).getByRole('button', { name: 'Quitar' }));
    expect(await screen.findByText(/Todo cliente tiene un asesor responsable/)).toBeVisible();
  });

  it('reassigns a client with its people after confirming, and says what stayed', async () => {
    const calls: Call[] = [];
    const { session } = open(
      { ...MUNDO_DETAIL, responsible: ANA, sellers: [{ user: ANA, is_responsible: true }] },
      {
        [`POST /v1/clients/${MUNDO.id}/reassign`]: (call) => {
          calls.push(call);
          return Response.json({ client: MUNDO_DETAIL, contacts_moved: 1, contacts_kept: 2 });
        },
      },
    );
    renderApp(session, `/clientes/${MUNDO.id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Reasignar a otro asesor' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reasignar cliente' });
    await user.click(within(dialog).getByRole('combobox', { name: /Entra/ }));
    await user.click(await screen.findByRole('option', { name: 'Luis Gómez' }));
    expect(calls).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Reasignar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      from_user_id: ANA.id,
      to_user_id: LUIS.id,
      move_contacts: true,
    });
    expect(await screen.findByText(/2 contactos se quedaron con su dueño/)).toBeVisible();
  });

  it('links a person with their roles and asks before unlinking', async () => {
    const calls: Call[] = [];
    const unlinked: Call[] = [];
    const { session } = open(
      MUNDO_DETAIL,
      {
        'GET /v1/contacts': () =>
          Response.json(
            page([
              {
                id: 'p2',
                code: 'CON-0002',
                name: 'Sofía Aguilar',
                is_active: true,
                version: 1,
                ...STAMPS,
              },
            ]),
          ),
        [`PUT /v1/clients/${MUNDO.id}/contacts/p2`]: (call) => {
          calls.push(call);
          return Response.json(MUNDO_DETAIL);
        },
        [`DELETE /v1/clients/${MUNDO.id}/contacts/p1`]: (call) => {
          unlinked.push(call);
          return Response.json(MUNDO_DETAIL);
        },
      },
      meWith({ clients: ALL, contacts: ['view'] }, { clients: 'all' }),
    );
    renderApp(session, `/clientes/${MUNDO.id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Vincular' }));
    const dialog = await screen.findByRole('dialog', { name: 'Vincular contacto' });
    const submit = within(dialog).getByRole('button', { name: 'Vincular' });
    expect(submit).toBeDisabled();
    await user.click(within(dialog).getByRole('combobox', { name: /Contacto/ }));
    await user.click(await screen.findByRole('option', { name: 'Sofía Aguilar' }));
    await user.click(await within(dialog).findByRole('checkbox', { name: 'Comercial' }));
    await user.click(submit);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ contact_type_ids: [COMERCIAL.id] });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Acciones de Roberto Mejía' }));
    await user.click(await screen.findByRole('menuitem', { name: /Quitar vínculo/ }));
    const confirm = await screen.findByRole('dialog', { name: 'Quitar vínculo' });
    expect(unlinked).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Quitar vínculo' }));
    await waitFor(() => expect(unlinked).toHaveLength(1));
  });

  it('does not show the contacts section actions without access to contacts', async () => {
    const { session } = open(MUNDO_DETAIL, {}, meWith({ clients: ALL }, { clients: 'all' }));
    renderApp(session, `/clientes/${MUNDO.id}`);

    expect(await screen.findByText('Tu perfil no tiene acceso a los contactos.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Vincular' })).not.toBeInTheDocument();
  });
});

describe('quick create widget', () => {
  const home = (permissions: Record<string, string[]>, calls: Call[] = []) =>
    createTestSession(
      {
        'GET /v1/dashboard': () => Response.json({ data: [{ code: 'quick_create_client' }] }),
        'POST /v1/clients': (call) => {
          calls.push(call);
          return Response.json(SOL_DETAIL, { status: 201 });
        },
      },
      meWith(permissions),
    );

  it('registers a prospect with only its name and links to complete it', async () => {
    const calls: Call[] = [];
    const { session } = home({ clients: ALL }, calls);
    renderApp(session, '/');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Nombre comercial'), ' Restaurante El Sol ');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ name: 'Restaurante El Sol' });
    expect(await screen.findByText(/Se registró «Restaurante El Sol» \(CLI-0001\)/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Completar sus datos' })).toHaveAttribute(
      'href',
      `/clientes/${SOL.id}/editar`,
    );
  });

  it('says so to a profile that cannot create clients', async () => {
    const { session } = home({ clients: ['view'] });
    renderApp(session, '/');

    expect(await screen.findByText('Tu perfil no puede registrar prospectos.')).toBeVisible();
  });
});
