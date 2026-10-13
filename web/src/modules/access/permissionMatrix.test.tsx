import { ThemeProvider } from '@mui/material';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MatrixValue } from '@soltec/shared';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setViewportWidth } from '../../test/render';
import { theme } from '../../theme/theme';
import { PermissionMatrix, type MatrixAction, type MatrixResource } from './PermissionMatrix';

const ACTIONS: MatrixAction[] = [
  { code: 'view', name: 'Ver' },
  { code: 'create', name: 'Crear' },
  { code: 'edit', name: 'Editar' },
  { code: 'deactivate', name: 'Desactivar' },
];
const RESOURCES: MatrixResource[] = [
  { code: 'audit_logs', name: 'Auditoría', scoped: true },
  { code: 'company', name: 'Empresa', scoped: false },
  { code: 'departments', name: 'Departamentos', scoped: false },
  { code: 'payroll', name: 'Nómina', scoped: false },
  { code: 'roles', name: 'Perfiles', scoped: false },
  { code: 'users', name: 'Usuarios', scoped: true },
];
const EMPTY: MatrixValue = { permissions: {}, scopes: {} };

/** Holds the value the way the form does, and shows it so a test can say what the form would send. */
function Harness({
  initial = EMPTY,
  disabled = false,
  resources = RESOURCES,
}: {
  initial?: MatrixValue;
  disabled?: boolean;
  resources?: MatrixResource[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <ThemeProvider theme={theme}>
      <PermissionMatrix
        resources={resources}
        actions={ACTIONS}
        value={value}
        onChange={setValue}
        disabled={disabled}
      />
      <div data-testid="value">{JSON.stringify(value.permissions)}</div>
    </ThemeProvider>
  );
}

const granted = () =>
  JSON.parse(screen.getByTestId('value').textContent ?? '{}') as Record<string, string[]>;
const box = (name: string) => screen.getByRole('checkbox', { name });

afterEach(() => vi.unstubAllGlobals());

describe('sections', () => {
  it('groups the modules by section and counts the ones the role reaches', () => {
    render(
      <Harness initial={{ permissions: { users: ['view'], departments: ['view'] }, scopes: {} }} />,
    );

    expect(screen.getByRole('table', { name: 'Permisos de Acceso' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Permisos de Organización' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Permisos de Configuración' })).toBeInTheDocument();
    // «1/3»: short on screen, the whole sentence for a screen reader.
    expect(screen.getByText('1 de 3 módulos con acceso')).toBeInTheDocument();
    expect(screen.getByText('1 de 1 módulos con acceso')).toBeInTheDocument();
    // Configuración (Empresa) and Otros (Nómina) have one module each and the role reaches neither.
    expect(screen.getAllByText('0 de 1 módulos con acceso')).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('2 de 6 módulos con acceso');
  });

  it('puts a module nobody listed under «Otros»', () => {
    render(<Harness />);

    const others = screen.getByRole('table', { name: 'Permisos de Otros' });
    expect(within(others).getByText('Nómina')).toBeInTheDocument();
  });

  it('folds a section and opens it again', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Contraer Acceso' }));
    expect(screen.queryByRole('table', { name: 'Permisos de Acceso' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expandir Acceso' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'Expandir Acceso' }));
    expect(screen.getByRole('table', { name: 'Permisos de Acceso' })).toBeInTheDocument();
  });

  it('folds and unfolds every section at once', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Contraer todo' }));
    expect(screen.queryAllByRole('table')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Expandir todo' }));
    expect(screen.getAllByRole('table')).toHaveLength(4);
  });
});

describe('filtering', () => {
  it('finds a module by name without caring for case or accents, and opens a folded section', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Contraer todo' }));

    await user.type(screen.getByLabelText('Filtrar módulos'), 'AUDITORIA');

    const table = screen.getByRole('table', { name: 'Permisos de Acceso' });
    expect(within(table).getByText('Auditoría')).toBeInTheDocument();
    expect(within(table).queryByText('Usuarios')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'Permisos de Organización' }),
    ).not.toBeInTheDocument();
  });

  it('shows only the modules with access on request', async () => {
    render(<Harness initial={{ permissions: { departments: ['view'] }, scopes: {} }} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('checkbox', { name: 'Solo con acceso' }));

    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(screen.getByText('Departamentos')).toBeInTheDocument();
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    render(<Harness />);

    await userEvent.setup().type(screen.getByLabelText('Filtrar módulos'), 'zzz');

    expect(screen.getByText('Ningún módulo coincide con el filtro.')).toBeInTheDocument();
    expect(screen.queryAllByRole('table')).toHaveLength(0);
  });
});

describe('actions', () => {
  it('switches view on with any other action', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(box('Editar Usuarios'));

    expect(box('Ver Usuarios')).toBeChecked();
    expect(box('Editar Usuarios')).toBeChecked();
    expect(granted()).toEqual({ users: ['view', 'edit'] });
  });

  it('switches the other actions off with view', async () => {
    render(
      <Harness
        initial={{ permissions: { users: ['view', 'create', 'edit'] }, scopes: { users: 'team' } }}
      />,
    );

    await userEvent.setup().click(box('Ver Usuarios'));

    expect(box('Crear Usuarios')).not.toBeChecked();
    expect(box('Editar Usuarios')).not.toBeChecked();
    expect(granted().users).toEqual([]);
  });

  it('switches every action of a module with the checkbox of its row', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(box('Todo en Empresa'));
    expect(granted().company).toEqual(['view', 'create', 'edit', 'deactivate']);

    await user.click(box('Todo en Empresa'));
    expect(granted().company).toEqual([]);
  });

  it('switches one action of the whole section with the checkbox of its column', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(box('Editar en toda la sección Acceso'));

    expect(granted()).toEqual({
      audit_logs: ['view', 'edit'],
      roles: ['view', 'edit'],
      users: ['view', 'edit'],
    });
  });

  it('switches a whole section with its checkbox, and shows a half-done one as mixed', async () => {
    render(<Harness initial={{ permissions: { users: ['view'] }, scopes: {} }} />);
    const user = userEvent.setup();
    expect(box('Todo en Acceso')).toBePartiallyChecked();
    expect(box('Todo en Usuarios')).toBePartiallyChecked();

    await user.click(box('Todo en Acceso'));
    expect(box('Todo en Acceso')).toBeChecked();
    expect(granted().roles).toEqual(['view', 'create', 'edit', 'deactivate']);

    await user.click(box('Todo en Acceso'));
    expect(box('Todo en Acceso')).not.toBeChecked();
    expect(granted().users).toEqual([]);
  });

  it('acts only on the modules the filter shows', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Filtrar módulos'), 'usuarios');
    await user.click(box('Todo en Acceso'));

    expect(granted()).toEqual({ users: ['view', 'create', 'edit', 'deactivate'] });
  });

  it('does not let a read-only profile change, but still folds and filters', async () => {
    render(
      <Harness disabled initial={{ permissions: { users: ['view'] }, scopes: { users: 'all' } }} />,
    );
    const user = userEvent.setup();

    expect(box('Ver Usuarios')).toBeDisabled();
    expect(box('Todo en Acceso')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Alcance de Usuarios' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Contraer Acceso' }));
    expect(screen.queryByRole('table', { name: 'Permisos de Acceso' })).not.toBeInTheDocument();
  });
});

describe('data scope', () => {
  it('is offered only for the modules whose rows have an owner', () => {
    render(<Harness />);

    expect(screen.getByRole('combobox', { name: 'Alcance de Usuarios' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Alcance de Auditoría' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Alcance de Empresa' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('cannot be chosen until the module has some access', async () => {
    render(<Harness />);
    expect(screen.getByRole('combobox', { name: 'Alcance de Usuarios' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await userEvent.setup().click(box('Ver Usuarios'));

    expect(screen.getByRole('combobox', { name: 'Alcance de Usuarios' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('has no column heading in a section where no module has one', () => {
    render(<Harness />);

    const organization = screen.getByRole('table', { name: 'Permisos de Organización' });
    expect(within(organization).queryByText('Alcance de los datos')).not.toBeInTheDocument();
    const access = screen.getByRole('table', { name: 'Permisos de Acceso' });
    expect(within(access).getByText('Alcance de los datos')).toBeInTheDocument();
  });
});

describe('on a phone', () => {
  it('is one table with a band per section, with the count and an all/none button', async () => {
    setViewportWidth(390);
    render(<Harness initial={{ permissions: { departments: ['view'] }, scopes: {} }} />);
    const user = userEvent.setup();

    const table = screen.getByRole('table', { name: 'Permisos del perfil' });
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(within(table).getAllByRole('rowgroup').length).toBeGreaterThan(3);
    expect(within(table).getByText('1 de 1 módulos con acceso')).toBeInTheDocument();
    // «Desactivar» does not fit a 44 px column: shortened on screen, whole for a screen reader.
    expect(within(table).getByText('Desactivar')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Marcar todo en Configuración' }));
    expect(granted().company).toEqual(['view', 'create', 'edit', 'deactivate']);
    await user.click(screen.getByRole('button', { name: 'Quitar todo en Configuración' }));
    expect(granted().company).toEqual([]);
  });

  it('shows the scope below a module only once the module has access', async () => {
    setViewportWidth(390);
    render(<Harness />);
    const user = userEvent.setup();
    expect(screen.queryByRole('combobox', { name: 'Alcance de Usuarios' })).not.toBeInTheDocument();

    await user.click(box('Ver Usuarios'));

    expect(screen.getByRole('combobox', { name: 'Alcance de Usuarios' })).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Alcance de Auditoría' }),
    ).not.toBeInTheDocument();
  });

  it('applies the same rule: view goes with any other action', async () => {
    setViewportWidth(390);
    render(<Harness />);

    await userEvent.setup().click(box('Desactivar Empresa'));

    expect(granted().company).toEqual(['view', 'deactivate']);
  });

  it('folds a section from its band', async () => {
    setViewportWidth(390);
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Acceso' }));

    expect(screen.queryByRole('rowheader', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Empresa' })).toBeInTheDocument();
  });

  it('has no desktop-only controls', () => {
    setViewportWidth(390);
    render(<Harness />);

    expect(screen.queryByRole('button', { name: 'Contraer todo' })).not.toBeInTheDocument();
  });
});
