import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSession, ME, page } from '../test/fakeApi';
import { renderApp, setViewportWidth } from '../test/render';

const meWith = (permissions: Record<string, string[]>) => ({ ...ME, permissions, scopes: {} });
const STAFF = meWith({
  clients: ['view'],
  contacts: ['view'],
  users: ['view'],
  workflow_states: ['view'],
});
const lists = { 'GET /v1/clients': () => Response.json(page([])) };

afterEach(() => {
  vi.unstubAllGlobals();
  // The menu remembers what each person folded in this browser: no test may leave it for the next.
  window.localStorage.clear();
});

const menu = () => screen.getByRole('navigation', { name: 'Navegación principal' });
const groupButton = (name: string) => within(menu()).getByRole('button', { name });

describe('the grouped menu', () => {
  it('draws the groups the person may use, each with its screens and their icons', async () => {
    const { session } = createTestSession(lists, STAFF);
    renderApp(session, '/');

    await screen.findByRole('navigation', { name: 'Navegación principal' });
    const groups = within(menu())
      .getAllByRole('button', { name: /^(Trabajo|Comercial|Catálogo|Administración)$/ })
      .map((button) => button.textContent);
    // Catálogo has nothing the person may open, so it is not drawn.
    expect(groups).toEqual(['Trabajo', 'Comercial', 'Administración']);
    const commercial = within(menu()).getByRole('list', { name: 'Comercial' });
    expect(
      within(commercial)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Clientes', 'Contactos']);
    // Every screen keeps its icon.
    expect(
      within(commercial).getByRole('link', { name: 'Clientes' }).querySelector('svg'),
    ).not.toBeNull();
    expect(
      within(menu()).getByRole('link', { name: 'Inicio' }).querySelector('svg'),
    ).not.toBeNull();
  });

  it('keeps the group of the current screen open and marks the screen', async () => {
    const { session } = createTestSession(lists, STAFF);
    renderApp(session, '/clientes');
    const user = userEvent.setup();

    await screen.findByRole('link', { name: 'Clientes' });
    expect(within(menu()).getByRole('link', { name: 'Clientes' })).toHaveClass('active');
    // It cannot be folded: the person would lose sight of where they are.
    await user.click(groupButton('Comercial'));
    expect(groupButton('Comercial')).toHaveAttribute('aria-expanded', 'true');
    expect(within(menu()).getByRole('link', { name: 'Clientes' })).toBeVisible();
  });

  it('folds a group and remembers it for that person, in that browser', async () => {
    const { session } = createTestSession(lists, STAFF);
    const first = renderApp(session, '/');
    const user = userEvent.setup();

    await screen.findByRole('navigation', { name: 'Navegación principal' });
    await user.click(groupButton('Administración'));
    expect(groupButton('Administración')).toHaveAttribute('aria-expanded', 'false');
    expect(within(menu()).queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(`soltec.nav.closed.${ME.id}`)).toBe('["admin"]');

    first.unmount();
    const again = createTestSession(lists, STAFF);
    renderApp(again.session, '/');
    await screen.findByRole('navigation', { name: 'Navegación principal' });
    expect(groupButton('Administración')).toHaveAttribute('aria-expanded', 'false');
    expect(groupButton('Comercial')).toHaveAttribute('aria-expanded', 'true');

    await user.click(groupButton('Administración'));
    expect(within(menu()).getByRole('link', { name: 'Usuarios' })).toBeVisible();
    expect(window.localStorage.getItem(`soltec.nav.closed.${ME.id}`)).toBe('[]');
  });

  it('starts with every group open when the browser refuses to remember anything', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { session } = createTestSession(lists, STAFF);
    renderApp(session, '/');
    const user = userEvent.setup();

    await screen.findByRole('navigation', { name: 'Navegación principal' });
    expect(groupButton('Administración')).toHaveAttribute('aria-expanded', 'true');
    await user.click(groupButton('Administración'));
    expect(groupButton('Administración')).toHaveAttribute('aria-expanded', 'false');
    vi.restoreAllMocks();
  });

  it('says where the person is in the top bar: group and screen on a desktop, the screen on a phone', async () => {
    const { session } = createTestSession(lists, STAFF);
    renderApp(session, '/clientes');
    expect(await screen.findByLabelText('Ruta')).toHaveTextContent('Comercial › Clientes');
  });

  it('shows the name of the screen in place of the brand on a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(lists, STAFF);
    renderApp(session, '/clientes');
    expect(await screen.findByLabelText('Ruta')).toHaveTextContent(/^Clientes$/);
  });

  it('opens a drawer with the same groups on a phone', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(lists, STAFF);
    renderApp(session, '/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Abrir el menú' }));
    expect(await screen.findByRole('button', { name: 'Administración' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Usuarios' })).toBeVisible();
  });
});

describe('searching for a screen', () => {
  it('opens with Ctrl+K, finds a section inside a screen and goes there with the keyboard', async () => {
    const { session } = createTestSession(
      {
        ...lists,
        'GET /v1/workflows/task/states': () => Response.json({ data: [] }),
        'GET /v1/workflows/task/board-columns': () => Response.json({ data: [] }),
      },
      STAFF,
    );
    renderApp(session, '/');
    const user = userEvent.setup();

    await screen.findByRole('navigation', { name: 'Navegación principal' });
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Buscar pantalla' });
    const box = within(dialog).getByRole('combobox', { name: 'Buscar pantalla' });
    expect(box).toHaveFocus();
    // With nothing typed, the screens of the menu.
    expect(
      within(within(dialog).getByRole('listbox')).getAllByRole('option').length,
    ).toBeGreaterThan(3);

    await user.type(box, 'flujos');
    const option = within(dialog).getByRole('option', { name: /Flujos de estado/ });
    expect(option).toHaveTextContent('Configuración › Flujos de estado');
    expect(option).toHaveTextContent('Administración');
    expect(option).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Buscar pantalla' })).not.toBeInTheDocument(),
    );
    expect(window.location.pathname).toBe('/');
    expect(await screen.findByRole('tab', { name: 'Tareas' })).toBeVisible();
  });

  it('moves with the arrows and closes with Escape', async () => {
    const { session } = createTestSession(lists, STAFF);
    renderApp(session, '/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Buscar pantalla' }));
    const dialog = await screen.findByRole('dialog', { name: 'Buscar pantalla' });
    const options = () => within(dialog).getAllByRole('option');
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(options().at(-1)).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Buscar pantalla' })).not.toBeInTheDocument(),
    );
  });

  it('offers only what the person may open, and says when nothing matches', async () => {
    const { session } = createTestSession(lists, meWith({ clients: ['view'] }));
    renderApp(session, '/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Buscar pantalla' }));
    const dialog = await screen.findByRole('dialog', { name: 'Buscar pantalla' });
    const box = within(dialog).getByRole('combobox', { name: 'Buscar pantalla' });
    await user.type(box, 'usuarios');
    expect(within(dialog).getByText('No hay ninguna pantalla con ese nombre.')).toBeVisible();
    await user.clear(box);
    await user.type(box, 'clien');
    // The typed part is marked, so the name arrives in pieces: compare the text, not the accessible name.
    expect(within(dialog).getByRole('option')).toHaveTextContent('ClientesComercial');
  });

  it('closes the drawer of a phone when the search opens', async () => {
    setViewportWidth(390);
    const { session } = createTestSession(lists, STAFF);
    renderApp(session, '/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Abrir el menú' }));
    await user.click(await screen.findByRole('button', { name: 'Buscar pantalla' }));

    expect(await screen.findByRole('dialog', { name: 'Buscar pantalla' })).toBeVisible();
  });
});
