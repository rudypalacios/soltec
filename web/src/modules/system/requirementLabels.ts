import type { CheckStatus, RequirementsVerdict } from '@soltec/shared';

/** Texts of the requirements screen. The API sends stable ids; the Spanish wording lives here. */
export const groupTitles: Record<string, string> = {
  php: 'PHP',
  config: 'Configuración',
  storage: 'Carpetas',
  database: 'Base de datos',
  mail: 'Correo',
};

export const statusLabels: Record<CheckStatus, string> = {
  pass: 'Correcto',
  warn: 'Aviso',
  fail: 'Falla',
};

export const verdictLabels: Record<RequirementsVerdict, string> = {
  ready: 'Todo listo',
  ready_with_warnings: 'Listo, con avisos',
  blocked: 'Bloqueado: hay requisitos sin cumplir',
};

const checkTitles: Record<string, string> = {
  'php.version': 'Versión de PHP',
  'php.webp': 'WebP en GD',
  'php.memory_limit': 'Memoria de PHP',
  'php.upload_max_filesize': 'Tamaño máximo de archivo',
  'php.post_max_size': 'Tamaño máximo de envío',
  'php.max_execution_time': 'Tiempo máximo de ejecución',
  'config.env_file': 'Archivo .env',
  'config.database_settings': 'Datos de la base en el .env',
  'config.app_env': 'Entorno (APP_ENV)',
  'config.layout': 'Estructura de carpetas',
  'config.document_root': 'Carpeta pública (Document Root)',
  'config.https': 'HTTPS',
  'storage.writable': 'Carpeta storage/',
  'storage.migrations': 'Archivos de migración',
  'db.connection': 'Conexión a la base de datos',
  'db.version': 'Versión de MySQL',
  'db.generated_column': 'Índice único en columna generada',
  'db.privileges': 'Privilegios de esquema',
  'db.migrations': 'Migraciones aplicadas',
  'mail.settings': 'Configuración del correo',
  'mail.smtp': 'Servidor SMTP',
};

const extensionPrefix = 'php.ext.';

export function checkTitle(id: string): string {
  if (id.startsWith(extensionPrefix)) {
    return `Extensión ${id.slice(extensionPrefix.length)}`;
  }
  return checkTitles[id] ?? id;
}

export function groupTitle(group: string): string {
  return groupTitles[group] ?? group;
}
