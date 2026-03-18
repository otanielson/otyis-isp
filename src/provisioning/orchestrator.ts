/**
 * Orquestrador: instalação completa do sistema por provedor.
 * Cria diretório do tenant, schema do banco, FreeRADIUS, compose e sobe os containers
 * (postgres, portal_admin, site, freeradius). Atualiza config_json no banco central.
 */
import fs from 'fs/promises';
import path from 'path';
import { getPool } from '../db.js';
import { findFreeTcpPort, getPortRanges } from './portFinder.js';
import {
  generateDockerCompose,
  generateTenantRootEnv,
  generateRadiusClientsConf,
  generateRadiusUsersFile,
  generateRadiusSqlMod,
  generateRadiusDefaultSite,
  generateRadiusdConf,
} from './composeGenerator.js';
import { dockerComposeUpServices, dockerComposeDown, dockerComposeRestart, dockerLogs } from './dockerRunner.js';
import { execSync } from 'child_process';
import type { TenantProvisionInput, ProvisionResult, ProvisioningConfig, TenantPorts } from './types.js';
import { randomBytes } from 'crypto';

const DEFAULT_BASE_PATH = process.platform === 'win32' ? 'C:\\srv\\tenants' : '/srv/tenants';

function getTenantsBasePath(): string {
  return process.env.TENANTS_BASE_PATH || DEFAULT_BASE_PATH;
}

function generateSecret(bytes = 24): string {
  return randomBytes(bytes).toString('base64').replace(/[/+=]/g, '').slice(0, 32);
}

function replacePlaceholders(content: string, vars: Record<string, string>): string {
  let out = content;
  for (const [key, val] of Object.entries(vars)) {
    out = out.replace(new RegExp(`{{${key}}}`, 'g'), val ?? '');
  }
  return out;
}

const BASE_TAG_SCRIPT =
  '<base id="__base" href="/"><script>var __BP=(function(){var p=location.pathname.replace(/\\/$/,\'\')||\'/\';var m=p.match(/^\\/([a-z0-9_-]+)(?:\\/|$)/i);return m?(\'/\'+m[1]+\'/\'):\'/\';})();var b=document.getElementById(\'__base\');if(b)b.href=__BP;</script>';

function applyBasePath(content: string, basePath: string, tenantAgnostic = true): string {
  if (!basePath || basePath === '/') return content;
  let out = content;
  out = out.replace(/href="\//g, `href="${basePath}`);
  out = out.replace(/src="\//g, `src="${basePath}`);
  out = out.replace(/'\/api\//g, `'${basePath}api/`);
  out = out.replace(/fetch\s*\(\s*['"]\//g, `fetch('${basePath}`);
  if (tenantAgnostic) {
    const escaped = basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`href="${escaped}`, 'g'), 'href="');
    out = out.replace(new RegExp(`src="${escaped}`, 'g'), 'src="');
    if (out.includes('<head>')) out = out.replace('<head>', '<head>\n  ' + BASE_TAG_SCRIPT);
    else if (out.includes('<head ')) out = out.replace(/<head\s[^>]*>/, (m) => m + '\n  ' + BASE_TAG_SCRIPT);
  }
  return out;
}

async function copySiteModel(
  stackPath: string,
  vars: Record<string, string>,
  basePath: string,
  appContextPath: string
): Promise<void> {
  const modelsSite = path.join(appContextPath, 'models', 'site');
  const webDir = path.join(appContextPath, 'web');
  const webAssets = path.join(webDir, 'assets');
  const outStatic = path.join(stackPath, 'site', 'static');

  const extraPages = [
    'planos.html',
    'assinar.html',
    '404.html',
    'noticias/index.html',
    'noticias/post-1.html',
    'noticias/post-2.html',
    'noticias/post-3.html',
    'clube/index.html',
    'clube/stand.html',
    'cliente/index.html',
  ];

  async function walkModel(dir: string, base: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.relative(base, full);
      if (e.isDirectory()) {
        files.push(...(await walkModel(full, base)));
      } else {
        files.push(rel);
      }
    }
    return files;
  }

  try {
    const modelFiles = await walkModel(modelsSite, modelsSite);
    for (const rel of modelFiles) {
      const src = path.join(modelsSite, rel);
      const dest = path.join(outStatic, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      let content = await fs.readFile(src, 'utf8');
      content = replacePlaceholders(content, vars);
      await fs.writeFile(dest, content, 'utf8');
    }
  } catch (err) {
    const fallback = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${vars.PROVIDER_NAME}</title></head><body><h1>${vars.PROVIDER_NAME}</h1><p>Site institucional. Acesso: <code>/${vars.PROVIDER_SLUG}/</code> (site) e <code>/${vars.PROVIDER_SLUG}/portal/</code> (painel).</p></body></html>`;
    await fs.writeFile(path.join(outStatic, 'index.html'), fallback, 'utf8');
    return;
  }

  for (const sub of ['css', 'js']) {
    const srcDir = path.join(webAssets, sub);
    const destDir = path.join(outStatic, 'assets', sub);
    try {
      const entries = await fs.readdir(srcDir, { withFileTypes: true });
      await fs.mkdir(destDir, { recursive: true });
      for (const e of entries) {
        if (e.isFile()) {
          await fs.copyFile(path.join(srcDir, e.name), path.join(destDir, e.name));
        }
      }
    } catch {
      /* ignore */
    }
  }

  for (const p of extraPages) {
    const src = path.join(webDir, p);
    const dest = path.join(outStatic, p);
    try {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      let content = await fs.readFile(src, 'utf8');
      content = applyBasePath(content, basePath);
      content = content.replace(/Multi Telecom/g, vars.PROVIDER_NAME);
      content = replacePlaceholders(content, vars);
      await fs.writeFile(dest, content, 'utf8');
    } catch {
      /* ignore */
    }
  }

  // Portal admin (dashboard, login) — montado no container
  const portalDir = path.join(webDir, 'portal');
  const outPortal = path.join(stackPath, 'portal');
  try {
    await fs.mkdir(outPortal, { recursive: true });
    const portalFiles = await walkModel(portalDir, portalDir);
    for (const rel of portalFiles) {
      const src = path.join(portalDir, rel);
      const dest = path.join(outPortal, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      let content = await fs.readFile(src, 'utf8');
      content = replacePlaceholders(content, vars);
      await fs.writeFile(dest, content, 'utf8');
    }
  } catch {
    /* ignore */
  }
}


/**
 * Instalação do sistema para um novo provedor: stack Docker completo (postgres, portal_admin, site, freeradius).
 */
export async function provisionTenantStack(input: TenantProvisionInput): Promise<ProvisionResult> {
  const log: string[] = [];
  const tenantsBasePath = getTenantsBasePath();
  const stackPath = path.join(tenantsBasePath, input.slug);

  const radiusSecret = input.radiusSecret || generateSecret();
  const portsRange = getPortRanges();

  log.push('=== Instalação do sistema para o provedor ===');
  log.push(`[1/6] Tenant: ${input.name} (${input.slug}), path: ${stackPath}`);

  const dbName = `portal_${input.slug.replace(/[^a-z0-9_]/gi, '_')}`.slice(0, 63);
  const dbUser = dbName;
  const dbPassword = generateSecret(16);
  const baseUrl = input.domain ? `https://${input.domain}` : '';
  const jwtSecret = process.env.JWT_SECRET || 'change-me';

  try {
    await fs.mkdir(stackPath, { recursive: true });
    await fs.mkdir(path.join(stackPath, 'site', 'static'), { recursive: true });
    await fs.mkdir(path.join(stackPath, 'radius', 'mods-available'), { recursive: true });
    await fs.mkdir(path.join(stackPath, 'radius', 'mods-enabled'), { recursive: true });
    await fs.mkdir(path.join(stackPath, 'radius', 'sites-available'), { recursive: true });
    await fs.mkdir(path.join(stackPath, 'radius', 'sites-enabled'), { recursive: true });
    await fs.mkdir(path.join(stackPath, 'postgres', 'init'), { recursive: true });
  } catch (e) {
    const msg = `Falha ao criar diretórios: ${(e as Error).message}`;
    log.push(`[Instalação] ERRO: ${msg}`);
    await updateTenantProvisioningStatus(input.tenantId, 'error', undefined, undefined, undefined, msg);
    return { success: false, message: msg, log };
  }
  log.push('[2/6] Estrutura de pastas criada.');

  const radiusAuthPort = 1812;
  const radiusAcctPort = 1813;
  log.push('[3/6] RADIUS nas portas originais: 1812 (auth) e 1813 (acct).');

  log.push('[3/6] Alocando portas TCP (app = portal + site em um container)...');
  const appPort = await findFreeTcpPort(portsRange.tcpStart, portsRange.tcpEnd);
  if (appPort == null) {
    const msg = `Nenhuma porta TCP livre no range ${portsRange.tcpStart}-${portsRange.tcpEnd} para o app.`;
    log.push(`[Instalação] ERRO: ${msg}`);
    await updateTenantProvisioningStatus(input.tenantId, 'error', undefined, undefined, undefined, msg);
    return { success: false, message: msg, log };
  }
  const pgHostPort = await findFreeTcpPort(appPort + 1, portsRange.tcpEnd);
  if (pgHostPort == null) {
    const msg = 'Nenhuma porta TCP livre para o Postgres no host (após app).';
    log.push(`[Instalação] ERRO: ${msg}`);
    await updateTenantProvisioningStatus(input.tenantId, 'error', undefined, undefined, undefined, msg);
    return { success: false, message: msg, log };
  }
  const ports: TenantPorts = {
    radiusAuthPort,
    radiusAcctPort,
    sitePort: appPort,
    adminPort: appPort,
    pgHostPort,
  };
  log.push(`[3/6] Portas: RADIUS ${radiusAuthPort}/${radiusAcctPort} (udp), app ${appPort} (portal+site), Postgres host ${pgHostPort} (tcp, 127.0.0.1).`);

  const appContextPath = process.env.PROVISION_APP_CONTEXT || path.resolve(process.cwd());
  const postgresImage = process.env.PROVISION_POSTGRES_IMAGE || undefined;
  const usePostgresModel = /^1|true|yes$/i.test(String(process.env.PROVISION_POSTGRES_MODEL || '').trim());
  const portalAdminImage = process.env.PROVISION_PORTAL_ADMIN_IMAGE || undefined;

  const composeContent = generateDockerCompose({
    slug: input.slug,
    tenantId: input.tenantId,
    radiusAuthPort,
    radiusAcctPort,
    appPort,
    pgHostPort,
    radiusSecret,
    dbName,
    dbUser,
    dbPassword,
    postgresImage,
    usePostgresModel,
    appContextPath,
    portalAdminImage,
  });

  const rootEnvContent = generateTenantRootEnv({
    slug: input.slug,
    domain: input.domain,
    dbName,
    dbUser,
    dbPassword,
    radiusAuthPort,
    radiusAcctPort,
    appPort,
    pgHostPort,
    radiusSecret,
    jwtSecret,
    baseUrl,
  });

  const clientsConfContent = generateRadiusClientsConf(radiusSecret, input.slug);
  const usersContent = generateRadiusUsersFile();
  const postgresHost = '127.0.0.1';
  const postgresPort = pgHostPort;
  const radiusSqlModContent = generateRadiusSqlMod(dbName, dbUser, dbPassword, postgresHost, postgresPort);
  const radiusDefaultSiteContent = generateRadiusDefaultSite();
  // Arquivo de driver PostgreSQL exigido pelo include ${modconfdir}/sql/driver/postgresql no módulo sql
  const radiusSqlDriverContent = `# Driver PostgreSQL — satisfaz INCLUDE \${modconfdir}/sql/driver/postgresql
postgresql {
  # Configurações adicionais específicas do driver podem ser adicionadas aqui, se necessário.
}
`;

  const tenantInitSql = `-- Tenant do stack (id=1)\nUPDATE tenants SET slug = '${input.slug.replace(/'/g, "''")}', name = '${input.name.replace(/'/g, "''")}' WHERE id = 1;\n`;

  let schemaSql: string | null = null;
  let radiusSchemaSql: string | null = null;
  if (!usePostgresModel) {
    const schemaPath = path.join(appContextPath, 'sql', 'schema.pg.sql');
    const radiusSchemaPath = path.join(appContextPath, 'sql', 'radius-schema.pg.sql');
    try {
      schemaSql = await fs.readFile(schemaPath, 'utf8');
      radiusSchemaSql = await fs.readFile(radiusSchemaPath, 'utf8');
    } catch (e) {
      const msg = `Schema SQL não encontrado: ${(e as Error).message}`;
      log.push(`[Instalação] ERRO: ${msg}`);
      await updateTenantProvisioningStatus(input.tenantId, 'error', undefined, undefined, undefined, msg);
      return { success: false, message: msg, log };
    }
  } else {
    log.push('[4/6] Usando Postgres modelo (apenas 02-tenant.sql no init).');
  }

  const siteUrlPrefix = `/${input.slug}/`;
  const siteVars = {
    PROVIDER_NAME: input.name,
    PROVIDER_SLUG: input.slug,
    PROVIDER_DOMAIN: input.domain || '',
    BASE_PATH: siteUrlPrefix,
  };

  try {
    await fs.writeFile(path.join(stackPath, '.env'), rootEnvContent, 'utf8');
    await fs.writeFile(path.join(stackPath, 'docker-compose.yml'), composeContent, 'utf8');
    await fs.writeFile(path.join(stackPath, 'radius', 'clients.conf'), clientsConfContent, 'utf8');
    await fs.writeFile(path.join(stackPath, 'radius', 'users'), usersContent, 'utf8');
    await fs.writeFile(path.join(stackPath, 'radius', 'mods-available', 'sql'), radiusSqlModContent, 'utf8');
    await fs.writeFile(path.join(stackPath, 'radius', 'mods-enabled', 'sql'), radiusSqlModContent, 'utf8');
    await fs.mkdir(path.join(stackPath, 'radius', 'mods-config', 'sql', 'driver'), { recursive: true });
    await fs.writeFile(path.join(stackPath, 'radius', 'mods-config', 'sql', 'driver', 'postgresql'), radiusSqlDriverContent, 'utf8');
    await fs.writeFile(path.join(stackPath, 'radius', 'sites-available', 'default'), radiusDefaultSiteContent, 'utf8');
    await fs.writeFile(path.join(stackPath, 'radius', 'sites-enabled', 'default'), radiusDefaultSiteContent, 'utf8');
    const radiusDir = path.join(stackPath, 'radius');
    await fs.mkdir(path.join(radiusDir, 'log'), { recursive: true });
    await fs.mkdir(path.join(radiusDir, 'run'), { recursive: true });
    const radiusdConfContent = generateRadiusdConf(radiusDir);
    await fs.writeFile(path.join(radiusDir, 'radiusd.conf'), radiusdConfContent, 'utf8');

    await copySiteModel(stackPath, siteVars, siteUrlPrefix, appContextPath);
    await fs.writeFile(path.join(stackPath, 'postgres', 'init', '02-tenant.sql'), tenantInitSql, 'utf8');
    if (!usePostgresModel && schemaSql && radiusSchemaSql) {
      await fs.writeFile(path.join(stackPath, 'postgres', 'init', '01-schema.sql'), schemaSql, 'utf8');
      await fs.writeFile(path.join(stackPath, 'postgres', 'init', '03-radius-schema.sql'), radiusSchemaSql, 'utf8');
      // Modelos padrão de recibos/faturas (tenant 1)
      try {
        const seedReceiptPath = path.join(appContextPath, 'sql', 'seed_receipt_templates.pg.sql');
        const seedReceiptSql = await fs.readFile(seedReceiptPath, 'utf8');
        await fs.writeFile(path.join(stackPath, 'postgres', 'init', '06-seed-receipt-templates.sql'), seedReceiptSql, 'utf8');
        log.push('[4/6] Seed de modelos de recibo adicionado (06-seed-receipt-templates.sql).');
      } catch {
        // seed opcional; schema.pg.sql já pode conter os INSERTs
      }
    }
    // Seed do usuário Master no banco do tenant (login no portal)
    if (input.masterUser) {
      const esc = (s: string) => s.replace(/'/g, "''");
      const masterSeedSql = `-- Usuário Master para login no portal (tenant_id=1)
INSERT INTO tenant_roles (tenant_id, name, is_system) VALUES (1, 'Master', true) ON CONFLICT (tenant_id, name) DO NOTHING;
INSERT INTO tenant_users (tenant_id, name, email, password_hash, is_master, is_active)
VALUES (1, '${esc(input.masterUser.name)}', '${esc(input.masterUser.email)}', '${esc(input.masterUser.password_hash)}', true, true)
ON CONFLICT (tenant_id, email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, is_master = true, is_active = true;
INSERT INTO tenant_user_roles (tenant_id, user_id, role_id)
SELECT 1, u.id, r.id FROM tenant_users u, tenant_roles r
WHERE u.tenant_id = 1 AND u.email = '${esc(input.masterUser.email)}' AND r.tenant_id = 1 AND r.name = 'Master'
ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING;
INSERT INTO tenant_role_permissions (tenant_id, role_id, permission_id)
SELECT 1, r.id, p.id FROM tenant_roles r CROSS JOIN tenant_permissions p
WHERE r.tenant_id = 1 AND r.name = 'Master' AND p.is_active = true
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
`;
      await fs.writeFile(path.join(stackPath, 'postgres', 'init', '05-seed-master.sql'), masterSeedSql, 'utf8');
      log.push('[4/6] Seed do Master adicionado (05-seed-master.sql).');
    }
    // Permite conexões da rede Docker (padrão pg_hba só aceita 127.0.0.1)
    const pgHbaScript = `#!/bin/bash
set -e
echo "host all all 0.0.0.0/0 scram-sha-256" >> "$PGDATA/pg_hba.conf"
`;
    await fs.writeFile(path.join(stackPath, 'postgres', 'init', '04-pg-hba-docker.sh'), pgHbaScript, 'utf8');
    log.push('[4/6] Arquivos do sistema gerados: .env, docker-compose.yml, ' + (usePostgresModel ? 'init (modelo), ' : 'schema do banco, ') + 'FreeRADIUS, site.');
  } catch (e) {
    const msg = `Falha ao escrever arquivos: ${(e as Error).message}`;
    log.push(`[Instalação] ERRO: ${msg}`);
    await updateTenantProvisioningStatus(input.tenantId, 'error', stackPath, ports, radiusSecret, msg);
    return { success: false, message: msg, log };
  }

  await updateTenantProvisioningStatus(
    input.tenantId,
    'provisioning',
    stackPath,
    ports,
    radiusSecret,
    'Subindo Postgres (etapa 1/3)...'
  );

  // --- Etapa 1/3: só Postgres (porta, usuário e senha já definidos; gravados no config para FreeRADIUS e portal) ---
  log.push('[5/6] Etapa 1/3: Subindo container Postgres...');
  const postgresResult = await dockerComposeUpServices(stackPath, ['postgres'], true);
  log.push(postgresResult.stdout);
  if (postgresResult.stderr) {
    let stderr = postgresResult.stderr;
    if (/pull access denied|repository does not exist/i.test(stderr)) {
      stderr = '(aviso normal ao construir imagem local) ' + stderr.trim().replace(/\s+/g, ' ');
    }
    log.push(`stderr: ${stderr}`);
  }
  if (!postgresResult.success) {
    const msg = `Postgres falhou (code=${postgresResult.code}): ${postgresResult.stderr || postgresResult.stdout}`;
    log.push(`[Instalação] ERRO: ${msg}`);
    await updateTenantProvisioningStatus(input.tenantId, 'error', stackPath, ports, radiusSecret, msg, dbName, dbUser, dbPassword);
    return { success: false, message: msg, log };
  }
  await updateTenantProvisioningStatus(
    input.tenantId,
    'provisioning',
    stackPath,
    ports,
    radiusSecret,
    `Postgres OK. Porta=${pgHostPort}, user=${dbUser}, banco=${dbName}. Subindo FreeRADIUS (etapa 2/3)...`,
    dbName,
    dbUser,
    dbPassword
  );
  log.push(`[5/6] Postgres em execução (127.0.0.1:${pgHostPort}, user=${dbUser}, db=${dbName}). Etapa 2/3: FreeRADIUS no host (systemd)...`);

  // --- Etapa 2/3: FreeRADIUS no host (systemd freeradius-tenant@slug) ---
  const appContextPathForUnit = process.env.PROVISION_APP_CONTEXT || path.resolve(process.cwd());
  const unitPath = path.join(appContextPathForUnit, 'deploy', 'freeradius-tenant@.service');
  try {
    await fs.access(unitPath);
    execSync(`cp "${unitPath}" /etc/systemd/system/`, { stdio: 'pipe' });
    execSync('systemctl daemon-reload', { stdio: 'pipe' });
    execSync(`systemctl enable freeradius-tenant@${input.slug}`, { stdio: 'pipe' });
    execSync(`systemctl start freeradius-tenant@${input.slug}`, { stdio: 'pipe' });
    log.push('[5/6] FreeRADIUS iniciado no host (systemctl start freeradius-tenant@' + input.slug + ').');
  } catch (e) {
    const msg = `FreeRADIUS no host falhou: ${(e as Error).message}. Instale freeradius (apt install freeradius) e confira deploy/freeradius-tenant@.service.`;
    log.push(`[Instalação] ERRO: ${msg}`);
    await updateTenantProvisioningStatus(input.tenantId, 'error', stackPath, ports, radiusSecret, msg, dbName, dbUser, dbPassword);
    return { success: false, message: msg, log };
  }
  await updateTenantProvisioningStatus(
    input.tenantId,
    'provisioning',
    stackPath,
    ports,
    radiusSecret,
    'FreeRADIUS OK. Subindo app (portal+site em um container) (etapa 3/3)...',
    dbName,
    dbUser,
    dbPassword
  );
  log.push('[5/6] Etapa 3/3: Subindo portal_admin (portal + site)...');

  // --- Etapa 3/3: portal_admin (portal + site) — único container ---
  const portalResult = await dockerComposeUpServices(stackPath, ['portal_admin'], false);
  log.push(portalResult.stdout);
  if (portalResult.stderr) {
    let stderr = portalResult.stderr;
    if (/pull access denied|repository does not exist/i.test(stderr)) {
      stderr = '(aviso normal ao construir imagem local) ' + stderr.trim().replace(/\s+/g, ' ');
    }
    log.push(`stderr: ${stderr}`);
  }
  if (!portalResult.success) {
    const msg = `Portal/site falhou (code=${portalResult.code}): ${portalResult.stderr || portalResult.stdout}`;
    log.push(`[Instalação] ERRO: ${msg}`);
    await updateTenantProvisioningStatus(input.tenantId, 'error', stackPath, ports, radiusSecret, msg, dbName, dbUser, dbPassword);
    return { success: false, message: msg, log };
  }

  const config: ProvisioningConfig = {
    stackPath,
    ports,
    radiusSecret,
    dbName,
    dbUser,
    dbPass: dbPassword,
    status: 'running',
    lastLog: (portalResult.stdout + (portalResult.stderr || '')).slice(-500),
    lastProvisionedAt: new Date().toISOString(),
  };

  await updateTenantProvisioningConfig(input.tenantId, config);

  const pool = getPool();
  const [rows] = await pool.query('SELECT config_json FROM tenants WHERE id = $1 LIMIT 1', [input.tenantId]);
  const row = Array.isArray(rows) ? (rows as { config_json: unknown }[])[0] : null;
  const cfg = (row?.config_json && typeof row.config_json === 'object' ? { ...(row.config_json as Record<string, unknown>) } : {}) as Record<string, unknown>;
  // Garantir que provisioning (com sitePort e adminPort) não seja perdido ao adicionar radius
  cfg.provisioning = config as unknown as Record<string, unknown>;
  cfg.radius = { host: '127.0.0.1', port: radiusAuthPort, secret: radiusSecret };
  await pool.query('UPDATE tenants SET config_json = $1::jsonb, updated_at = NOW() WHERE id = $2', [
    JSON.stringify(cfg),
    input.tenantId,
  ]);

  log.push('[6/6] Containers e FreeRADIUS (host) em execução. Configuração salva no banco central.');
  const installSummary = [
    `Instalação do sistema — ${input.name} (${input.slug})`,
    `Data: ${new Date().toISOString()}`,
    '',
    'Containers: postgres, portal_admin (portal+site). FreeRADIUS no host: systemctl status freeradius-tenant@' + input.slug,
    `Portas: Postgres 127.0.0.1:${pgHostPort}, app=127.0.0.1:${appPort} (tcp), RADIUS auth=${radiusAuthPort} acct=${radiusAcctPort} (udp, no host)`,
    `Banco: ${dbName} | user=${dbUser} | porta host=${pgHostPort}`,
    '',
    `Acesso por path (sem DNS): https://SEU_IP/${input.slug}/ → site | https://SEU_IP/${input.slug}/portal/ → portal admin`,
    `Nginx: proxy_pass site e portal → http://127.0.0.1:${appPort}/`,
  ].join('\n');
  try {
    await fs.writeFile(path.join(stackPath, 'INSTALADO.txt'), installSummary, 'utf8');
  } catch {
    // não falha a instalação
  }

  return {
    success: true,
    message: 'Sistema instalado com sucesso. Stack Docker (postgres, portal_admin) e FreeRADIUS no host em execução.',
    config,
    log,
  };
}

/**
 * Atualiza apenas status e lastLog em config_json.provisioning.
 */
async function updateTenantProvisioningStatus(
  tenantId: number,
  status: ProvisioningConfig['status'],
  stackPath?: string,
  ports?: TenantPorts,
  radiusSecret?: string,
  lastLog?: string,
  dbName?: string,
  dbUser?: string,
  dbPass?: string
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT config_json FROM tenants WHERE id = ? LIMIT 1',
    [tenantId]
  );
  const row = Array.isArray(rows) ? (rows as { config_json: unknown }[])[0] : null;
  const config = (row?.config_json && typeof row.config_json === 'object'
    ? { ...(row.config_json as Record<string, unknown>) }
    : {}) as Record<string, unknown>;
  const prev = (typeof config.provisioning === 'object' && config.provisioning !== null
    ? (config.provisioning as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  config.provisioning = {
    ...prev,
    status,
    lastLog: lastLog ?? prev.lastLog,
    stackPath: stackPath ?? prev.stackPath,
    ports: ports ?? prev.ports,
    radiusSecret: radiusSecret ?? prev.radiusSecret,
    dbName: dbName ?? prev.dbName,
    dbUser: dbUser ?? prev.dbUser,
    dbPass: dbPass ?? prev.dbPass,
    lastProvisionedAt: status === 'running' ? new Date().toISOString() : prev.lastProvisionedAt,
  };

  await pool.query('UPDATE tenants SET config_json = ?, updated_at = NOW() WHERE id = ?', [
    JSON.stringify(config),
    tenantId,
  ]);
}

/**
 * Atualiza config_json.provisioning com o objeto completo.
 */
async function updateTenantProvisioningConfig(
  tenantId: number,
  provisioning: ProvisioningConfig
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT config_json FROM tenants WHERE id = ? LIMIT 1',
    [tenantId]
  );
  const row = Array.isArray(rows) ? (rows as { config_json: unknown }[])[0] : null;
  const config = (row?.config_json && typeof row.config_json === 'object'
    ? { ...(row.config_json as Record<string, unknown>) }
    : {}) as Record<string, unknown>;

  config.provisioning = provisioning;

  await pool.query('UPDATE tenants SET config_json = ?, updated_at = NOW() WHERE id = ?', [
    JSON.stringify(config),
    tenantId,
  ]);
}

/**
 * Retorna o status de provisionamento do tenant (se existir).
 */
export async function getTenantProvisioningStatus(tenantId: number): Promise<ProvisioningConfig | null> {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT config_json FROM tenants WHERE id = ? LIMIT 1',
    [tenantId]
  );
  const row = Array.isArray(rows) ? (rows as { config_json: unknown }[])[0] : null;
  const config = row?.config_json;
  if (!config || typeof config !== 'object') return null;
  const prov = (config as Record<string, unknown>).provisioning;
  if (!prov || typeof prov !== 'object') return null;
  return prov as ProvisioningConfig;
}

/**
 * Retorna logs dos serviços do stack (postgres, portal_admin = Docker; radius = systemd no host).
 */
export async function getTenantStackLogs(
  tenantId: number,
  serviceKey: 'portal' | 'radius' | 'postgres' | 'all',
  tail = 100
): Promise<{ success: boolean; message: string; stdout: string; stderr: string }> {
  const provisioning = await getTenantProvisioningStatus(tenantId);
  if (!provisioning?.stackPath) {
    return { success: false, message: 'Tenant sem stack provisionado.', stdout: '', stderr: '' };
  }
  const slug = path.basename(provisioning.stackPath);
  const parts: string[] = [];

  const stackPath = provisioning.stackPath;
  function addRadiusLogs() {
    try {
      const out = execSync(`journalctl -u freeradius-tenant@${slug} -n ${tail} --no-pager`, { encoding: 'utf8', maxBuffer: 512 * 1024 });
      parts.push(`=== freeradius-tenant@${slug} (systemd) ===\n${out || '(vazio)'}`);
    } catch {
      const logPath = path.join(stackPath, 'radius', 'log', 'radius.log');
      try {
        const out = execSync(`tail -n ${tail} "${logPath}"`, { encoding: 'utf8', maxBuffer: 512 * 1024 });
        parts.push(`=== ${logPath} ===\n${out || '(vazio)'}`);
      } catch {
        parts.push(`=== RADIUS (tenant ${slug}) ===\n(journalctl ou arquivo de log não disponível)`);
      }
    }
  }

  if (serviceKey === 'radius' || serviceKey === 'all') addRadiusLogs();
  if (serviceKey !== 'radius') {
    const containers = serviceKey === 'portal' ? [`portal_${slug}`] : serviceKey === 'postgres' ? [`pg_${slug}`] : [`pg_${slug}`, `portal_${slug}`];
    for (const c of containers) {
      const r = await dockerLogs(c, tail);
      const out = (r.stdout || '') + (r.stderr ? '\n' + r.stderr : '');
      if (out.trim()) parts.push(`=== ${c} ===\n${out}`);
      else if (!r.success && r.stderr) parts.push(`=== ${c} (erro) ===\n${r.stderr}`);
    }
  }

  const combined = parts.join('\n\n');
  return {
    success: true,
    message: 'OK',
    stdout: combined || '(Nenhum log disponível.)',
    stderr: '',
  };
}

/**
 * Reinicia o stack do tenant (Docker: portal, postgres; host: radius via systemd).
 */
export async function restartTenantStack(
  tenantId: number,
  services?: ('portal' | 'radius' | 'postgres')[]
): Promise<{ success: boolean; message: string; log: string }> {
  const provisioning = await getTenantProvisioningStatus(tenantId);
  if (!provisioning?.stackPath) {
    return { success: false, message: 'Tenant sem stack provisionado.', log: '' };
  }
  const slug = path.basename(provisioning.stackPath);
  const logParts: string[] = [];

  const toRestart = services && services.length ? services : (['portal', 'radius', 'postgres'] as const);
  if (toRestart.includes('radius')) {
    try {
      execSync(`systemctl restart freeradius-tenant@${slug}`, { stdio: 'pipe' });
      logParts.push(`freeradius-tenant@${slug}: reiniciado.`);
    } catch (e) {
      logParts.push(`freeradius-tenant@${slug}: ${(e as Error).message}`);
    }
  }
  const dockerSvcs = toRestart.filter((s) => s !== 'radius').map((s) => (s === 'portal' ? 'portal_admin' : 'postgres'));
  if (dockerSvcs.length > 0) {
    const result = await dockerComposeRestart(provisioning.stackPath, dockerSvcs as ('portal_admin' | 'postgres')[]);
    logParts.push(result.stdout || '', result.stderr || '');
  }

  const log = logParts.join('\n');
  const success = !log.includes('Error') && !log.includes('error');
  if (!success) {
    await updateTenantProvisioningStatus(
      tenantId,
      'error',
      provisioning.stackPath,
      provisioning.ports,
      provisioning.radiusSecret,
      log.slice(-500)
    );
  }
  return { success, message: success ? 'Reiniciado.' : 'Falha em algum serviço.', log };
}

/**
 * Desprovisiona o stack do tenant: docker compose down e remove a pasta.
 * Limpa config_json.provisioning e opcionalmente marca tenant como CANCELLED.
 */
export async function deprovisionTenantStack(tenantId: number): Promise<{ success: boolean; message: string; log: string[] }> {
  const log: string[] = [];
  const provisioning = await getTenantProvisioningStatus(tenantId);
  if (!provisioning?.stackPath) {
    return { success: true, message: 'Nenhum stack provisionado para este tenant.', log };
  }

  const stackPath = provisioning.stackPath;
  const slug = path.basename(stackPath);
  log.push(`[Deprovision] Derrubando stack em ${stackPath}`);

  try {
    execSync(`systemctl stop freeradius-tenant@${slug}`, { stdio: 'pipe' });
    execSync(`systemctl disable freeradius-tenant@${slug}`, { stdio: 'pipe' });
    log.push(`[Deprovision] FreeRADIUS (systemd) parado e desabilitado.`);
  } catch (e) {
    log.push(`[Deprovision] Aviso: systemd freeradius-tenant@${slug}: ${(e as Error).message}`);
  }

  const downResult = await dockerComposeDown(stackPath);
  log.push(downResult.stdout);
  if (downResult.stderr) log.push(`stderr: ${downResult.stderr}`);

  try {
    await fs.rm(stackPath, { recursive: true, force: true });
    log.push('[Deprovision] Pasta removida.');
  } catch (e) {
    log.push(`[Deprovision] Aviso: não foi possível remover a pasta: ${(e as Error).message}`);
  }

  const pool = getPool();
  const [rows] = await pool.query('SELECT config_json FROM tenants WHERE id = ? LIMIT 1', [tenantId]);
  const row = Array.isArray(rows) ? (rows as { config_json: unknown }[])[0] : null;
  const config = (row?.config_json && typeof row.config_json === 'object'
    ? { ...(row.config_json as Record<string, unknown>) }
    : {}) as Record<string, unknown>;
  delete config.provisioning;
  delete config.radius;
  await pool.query('UPDATE tenants SET config_json = ?, updated_at = NOW() WHERE id = ?', [
    JSON.stringify(config),
    tenantId,
  ]);
  log.push('[Deprovision] config_json.provisioning e radius limpos.');

  return { success: true, message: 'Stack derrubado e pasta removida.', log };
}
