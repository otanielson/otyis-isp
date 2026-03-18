#!/usr/bin/env node
/**
 * Deploy na VPS — build, migrações, nginx e restart do app.
 *
 * Uso:
 *   node scripts/deploy.mjs
 *   node scripts/deploy.mjs --no-pull
 *   node scripts/deploy.mjs --no-migrate
 *   node scripts/deploy.mjs --no-nginx
 *
 * Opções:
 *   --no-pull    Não faz git pull (útil quando atualizou via rsync/scp)
 *   --no-migrate Não roda migrações SQL (banco central + tenants)
 *   --no-nginx   Não atualiza nginx-tenants.conf nem recarrega Nginx
 *
 * Requer: .env com DB_* (para migrações e nginx-tenants)
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const NO_PULL = args.includes('--no-pull');
const NO_MIGRATE = args.includes('--no-migrate');
const NO_NGINX = args.includes('--no-nginx');

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

async function main() {
  console.log('==============================================');
  console.log('  Multi-Portal — Deploy');
  console.log('==============================================');
  console.log('Diretório:', ROOT);
  console.log('');

  // 1. Git pull
  if (!NO_PULL && existsSync(path.join(ROOT, '.git'))) {
    console.log('[1/6] Git pull...');
    run('git pull');
  } else {
    console.log('[1/6] Git pull — pulado (--no-pull ou não é repositório git)');
  }

  // 2. npm install
  console.log('\n[2/6] npm install...');
  run('npm install');

  // 3. npm run build
  console.log('\n[3/6] npm run build...');
  run('npm run build');
  try {
    run('npm run build:portal-spa');
  } catch {
    console.warn('[AVISO] build:portal-spa falhou (portal SPA pode não estar atualizado)');
  }

  // 4. Migrações
  if (!NO_MIGRATE) {
    console.log('\n[4/6] Migrações SQL (central + tenants)...');
    run('npm run update-databases:tenants');
  } else {
    console.log('\n[4/6] Migrações — pulado (--no-migrate)');
  }

  // 5. Nginx tenants
  if (!NO_NGINX) {
    console.log('\n[5/6] Nginx tenants...');
    try {
      run('npm run nginx-tenants:reload');
      console.log('Nginx atualizado e recarregado.');
    } catch (e) {
      console.warn('[AVISO] Nginx tenants falhou. Rode manualmente: npm run nginx-tenants:reload');
    }
  } else {
    console.log('\n[5/6] Nginx — pulado (--no-nginx)');
  }

  // 6. Reiniciar app
  console.log('\n[6/6] Reiniciando aplicação...');
  try {
    execSync('pm2 describe multi-portal', { stdio: 'pipe', cwd: ROOT });
    run('pm2 restart multi-portal');
    console.log('PM2: multi-portal reiniciado.');
  } catch {
    try {
      execSync('systemctl is-active multi-portal', { stdio: 'pipe' });
      run('sudo systemctl restart multi-portal');
      console.log('systemd: multi-portal reiniciado.');
    } catch {
      console.warn('[AVISO] PM2 e systemd não encontrados. Reinicie o app manualmente.');
      console.warn('  Ex.: pm2 restart multi-portal');
      console.warn('  Ou:  sudo systemctl restart multi-portal');
    }
  }

  console.log('\n==============================================');
  console.log('  Deploy concluído.');
  console.log('==============================================');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
