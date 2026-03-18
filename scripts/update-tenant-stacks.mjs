#!/usr/bin/env node
/**
 * Atualiza o app (portal + API) nos containers Docker dos tenants provisionados.
 * Rebuild da imagem portal_admin a partir do código atual e reinício do container.
 * Use após adicionar novas rotas de API (ex.: /api/portal/contract-templates) ou
 * alterações no Node/TypeScript que precisem estar nos containers.
 *
 * Uso:
 *   node scripts/update-tenant-stacks.mjs              — build + up em todos os tenants
 *   node scripts/update-tenant-stacks.mjs tp           — só o tenant tp
 *   node scripts/update-tenant-stacks.mjs --skip-build — só reinicia (não reconstrói)
 *   node scripts/update-tenant-stacks.mjs --build-only — só roda npm run build no host (útil antes de --skip-build em outro passo)
 *
 * Requer: .env com DB_* (banco central). Migrações nos bancos dos tenants devem
 * ser feitas separadamente: npm run update-databases -- --tenants [slug]
 */
import 'dotenv/config';
import pg from 'pg';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP_CONTEXT = process.env.PROVISION_APP_CONTEXT || ROOT;

async function main() {
  const args = process.argv.slice(2);
  const slugArg = args.find((a) => !a.startsWith('--'));
  const skipBuild = args.includes('--skip-build');
  const buildOnly = args.includes('--build-only');

  if (buildOnly) {
    console.log('Build do app no host:', APP_CONTEXT);
    execSync('npm run build', { cwd: APP_CONTEXT, stdio: 'inherit' });
    console.log('Concluído. Rode sem --build-only para atualizar os containers.');
    return;
  }

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

  if (!skipBuild) {
    console.log('Build do app no host:', APP_CONTEXT);
    try {
      execSync('npm run build', { cwd: APP_CONTEXT, stdio: 'inherit' });
    } catch (err) {
      console.error('Falha no build. Corrija e rode de novo.');
      process.exit(1);
    }
    console.log('');
  }

  console.log('Atualizando stack (portal_admin) para:', toUpdate.map((t) => t.slug).join(', '));

  for (const t of toUpdate) {
    const stackPath = t.config_json?.provisioning?.stackPath;
    if (!stackPath) continue;

    try {
      if (!skipBuild) {
        try {
          execSync('docker compose build --no-cache portal_admin', {
            cwd: stackPath,
            stdio: 'inherit',
          });
        } catch (buildErr) {
          // Tenant pode usar só image: (PROVISION_PORTAL_ADMIN_IMAGE) sem build; aí só reinicia
          console.warn('  [AVISO]', t.slug, '— build falhou (compose sem build?). Reconstrua a imagem manualmente ou use --skip-build.');
        }
      }
      execSync(skipBuild ? 'docker compose up -d --force-recreate portal_admin' : 'docker compose up -d portal_admin', {
        cwd: stackPath,
        stdio: 'inherit',
      });
      console.log('  [OK]', t.slug);
    } catch (err) {
      console.error('  [ERRO]', t.slug, err.message);
    }
  }

  console.log('\nConcluído. Lembre de rodar migrações nos bancos dos tenants se precisar:');
  console.log('  npm run update-databases -- --tenants' + (slugArg ? ' ' + slugArg : ''));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
