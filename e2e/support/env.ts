/** The throwaway server of the E2E run: where it listens and the account it starts with. */
export const WEB_URL = 'http://127.0.0.1:4173';
export const API_PORT = 8080;
export const MAIL_HTTP_URL = 'http://127.0.0.1:8025';

export const DEPLOY_TOKEN = 'e2e-deploy-token-0123456789abcdef0123456789';

/** Created by the post-migration step of the API (ADMIN_* variables); it never has to change its password. */
export const ADMIN = {
  email: 'admin@e2e.test',
  name: 'Administrador E2E',
  password: 'E2e-admin-password-1',
} as const;

/** Variables the API reads. The database is created by `support/reset-database.php`. */
export const apiEnvironment = (): Record<string, string> => ({
  APP_ENV: 'testing',
  APP_URL: WEB_URL,
  APP_BASE_PATH: '/api',
  DB_HOST: process.env.E2E_DB_HOST ?? '127.0.0.1',
  DB_PORT: process.env.E2E_DB_PORT ?? '3306',
  DB_NAME: process.env.E2E_DB_NAME ?? 'soltec_e2e',
  DB_USER: process.env.E2E_DB_USER ?? 'soltec',
  DB_PASS: process.env.E2E_DB_PASS ?? 'soltec_local',
  DEPLOY_TOKEN,
  JWT_SECRET: 'e2e-jwt-secret-0123456789abcdef0123456789abcdef',
  MAIL_DRIVER: 'smtp',
  MAIL_HOST: '127.0.0.1',
  MAIL_PORT: '2525',
  MAIL_ENCRYPTION: 'none',
  MAIL_USERNAME: 'e2e',
  MAIL_PASSWORD: 'e2e',
  MAIL_FROM_ADDRESS: 'noreply@e2e.test',
  MAIL_FROM_NAME: 'Soltec E2E',
  ADMIN_EMAIL: ADMIN.email,
  ADMIN_NAME: ADMIN.name,
  ADMIN_PASSWORD: ADMIN.password,
  PHP_CLI_SERVER_WORKERS: '4',
});
