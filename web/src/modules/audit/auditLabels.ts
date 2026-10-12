/** What each stable code of the audit log reads as. A code that is not here is shown as it comes. */
export const ENTITY_LABELS: Record<string, string> = {
  users: 'Usuarios',
  roles: 'Perfiles',
  departments: 'Departamentos',
  company: 'Empresa',
  financial_settings: 'Finanzas',
  security_settings: 'Seguridad',
  sequences: 'Numeración',
  margin_levels: 'Niveles de margen',
  devices: 'Dispositivos',
};

export const ACTION_LABELS: Record<string, string> = {
  create: 'Creación',
  update: 'Cambio',
  deactivate: 'Desactivación',
  reactivate: 'Reactivación',
  login: 'Inicio de sesión',
  logout: 'Cierre de sesión',
  lockout: 'Bloqueo de cuenta',
  unlock: 'Desbloqueo de cuenta',
  device_revoke: 'Cierre de una sesión',
  password_change: 'Cambio de contraseña',
  password_reset_request: 'Solicitud de nueva contraseña',
  password_reset: 'Nueva contraseña por enlace',
  invite: 'Invitación enviada',
  accept_invitation: 'Invitación aceptada',
};

export const entityLabel = (code: string): string => ENTITY_LABELS[code] ?? code;
export const actionLabel = (code: string): string => ACTION_LABELS[code] ?? code;

/** The record with its kind for a sentence («Perfil «Comercial»»). */
export const ENTITY_NOUNS: Record<string, string> = {
  users: 'Usuario',
  roles: 'Perfil',
  departments: 'Departamento',
  margin_levels: 'Nivel de margen',
  devices: 'Dispositivo',
};

/**
 * The screen of a record, when there is one and the person may open it. Departments, margin levels and devices have
 * no screen of their own (they are edited in a list), so they only show their name.
 */
export function recordPath(
  entityType: string,
  entityId: string | null,
  can: (resource: string, action: string) => boolean,
): string | null {
  if (entityId === null) {
    return null;
  }
  if (entityType === 'users' && can('users', 'edit')) {
    return `/usuarios/${entityId}/editar`;
  }
  if (entityType === 'roles' && can('roles', 'view')) {
    return `/perfiles/${entityId}`;
  }
  return null;
}

/** The address of the audit filtered to one record. */
export function historyPath(entityType: string, entityId: string): string {
  return `/auditoria?tipo=${encodeURIComponent(entityType)}&registro=${encodeURIComponent(entityId)}`;
}
