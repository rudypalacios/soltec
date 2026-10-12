import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, problem, type Call } from '../../test/fakeApi';
import { renderApp, setViewportWidth } from '../../test/render';

const READER = {
  ...ME,
  permissions: { ...ME.permissions, audit_logs: ['view'] },
  scopes: { ...ME.scopes, audit_logs: 'all' },
};

const ENTRY = {
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000e1',
  occurred_at: '2026-10-09T18:30:00.000Z',
  user: { id: ME.id, name: 'Ana Pérez' },
  device_id: null,
  action: 'update',
  entity_type: 'roles',
  entity_id: '0192f1c2-7d3a-7a11-8f2e-0000000000b1',
  entity_label: 'Comercial',
  entity_label_is_current: false,
  before: { name: 'Ventas', description: null },
  after: { name: 'Comercial', description: 'Equipo comercial' },
  ip_address: '203.0.113.9',
};
const LOCKOUT = {
  ...ENTRY,
  id: '0192f1c2-7d3a-7a11-8f2e-0000000000e2',
  occurred_at: '2026-10-09T18:00:00.000Z',
  user: null,
  action: 'lockout',
  entity_type: 'users',
  entity_id: '0192f1c2-7d3a-7a11-8f2e-0000000000c1',
  entity_label: 'Luis Gómez',
  entity_label_is_current: false,
  before: null,
  after: null,
  ip_address: null,
};

const log = (data: object[], next: string | null = null) => ({
  'GET /v1/audit-logs': () => Response.json({ data, meta: { limit: 50, next_cursor: next } }),
});

afterEach(() => vi.unstubAllGlobals());

describe('audit screen', () => {
  it('lists what happened with the words the person reads, not the codes', async () => {
    const { session } = createTestSession(log([ENTRY, LOCKOUT]), READER);
    renderApp(session, '/auditoria');

    const table = await screen.findByRole('table', { name: 'Movimientos registrados' });
    expect(within(table).getByText('Cambio')).toBeInTheDocument();
    expect(within(table).getByText('Bloqueo de cuenta')).toBeInTheDocument();
    expect(within(table).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(table).getByText('Sistema o sin sesión')).toBeInTheDocument();
    expect(within(table).getByText('Perfiles')).toBeInTheDocument();
  });

  it('shows cards on a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(log([ENTRY]), READER);
    renderApp(session, '/auditoria');

    const cards = await screen.findByLabelText('Movimientos registrados');
    expect(within(cards).getByText('Cambio')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('opens the detail with what changed, before and after', async () => {
    const { session } = createTestSession(log([ENTRY]), READER);
    renderApp(session, '/auditoria');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Acciones de Cambio/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ver detalle' }));

    const dialog = await screen.findByRole('dialog');
    const changes = within(dialog).getByRole('table', { name: 'Cambios' });
    expect(within(changes).getByText('name')).toBeInTheDocument();
    expect(within(changes).getByText('Ventas')).toBeInTheDocument();
    expect(within(changes).getByText('Comercial')).toBeInTheDocument();
    expect(within(changes).getByText('Equipo comercial')).toBeInTheDocument();
    expect(within(dialog).getByText(/203\.0\.113\.9/)).toBeInTheDocument();
  });

  it('says so when an entry changed no data', async () => {
    const { session } = createTestSession(log([LOCKOUT]), READER);
    renderApp(session, '/auditoria');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Acciones de Bloqueo de cuenta/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ver detalle' }));

    expect(await screen.findByText('Este movimiento no cambió datos.')).toBeInTheDocument();
  });

  it('loads the older entries with the cursor and adds them to the list', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/audit-logs': (call) => {
          calls.push(call);
          return call.query.get('cursor') === 'next-1'
            ? Response.json({ data: [LOCKOUT], meta: { limit: 50, next_cursor: null } })
            : Response.json({ data: [ENTRY], meta: { limit: 50, next_cursor: 'next-1' } });
        },
      },
      READER,
    );
    renderApp(session, '/auditoria');
    const user = userEvent.setup();

    await screen.findByText('Cambio');
    await user.click(screen.getByRole('button', { name: 'Ver movimientos anteriores' }));

    expect(await screen.findByText('Bloqueo de cuenta')).toBeInTheDocument();
    expect(screen.getByText('Cambio')).toBeInTheDocument();
    expect(calls[1]?.query.get('cursor')).toBe('next-1');
    // On the last page there is nothing more to ask for.
    expect(
      screen.queryByRole('button', { name: 'Ver movimientos anteriores' }),
    ).not.toBeInTheDocument();
  });

  it('sends the filters the person chose', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/audit-logs': (call) => {
          calls.push(call);
          return Response.json({ data: [], meta: { limit: 50, next_cursor: null } });
        },
      },
      READER,
    );
    renderApp(session, '/auditoria');
    const user = userEvent.setup();

    await screen.findByText(/No hay movimientos/);
    await user.click(screen.getByLabelText('Sobre'));
    await user.click(await screen.findByRole('option', { name: 'Usuarios' }));
    await user.click(screen.getByLabelText('Qué pasó'));
    await user.click(await screen.findByRole('option', { name: 'Desbloqueo de cuenta' }));
    await user.type(screen.getByLabelText('Desde'), '2026-10-01');
    await user.type(screen.getByLabelText('Hasta'), '2026-10-09');

    await waitFor(() => {
      const last = calls[calls.length - 1];
      expect(last?.query.get('entity_type')).toBe('users');
      expect(last?.query.get('action')).toBe('unlock');
      expect(last?.query.get('from')).toMatch(/^2026-10-0[01]T\d{2}:00:00\.000Z$/);
      // The end of the day: 23:59:59.999 where the person is.
      expect(last?.query.get('to')).toMatch(/^2026-10-(09|10)T\d{2}:59:59\.999Z$/);
    });
  });

  it('does not ask the server for a range that ends before it starts', async () => {
    const { session, calls } = createTestSession(log([ENTRY]), READER);
    renderApp(session, '/auditoria?desde=2026-10-09&hasta=2026-10-01');

    expect(await screen.findByText(/no puede ser posterior a «Hasta»/)).toBeInTheDocument();
    expect(calls.some((call) => call.path === '/v1/audit-logs')).toBe(false);
  });

  it('shows the history of one record from the address, and lets the person leave it', async () => {
    const calls: Call[] = [];
    const { session } = createTestSession(
      {
        'GET /v1/audit-logs': (call) => {
          calls.push(call);
          return Response.json({ data: [ENTRY], meta: { limit: 50, next_cursor: null } });
        },
      },
      READER,
    );
    renderApp(session, `/auditoria?tipo=users&registro=${ENTRY.entity_id}`);
    const user = userEvent.setup();

    expect(
      await screen.findByText('Solo se muestran los movimientos de un registro.'),
    ).toBeInTheDocument();
    expect(calls[0]?.query.get('entity_id')).toBe(ENTRY.entity_id);
    expect(calls[0]?.query.get('entity_type')).toBe('users');

    await user.click(screen.getByRole('button', { name: 'Ver todo' }));

    await waitFor(() => {
      expect(
        screen.queryByText('Solo se muestran los movimientos de un registro.'),
      ).not.toBeInTheDocument();
      expect(calls[calls.length - 1]?.query.has('entity_id')).toBe(false);
    });
  });

  it('explains when the log cannot be read', async () => {
    const { session } = createTestSession(
      { 'GET /v1/audit-logs': () => problem(403, 'forbidden') },
      READER,
    );
    renderApp(session, '/auditoria');

    expect(await screen.findByText('No tienes permiso para hacer esto.')).toBeInTheDocument();
  });

  it('is closed to whoever may not view it, and absent from the menu', async () => {
    const { session } = createTestSession({}, ME);
    renderApp(session, '/auditoria');

    expect(
      await screen.findByText('No tienes permiso para ver esta pantalla.'),
    ).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(navigation).queryByText('Auditoría')).not.toBeInTheDocument();
  });

  it('is in the menu for whoever may view it', async () => {
    const { session } = createTestSession(log([]), READER);
    renderApp(session, '/');

    const navigation = await screen.findByRole('navigation', { name: 'Navegación principal' });
    expect(within(navigation).getByText('Auditoría')).toBeInTheDocument();
  });
});

describe('record of an entry', () => {
  const SETTINGS = {
    ...ENTRY,
    id: '0192f1c2-7d3a-7a11-8f2e-0000000000e3',
    entity_type: 'security_settings',
    entity_id: null,
    entity_label: null,
  };
  const OLD = {
    ...ENTRY,
    id: '0192f1c2-7d3a-7a11-8f2e-0000000000e4',
    entity_type: 'departments',
    entity_label: 'Operaciones',
    entity_label_is_current: true,
  };
  const withRoleAndUserAccess = {
    ...READER,
    permissions: { ...READER.permissions, roles: ['view'], users: ['view', 'edit'] },
  };

  it('shows the name of the record and links it to its screen when there is one', async () => {
    const { session } = createTestSession(log([ENTRY, LOCKOUT, OLD]), withRoleAndUserAccess);
    renderApp(session, '/auditoria');

    const table = await screen.findByRole('table', { name: 'Movimientos registrados' });
    expect(within(table).getByRole('link', { name: 'Comercial' })).toHaveAttribute(
      'href',
      `/perfiles/${ENTRY.entity_id}`,
    );
    expect(within(table).getByRole('link', { name: 'Luis Gómez' })).toHaveAttribute(
      'href',
      `/usuarios/${LOCKOUT.entity_id}/editar`,
    );
    // Departments have no screen of their own: the name is plain text.
    expect(within(table).getByText('Operaciones')).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: 'Operaciones' })).not.toBeInTheDocument();
  });

  it('shows the name without a link to whoever may not open that screen', async () => {
    const onlyAudit = {
      ...ME,
      permissions: { audit_logs: ['view'] },
      scopes: { audit_logs: 'all' },
    };
    const { session } = createTestSession(log([ENTRY]), onlyAudit);
    renderApp(session, '/auditoria');

    const table = await screen.findByRole('table', { name: 'Movimientos registrados' });
    expect(within(table).getByText('Comercial')).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: 'Comercial' })).not.toBeInTheDocument();
  });

  it("marks a name that is today's and not the one of the moment", async () => {
    const { session } = createTestSession(log([OLD, ENTRY]), READER);
    renderApp(session, '/auditoria');

    const table = await screen.findByRole('table', { name: 'Movimientos registrados' });
    expect(within(table).getAllByText('nombre actual')).toHaveLength(1);
  });

  it('shows a dash when the record has no name of its own', async () => {
    const { session } = createTestSession(log([SETTINGS]), READER);
    renderApp(session, '/auditoria');

    const table = await screen.findByRole('table', { name: 'Movimientos registrados' });
    expect(within(table).getByText('—')).toBeInTheDocument();
  });

  it('shows it on the card of a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(log([ENTRY]), READER);
    renderApp(session, '/auditoria');

    const cards = await screen.findByLabelText('Movimientos registrados');
    expect(within(cards).getByText(/Registro:/)).toBeInTheDocument();
    expect(within(cards).getByText('Comercial')).toBeInTheDocument();
  });

  it('names the record in the detail with a way to its screen and its history', async () => {
    const { session } = createTestSession(log([ENTRY]), withRoleAndUserAccess);
    renderApp(session, '/auditoria');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Acciones de Cambio/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ver detalle' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Perfil «Comercial»/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Ver el perfil' })).toHaveAttribute(
      'href',
      `/perfiles/${ENTRY.entity_id}`,
    );
    expect(within(dialog).getByRole('link', { name: 'Ver su historial' })).toHaveAttribute(
      'href',
      `/auditoria?tipo=roles&registro=${ENTRY.entity_id}`,
    );
  });

  it('has no record line in the detail when the entry is about no record', async () => {
    const { session } = createTestSession(log([SETTINGS]), READER);
    renderApp(session, '/auditoria');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Acciones de Cambio/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ver detalle' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/Registro:/)).not.toBeInTheDocument();
  });
});
