import { ADMIN } from '../support/env.ts';
import { expect, test } from '../fixtures.ts';
import { signIn } from '../flujos/signIn.ts';
import { RoleFormPage } from '../paginas/RoleFormPage.ts';
import { uniqueSuffix } from '../support/api.ts';

test(
  'a profile built with the matrix is saved as it was chosen and reopens the same',
  { tag: '@mobile' },
  async ({ page, admin }) => {
    const name = `E2E perfil ${uniqueSuffix()}`;
    await signIn(page, ADMIN.email, ADMIN.password);
    const form = new RoleFormPage(page);
    const { matrix } = form;
    await form.openNew();
    await form.name.fill(name);

    // A scope is only for modules whose rows have an owner, and only once the module has some access.
    await expect(matrix.usableScope('Usuarios')).toHaveCount(0);
    await expect(matrix.usableScope('Departamentos')).toHaveCount(0);

    // Every action goes with «Ver».
    await matrix.action('Editar', 'Departamentos').check();
    await expect(matrix.action('Ver', 'Departamentos')).toBeChecked();
    await matrix.action('Crear', 'Empresa').check();
    await expect(matrix.action('Ver', 'Empresa')).toBeChecked();
    await matrix.action('Ver', 'Empresa').uncheck();
    await expect(matrix.action('Crear', 'Empresa')).not.toBeChecked();

    await matrix.action('Ver', 'Usuarios').check();
    await expect(matrix.usableScope('Usuarios')).toHaveCount(1);
    await matrix.chooseScope('Usuarios', 'Su equipo');
    // A module without owned data never gets one.
    await expect(matrix.usableScope('Departamentos')).toHaveCount(0);

    // «Solo con acceso» leaves what the profile reaches: Perfiles and Empresa are gone.
    await matrix.onlyWithAccess.check();
    await expect(matrix.module('Usuarios')).toBeVisible();
    await expect(matrix.module('Departamentos')).toBeVisible();
    await expect(matrix.module('Perfiles')).toHaveCount(0);
    await expect(matrix.module('Empresa')).toHaveCount(0);

    await form.save.click();
    await expect(page.getByText('Perfil guardado.')).toBeVisible();

    // The server holds exactly that: the permissions sorted, one scope and none for the module without owner.
    const saved = await admin.roleNamed(name);
    expect(saved.permissions).toEqual({ departments: ['edit', 'view'], users: ['view'] });
    expect(saved.scopes).toEqual({ users: 'team' });

    // Reopening shows the same.
    await form.open(saved.id);
    await expect(form.name).toHaveValue(name);
    await expect(matrix.action('Editar', 'Departamentos')).toBeChecked();
    await expect(matrix.action('Ver', 'Usuarios')).toBeChecked();
    await expect(matrix.action('Crear', 'Usuarios')).not.toBeChecked();
    await expect(matrix.usableScope('Usuarios')).toContainText('Su equipo');
  },
);
