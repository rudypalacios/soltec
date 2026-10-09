import type { components } from '../api/generated/schema';

type PermissionMap = components['schemas']['PermissionMap'];

/**
 * Whether the permissions of the signed-in user include an action on a resource. Used to hide menus and buttons;
 * the server is the real control (ADR-0012), so a hidden option is a courtesy and a visible one is never a promise.
 */
export function can(
  user: { permissions: PermissionMap } | null | undefined,
  resource: string,
  action: string,
): boolean {
  if (!user || !Object.hasOwn(user.permissions, resource)) {
    return false;
  }
  return user.permissions[resource]?.includes(action) ?? false;
}
