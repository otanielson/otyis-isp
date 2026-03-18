#!/usr/bin/env node
/**
 * Exporta modelos para um novo provedor.
 * Cria a estrutura do tenant com site, postgres init, radius (templates).
 *
 * Uso:
 *   node scripts/export-provider.mjs --slug otyisisp --name "Oty ISP"
 *   node scripts/export-provider.mjs --slug bibi --name "Bibi Net" --domain bibi.com.br
 *
 * Opções:
 *   --slug    Slug do provedor (obrigatório)
 *   --name    Nome do provedor (obrigatório)
 *   --domain  Domínio (opcional)
 *   --out     Diretório de saída (default: ./export/<slug>)
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PLACEHOLDERS = ['PROVIDER_NAME', 'PROVIDER_SLUG', 'PROVIDER_DOMAIN', 'BASE_PATH'];

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { out: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--slug' && args[i + 1]) opts.slug = args[++i];
    else if (args[i] === '--name' && args[i + 1]) opts.name = args[++i];
    else if (args[i] === '--domain' && args[i + 1]) opts.domain = args[++i];
    else if (args[i] === '--out' && args[i + 1]) opts.out = args[++i];
  }
  return opts;
}

function replacePlaceholders(content, vars) {
  let out = content;
  for (const [key, val] of Object.entries(vars)) {
    out = out.replace(new RegExp(`{{${key}}}`, 'g'), val ?? '');
  }
  return out;
}

const BASE_TAG_SCRIPT = '<base id="__base" href="/"><script>var __BP=(function(){var p=location.pathname.replace(/\\/$/,\'\')||\'/\';var m=p.match(/^\\/([a-z0-9_-]+)(?:\\/|$)/i);return m?(\'/\'+m[1]+\'/\'):\'/\';})();var b=document.getElementById(\'__base\');if(b)b.href=__BP;</script>';

/** Aplica substituições para path-based routing. Com tenant-agnostic, usa paths relativos + base tag para funcionar com qualquer tenant. */
function applyBasePath(content, basePath, tenantAgnostic = true) {
  if (!basePath || basePath === '/') return content;
  let out = content;
  out = out.replace(/href="\//g, `href="${basePath}`);
  out = out.replace(/src="\//g, `src="${basePath}`);
  out = out.replace(/'\/api\//g, `'${basePath}api/`);
  out = out.replace(/fetch\s*\(\s*['"]\//g, `fetch('${basePath}`);
  out = out.replace(/Multi Telecom/g, '{{PROVIDER_NAME}}');
  if (tenantAgnostic) {
    const escaped = basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`href="${escaped}`, 'g'), 'href="');
    out = out.replace(new RegExp(`src="${escaped}`, 'g'), 'src="');
    if (out.includes('<head>')) out = out.replace('<head>', '<head>\n  ' + BASE_TAG_SCRIPT);
    else if (out.includes('<head ')) out = out.replace(/<head\s[^>]*>/, (m) => m + '\n  ' + BASE_TAG_SCRIPT);
  }
  return out;
}

async function walkDir(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full);
    if (e.isDirectory()) {
      files.push(...(await walkDir(full, base)));
    } else {
      files.push(rel);
    }
  }
  return files;
}

async function exportSiteModel(outDir, vars, basePath) {
  const modelDir = path.join(ROOT, 'models', 'site');
  const webAssets = path.join(ROOT, 'web', 'assets');

  const files = await walkDir(modelDir);
  for (const rel of files) {
    const src = path.join(modelDir, rel);
    const dest = path.join(outDir, 'site', 'static', rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    let content = await fs.readFile(src, 'utf8');
    content = replacePlaceholders(content, vars);
    await fs.writeFile(dest, content, 'utf8');
  }

  // Copiar assets (CSS, JS) do web/ que não estão no model
  const assetDirs = ['css', 'js'];
  for (const sub of assetDirs) {
    const srcDir = path.join(webAssets, sub);
    const destDir = path.join(outDir, 'site', 'static', 'assets', sub);
    try {
      const entries = await fs.readdir(srcDir, { withFileTypes: true });
      await fs.mkdir(destDir, { recursive: true });
      for (const e of entries) {
        if (e.isFile()) {
          const src = path.join(srcDir, e.name);
          const dest = path.join(destDir, e.name);
          await fs.copyFile(src, dest);
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  // Copiar páginas adicionais do web/ (planos, assinar, noticias, clube, cliente)
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
  for (const p of extraPages) {
    const src = path.join(ROOT, 'web', p);
    const dest = path.join(outDir, 'site', 'static', p);
    try {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      let content = await fs.readFile(src, 'utf8');
      content = applyBasePath(content, basePath);
      content = replacePlaceholders(content, vars);
      await fs.writeFile(dest, content, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`Aviso: não foi possível copiar ${p}:`, err.message);
      }
    }
  }
}

async function main() {
  const opts = parseArgs();
  if (!opts.slug || !opts.name) {
    console.error('Uso: node scripts/export-provider.mjs --slug <slug> --name "<nome>" [--domain <dominio>] [--out <dir>]');
    process.exit(1);
  }

  const outDir = opts.out || path.join(ROOT, 'export', opts.slug);
  const basePath = `/${opts.slug}/`;

  const vars = {
    PROVIDER_NAME: opts.name,
    PROVIDER_SLUG: opts.slug,
    PROVIDER_DOMAIN: opts.domain || '',
    BASE_PATH: basePath,
  };

  console.log(`Exportando provedor: ${opts.name} (${opts.slug})`);
  console.log(`Saída: ${outDir}`);

  await fs.mkdir(outDir, { recursive: true });

  // 1. Site
  await exportSiteModel(outDir, vars, basePath);
  console.log('  [OK] Site modelo exportado');

  // 2. Postgres init (02-tenant.sql)
  const postgresInit = path.join(outDir, 'postgres', 'init');
  await fs.mkdir(postgresInit, { recursive: true });
  const tenantSql = `-- Tenant do stack (id=1)
UPDATE tenants SET slug = '${opts.slug.replace(/'/g, "''")}', name = '${opts.name.replace(/'/g, "''")}' WHERE id = 1;
`;
  await fs.writeFile(path.join(postgresInit, '02-tenant.sql'), tenantSql, 'utf8');
  console.log('  [OK] Postgres init (02-tenant.sql)');

  // 3. README do export
  const readme = `# Export: ${opts.name} (${opts.slug})
Gerado em ${new Date().toISOString()}

## Estrutura

- site/static/ — Site institucional (HTML, assets)
- postgres/init/ — 02-tenant.sql (schema vem da imagem modelo)

## Próximos passos

1. Copie esta pasta para o host de provisionamento (ex: /srv/tenants/${opts.slug})
2. Execute o provisionamento via API ou use docker-compose manualmente
3. O provisionamento gerará: .env, docker-compose.yml, radius/
`;
  await fs.writeFile(path.join(outDir, 'README.md'), readme, 'utf8');

  console.log('');
  console.log('Export concluído. Use o provisionamento para gerar .env, docker-compose e radius.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
