#!/usr/bin/env node
/**
 * Gera o arquivo Nginx com os tenants por path e opcionalmente recarrega o Nginx.
 * Usa o mesmo .env do app (DB_*). O arquivo gerado deve ser incluído no server {} do Nginx.
 *
 * Uso:
 *   node scripts/update-nginx-tenants.mjs
 *   node scripts/update-nginx-tenants.mjs --reload
 *   node scripts/update-nginx-tenants.mjs --out /etc/nginx/sites-available/multi-portal-tenants.conf --reload
 *
 * Variáveis de ambiente:
 *   NGINX_TENANTS_CONF — caminho do arquivo a ser escrito (default: nginx-tenants.conf na raiz do projeto)
 *   DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME — conexão PostgreSQL (igual ao app)
 *
 * No Nginx, inclua o arquivo dentro do server {} (uma vez só):
 *   include /caminho/para/multi-portal-tenants.conf;
 */
import 'dotenv/config';
import pg from 'pg';
import { writeFile } from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function buildBlock(slug, sitePort, adminPort) {
  return [
    `    # Tenant: ${slug} — acesso por path (sem DNS)`,
    `    location /${slug}/portal/ {`,
    `        proxy_pass http://127.0.0.1:${adminPort}/portal/;`,
    `        proxy_http_version 1.1;`,
    `        proxy_set_header Host $host;`,
    `        proxy_set_header X-Real-IP $remote_addr;`,
    `        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
    `        proxy_set_header X-Forwarded-Proto $scheme;`,
    `        proxy_set_header X-Forwarded-Prefix /${slug}/portal/;`,
    `        proxy_set_header Upgrade $http_upgrade;`,
    `        proxy_set_header Connection "upgrade";`,
    `    }`,
    `    location /${slug}/ {`,
    `        proxy_pass http://127.0.0.1:${adminPort}/;`,
    `        proxy_set_header Host $host;`,
    `        proxy_set_header X-Real-IP $remote_addr;`,
    `        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
    `        proxy_set_header X-Forwarded-Proto $scheme;`,
    `        proxy_set_header X-Forwarded-Prefix /${slug}/;`,
    `        # Se CSS/JS quebrarem em subpath, descomente e ajuste:`,
    `        # sub_filter_once off; sub_filter 'href="/' 'href="/${slug}/'; sub_filter 'src="/' 'src="/${slug}/';`,
    `    }`,
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const doReload = args.includes('--reload');
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 && args[outIdx + 1]
    ? args[outIdx + 1]
    : process.env.NGINX_TENANTS_CONF || path.join(rootDir, 'nginx-tenants.conf');

  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME,
  };
  if (!config.user || !config.database) {
    console.error('Defina DB_USER e DB_NAME no .env');
    process.exit(1);
  }

  const client = new pg.Client(config);
  await client.connect();

  const { rows } = await client.query(
    'SELECT slug, config_json FROM tenants WHERE config_json IS NOT NULL ORDER BY slug'
  );
  await client.end();

  const included = [];
  const skipped = [];
  for (const r of rows) {
    const prov = r.config_json?.provisioning;
    const ports = prov?.ports;
    const sitePort = ports?.sitePort;
    const adminPort = ports?.adminPort ?? null;
    if (sitePort == null) continue;
    if (adminPort == null) {
      skipped.push({ slug: r.slug, reason: 'adminPort não definido' });
      continue;
    }
    included.push({ slug: r.slug, sitePort, adminPort });
  }

  const blocks = included.map((t) => buildBlock(t.slug, t.sitePort, t.adminPort));
  const content = blocks.length
    ? [
        '# Multi-Portal — tenants por path (gerado por scripts/update-nginx-tenants.mjs)',
        '# Inclua este arquivo dentro do server {} do Nginx: include /caminho/para/este/arquivo.conf;',
        '# Ordem: location /slug/portal/ antes de location /slug/ para cada tenant.',
        '',
        blocks.join('\n\n'),
        '',
      ].join('\n')
    : '# Nenhum tenant com sitePort e adminPort. Rode o provisionamento para novos tenants.\n';

  await writeFile(outPath, content, 'utf8');
  console.log('Escrito:', outPath, `(${included.length} tenant(s))`);
  if (skipped.length) {
    console.log('Omitidos:', skipped.map((s) => `${s.slug} (${s.reason})`).join(', '));
  }

  if (doReload) {
    try {
      execSync('nginx -t', { stdio: 'inherit' });
      execSync('systemctl reload nginx', { stdio: 'inherit' });
      console.log('Nginx recarregado.');
    } catch (e) {
      console.error('Falha ao testar/recarregar Nginx:', e.message);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
