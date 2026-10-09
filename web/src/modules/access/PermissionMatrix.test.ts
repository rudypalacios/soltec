import { describe, expect, it } from 'vitest';
import { setScope, toggleAction, toPayload, type MatrixValue } from './PermissionMatrix';

const EMPTY: MatrixValue = { permissions: {}, scopes: {} };

describe('permission matrix', () => {
  it('switches an action on without touching the rest', () => {
    const value = toggleAction(
      { permissions: { roles: ['view'] }, scopes: {} },
      'users',
      'view',
      true,
    );

    expect(value.permissions).toEqual({ roles: ['view'], users: ['view'] });
  });

  it('does not repeat an action switched on twice', () => {
    const once = toggleAction(EMPTY, 'users', 'view', true);

    expect(toggleAction(once, 'users', 'view', true).permissions.users).toEqual(['view']);
  });

  it('switches an action off', () => {
    const value = toggleAction(
      { permissions: { users: ['view', 'edit'] }, scopes: {} },
      'users',
      'view',
      false,
    );

    expect(value.permissions.users).toEqual(['edit']);
  });

  it('never mutates the value it was given', () => {
    const original: MatrixValue = { permissions: { users: ['view'] }, scopes: { users: 'own' } };
    toggleAction(original, 'users', 'edit', true);
    setScope(original, 'users', 'all');

    expect(original).toEqual({ permissions: { users: ['view'] }, scopes: { users: 'own' } });
  });

  it('sends only the resources with an action, each with its scope (own by default)', () => {
    const payload = toPayload({
      permissions: { users: ['view'], roles: [], payroll: ['view', 'edit'] },
      scopes: { users: 'all', roles: 'all' },
    });

    expect(payload).toEqual({
      permissions: { users: ['view'], payroll: ['view', 'edit'] },
      scopes: { users: 'all', payroll: 'own' },
    });
  });

  it('sends nothing for an empty matrix', () => {
    expect(toPayload(EMPTY)).toEqual({ permissions: {}, scopes: {} });
  });
});
