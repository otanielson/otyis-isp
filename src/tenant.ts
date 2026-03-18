/**
 * SaaS: resolução de tenant por subdomínio, domínio ou header.
 * Use o middleware resolveTenant nas rotas que precisam de req.tenant.
 */
import type { Request, Response, NextFunction } from 'express';
import { getPool } from './db.js';

export interface TenantRadiusConfig {
  host: string;
  port?: number;
  secret: string;
  nasIp?: string;
}

export interface TenantConfig {
  radius?: TenantRadiusConfig;
  branding?: { companyName?: string; logoUrl?: string };
  adminKeyHash?: string;
  /** Preenchido quando o tenant tem stack provisionado (porta do site nginx e portal). */
  provisioning?: { ports?: { sitePort?: number; adminPort?: number } };
}

export interface Tenant {
  id: number;
  slug: string;
  name: string;
  status: string;
  config: TenantConfig | null;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant | null;
    }
  }
}

/** Slug válido: apenas letras, números, hífen, underscore. */
const SLUG_REGEX = /^[a-z0-9_-]+$/i;

/**
 * Resolve o tenant da requisição:
 * - Path: /{slug}/ ou /{slug}/... (ex: /cu/, /cu/planos.html)
 * - Header X-Tenant-Id ou X-Tenant-Slug
 * - Subdomínio (primeira parte do host antes do BASE_DOMAIN)
 * - custom_domain (host igual ao cadastrado)
 * Retorna null se não houver tenant (ou tenant inativo).
 */
export async function getTenantFromRequest(req: Request): Promise<Tenant | null> {
  let pool;
  try {
    pool = getPool();
  } catch {
    return null;
  }
  // Atrás de proxy (Nginx, etc.): use X-Forwarded-Host para o host real (ex: otaota.otyisisp.otnsoft.com.br)
  const hostRaw = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
  const host = hostRaw.split(',')[0].trim().split(':')[0].toLowerCase();
  const tenantId = req.headers['x-tenant-id'] as string | undefined;
  const tenantSlug = req.headers['x-tenant-slug'] as string | undefined;

  const pathPart = (req.path || req.url || '/').split('?')[0];
  const pathMatch = pathPart.match(/^\/([a-z0-9_-]+)(?:\/|$)/i);
  const pathSlug = pathMatch?.[1];
  const reserved = ['admin', 'api', 'portal'];
  const isPathBasedSlug = pathSlug && SLUG_REGEX.test(pathSlug) && !reserved.includes(pathSlug.toLowerCase());

  // Nginx rewrite remove o prefixo do path; X-Forwarded-Prefix traz /tk/ ou /tk/portal/
  const forwardedPrefix = (req.headers['x-forwarded-prefix'] as string) || '';
  const prefixMatch = forwardedPrefix.match(/^\/([a-z0-9_-]+)\/?/i);
  const prefixSlug = prefixMatch?.[1];
  const isPrefixBasedSlug = prefixSlug && SLUG_REGEX.test(prefixSlug) && !reserved.includes(prefixSlug.toLowerCase());

  const isStandalone = /^1|true|yes$/i.test(String(process.env.STANDALONE || '').trim());
  const envTenantId = process.env.TENANT_ID ? Number(process.env.TENANT_ID) : null;
  const envTenantSlug = (process.env.TENANT_SLUG || '').trim();

  try {
    // Standalone: uma VPS = um provedor → sempre tentar primeiro o tenant id=1 (página do provedor já criado)
    if (isStandalone) {
      try {
        const [rows] = await pool.query(
          'SELECT id, slug, name, status, config_json FROM tenants WHERE id = 1 AND status = ? LIMIT 1',
          ['ACTIVE']
        );
        const row = Array.isArray(rows) ? (rows as { id: number; slug: string; name: string; status: string; config_json: unknown }[])[0] : undefined;
        if (row) return mapRowToTenant(row);
      } catch (err) {
        console.error('[Tenant] Standalone: falha ao buscar tenant id=1 (verifique DB e permissões):', err);
      }
    }

    // Modo standalone ou acesso por IP: usar tenant do .env para não exigir subdomínio/domínio
    if (isStandalone && (envTenantId || envTenantSlug)) {
      if (envTenantId) {
        const [rows] = await pool.query(
          'SELECT id, slug, name, status, config_json FROM tenants WHERE id = ? AND status = ? LIMIT 1',
          [envTenantId, 'ACTIVE']
        );
        const row = Array.isArray(rows) ? (rows as { id: number; slug: string; name: string; status: string; config_json: unknown }[])[0] : undefined;
        if (row) return mapRowToTenant(row);
      }
      if (envTenantSlug) {
        const [rows] = await pool.query(
          'SELECT id, slug, name, status, config_json FROM tenants WHERE slug = ? AND status = ? LIMIT 1',
          [envTenantSlug, 'ACTIVE']
        );
        const row = Array.isArray(rows) ? (rows as { id: number; slug: string; name: string; status: string; config_json: unknown }[])[0] : undefined;
        if (row) return mapRowToTenant(row);
      }
    }

    if (isPrefixBasedSlug) {
      const [rows] = await pool.query(
        'SELECT id, slug, name, status, config_json FROM tenants WHERE slug = ? AND status = ? LIMIT 1',
        [prefixSlug, 'ACTIVE']
      );
      const row = Array.isArray(rows) ? (rows as { id: number; slug: string; name: string; status: string; config_json: unknown }[])[0] : undefined;
      if (row) return mapRowToTenant(row);
    }

    if (isPathBasedSlug) {
      const [rows] = await pool.query(
        'SELECT id, slug, name, status, config_json FROM tenants WHERE slug = ? AND status = ? LIMIT 1',
        [pathSlug, 'ACTIVE']
      );
      const row = Array.isArray(rows) ? (rows as { id: number; slug: string; name: string; status: string; config_json: unknown }[])[0] : undefined;
      if (row) return mapRowToTenant(row);
    }

    if (tenantId) {
      const [rows] = await pool.query(
        'SELECT id, slug, name, status, config_json FROM tenants WHERE id = ? AND status = ? LIMIT 1',
        [Number(tenantId), 'ACTIVE']
      );
      const row = Array.isArray(rows) ? (rows as { id: number; slug: string; name: string; status: string; config_json: unknown }[])[0] : undefined;
      if (row) return mapRowToTenant(row);
    }

    if (tenantSlug) {
      const [rows] = await pool.query(
        'SELECT id, slug, name, status, config_json FROM tenants WHERE slug = ? AND status = ? LIMIT 1',
        [tenantSlug, 'ACTIVE']
      );
      const row = Array.isArray(rows) ? (rows as { id: number; slug: string; name: string; status: string; config_json: unknown }[])[0] : undefined;
      if (row) return mapRowToTenant(row);
    }

    const baseDomain = (process.env.BASE_DOMAIN || '').toLowerCase();
    if (baseDomain && host.endsWith('.' + baseDomain)) {
      const subdomain = host.slice(0, -(baseDomain.length + 1));
      if (subdomain) {
        const [rows] = await pool.query(
          'SELECT id, slug, name, status, config_json FROM tenants WHERE subdomain = ? AND status = ? LIMIT 1',
          [subdomain, 'ACTIVE']
        );
        const row = Array.isArray(rows) ? (rows as { id: number; slug: string; name: string; status: string; config_json: unknown }[])[0] : undefined;
        if (row) return mapRowToTenant(row);
      }
    }

    if (host) {
      const [rows] = await pool.query(
        'SELECT id, slug, name, status, config_json FROM tenants WHERE custom_domain = ? AND status = ? LIMIT 1',
        [host, 'ACTIVE']
      );
      const row = Array.isArray(rows) ? (rows as { id: number; slug: string; name: string; status: string; config_json: unknown }[])[0] : undefined;
      if (row) return mapRowToTenant(row);
    }

    if (envTenantId) {
      const [rows] = await pool.query(
        'SELECT id, slug, name, status, config_json FROM tenants WHERE id = ? AND status = ? LIMIT 1',
        [envTenantId, 'ACTIVE']
      );
      const row = Array.isArray(rows) ? (rows as { id: number; slug: string; name: string; status: string; config_json: unknown }[])[0] : undefined;
      if (row) return mapRowToTenant(row);
    }

    // Uma VPS = um provedor: acesso por IP ou host não reconhecido → usar o único provedor ativo (id=1)
    const [rows] = await pool.query(
      'SELECT id, slug, name, status, config_json FROM tenants WHERE id = 1 AND status = ? LIMIT 1',
      ['ACTIVE']
    );
    const defaultRow = Array.isArray(rows) ? (rows as { id: number; slug: string; name: string; status: string; config_json: unknown }[])[0] : undefined;
    if (defaultRow) return mapRowToTenant(defaultRow);
  } catch (err) {
    console.error('[Tenant] Erro ao resolver tenant:', err);
    return null;
  }
  return null;
}

function mapRowToTenant(row: { id: number; slug: string; name: string; status: string; config_json: unknown }): Tenant {
  let config: TenantConfig | null = null;
  if (row.config_json != null && typeof row.config_json === 'object') {
    config = row.config_json as TenantConfig;
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    config,
  };
}

/**
 * Middleware que define req.tenant.
 * Se a tabela tenants não existir ou não houver tenant na requisição, req.tenant fica undefined
 * (comportamento single-tenant preservado).
 */
export function resolveTenant(req: Request, _res: Response, next: NextFunction): void {
  getTenantFromRequest(req)
    .then((tenant) => {
      req.tenant = tenant ?? undefined;
      next();
    })
    .catch((err) => {
      console.error('[Tenant]', err);
      req.tenant = undefined;
      next();
    });
}

/**
 * Retorna o tenant da requisição ou o tenant padrão (id=1) se existir.
 * Útil para manter compatibilidade: quando não houver multi-tenant, usar tenant 1.
 */
export async function getTenantOrDefault(req: Request): Promise<Tenant | null> {
  const t = await getTenantFromRequest(req);
  if (t) return t;
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, slug, name, status, config_json FROM tenants WHERE id = 1 AND status = ? LIMIT 1',
    ['ACTIVE']
  );
  const row = Array.isArray(rows) ? (rows as { id: number; slug: string; name: string; status: string; config_json: unknown }[])[0] : undefined;
  return row ? mapRowToTenant(row) : null;
}
