import { ApiError } from '@soltec/shared';

/** What the user reads for each stable `code` of the API. The API never carries user-facing text. */
const UNEXPECTED = 'Ocurrió un error inesperado. Inténtalo de nuevo.';

const PROBLEM_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  password_change_required: 'Debes cambiar tu contraseña para continuar.',
  token_expired: 'Tu sesión terminó. Inicia sesión de nuevo.',
  token_invalid: 'Tu sesión terminó. Inicia sesión de nuevo.',
  forbidden: 'No tienes permiso para hacer esto.',
  not_found: 'No se encontró el registro.',
  validation_failed: 'Revisa los campos marcados.',
  conflict: 'Otra persona cambió este registro. Recarga la página e inténtalo de nuevo.',
  last_admin: 'Debe quedar al menos un administrador activo.',
  system_role_immutable: 'Los perfiles de sistema no se pueden modificar.',
  department_in_use:
    'No se puede desactivar: el departamento tiene usuarios activos. Asígnalos a otro departamento primero.',
  link_invalid:
    'Este enlace ya no sirve: ya se usó o se envió uno más reciente. Pide que te lo envíen de nuevo.',
  link_expired: 'Este enlace venció. Pide que te lo envíen de nuevo.',
  invitation_not_pending: 'Esta persona ya eligió su contraseña.',
  mail_send_failed: 'El servidor de correo rechazó el mensaje. Inténtalo de nuevo en unos minutos.',
  mail_not_configured:
    'El correo aún no está configurado en el servidor. Avisa a quien lo administra.',
  auth_not_configured:
    'El servidor aún no está listo para iniciar sesión. Avisa a quien lo administra.',
};

const INVALID_FIELD = 'No es válido.';

const FIELD_MESSAGES: Record<string, string> = {
  required: 'Obligatorio.',
  invalid: INVALID_FIELD,
  too_short: 'Es demasiado corto.',
  too_long: 'Es demasiado largo.',
  taken: 'Ya está en uso.',
  not_found: 'No existe o no está disponible.',
  out_of_range: 'Está fuera del rango permitido.',
  current_password_incorrect: 'La contraseña actual no es correcta.',
  cycle: 'Esa persona depende de este usuario: no puede ser su jefe.',
};

/**
 * The message for a failed call. `overrides` lets a screen say something more precise for a code that means
 * different things in different places (`conflict` is a stale version when saving and a role in use when deactivating).
 */
export function problemMessage(error: unknown, overrides: Record<string, string> = {}): string {
  if (error instanceof ApiError) {
    return overrides[error.code] ?? PROBLEM_MESSAGES[error.code] ?? UNEXPECTED;
  }
  if (error instanceof TypeError) {
    return 'No se pudo contactar con el servicio. Revisa tu conexión.';
  }
  return UNEXPECTED;
}

/** The message under a wrong field; `overrides` are per code, for fields with their own rules. */
export function fieldMessage(code: string, overrides: Record<string, string> = {}): string {
  return overrides[code] ?? FIELD_MESSAGES[code] ?? INVALID_FIELD;
}

/** The field errors of a failed call, already in Spanish and keyed by field. */
export function fieldMessages(
  error: unknown,
  overrides: Record<string, Record<string, string>> = {},
): Record<string, string> {
  if (!(error instanceof ApiError)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(error.fieldErrors).map(([field, code]) => [
      field,
      fieldMessage(code, overrides[field]),
    ]),
  );
}
