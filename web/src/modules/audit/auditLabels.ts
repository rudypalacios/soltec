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
