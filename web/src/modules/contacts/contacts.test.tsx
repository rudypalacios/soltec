import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, page, problem, type Call } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const ALL = ['view', 'create', 'edit', 'deactivate'];
const meWith = (
  permissions: Record<string, string[]>,
  scopes: Record<string, string> = { contacts: 'own' },
) => ({ ...ME, permissions, scopes });

const STAMPS = { created_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-01T10:00:00.000Z' };
const OWNER = { id: ME.id, name: ME.name };
const ANA = {
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000f1',
  code: 'CON-0001',
  name: 'Ana López',
  phone: '2222-3333',
  mobile: null,
  email: 'ana@example.com',
  address: '5a avenida 10-20',
  zone: 'Zona 10',
  country: 'Guatemala',
  owner: OWNER,
  is_active: true,
  version: 1,
  ...STAMPS,
};
const BEA = {
  ...ANA,
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000f2',
  code: 'CON-0002',
  name: 'Beatriz Cruz',
  phone: null,
  mobile: '4444-9876',
  email: null,
  address: null,
  zone: null,
  country: null,
};

afterEach(() => vi.unstubAllGlobals());

describe('contacts list', () => {
  it('shows each contact with its code, phone, email and owner', async () => {
    const { session } = createTestSession(
      { 'GET /v1/contacts': () => Response.json(page([ANA, BEA])) },
      meWith({ contacts: ALL }),
    );
    renderApp(session, '/contactos');

    const table = await screen.findByRole('table', { name: 'Lista de contactos' });
    expect(within(table).getByText('Ana López')).toBeVisible();
    expect(within(table).getByText('CON-0001')).toBeVisible();
    expect(within(table).getByText('2222-3333')).toBeVisible();
    expect(within(table).getByText('ana@example.com')).toBeVisible();
    // Without a landline the mobile stands in.
    expect(within(table).getByText('4444-9876')).toBeVisible();
    expect(within(table).getAllByText(ME.name)).toHaveLength(2);
  });

  it('shows cards instead of a table on a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(
      { 'GET /v1/contacts': () => Response.json(page([ANA])) },
      meWith({ contacts: ALL }),
    );
    renderApp(session, '/contactos');

    const cards = await screen.findByLabelText('Lista de contactos');
    expect(within(cards).getByText('Ana López')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers only what the permissions allow', async () => {
    const { session } = createTestSession(
      { 'GET /v1/contacts': () => Response.json(page([ANA])) },
      meWith({ contacts: ['view'] }),
    );
    renderApp(session, '/contactos');

    await screen.findByRole('table', { name: 'Lista de contactos' });
    expect(screen.queryByRole('link', { name: /Nuevo contacto/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument();
  });

  it('searches and filters by status through the API', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/contacts': (call) => {
          calls.push(call);
          return Response.json(page([ANA]));
        },
      },
      meWith({ contacts: ALL }),
    );
    renderApp(session, '/contactos');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Buscar por nombre/), 'ana');

    await waitFor(() => expect(calls.at(-1)?.query.get('q')).toBe('ana'));
    expect(calls.at(-1)?.query.get('status')).toBe('active');
  });

  it('asks before deactivating and reactivates an inactive contact', async () => {
    const calls: Call[] = [];
    const retired = { ...BEA, is_active: false };
    const { session } = createTestSession(
      {
        'GET /v1/contacts': () => Response.json(page([ANA, retired])),
        [`POST /v1/contacts/${ANA.id}/deactivate`]: (call) => {
          calls.push(call);
          return Response.json({ ...ANA, is_active: false });
        },
        [`POST /v1/contacts/${BEA.id}/reactivate`]: (call) => {
          calls.push(call);
          return Response.json({ ...BEA, is_active: true });
        },
      },
      meWith({ contacts: ALL }),
    );
    renderApp(session, '/contactos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Ana López' }));
    await user.click(await screen.findByRole('menuitem', { name: /Desactivar/ }));
    const confirm = await screen.findByRole('dialog', { name: 'Desactivar contacto' });
    expect(calls).toHaveLength(0);
    await user.click(within(confirm).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Acciones de Beatriz Cruz' }));
    await user.click(await screen.findByRole('menuitem', { name: /Reactivar/ }));
    const reactivate = await screen.findByRole('dialog', { name: 'Reactivar contacto' });
    await user.click(within(reactivate).getByRole('button', { name: 'Reactivar' }));
    await waitFor(() => expect(calls).toHaveLength(2));
  });
});

describe('contact form', () => {
  it('creates a contact sending nothing for the empty optional fields', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/contacts': () => Response.json(page([])),
        'POST /v1/contacts': (call) => {
          calls.push(call);
          return Response.json(ANA, { status: 201 });
        },
      },
      meWith({ contacts: ALL }),
    );
    renderApp(session, '/contactos/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Nombre/), '  Ana López ');
    await user.type(screen.getByLabelText('Correo'), 'ana@example.com');
    await user.type(screen.getByLabelText('Zona'), 'Zona 10');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      name: 'Ana López',
      phone: null,
      mobile: null,
      email: 'ana@example.com',
      address: null,
      zone: 'Zona 10',
      country: null,
    });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/contactos$/));
  });

  it('cannot be saved without a name', async () => {
    const { session } = createTestSession({}, meWith({ contacts: ALL }));
    renderApp(session, '/contactos/nuevo');

    expect(await screen.findByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('shows what the API refused next to its field', async () => {
    const { session } = createTestSession(
      {
        'POST /v1/contacts': () =>
          problem(422, 'validation_failed', [{ field: 'email', code: 'invalid' }]),
      },
      meWith({ contacts: ALL }),
    );
    renderApp(session, '/contactos/nuevo');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Nombre/), 'Ana');
    await user.type(screen.getByLabelText('Correo'), 'no-es-correo');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/Escribe un correo válido/)).toBeVisible();
  });

  it('is closed to someone who cannot create', async () => {
    const { session } = createTestSession({}, meWith({ contacts: ['view'] }));
    renderApp(session, '/contactos/nuevo');

    expect(await screen.findByText('No tienes permiso para ver esta pantalla.')).toBeVisible();
  });

  it('edits with the version it read and clears what was emptied', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        [`GET /v1/contacts/${ANA.id}`]: () => Response.json(ANA),
        'GET /v1/contacts': () => Response.json(page([ANA])),
        [`PATCH /v1/contacts/${ANA.id}`]: (call) => {
          calls.push(call);
          return Response.json({ ...ANA, version: 2 });
        },
      },
      meWith({ contacts: ALL }),
    );
    renderApp(session, `/contactos/${ANA.id}/editar`);
    const user = userEvent.setup();

    const name = await screen.findByLabelText(/Nombre/);
    expect(name).toHaveValue('Ana López');
    await user.clear(name);
    await user.type(name, 'Ana M. López');
    await user.clear(screen.getByLabelText('Zona'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      version: 1,
      name: 'Ana M. López',
      phone: '2222-3333',
      mobile: null,
      email: 'ana@example.com',
      address: '5a avenida 10-20',
      zone: null,
      country: 'Guatemala',
    });
  });

  it('only shows the owner to someone whose scope is their own contacts', async () => {
    const { session } = createTestSession(
      { [`GET /v1/contacts/${ANA.id}`]: () => Response.json(ANA) },
      meWith({ contacts: ALL, users: ['view'] }, { contacts: 'own', users: 'all' }),
    );
    renderApp(session, `/contactos/${ANA.id}/editar`);

    const owner = await screen.findByLabelText('Responsable');
    expect(owner).toBeDisabled();
    expect(owner).toHaveValue(ME.name);
  });

  it('lets a wider scope hand the contact to another user', async () => {
    const calls: Call[] = [];
    const bea = { id: '0192f1c2-7d3a-7a11-8f2e-0000000000a2', name: 'Bea Ruiz' };
    const { session } = createTestSession(
      {
        [`GET /v1/contacts/${ANA.id}`]: () => Response.json(ANA),
        'GET /v1/contacts': () => Response.json(page([ANA])),
        'GET /v1/users': () => Response.json(page([bea, OWNER])),
        [`PATCH /v1/contacts/${ANA.id}`]: (call) => {
          calls.push(call);
          return Response.json({ ...ANA, owner: bea, version: 2 });
        },
      },
      meWith({ contacts: ALL, users: ['view'] }, { contacts: 'all', users: 'all' }),
    );
    renderApp(session, `/contactos/${ANA.id}/editar`);
    const user = userEvent.setup();

    const owner = await screen.findByRole('combobox', { name: /Responsable/ });
    expect(owner).toHaveValue(ME.name);
    await user.click(owner);
    await user.click(await screen.findByRole('option', { name: 'Bea Ruiz' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ owner_id: bea.id, version: 1 });
  });

  it('says so when the contact does not exist or is out of reach', async () => {
    const { session } = createTestSession(
      { [`GET /v1/contacts/${ANA.id}`]: () => problem(404, 'not_found') },
      meWith({ contacts: ALL }),
    );
    renderApp(session, `/contactos/${ANA.id}/editar`);

    expect(await screen.findByText('No se encontró el registro.')).toBeVisible();
  });
});
