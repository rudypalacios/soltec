import { describe, expect, it } from 'vitest';
import { can } from './permissions';

describe('can', () => {
  const user = { permissions: { users: ['view', 'edit'], roles: ['view'] } };

  it('allows what the user was granted', () => {
    expect(can(user, 'users', 'view')).toBe(true);
    expect(can(user, 'users', 'edit')).toBe(true);
    expect(can(user, 'roles', 'view')).toBe(true);
  });

  it('denies by default', () => {
    expect(can(user, 'users', 'deactivate')).toBe(false);
    expect(can(user, 'roles', 'edit')).toBe(false);
    expect(can(user, 'payroll', 'view')).toBe(false);
  });

  it('denies when there is no user', () => {
    expect(can(null, 'users', 'view')).toBe(false);
    expect(can(undefined, 'users', 'view')).toBe(false);
  });

  it('does not mistake inherited object keys for resources', () => {
    expect(can(user, 'constructor', 'view')).toBe(false);
    expect(can(user, 'toString', 'view')).toBe(false);
  });
});
