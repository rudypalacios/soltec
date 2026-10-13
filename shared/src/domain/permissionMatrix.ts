/**
 * The permission matrix of a role as the form edits it: which actions it grants on each resource and, for the
 * resources whose rows have an owner, whose data it reaches. Pure functions, so every screen applies the same rules
 * and the server (which enforces them too) is the only other place that knows them.
 */
export type MatrixScope = 'own' | 'team' | 'all';

export interface MatrixValue {
  /** Granted actions by resource code. */
  permissions: Record<string, string[]>;
  /** Data scope by resource code. A resource without an entry is `own`. */
  scopes: Record<string, MatrixScope>;
}

/** How many of a set of checkboxes are on: every one, some or none. */
export type CheckState = 'all' | 'some' | 'none';

const VIEW = 'view';

/**
 * Switches actions on or off for several resources at once. Every action needs `view`: switching one on adds `view`,
 * and switching `view` off removes the rest (an edit nobody can open is nonsense, and the API rejects it).
 * Never mutates the value it receives.
 */
export function setActions(
  value: MatrixValue,
  resources: readonly string[],
  actions: readonly string[],
  on: boolean,
): MatrixValue {
  const permissions = { ...value.permissions };
  for (const resource of resources) {
    let next = new Set(permissions[resource] ?? []);
    for (const action of actions) {
      if (on) {
        next.add(action);
      } else {
        next.delete(action);
      }
    }
    if (on && actions.some((action) => action !== VIEW) && !next.has(VIEW)) {
      next = new Set([VIEW, ...next]);
    }
    if (!next.has(VIEW)) {
      next.clear();
    }
    permissions[resource] = [...next];
  }
  return { ...value, permissions };
}

export function setScope(value: MatrixValue, resource: string, scope: MatrixScope): MatrixValue {
  return { ...value, scopes: { ...value.scopes, [resource]: scope } };
}

/** Whether the role grants at least one action on the resource. */
export function hasAccess(value: MatrixValue, resource: string): boolean {
  return (value.permissions[resource] ?? []).length > 0;
}

/** How many of the resources the role grants something on. */
export function countWithAccess(value: MatrixValue, resources: readonly string[]): number {
  return resources.filter((resource) => hasAccess(value, resource)).length;
}

/** The state of the checkbox that stands for `actions` on all of `resources` (a row, a column or a section). */
export function checkState(
  value: MatrixValue,
  resources: readonly string[],
  actions: readonly string[],
): CheckState {
  const total = resources.length * actions.length;
  if (total === 0) {
    return 'none';
  }
  const on = resources.reduce(
    (sum, resource) =>
      sum + actions.filter((action) => (value.permissions[resource] ?? []).includes(action)).length,
    0,
  );
  if (on === 0) {
    return 'none';
  }
  return on === total ? 'all' : 'some';
}

/**
 * The matrix a stored role has. A stored scope that is not one of the three the form offers is left out (`client`
 * belongs to external roles, which have no form yet).
 */
export function matrixOfRole(role: {
  permissions: Record<string, string[]>;
  scopes: Record<string, string>;
}): MatrixValue {
  const scopes: Record<string, MatrixScope> = {};
  for (const [resource, scope] of Object.entries(role.scopes)) {
    if (scope === 'own' || scope === 'team' || scope === 'all') {
      scopes[resource] = scope;
    }
  }
  return { permissions: role.permissions, scopes };
}

/**
 * What the API receives: only the resources with at least one action. A scope goes only for a resource whose rows
 * have an owner (`scoped`), `own` unless chosen; any other resource has no scope to send.
 */
export function toPayload(value: MatrixValue, scoped: readonly string[]): MatrixValue {
  const permissions: Record<string, string[]> = {};
  const scopes: Record<string, MatrixScope> = {};
  for (const [resource, actions] of Object.entries(value.permissions)) {
    if (actions.length === 0) {
      continue;
    }
    permissions[resource] = actions;
    if (scoped.includes(resource)) {
      scopes[resource] = value.scopes[resource] ?? 'own';
    }
  }
  return { permissions, scopes };
}
