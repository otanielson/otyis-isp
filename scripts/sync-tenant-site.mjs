#!/usr/bin/env node
/**
 * Sincroniza assets do site (JS, CSS) para o(s) tenant(s).
 * Útil após atualizar include.js ou outros assets que afetam o base path.
 *
 * Uso: node scripts/sync-tenant-site.mjs [slug]
 *      node scripts/sync-tenant-site.mjs        — sincroniza todos os tenants
 *      node scripts/sync-tenant-site.mjs git   — sincroniza só o tenant git
 */
import { readdir, copyFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const webDir = path.join(rootDir, 'web');
const webAssets = path.join(webDir, 'assets');

const tenantsBase = process.env.TENANTS_BASE_PATH || (process.platform === 'win32' ? 'C:\\srv\\tenants' : '/srv/tenants');

async function syncAssetsToTenant(slug) {
  const tenantStatic = path.join(tenantsBase, slug, 'site', 'static');
  const destCss = path.join(tenantStatic, 'assets', 'css');
  const destJs = path.join(tenantStatic, 'assets', 'js');
  try {
    await mkdir(destCss, { recursive: true });
    await mkdir(destJs, { recursive: true });
  } catch (e) {
    console.error(`  [${slug}] Pasta não existe: ${tenantStatic}`);
    return false;
  }
  let count = 0;
  for (const sub of ['css', 'js']) {
    const srcDir = path.join(webAssets, sub);
    const destDir = path.join(tenantStatic, 'assets', sub);
    try {
      const entries = await readdir(srcDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile()) {
          await copyFile(path.join(srcDir, e.name), path.join(destDir, e.name));
          count++;
        }
      }
    } catch (err) {
      console.error(`  [${slug}] Erro em ${sub}:`, err.message);
    }
  }
  console.log(`  [${slug}] ${count} arquivo(s) sincronizado(s)`);
  return true;
}

async function main() {
  const slug = process.argv[2];
  let slugs = [];
  if (slug) {
    slugs = [slug];
  } else {
    try {
      const entries = await readdir(tenantsBase, { withFileTypes: true });
      slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (e) {
      console.error('Erro ao listar tenants:', e.message);
      process.exit(1);
    }
  }
  if (slugs.length === 0) {
    console.log('Nenhum tenant encontrado.');
    return;
  }
  console.log('Sincronizando assets para:', slugs.join(', '));
  for (const s of slugs) {
    await syncAssetsToTenant(s);
  }
  console.log('Concluído.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
