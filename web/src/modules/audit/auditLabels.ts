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
  contact_types: 'Tipos de contacto',
  client_statuses: 'Estados de cliente',
  segments: 'Segmentos',
  tax_regimes: 'Regímenes fiscales',
  payment_methods: 'Formas de pago',
  brands: 'Marcas',
  areas: 'Áreas',
  product_groups: 'Grupos de producto',
  unit_categories: 'Categorías de unidad',
  units_of_measure: 'Unidades de medida',
  contacts: 'Contactos',
  suppliers: 'Proveedores',
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
  contact_types: 'Tipo de contacto',
  client_statuses: 'Estado de cliente',
  segments: 'Segmento',
  tax_regimes: 'Régimen fiscal',
  payment_methods: 'Forma de pago',
  brands: 'Marca',
  areas: 'Área',
  product_groups: 'Grupo de producto',
  unit_categories: 'Categoría de unidad',
  units_of_measure: 'Unidad de medida',
  contacts: 'Contacto',
  suppliers: 'Proveedor',
};

/**
 * The screen of a record, when there is one and the person may open it. Departments, margin levels, parameters and devices have
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
  if (entityType === 'contacts' && can('contacts', 'edit')) {
    return `/contactos/${entityId}/editar`;
  }
  if (entityType === 'suppliers' && can('suppliers', 'edit')) {
    return `/proveedores/${entityId}/editar`;
  }
  return null;
}

/** The address of the audit filtered to one record. */
export function historyPath(entityType: string, entityId: string): string {
  return `/auditoria?tipo=${encodeURIComponent(entityType)}&registro=${encodeURIComponent(entityId)}`;
}
