#!/usr/bin/env node
/**
 * Atualiza a configuração do FreeRADIUS nos stacks dos tenants provisionados.
 * Aplica: group_attribute antes do $INCLUDE em mods/sql (corrige "${group_attribute} not found"),
 * clients.conf com require_message_authenticator = no e limit_proxy_state = false (BlastRADIUS).
 *
 * Uso:
 *   node scripts/update-tenant-radius.mjs              — atualiza todos os tenants provisionados
 *   node scripts/update-tenant-radius.mjs tp          — só o tenant tp
 *   node scripts/update-tenant-radius.mjs --no-restart — não reinicia o container freeradius
 *
 * Requer: .env com DB_* (banco central). Rode no host onde estão as pastas dos stacks.
 */
import 'dotenv/config';
import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseEnv(content) {
  const out = {};
  for (const line of (content || '').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function generateRadiusSqlMod(dbName, dbUser, dbPassword, postgresHost, postgresPort = 5432) {
  const escaped = dbPassword.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `# SQL module — PostgreSQL (gerado pelo SaaS). RADIUS no host → 127.0.0.1:port

sql {
\tdialect = "postgresql"
\tdriver = "rlm_sql_postgresql"

\t# Conexão com o Postgres do tenant
\tradius_db = "dbname=${dbName} host=${postgresHost} port=${postgresPort} user=${dbUser} password=${escaped}"

\t# Tabela de NAS/clients usada pelo FreeRADIUS (necessária para \${client_table} em queries.conf)
\tclient_table = "nas"

\tacct_table1 = "radacct"
\tacct_table2 = "radacct"
\tpostauth_table = "radpostauth"
\tauthcheck_table = "radcheck"
\tgroupcheck_table = "radgroupcheck"
\tauthreply_table = "radreply"
\tgroupreply_table = "radgroupreply"
\tusergroup_table = "radusergroup"
\t# Obrigatório antes do $INCLUDE queries.conf (ele referencia \${group_attribute})
\tgroup_attribute = "SQL-Group"

\t\$INCLUDE \${modconfdir}/sql/driver/postgresql
\t\$INCLUDE \${modconfdir}/sql/main/postgresql/queries.conf

\tpool {
\t\tstart = 0
\t\tmin = 1
\t\tmax = 32
\t}
}
`;
}

function generateRadiusClientsConf(radiusSecret, slug) {
  return `# Aceita qualquer NAS (configure IPs em produção)
# require_message_authenticator = no + limit_proxy_state = false: evita BlastRADIUS rejeitar teste do portal e NAS que não enviam Message-Authenticator/Proxy-State.
client mikrotik_${slug} {
  ipaddr = 0.0.0.0
  netmask = 0
  secret = ${radiusSecret}
  shortname = ${slug}
  require_message_authenticator = no
  limit_proxy_state = false
}
`;
}

function generateRadiusdConf(radiusDirPath) {
  return `# FreeRADIUS — config mínima por tenant (gerado pelo SaaS). Roda no host (systemd).
prefix = ${radiusDirPath}
logdir = \${prefix}/log
run_dir = \${prefix}/run
modconfdir = \${prefix}/mods-config
$INCLUDE clients.conf
$INCLUDE mods-enabled/
$INCLUDE sites-enabled/
`;
}

function generateRadiusDefaultSite() {
  return `# Site default — estrutura plana (gerado pelo SaaS). post-auth sql grava em radpostauth.
server default {
\tnamespace = radius

\tlisten {
\t\ttype = auth
\t\tipaddr = *
\t\tport = 0
\t}
\tlisten {
\t\ttype = acct
\t\tipaddr = *
\t\tport = 0
\t}

\tauthorize {
\t\tpreprocess
\t\tsql
\t\tpap
\t}
\tauthenticate {
\t\tAuth-Type PAP {
\t\t\tpap
\t\t}
\t}
\tpost-auth {
\t\tsql
\t}
\taccounting {
\t\tsql
\t}
}
`;
}

async function main() {
  const args = process.argv.slice(2);
  const slugArg = args.find((a) => !a.startsWith('--'));
  const noRestart = args.includes('--no-restart');

  const pool = new pg.Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME,
  });

  let tenants = [];
  try {
    const res = await pool.query(
      `SELECT id, slug, name, config_json FROM tenants WHERE status = 'ACTIVE' ORDER BY slug`
    );
    tenants = res.rows || [];
  } catch (err) {
    console.error('Erro ao listar tenants:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }

  const provisioned = tenants.filter((t) => {
    const cfg = t.config_json && typeof t.config_json === 'object' ? t.config_json : {};
    const prov = cfg?.provisioning;
    return prov && typeof prov === 'object' && prov.stackPath;
  });

  let toUpdate = provisioned;
  if (slugArg && slugArg.length > 0) {
    toUpdate = provisioned.filter((t) => t.slug === slugArg);
    if (toUpdate.length === 0) {
      console.error('Tenant "' + slugArg + '" não encontrado ou sem stack provisionado.');
      process.exit(1);
    }
  }

  if (toUpdate.length === 0) {
    console.log('Nenhum tenant provisionado encontrado.');
    return;
  }

  console.log('Atualizando configuração RADIUS para:', toUpdate.map((t) => t.slug).join(', '));
  console.log('');

  for (const t of toUpdate) {
    const stackPath = t.config_json?.provisioning?.stackPath;
    const prov = t.config_json?.provisioning || {};
    const radiusCfg = t.config_json?.radius || {};
    if (!stackPath) continue;

    let dbName = prov.dbName || null;
    let dbUser = prov.dbUser || null;
    let dbPassword = prov.dbPass || null;
    let radiusSecret = radiusCfg.secret || null;

    const envPath = path.join(stackPath, '.env');
    try {
      const envContent = await fs.readFile(envPath, 'utf8');
      const env = parseEnv(envContent);
      dbName = dbName || env.PG_DB || env.DB_NAME;
      dbUser = dbUser || env.PG_USER || env.DB_USER;
      dbPassword = dbPassword || env.PG_PASS || env.DB_PASS;
      radiusSecret = radiusSecret || env.RADIUS_SECRET;
    } catch (e) {
      console.warn('  [AVISO]', t.slug, '— não foi possível ler .env do stack:', envPath);
      continue;
    }

    if (!dbName || !dbUser || !radiusSecret) {
      console.warn('  [AVISO]', t.slug, '— falta PG_DB/PG_USER no .env ou radius.secret no config_json');
      continue;
    }
    if (!dbPassword) {
      console.warn('  [AVISO]', t.slug, '— PG_PASS não definido no .env');
    }

    const postgresHost = '127.0.0.1';
    const pgPort = Number(prov.ports?.pgHostPort ?? env.PG_HOST_PORT ?? env.DB_PORT ?? 5432);
    const radiusDir = path.join(stackPath, 'radius');
    const modsAvailable = path.join(radiusDir, 'mods-available', 'sql');
    const modsEnabled = path.join(radiusDir, 'mods-enabled', 'sql');
    const clientsConfPath = path.join(radiusDir, 'clients.conf');
    const siteAvailable = path.join(radiusDir, 'sites-available', 'default');
    const siteEnabled = path.join(radiusDir, 'sites-enabled', 'default');

    try {
      await fs.mkdir(path.join(radiusDir, 'mods-available'), { recursive: true });
      await fs.mkdir(path.join(radiusDir, 'mods-enabled'), { recursive: true });
      await fs.mkdir(path.join(radiusDir, 'sites-available'), { recursive: true });
      await fs.mkdir(path.join(radiusDir, 'sites-enabled'), { recursive: true });
      await fs.mkdir(path.join(radiusDir, 'log'), { recursive: true });
      await fs.mkdir(path.join(radiusDir, 'run'), { recursive: true });

      const radiusdConfContent = generateRadiusdConf(radiusDir);
      await fs.writeFile(path.join(radiusDir, 'radiusd.conf'), radiusdConfContent, 'utf8');

      const sqlModContent = generateRadiusSqlMod(dbName, dbUser, dbPassword || '', postgresHost, pgPort);
      await fs.writeFile(modsAvailable, sqlModContent, 'utf8');
      await fs.writeFile(modsEnabled, sqlModContent, 'utf8');

      const clientsContent = generateRadiusClientsConf(radiusSecret, t.slug);
      await fs.writeFile(clientsConfPath, clientsContent, 'utf8');

      const defaultSiteContent = generateRadiusDefaultSite();
      await fs.writeFile(siteAvailable, defaultSiteContent, 'utf8');
      await fs.writeFile(siteEnabled, defaultSiteContent, 'utf8');

      console.log('  [OK]', t.slug, '— radiusd.conf + mods/sql + clients.conf + site default atualizados');

      if (!noRestart) {
        try {
          execSync(`systemctl restart freeradius-tenant@${t.slug}`, { stdio: 'pipe' });
          console.log('  [OK]', t.slug, '— FreeRADIUS (systemd) reiniciado');
        } catch (restartErr) {
          console.warn('  [AVISO]', t.slug, '— falha ao reiniciar freeradius-tenant@' + t.slug + ':', restartErr.message);
        }
      }
    } catch (err) {
      console.error('  [ERRO]', t.slug, err.message);
    }
  }

  console.log('');
  console.log('Concluído.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
