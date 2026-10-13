import { describe, expect, it } from 'vitest';
import {
  checkState,
  countWithAccess,
  hasAccess,
  matrixOfRole,
  setActions,
  setScope,
  toPayload,
  type MatrixValue,
} from './permissionMatrix';

const EMPTY: MatrixValue = { permissions: {}, scopes: {} };

describe('setActions', () => {
  it('switches an action on without touching the rest', () => {
    const value = setActions(
      { permissions: { roles: ['view'] }, scopes: {} },
      ['users'],
      ['view'],
      true,
    );

    expect(value.permissions).toEqual({ roles: ['view'], users: ['view'] });
  });

  it('does not repeat an action switched on twice', () => {
    const once = setActions(EMPTY, ['users'], ['view'], true);

    expect(setActions(once, ['users'], ['view'], true).permissions.users).toEqual(['view']);
  });

  it('adds view first when another action is switched on without it', () => {
    expect(setActions(EMPTY, ['users'], ['edit'], true).permissions.users).toEqual([
      'view',
      'edit',
    ]);
    expect(setActions(EMPTY, ['users'], ['create', 'deactivate'], true).permissions.users).toEqual([
      'view',
      'create',
      'deactivate',
    ]);
  });

  it('keeps the order in which actions were switched on once view is there', () => {
    const value = setActions(
      setActions(EMPTY, ['users'], ['view'], true),
      ['users'],
      ['edit'],
      true,
    );

    expect(value.permissions.users).toEqual(['view', 'edit']);
  });

  it('switches an action other than view off and keeps view', () => {
    const value = setActions(
      { permissions: { users: ['view', 'edit'] }, scopes: {} },
      ['users'],
      ['edit'],
      false,
    );

    expect(value.permissions.users).toEqual(['view']);
  });

  it('removes every action when view is switched off', () => {
    const value = setActions(
      { permissions: { users: ['view', 'create', 'edit'], roles: ['view'] }, scopes: {} },
      ['users'],
      ['view'],
      false,
    );

    expect(value.permissions).toEqual({ users: [], roles: ['view'] });
  });

  it('applies the same rule to several resources and several actions at once', () => {
    const value = setActions(EMPTY, ['users', 'roles'], ['create', 'edit'], true);

    expect(value.permissions).toEqual({
      users: ['view', 'create', 'edit'],
      roles: ['view', 'create', 'edit'],
    });
  });

  it('never mutates the value it was given', () => {
    const original: MatrixValue = { permissions: { users: ['view'] }, scopes: { users: 'own' } };
    setActions(original, ['users'], ['edit'], true);
    setScope(original, 'users', 'all');

    expect(original).toEqual({ permissions: { users: ['view'] }, scopes: { users: 'own' } });
  });
});

describe('access summary', () => {
  const value: MatrixValue = {
    permissions: { users: ['view'], roles: [], departments: ['view', 'edit'] },
    scopes: {},
  };

  it('knows whether a resource grants anything', () => {
    expect(hasAccess(value, 'users')).toBe(true);
    expect(hasAccess(value, 'roles')).toBe(false);
    expect(hasAccess(value, 'payroll')).toBe(false);
  });

  it('counts the resources with access', () => {
    expect(countWithAccess(value, ['users', 'roles', 'departments', 'payroll'])).toBe(2);
    expect(countWithAccess(value, [])).toBe(0);
  });
});

describe('checkState', () => {
  const value: MatrixValue = {
    permissions: { users: ['view', 'edit'], roles: ['view'] },
    scopes: {},
  };

  it('is none, some or all', () => {
    expect(checkState(value, ['users', 'roles'], ['create'])).toBe('none');
    expect(checkState(value, ['users', 'roles'], ['view'])).toBe('all');
    expect(checkState(value, ['users', 'roles'], ['edit'])).toBe('some');
    expect(checkState(value, ['users'], ['view', 'edit'])).toBe('all');
    expect(checkState(value, ['users', 'roles'], ['view', 'edit'])).toBe('some');
  });

  it('is none when there is nothing to check', () => {
    expect(checkState(value, [], ['view'])).toBe('none');
    expect(checkState(value, ['users'], [])).toBe('none');
  });
});

describe('matrixOfRole', () => {
  it('keeps the permissions and the scopes the form offers', () => {
    const matrix = matrixOfRole({
      permissions: { users: ['view'] },
      scopes: { users: 'team', audit_logs: 'client', departments: 'all' },
    });

    expect(matrix).toEqual({
      permissions: { users: ['view'] },
      scopes: { users: 'team', departments: 'all' },
    });
  });
});

describe('toPayload', () => {
  it('sends only the resources with an action', () => {
    const payload = toPayload(
      { permissions: { users: ['view'], roles: [], payroll: ['view', 'edit'] }, scopes: {} },
      [],
    );

    expect(payload.permissions).toEqual({ users: ['view'], payroll: ['view', 'edit'] });
  });

  it('sends a scope only for the resources that have an owner, own by default', () => {
    const payload = toPayload(
      {
        permissions: { users: ['view'], audit_logs: ['view'], departments: ['view'] },
        scopes: { users: 'all', departments: 'team' },
      },
      ['users', 'audit_logs'],
    );

    expect(payload.scopes).toEqual({ users: 'all', audit_logs: 'own' });
  });

  it('sends no scope for a resource without actions, even an owned one', () => {
    const payload = toPayload({ permissions: { users: [] }, scopes: { users: 'all' } }, ['users']);

    expect(payload).toEqual({ permissions: {}, scopes: {} });
  });

  it('sends nothing for an empty matrix', () => {
    expect(toPayload(EMPTY, ['users'])).toEqual({ permissions: {}, scopes: {} });
  });
});
