import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, page, problem, type Call } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const ORG_ME = {
  ...ME,
  permissions: { ...ME.permissions, departments: ['view', 'create', 'edit', 'deactivate'] },
  scopes: { ...ME.scopes, departments: 'all' },
};
const SALES = {
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000d1',
  name: 'Ventas',
  is_active: true,
  active_user_count: 3,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  version: 1,
};
const EMPTY = {
  ...SALES,
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000d2',
  name: 'Bodega',
  active_user_count: 0,
};

afterEach(() => vi.unstubAllGlobals());

describe('departments', () => {
  it('lists departments with their active users in a table on a desktop', async () => {
    const { session } = createTestSession(
      { 'GET /v1/departments': () => Response.json(page([EMPTY, SALES])) },
      ORG_ME,
    );
    renderApp(session, '/departamentos');

    const table = await screen.findByRole('table', { name: 'Lista de departamentos' });
    expect(within(table).getByText('Ventas')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: '3 usuarios activos' })).toHaveAttribute(
      'href',
      `/usuarios?departamento=${SALES.id}`,
    );
    expect(within(table).getByText('0 usuarios activos')).toBeInTheDocument();
  });

  it('shows cards instead of a table on a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(
      { 'GET /v1/departments': () => Response.json(page([SALES])) },
      ORG_ME,
    );
    renderApp(session, '/departamentos');

    const cards = await screen.findByLabelText('Lista de departamentos');
    expect(within(cards).getByText('Ventas')).toBeInTheDocument();
    // The card keeps its main action in sight and the rest behind ⋮.
    expect(within(cards).getByRole('button', { name: 'Renombrar: Ventas' })).toBeInTheDocument();
    expect(within(cards).getByRole('button', { name: 'Acciones de Ventas' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('creates a department and says when the name is taken', async () => {
    const posted: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/departments': () => Response.json(page([SALES])),
        'POST /v1/departments': (call) => {
          posted.push(call);
          return posted.length === 1
            ? problem(422, 'validation_failed', [{ field: 'name', code: 'taken' }])
            : Response.json({ ...EMPTY, name: 'Soporte' }, { status: 201 });
        },
      },
      ORG_ME,
    );
    renderApp(session, '/departamentos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Nuevo departamento' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo departamento' });
    await user.type(within(dialog).getByLabelText(/^Nombre/), 'Ventas');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(
      await within(dialog).findByText('Ya hay un departamento activo con ese nombre.'),
    ).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText(/^Nombre/));
    await user.type(within(dialog).getByLabelText(/^Nombre/), '  Soporte ');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(posted[1]?.body).toEqual({ name: 'Soporte' });
  });

  it('renames with the version it read', async () => {
    let patched: Call | undefined;
    const { session } = createTestSession(
      {
        'GET /v1/departments': () => Response.json(page([SALES])),
        [`PATCH /v1/departments/${SALES.id}`]: (call) => {
          patched = call;
          return Response.json({ ...SALES, name: 'Comercial', version: 2 });
        },
      },
      ORG_ME,
    );
    renderApp(session, '/departamentos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Ventas' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Renombrar' }));
    const name = within(await screen.findByRole('dialog')).getByLabelText(/^Nombre/);
    expect(name).toHaveValue('Ventas');
    await user.clear(name);
    await user.type(name, 'Comercial');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(patched?.body).toEqual({ name: 'Comercial', version: 1 }));
  });

  it('says why a department with active users cannot be deactivated and links to them', async () => {
    const { session } = createTestSession(
      {
        'GET /v1/departments': () => Response.json(page([SALES])),
        [`POST /v1/departments/${SALES.id}/deactivate`]: () =>
          Response.json(
            {
              type: 'about:blank',
              title: 'Conflict',
              status: 409,
              code: 'department_in_use',
              active_user_count: 3,
            },
            { status: 409 },
          ),
      },
      ORG_ME,
    );
    renderApp(session, '/departamentos');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Acciones de Ventas' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Desactivar' }));
    await user.click(await screen.findByRole('button', { name: 'Desactivar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'No se puede desactivar «Ventas»: tiene 3 usuarios activos. Asígnalos a otro departamento primero.',
    );
    expect(within(alert).getByRole('link', { name: 'Ver sus usuarios' })).toHaveAttribute(
      'href',
      `/usuarios?departamento=${SALES.id}`,
    );
  });

  it('hides the actions the person may not take', async () => {
    const reader = {
      ...ME,
      permissions: { ...ME.permissions, departments: ['view'] },
      scopes: ME.scopes,
    };
    const { session } = createTestSession(
      { 'GET /v1/departments': () => Response.json(page([SALES])) },
      reader,
    );
    renderApp(session, '/departamentos');

    await screen.findByRole('table', { name: 'Lista de departamentos' });
    expect(screen.queryByRole('button', { name: 'Nuevo departamento' })).not.toBeInTheDocument();
    // Without edit or deactivate permission the row has no actions, so there is no menu either.
    expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument();
  });
});
