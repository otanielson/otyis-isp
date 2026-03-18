#!/usr/bin/env node
/**
 * Atualiza os arquivos do site (HTML + assets) e portal para todos os tenants já provisionados.
 * Usa web/ e models/site como fonte, com paths tenant-agnostic (base tag + relativos).
 *
 * Uso: node scripts/update-tenant-sites.mjs [slug] [--restart] [--force-recreate]
 *      node scripts/update-tenant-sites.mjs        — atualiza todos os tenants provisionados
 *      node scripts/update-tenant-sites.mjs tk     — atualiza só o tenant tk
 *      node scripts/update-tenant-sites.mjs tk --restart  — atualiza e reinicia o container
 *      node scripts/update-tenant-sites.mjs tk --force-recreate  — recria o container (necessário quando novo volume foi adicionado)
 *
 * Requer: .env (DB_* para banco central)
 */
import 'dotenv/config';
import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BASE_TAG_SCRIPT = '<base id="__base" href="/"><script>var __BP=(function(){var p=location.pathname.replace(/\\/$/,\'\')||\'/\';var m=p.match(/^\\/([a-z0-9_-]+)(?:\\/|$)/i);return m?(\'/\'+m[1]+\'/\'):\'/\';})();var b=document.getElementById(\'__base\');if(b)b.href=__BP;</script>';

function replacePlaceholders(content, vars) {
  let out = content;
  for (const [key, val] of Object.entries(vars)) {
    out = out.replace(new RegExp(`{{${key}}}`, 'g'), val ?? '');
  }
  return out;
}

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

async function copySiteToStack(stackPath, vars, basePath) {
  const modelsSite = path.join(ROOT, 'models', 'site');
  const webDir = path.join(ROOT, 'web');
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

  // Portal admin (dashboard, login) — montado no container para atualizar sem rebuild
  const portalDir = path.join(ROOT, 'web', 'portal');
  const outPortal = path.join(stackPath, 'portal');
  try {
    await fs.mkdir(outPortal, { recursive: true });
    const portalFiles = await walkDir(portalDir, portalDir);
    for (const rel of portalFiles) {
      const src = path.join(portalDir, rel);
      const dest = path.join(outPortal, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      let content = await fs.readFile(src, 'utf8');
      content = replacePlaceholders(content, vars);
      await fs.writeFile(dest, content, 'utf8');
    }
  } catch (err) {
    console.warn('  Aviso portal:', err.message);
  }

  try {
    const modelFiles = await walkDir(modelsSite, modelsSite);
    for (const rel of modelFiles) {
      const src = path.join(modelsSite, rel);
      const dest = path.join(outStatic, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      let content = await fs.readFile(src, 'utf8');
      content = replacePlaceholders(content, vars);
      await fs.writeFile(dest, content, 'utf8');
    }
  } catch (err) {
    console.warn('  Aviso models/site:', err.message);
  }

  for (const sub of ['css', 'js']) {
    const srcDir = path.join(webAssets, sub);
    const destDir = path.join(outStatic, 'assets', sub);
    try {
      await fs.mkdir(destDir, { recursive: true });
      const entries = await fs.readdir(srcDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile()) {
          await fs.copyFile(path.join(srcDir, e.name), path.join(destDir, e.name));
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('  Aviso assets/' + sub + ':', err.message);
    }
  }

  for (const p of extraPages) {
    const src = path.join(webDir, p);
    const dest = path.join(outStatic, p);
    try {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      let content = await fs.readFile(src, 'utf8');
      content = applyBasePath(content, basePath);
      content = replacePlaceholders(content, vars);
      await fs.writeFile(dest, content, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('  Aviso ' + p + ':', err.message);
    }
  }
}

/** Adiciona volume do portal ao docker-compose se ainda não existir. Retorna true se alterou. */
async function ensurePortalVolume(stackPath) {
  const composePath = path.join(stackPath, 'docker-compose.yml');
  try {
    let content = await fs.readFile(composePath, 'utf8');
    if (content.includes('/app/web/portal')) return false;
    const siteStatic = '- ./site/static:/app/site/static:ro';
    const portalMount = '- ./portal:/app/web/portal:ro';
    if (!content.includes(siteStatic)) return false;
    content = content.replace(siteStatic, siteStatic + '\n      ' + portalMount);
    await fs.writeFile(composePath, content, 'utf8');
    return true;
  } catch (err) {
    console.warn('  Aviso compose:', err.message);
    return false;
  }
}

/** Reinicia ou recria o container portal_admin. Se composeChanged, recria para aplicar novo volume. */
function restartPortalContainer(stackPath, composeChanged) {
  try {
    if (composeChanged) {
      // Novo volume exige recriar o container (restart não aplica)
      execSync('docker compose up -d --force-recreate portal_admin', {
        cwd: stackPath,
        stdio: 'inherit',
      });
    } else {
      execSync('docker compose restart portal_admin', {
        cwd: stackPath,
        stdio: 'inherit',
      });
    }
  } catch (err) {
    console.warn('  Aviso restart:', err.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const slugArg = args.find((a) => !a.startsWith('--'));
  const doRestart = args.includes('--restart');
  const forceRecreate = args.includes('--force-recreate');

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
      console.error(`Tenant "${slugArg}" não encontrado ou sem stack provisionado.`);
      process.exit(1);
    }
  }

  if (toUpdate.length === 0) {
    console.log('Nenhum tenant provisionado encontrado.');
    return;
  }

  console.log('Atualizando site para:', toUpdate.map((t) => t.slug).join(', '));

  for (const t of toUpdate) {
    const stackPath = t.config_json?.provisioning?.stackPath;
    if (!stackPath) continue;
    const basePath = `/${t.slug}/`;
    const vars = {
      PROVIDER_NAME: t.name || t.slug,
      PROVIDER_SLUG: t.slug,
      PROVIDER_DOMAIN: '',
      BASE_PATH: basePath,
    };

    try {
      await copySiteToStack(stackPath, vars, basePath);
      const composeChanged = await ensurePortalVolume(stackPath);
      const needsRestart = doRestart || composeChanged || forceRecreate;
      if (needsRestart) {
        restartPortalContainer(stackPath, composeChanged || forceRecreate);
        console.log('  [OK]', t.slug, '->', stackPath, '(reiniciado)');
      } else {
        console.log('  [OK]', t.slug, '->', stackPath);
      }
    } catch (err) {
      console.error('  [ERRO]', t.slug, err.message);
    }
  }

  console.log('Concluído.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
