import { DEPLOY_TOKEN } from './env.ts';

/**
 * Applies the migrations through the same endpoint the deployment uses (docs/despliegue.md). The post-migration step
 * creates the administrator from the ADMIN_* variables, so the run starts with one account and nothing else.
 */
export default async function globalSetup(): Promise<void> {
  const response = await fetch('http://127.0.0.1:8080/api/system/migrations/apply', {
    method: 'POST',
    headers: { 'X-Deploy-Token': DEPLOY_TOKEN },
  });
  if (!response.ok) {
    throw new Error(`Migrations failed (HTTP ${response.status}): ${await response.text()}`);
  }
}
