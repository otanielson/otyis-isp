/**
 * Sincroniza o usuário Master do banco central para o banco do tenant.
 * Útil quando o tenant foi provisionado antes da correção que insere o Master no init.
 *
 * Uso: node scripts/fix-tenant-master.mjs <slug>
 * Ex.: node scripts/fix-tenant-master.mjs git
 *
 * Requer: .env do projeto (DB_* para banco central)
 * O script lê o .env do tenant em TENANTS_BASE_PATH/<slug>/.env (padrão /srv/tenants/<slug>)
 */
import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function parseEnv(content) {
  const out = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Uso: node scripts/fix-tenant-master.mjs <slug>');
    console.error('Ex.: node scripts/fix-tenant-master.mjs git');
    process.exit(1);
  }

  const tenantsBase = process.env.TENANTS_BASE_PATH || (process.platform === 'win32' ? 'C:\\srv\\tenants' : '/srv/tenants');
  const tenantPath = path.join(tenantsBase, slug);
  const tenantEnvPath = path.join(tenantPath, '.env');

  let tenantEnv = {};
  try {
    const content = await readFile(tenantEnvPath, 'utf8');
    tenantEnv = parseEnv(content);
  } catch (e) {
    console.error(`Erro: não foi possível ler ${tenantEnvPath}`);
    console.error('Verifique se o tenant existe e TENANTS_BASE_PATH está correto.');
    process.exit(1);
  }

  const pgPort = tenantEnv.PG_HOST_PORT || tenantEnv.DB_PORT || 5432;
  const tenantDbConfig = {
    host: '127.0.0.1',
    port: Number(pgPort),
    user: tenantEnv.PG_USER || tenantEnv.DB_USER,
    password: tenantEnv.PG_PASS || tenantEnv.DB_PASS || '',
    database: tenantEnv.PG_DB || tenantEnv.DB_NAME,
  };
  if (!tenantDbConfig.user || !tenantDbConfig.database) {
    console.error('Erro: .env do tenant não tem PG_USER/PG_DB ou DB_USER/DB_NAME');
    process.exit(1);
  }

  const centralConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME,
  };
  if (!centralConfig.user || !centralConfig.database) {
    console.error('Erro: defina DB_USER e DB_NAME no .env do projeto (banco central)');
    process.exit(1);
  }

  const central = new pg.Client(centralConfig);
  await central.connect();

  const tenantRes = await central.query(
    'SELECT id FROM tenants WHERE slug = $1 LIMIT 1',
    [slug]
  );
  const tenant = tenantRes.rows?.[0];
  if (!tenant) {
    console.error(`Erro: tenant "${slug}" não encontrado no banco central`);
    await central.end();
    process.exit(1);
  }
  const tenantId = tenant.id;

  const userRes = await central.query(
    `SELECT name, email, password_hash FROM tenant_users
     WHERE tenant_id = $1 AND is_master = true AND is_active = true LIMIT 1`,
    [tenantId]
  );
  const user = userRes.rows?.[0];
  if (!user) {
    console.error(`Erro: usuário Master não encontrado para o tenant "${slug}"`);
    await central.end();
    process.exit(1);
  }

  await central.end();

  const esc = (s) => String(s).replace(/'/g, "''");
  const seedSql = `
-- Sincroniza Master do central para o banco do tenant (fix-tenant-master)
INSERT INTO tenant_roles (tenant_id, name, is_system) VALUES (1, 'Master', true) ON CONFLICT (tenant_id, name) DO NOTHING;
INSERT INTO tenant_users (tenant_id, name, email, password_hash, is_master, is_active)
VALUES (1, '${esc(user.name)}', '${esc(user.email)}', '${esc(user.password_hash)}', true, true)
ON CONFLICT (tenant_id, email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, is_master = true, is_active = true;
INSERT INTO tenant_user_roles (tenant_id, user_id, role_id)
SELECT 1, u.id, r.id FROM tenant_users u, tenant_roles r
WHERE u.tenant_id = 1 AND u.email = '${esc(user.email)}' AND r.tenant_id = 1 AND r.name = 'Master'
ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING;
INSERT INTO tenant_role_permissions (tenant_id, role_id, permission_id)
SELECT 1, r.id, p.id FROM tenant_roles r CROSS JOIN tenant_permissions p
WHERE r.tenant_id = 1 AND r.name = 'Master' AND p.is_active = true
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
`;

  const tenantClient = new pg.Client(tenantDbConfig);
  try {
    await tenantClient.connect();
  } catch (e) {
    console.error('Erro ao conectar no banco do tenant:', e.message);
    console.error(`Verifique se o Postgres do tenant está em 127.0.0.1:${pgPort}`);
    process.exit(1);
  }

  try {
    await tenantClient.query(seedSql);
    console.log(`OK: Master (${user.email}) sincronizado para o tenant "${slug}".`);
    console.log('Agora é possível fazer login no portal.');
  } catch (e) {
    console.error('Erro ao executar seed no banco do tenant:', e.message);
    process.exit(1);
  } finally {
    await tenantClient.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
