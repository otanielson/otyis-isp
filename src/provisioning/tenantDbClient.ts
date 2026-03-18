/**
 * Cliente PostgreSQL do banco do tenant (config_json.provisioning).
 * Usado pelo portal para radpostauth/logs e pelo Admin SaaS para diagnóstico.
 */
import pg from 'pg';
import { getTenantProvisioningStatus } from './orchestrator.js';

/**
 * Retorna um client PostgreSQL conectado ao banco do tenant.
 * Requer que o processo rode no mesmo host do stack (127.0.0.1:pgHostPort).
 * Retorna null se o tenant não tiver provisioning com pgHostPort/dbName/dbUser/dbPass.
 */
export async function getTenantDbClient(tenantId: number): Promise<pg.Client | null> {
  const provisioning = await getTenantProvisioningStatus(tenantId);
  if (!provisioning?.ports?.pgHostPort || !provisioning.dbName || !provisioning.dbUser || !provisioning.dbPass) {
    return null;
  }
  const client = new pg.Client({
    host: '127.0.0.1',
    port: provisioning.ports.pgHostPort,
    user: provisioning.dbUser,
    password: provisioning.dbPass,
    database: provisioning.dbName,
  });
  await client.connect();
  return client;
}
