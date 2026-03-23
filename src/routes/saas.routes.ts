import { Router, type Request, type Response } from 'express';
import dns from 'dns';
import tls from 'tls';
import path from 'path';
import fs from 'fs';
import { spawn, execSync } from 'child_process';
import multer from 'multer';
import { z } from 'zod';
import { getPool } from '../db.js';
import { requireSaasAdmin } from '../middlewares/saasAdmin.js';
import { hashPassword } from '../utils/crypto.js';
import { getRadiusConfig, authenticateWithConfig } from '../radius.js';
import {
  provisionTenantStack,
  getTenantProvisioningStatus,
  deprovisionTenantStack,
  getProvisioningCheck,
  getTenantStackLogs,
  restartTenantStack,
  getTenantDbClient,
} from '../provisioning/index.js';
import { buildNginxSnippetForTenant, buildFullNginxSnippet } from '../provisioning/nginxSnippet.js';
import pg from 'pg';

/** Modo instalador único: uma VPS = um provedor; /admin vira Central do proprietário; não cria outros tenants. */
function isStandalone(): boolean {
  return /^1|true|yes$/i.test(String(process.env.STANDALONE || '').trim());
}

function isTableNotFoundError(e: unknown): boolean {
  const err = e as { code?: string };
  return err?.code === '42P01' || err?.code === 'ER_NO_SUCH_TABLE';
}

/** Pasta web/uploads para logos enviadas pelo painel (servida como /uploads/*). App costuma rodar com cwd = raiz do projeto. */
const webUploadsDir = path.join(process.cwd(), 'web', 'uploads');
function ensureUploadsDir(): void {
  try {
    fs.mkdirSync(webUploadsDir, { recursive: true });
  } catch {
    // ignora se já existir ou permissão
  }
}

const uploadLogoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, webUploadsDir),
  filename: (req, file, cb) => {
    const type = (req.body && req.body.type) === 'site' ? 'site' : 'portal';
    const ext = (path.extname(file.originalname) || '.png').toLowerCase();
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
    const safeExt = allowed.includes(ext) ? ext : '.png';
    cb(null, `logo-${type}-${Date.now()}${safeExt}`);
  },
});
const uploadLogo = multer({
  storage: uploadLogoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(file.mimetype) || file.mimetype === 'image/svg+xml';
    cb(null, !!ok);
  },
});

export const saasRouter = Router();

function dbBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 't' || value === 'true' || value === 'yes';
}
saasRouter.use(requireSaasAdmin);

/**
 * GET /api/saas/standalone
 * Indica se a instalação é modo único (instalador). Front usa para exibir "Central do proprietário" e esconder criação de provedores.
 */
saasRouter.get('/standalone', (_req: Request, res: Response): Response => {
  return res.json({ ok: true, standalone: isStandalone() });
});

/**
 * GET /api/saas/installation-info
 * Dados do provedor desta instalação (nome, slug, e-mail Master, RADIUS, link do portal). Para o Painel do dono do sistema.
 */
saasRouter.get('/installation-info', async (req: Request, res: Response): Promise<Response | void> => {
  const pool = getPool();
  let tenantId: number | null = isStandalone() ? Number(process.env.TENANT_ID || 1) : null;
  if (tenantId == null || tenantId <= 0) {
    const [first] = await pool.query('SELECT id FROM tenants ORDER BY id ASC LIMIT 1');
    const row = Array.isArray(first) && first.length > 0 ? (first as { id: number }[])[0] : null;
    tenantId = row?.id ?? null;
  }
  if (tenantId == null) {
    return res.json({ ok: true, tenant: null, masterEmail: null, portalUrl: null, radius: null });
  }
  const [tenantRows] = await pool.query(
    'SELECT name, slug FROM tenants WHERE id = ? LIMIT 1',
    [tenantId]
  );
  const tenantRow = Array.isArray(tenantRows) && tenantRows.length > 0 ? (tenantRows as { name: string; slug: string }[])[0] : null;
  if (!tenantRow) {
    return res.json({ ok: true, tenant: null, masterEmail: null, portalUrl: null, radius: null });
  }
  let fantasyName: string | null = null;
  let shortName: string | null = null;
  try {
    const [providerRows] = await pool.query(
      'SELECT fantasy_name, short_name FROM provider_settings WHERE tenant_id = ? LIMIT 1',
      [tenantId]
    );
    const providerRow = Array.isArray(providerRows) && providerRows.length > 0
      ? (providerRows as { fantasy_name: string | null; short_name: string | null }[])[0]
      : null;
    fantasyName = providerRow?.fantasy_name ?? null;
    shortName = providerRow?.short_name ?? null;
  } catch {
    // provider_settings pode não existir ainda
  }
  const displayName = fantasyName || shortName || tenantRow.name;
  const [userRows] = await pool.query(
    'SELECT email FROM tenant_users WHERE tenant_id = ? AND is_master = true LIMIT 1',
    [tenantId]
  );
  const userRow = Array.isArray(userRows) && userRows.length > 0 ? (userRows as { email: string }[])[0] : null;
  const masterEmail = userRow?.email ?? null;
  const baseUrl = (process.env.BASE_URL || '').trim() || (req.protocol + '://' + req.get('host') || '');
  const portalUrl = baseUrl ? (baseUrl.replace(/\/+$/, '') + '/portal/') : null;
  const radiusConfig = getRadiusConfig();
  const radius = radiusConfig
    ? { host: radiusConfig.host, port: radiusConfig.port, secret: radiusConfig.secret }
    : null;
  return res.json({
    ok: true,
    tenant: {
      name: displayName,
      slug: tenantRow.slug,
      legalName: tenantRow.name,
      fantasyName,
      shortName,
    },
    provider: {
      displayName,
      fantasyName,
      shortName,
      legalName: tenantRow.name,
    },
    masterEmail,
    portalUrl,
    radius,
  });
});

/**
 * PUT /api/saas/installation
 * Atualiza dados do provedor desta instalação (nome, slug, e-mail do Master). Só em modo standalone ou tenant único.
 */
saasRouter.put('/installation', async (req: Request, res: Response): Promise<Response | void> => {
  const pool = getPool();
  let tenantId: number | null = isStandalone() ? Number(process.env.TENANT_ID || 1) : null;
  if (tenantId == null || tenantId <= 0) {
    const [first] = await pool.query('SELECT id FROM tenants ORDER BY id ASC LIMIT 1');
    const row = Array.isArray(first) && first.length > 0 ? (first as { id: number }[])[0] : null;
    tenantId = row?.id ?? null;
  }
  if (tenantId == null) {
    return res.status(404).json({ error: 'Nenhum provedor encontrado nesta instalação.' });
  }

  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : undefined;
  const slugRaw = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : undefined;
  const slug = slugRaw ? slugRaw.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : undefined;
  const masterEmail = typeof body.masterEmail === 'string' ? body.masterEmail.trim().toLowerCase() : undefined;

  if (!name && !slug && masterEmail === undefined) {
    return res.status(400).json({ error: 'Envie ao menos um campo: name, slug ou masterEmail.' });
  }
  if (slug !== undefined && slug.length < 2) {
    return res.status(400).json({ error: 'Slug deve ter no mínimo 2 caracteres (apenas letras, números e hífens).' });
  }
  if (masterEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(masterEmail)) {
    return res.status(400).json({ error: 'E-mail do Master inválido.' });
  }

  if (slug !== undefined) {
    const [existing] = await pool.query(
      'SELECT id FROM tenants WHERE slug = :slug AND id != :id LIMIT 1',
      { slug, id: tenantId }
    );
    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json({ error: 'Este slug já está em uso por outro provedor.' });
    }
  }

  if (name !== undefined) {
    await pool.query('UPDATE tenants SET name = :name, updated_at = NOW() WHERE id = :id', { name, id: tenantId });
  }
  if (slug !== undefined) {
    await pool.query('UPDATE tenants SET slug = :slug, updated_at = NOW() WHERE id = :id', { slug, id: tenantId });
  }
  if (masterEmail !== undefined) {
    await pool.query(
      'UPDATE tenant_users SET email = :email WHERE tenant_id = :id AND is_master = true',
      { email: masterEmail, id: tenantId }
    );
  }

  return res.json({ ok: true, message: 'Dados do provedor atualizados.' });
});

/**
 * GET /api/saas/installation-provider
 * Dados do provedor (provider_settings): nome fantasia, contato, endereço, branding. Mesmos dados do Portal → Administração.
 */
saasRouter.get('/installation-provider', async (_req: Request, res: Response): Promise<Response | void> => {
  const pool = getPool();
  let tenantId: number | null = isStandalone() ? Number(process.env.TENANT_ID || 1) : null;
  if (tenantId == null || tenantId <= 0) {
    const [first] = await pool.query('SELECT id FROM tenants ORDER BY id ASC LIMIT 1');
    const row = Array.isArray(first) && first.length > 0 ? (first as { id: number }[])[0] : null;
    tenantId = row?.id ?? null;
  }
  if (tenantId == null) {
    return res.json({ ok: true, settings: null });
  }
  try {
    const [rows] = await pool.query(
      `SELECT fantasy_name, legal_name, document, ie, im,
              whatsapp, phone, email, website,
              street, number, complement, neighborhood, city, state, zip,
              logo_portal, logo_site, logo_receipt, color_primary, color_accent,
              short_name, timezone
       FROM provider_settings
       WHERE tenant_id = :tid
       LIMIT 1`,
      { tid: tenantId }
    );
    const list = Array.isArray(rows) ? rows : [];
    return res.json({ ok: true, settings: list.length ? list[0] : null });
  } catch (e) {
    const err = e as { code?: string };
    if (err?.code === '42P01' || (err && typeof err === 'object' && 'message' in err && String((e as { message: string }).message).includes('does not exist'))) {
      return res.status(503).json({ ok: false, message: 'Tabela provider_settings não existe. Execute sql/provider_settings.sql (ou migração equivalente para PostgreSQL).' });
    }
    throw e;
  }
});

/**
 * PUT /api/saas/installation-provider
 * Atualiza provider_settings do provedor desta instalação. Mesmos campos do Portal → Administração → Dados do Provedor.
 */
saasRouter.put('/installation-provider', async (req: Request, res: Response): Promise<Response | void> => {
  const pool = getPool();
  let tenantId: number | null = isStandalone() ? Number(process.env.TENANT_ID || 1) : null;
  if (tenantId == null || tenantId <= 0) {
    const [first] = await pool.query('SELECT id FROM tenants ORDER BY id ASC LIMIT 1');
    const row = Array.isArray(first) && first.length > 0 ? (first as { id: number }[])[0] : null;
    tenantId = row?.id ?? null;
  }
  if (tenantId == null) {
    return res.status(404).json({ error: 'Nenhum provedor encontrado nesta instalação.' });
  }

  const body = req.body || {};
  const fantasyName = body.fantasy_name != null ? String(body.fantasy_name).trim() : null;
  const legalName = body.legal_name != null ? String(body.legal_name).trim() : null;
  const document = body.document != null ? String(body.document).replace(/\D/g, '') || null : null;
  const ie = body.ie != null ? String(body.ie).trim() || null : null;
  const im = body.im != null ? String(body.im).trim() || null : null;
  const whatsapp = body.whatsapp != null ? String(body.whatsapp).trim() || null : null;
  const phone = body.phone != null ? String(body.phone).trim() || null : null;
  const email = body.email != null ? String(body.email).trim() || null : null;
  const website = body.website != null ? String(body.website).trim() || null : null;
  const street = body.street != null ? String(body.street).trim() || null : null;
  const number = body.number != null ? String(body.number).trim() || null : null;
  const complement = body.complement != null ? String(body.complement).trim() || null : null;
  const neighborhood = body.neighborhood != null ? String(body.neighborhood).trim() || null : null;
  const city = body.city != null ? String(body.city).trim() || null : null;
  const state = body.state != null ? String(body.state).trim().toUpperCase() || null : null;
  const zip = body.zip != null ? String(body.zip).replace(/\D/g, '') || null : null;
  const logoPortal = body.logo_portal != null ? String(body.logo_portal).trim() || null : null;
  const logoSite = body.logo_site != null ? String(body.logo_site).trim() || null : null;
  const logoReceipt = body.logo_receipt != null ? String(body.logo_receipt).trim() || null : null;
  const colorPrimary = body.color_primary != null ? String(body.color_primary).trim() || null : null;
  const colorAccent = body.color_accent != null ? String(body.color_accent).trim() || null : null;
  const shortName = body.short_name != null ? String(body.short_name).trim() || null : null;
  const timezone = body.timezone != null ? String(body.timezone).trim() || null : null;

  try {
    await pool.query(
      `INSERT INTO provider_settings
       (tenant_id, fantasy_name, legal_name, document, ie, im,
        whatsapp, phone, email, website,
        street, number, complement, neighborhood, city, state, zip,
        logo_portal, logo_site, logo_receipt, color_primary, color_accent,
        short_name, timezone)
       VALUES
       (:tid, :fantasyName, :legalName, :document, :ie, :im,
        :whatsapp, :phone, :email, :website,
        :street, :number, :complement, :neighborhood, :city, :state, :zip,
        :logoPortal, :logoSite, :logoReceipt, :colorPrimary, :colorAccent,
        :shortName, :timezone)
       ON CONFLICT (tenant_id) DO UPDATE SET
        fantasy_name = EXCLUDED.fantasy_name,
        legal_name = EXCLUDED.legal_name,
        document = EXCLUDED.document,
        ie = EXCLUDED.ie,
        im = EXCLUDED.im,
        whatsapp = EXCLUDED.whatsapp,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        website = EXCLUDED.website,
        street = EXCLUDED.street,
        number = EXCLUDED.number,
        complement = EXCLUDED.complement,
        neighborhood = EXCLUDED.neighborhood,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        zip = EXCLUDED.zip,
        logo_portal = EXCLUDED.logo_portal,
        logo_site = EXCLUDED.logo_site,
        logo_receipt = EXCLUDED.logo_receipt,
        color_primary = EXCLUDED.color_primary,
        color_accent = EXCLUDED.color_accent,
        short_name = EXCLUDED.short_name,
        timezone = EXCLUDED.timezone,
        updated_at = CURRENT_TIMESTAMP`,
      {
        tid: tenantId,
        fantasyName: fantasyName ?? null,
        legalName: legalName ?? null,
        document: document ?? null,
        ie: ie ?? null,
        im: im ?? null,
        whatsapp: whatsapp ?? null,
        phone: phone ?? null,
        email: email ?? null,
        website: website ?? null,
        street: street ?? null,
        number: number ?? null,
        complement: complement ?? null,
        neighborhood: neighborhood ?? null,
        city: city ?? null,
        state: state ?? null,
        zip: zip ?? null,
        logoPortal: logoPortal ?? null,
        logoSite: logoSite ?? null,
        logoReceipt: logoReceipt ?? null,
        colorPrimary: colorPrimary ?? null,
        colorAccent: colorAccent ?? null,
        shortName: shortName ?? null,
        timezone: timezone ?? null,
      }
    );
    return res.json({ ok: true, message: 'Dados do provedor (identidade/contato) atualizados.' });
  } catch (e) {
    const err = e as { code?: string };
    if (err?.code === '42P01' || (err && typeof err === 'object' && 'message' in err && String((e as { message: string }).message).includes('does not exist'))) {
      return res.status(503).json({ ok: false, message: 'Tabela provider_settings não existe. Execute sql/provider_settings.sql (ou migração para PostgreSQL).' });
    }
    throw e;
  }
});

/**
 * POST /api/saas/upload-logo
 * Multipart: file (arquivo de imagem), type (portal|site). Salva em web/uploads e retorna a URL pública.
 */
saasRouter.post('/upload-logo', (req: Request, res: Response, next) => {
  ensureUploadsDir();
  uploadLogo.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ ok: false, message: 'Arquivo muito grande. Máximo 2 MB.' });
        return;
      }
      res.status(400).json({ ok: false, message: err instanceof Error ? err.message : 'Falha no upload.' });
      return;
    }
    return next();
  });
}, (req: Request, res: Response): void => {
  const file = (req as Request & { file?: { filename: string } })?.file;
  if (!file?.filename) {
    res.status(400).json({ ok: false, message: 'Nenhum arquivo enviado. Use o campo "file".' });
    return;
  }
  const url = '/uploads/' + encodeURIComponent(file.filename);
  return void res.json({ ok: true, url });
});

saasRouter.get('/wifi-templates', async (_req: Request, res: Response): Promise<Response | void> => {
  const pool = getPool();
  try {
    const [templateRows] = await pool.query(
      `SELECT id, tenant_id, name, slug, description, auth_type, portal_enabled, radius_enabled,
              free_minutes, otp_enabled, payment_required, payment_method, payment_amount,
              requires_phone, requires_name, auto_release_after_payment, bind_mac,
              session_timeout_minutes, redirect_url, is_default, is_active, config_json,
              created_at, updated_at
       FROM hotspot_templates
       WHERE tenant_id = 1
       ORDER BY is_default DESC, name ASC`
    );
    const [planRows] = await pool.query(
      `SELECT id, template_id, name, price, duration_minutes, sort_order, active
       FROM hotspot_template_pix_plans
       WHERE tenant_id = 1
       ORDER BY template_id ASC, sort_order ASC, id ASC`
    );
    const templates = Array.isArray(templateRows) ? templateRows : [];
    const plans = Array.isArray(planRows) ? planRows : [];
    const plansByTemplate = new Map<number, unknown[]>();
    for (const row of plans as { template_id: number }[]) {
      const key = Number(row.template_id);
      if (!plansByTemplate.has(key)) plansByTemplate.set(key, []);
      plansByTemplate.get(key)!.push(row);
    }
    return res.json({
      ok: true,
      rows: (templates as { id: number }[]).map((row) => ({
        ...row,
        is_default: dbBool((row as { is_default?: unknown }).is_default),
        is_active: dbBool((row as { is_active?: unknown }).is_active),
        pix_plans: plansByTemplate.get(Number(row.id)) || [],
      })),
    });
  } catch (e) {
    if (isTableNotFoundError(e)) {
      return res.status(503).json({ message: 'Tabela hotspot_templates não existe. Execute sql/hotspot_templates.sql' });
    }
    throw e;
  }
});

saasRouter.get('/wifi-payment-gateways', async (_req: Request, res: Response): Promise<Response | void> => {
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      `SELECT id, description, gateway_type, active
       FROM payment_gateways
       WHERE tenant_id = 1
         AND active = true
         AND pix = true
       ORDER BY description ASC, id ASC`
    );
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) {
      return res.status(503).json({ message: 'Tabela payment_gateways não existe. Execute sql/payment_gateways.sql' });
    }
    throw e;
  }
});

saasRouter.put('/wifi-templates/:id', async (req: Request, res: Response): Promise<Response | void> => {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).json({ message: 'Template inválido.' });
  const body = req.body || {};
  const pool = getPool();
  const config = body.config_json && typeof body.config_json === 'object' ? body.config_json : {};
  const pixPlans = Array.isArray(body.pix_plans) ? body.pix_plans : [];
  try {
    if (body.is_default) {
      await pool.query('UPDATE hotspot_templates SET is_default = false, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = 1');
    }
    await pool.query(
      `UPDATE hotspot_templates SET
         name = :name,
         slug = :slug,
         description = :description,
         auth_type = :auth_type,
         portal_enabled = :portal_enabled,
         radius_enabled = :radius_enabled,
         free_minutes = :free_minutes,
         otp_enabled = :otp_enabled,
         payment_required = :payment_required,
         payment_method = :payment_method,
         payment_amount = :payment_amount,
         requires_phone = :requires_phone,
         requires_name = :requires_name,
         auto_release_after_payment = :auto_release_after_payment,
         bind_mac = :bind_mac,
         session_timeout_minutes = :session_timeout_minutes,
         redirect_url = :redirect_url,
         is_default = :is_default,
         is_active = :is_active,
         config_json = :config_json::jsonb,
         updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = 1 AND id = :id`,
      {
        id,
        name: String(body.name || '').trim(),
        slug: String(body.slug || '').trim(),
        description: String(body.description || '').trim(),
        auth_type: String(body.auth_type || 'simple_login').trim(),
        portal_enabled: !!body.portal_enabled,
        radius_enabled: !!body.radius_enabled,
        free_minutes: Math.max(0, Number(body.free_minutes) || 0),
        otp_enabled: !!body.otp_enabled,
        payment_required: !!body.payment_required,
        payment_method: body.payment_method != null ? String(body.payment_method).trim() || null : null,
        payment_amount: body.payment_amount !== '' && body.payment_amount != null ? Number(body.payment_amount) : null,
        requires_phone: !!body.requires_phone,
        requires_name: !!body.requires_name,
        auto_release_after_payment: !!body.auto_release_after_payment,
        bind_mac: !!body.bind_mac,
        session_timeout_minutes: Math.max(0, Number(body.session_timeout_minutes) || 0),
        redirect_url: body.redirect_url != null ? String(body.redirect_url).trim() || null : null,
        is_default: !!body.is_default,
        is_active: body.is_active !== false,
        config_json: JSON.stringify(config),
      }
    );
    await pool.query('DELETE FROM hotspot_template_pix_plans WHERE tenant_id = 1 AND template_id = :id', { id });
    for (let i = 0; i < pixPlans.length; i++) {
      const plan = pixPlans[i] || {};
      const name = String(plan.name || '').trim();
      if (!name) continue;
      await pool.query(
        `INSERT INTO hotspot_template_pix_plans (tenant_id, template_id, name, price, duration_minutes, sort_order, active)
         VALUES (1, :template_id, :name, :price, :duration_minutes, :sort_order, :active)`,
        {
          template_id: id,
          name,
          price: Number(plan.price) || 0,
          duration_minutes: Math.max(1, Number(plan.duration_minutes) || 60),
          sort_order: i + 1,
          active: plan.active !== false,
        }
      );
    }
    return res.json({ ok: true, id });
  } catch (e) {
    if (isTableNotFoundError(e)) {
      return res.status(503).json({ message: 'Tabela hotspot_templates não existe. Execute sql/hotspot_templates.sql' });
    }
    throw e;
  }
});

saasRouter.post('/wifi-templates/:id/default', async (req: Request, res: Response): Promise<Response | void> => {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).json({ message: 'Template inválido.' });
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      'SELECT id FROM hotspot_templates WHERE tenant_id = 1 AND id = :id LIMIT 1',
      { id }
    );
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(404).json({ message: 'Template Wi-Fi não encontrado.' });
    }
    await pool.query('UPDATE hotspot_templates SET is_default = false, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = 1');
    await pool.query(
      'UPDATE hotspot_templates SET is_default = true, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = 1 AND id = :id',
      { id }
    );
    return res.json({ ok: true, id });
  } catch (e) {
    if (isTableNotFoundError(e)) {
      return res.status(503).json({ message: 'Tabela hotspot_templates não existe. Execute sql/hotspot_templates.sql' });
    }
    throw e;
  }
});

/**
 * GET /api/saas/provisioning-check
 * Diagnóstico do ambiente de provisionamento (Docker, paths, permissões). Use na VPS para ver por que o stack não sobe.
 */
saasRouter.get('/provisioning-check', async (_req: Request, res: Response): Promise<Response> => {
  const check = await getProvisioningCheck();
  return res.json({ ok: true, check });
});

/**
 * GET /api/saas/tenants
 * Lista tenants. Em modo standalone retorna apenas o tenant desta instalação (id=1).
 */
saasRouter.get('/tenants', async (_req: Request, res: Response): Promise<Response | void> => {
  const pool = getPool();
  const tenantId = isStandalone() ? Number(process.env.TENANT_ID || 1) : null;
  const sql = tenantId != null
    ? `SELECT t.id, t.name, t.slug, t.status, t.subdomain, t.custom_domain, t.created_at, t.config_json,
       (SELECT COUNT(*) FROM tenant_users u WHERE u.tenant_id = t.id) AS users_count
       FROM tenants t WHERE t.id = $1 ORDER BY t.created_at DESC`
    : `SELECT t.id, t.name, t.slug, t.status, t.subdomain, t.custom_domain, t.created_at, t.config_json,
       (SELECT COUNT(*) FROM tenant_users u WHERE u.tenant_id = t.id) AS users_count
       FROM tenants t ORDER BY t.created_at DESC`;
  const params = tenantId != null ? [tenantId] : [];
  const [rows] = await pool.query(sql, params);
  const rawList = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  const list = rawList.map((t) => {
    const provisioning = (t.config_json && typeof t.config_json === 'object' && (t.config_json as Record<string, unknown>).provisioning) as Record<string, unknown> | undefined;
    const stackPath = provisioning?.stackPath as string | undefined;
    const ports = provisioning?.ports as { sitePort?: number; radiusAuthPort?: number; radiusAcctPort?: number; adminPort?: number } | undefined;
    const stackStatus = provisioning?.status as string | undefined;
    const lastProvisionedAt = provisioning?.lastProvisionedAt as string | undefined;
    const { config_json, ...rest } = t;
    return {
      ...rest,
      stackPath: stackPath || null,
      stackStatus: stackStatus || null,
      lastProvisionedAt: lastProvisionedAt || null,
      sitePort: ports?.sitePort ?? null,
      adminPort: ports?.adminPort ?? null,
      radiusAuthPort: ports?.radiusAuthPort ?? null,
      radiusAcctPort: ports?.radiusAcctPort ?? null,
    };
  });
  return res.json({ ok: true, standalone: isStandalone(), tenants: list });
});

/**
 * GET /api/saas/tenants/:id
 * Detalhes de um tenant + lista de usuários. Admin do SaaS.
 */
saasRouter.get('/tenants/:id', async (req: Request, res: Response): Promise<Response | void> => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  const pool = getPool();
  const [tenantRows] = await pool.query(
    `SELECT id, name, slug, status, subdomain, custom_domain, config_json, created_at, updated_at
     FROM tenants WHERE id = :id LIMIT 1`,
    { id }
  );
  const tenant = Array.isArray(tenantRows) && tenantRows.length > 0 ? (tenantRows as Record<string, unknown>[])[0] : null;
  if (!tenant) return res.status(404).json({ error: 'Provedor não encontrado' });

  const [userRows] = await pool.query(
    `SELECT id, name, email, is_master, is_active, created_at
     FROM tenant_users WHERE tenant_id = :id ORDER BY is_master DESC, name`,
    { id }
  );
  const users = Array.isArray(userRows) ? (userRows as Record<string, unknown>[]) : [];

  return res.json({ ok: true, tenant, users });
});

/**
 * POST /api/saas/tenants
 * Cria tenant + usuário Master + role Master + todas permissões ao Master. Em modo standalone retorna 403.
 */
saasRouter.post('/tenants', async (req: Request, res: Response): Promise<Response | void> => {
  if (isStandalone()) {
    return res.status(403).json({
      error: 'Modo instalador único: não é possível criar novos provedores. Esta instalação serve um único provedor.',
    });
  }
  const schema = z.object({
    tenantName: z.string().min(2),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
    domain: z.string().min(1).optional(),
    masterName: z.string().min(2),
    masterEmail: z.string().email(),
    masterPassword: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { tenantName, slug, domain, masterName, masterEmail, masterPassword } = parsed.data;
  const emailNorm = masterEmail.toLowerCase().trim();

  const pool = getPool();
  const [existing] = await pool.query('SELECT id FROM tenants WHERE slug = :slug LIMIT 1', { slug });
  if (Array.isArray(existing) && existing.length > 0) {
    return res.status(409).json({ error: 'Slug já existe' });
  }

  // Subdomínio = slug para acesso no formato slug.otyisisp.otnsoft.com.br (defina BASE_DOMAIN no .env)
  const subdomain = slug;
  const customDomain = domain?.trim() ? domain.trim().toLowerCase() : null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [insTenant] = await conn.query(
      `INSERT INTO tenants (name, slug, status, subdomain, custom_domain)
       VALUES (:name, :slug, :status, :subdomain, :custom_domain) RETURNING id`,
      { name: tenantName, slug, status: 'ACTIVE', subdomain, custom_domain: customDomain }
    );
    const tenantId = (insTenant as { insertId?: number })?.insertId;
    if (tenantId == null || tenantId <= 0) {
      throw new Error('Falha ao obter ID do tenant criado. Verifique o banco de dados.');
    }

    const passHash = await hashPassword(masterPassword);
    const [insUser] = await conn.query(
      `INSERT INTO tenant_users (tenant_id, name, email, password_hash, is_master, is_active)
       VALUES (:tenantId, :name, :email, :passwordHash, true, true) RETURNING id`,
      { tenantId, name: masterName, email: emailNorm, passwordHash: passHash }
    );
    const userId = (insUser as { insertId?: number })?.insertId;
    if (userId == null || userId <= 0) {
      throw new Error('Falha ao obter ID do usuário Master. Verifique o banco de dados.');
    }

    const [insRole] = await conn.query(
      'INSERT INTO tenant_roles (tenant_id, name, is_system) VALUES (:tenantId, :name, true) RETURNING id',
      { tenantId, name: 'Master' }
    );
    const roleId = (insRole as { insertId?: number })?.insertId;
    if (roleId == null || roleId <= 0) {
      throw new Error('Falha ao obter ID da role Master. Verifique o banco de dados.');
    }

    await conn.query(
      'INSERT INTO tenant_user_roles (tenant_id, user_id, role_id) VALUES (:tenantId, :userId, :roleId)',
      { tenantId, userId, roleId }
    );

    const [perms] = await conn.query('SELECT id FROM tenant_permissions WHERE is_active = true');
    const permList = Array.isArray(perms) ? (perms as { id: number }[]) : [];
    if (permList.length > 0) {
      const values = permList.map((p) => `(${tenantId}, ${roleId}, ${p.id})`).join(', ');
      await conn.query(
        `INSERT INTO tenant_role_permissions (tenant_id, role_id, permission_id) VALUES ${values}`
      );
    }

    await conn.commit();

    const payload: Record<string, unknown> = {
      tenant: { id: tenantId, name: tenantName, slug, subdomain, custom_domain: customDomain, created_at: new Date() },
      master: { id: userId, tenant_id: tenantId, name: masterName, email: emailNorm, is_master: true },
      role: { id: roleId, name: 'Master' },
    };

    // Ao criar provedor: sobe stack Docker (portal_admin, site, freeradius, postgres) por tenant. Desative com PROVISION_DOCKER=0.
    const provisionDocker = !/^0|false|no$/i.test(String(process.env.PROVISION_DOCKER || '').trim());
    if (provisionDocker) {
      try {
        const provisionResult = await provisionTenantStack({
          tenantId,
          slug,
          name: tenantName,
          domain: domain?.trim() || undefined,
          masterUser: { email: emailNorm, name: masterName, password_hash: passHash },
        });
        const publicIp = (process.env.PUBLIC_IP || '').trim();
        const useHttps = /^1|true|yes$/i.test(String(process.env.PUBLIC_HTTPS || '').trim());
        const scheme = useHttps ? 'https' : 'http';
        // Prioridade: acesso só por IP (PUBLIC_IP) > subdomínio (BASE_DOMAIN)
        const portalUrlByIp = publicIp ? `${scheme}://${publicIp}/${slug}/portal/` : null;
        const baseDomain = (process.env.BASE_DOMAIN || '').trim().toLowerCase();
        const portalUrlBySubdomain = baseDomain ? `https://${slug}.${baseDomain}/portal/` : null;
        const suggestedDomain = baseDomain || (req.get('host') || '').split(':')[0] || 'otyisisp.otnsoft.com.br';
        const portalUrlRecommended = `https://${slug}.${suggestedDomain}/portal/`;
        const portalUrl = portalUrlByIp || portalUrlBySubdomain || portalUrlRecommended;
        let portalNote: string;
        if (portalUrlByIp) {
          portalNote = `Provedor acessa em ${portalUrlByIp} (e-mail e senha do Master). Acesso só por IP.`;
        } else if (baseDomain) {
          portalNote = `Provedor acessa em ${portalUrlBySubdomain} (e-mail e senha do Master). DNS: *.${baseDomain} → este servidor.`;
        } else {
          portalNote = `Provedor acessa em ${portalUrlRecommended} Defina BASE_DOMAIN ou PUBLIC_IP no .env.`;
        }
        payload.provisioning = {
          success: provisionResult.success,
          message: provisionResult.message,
          config: provisionResult.config,
          log: provisionResult.log,
          portalUrl,
          portalNote,
        };
      } catch (provisionErr) {
        payload.provisioning = {
          success: false,
          message: (provisionErr as Error).message,
          log: [],
        };
      }
    } else {
      const baseUrlFallback = req.protocol + '://' + (req.get('host') || 'SEU_DOMINIO');
      payload.provisioning = {
        success: false,
        message: 'Provisionamento Docker desativado (PROVISION_DOCKER=0). Remova ou defina PROVISION_DOCKER=1 para criar o stack ao criar provedor.',
        skipped: true,
        portalUrl: baseUrlFallback + '/portal/',
      };
    }

    return res.status(201).json(payload);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

/**
 * GET /api/saas/tenants/:id/provisioning
 * Retorna status do provisionamento Docker do tenant (se existir).
 */
saasRouter.get('/tenants/:id/provisioning', async (req: Request, res: Response): Promise<Response | void> => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const status = await getTenantProvisioningStatus(id);
  return res.json({ ok: true, provisioning: status });
});

/**
 * GET /api/saas/tenants/:id/status
 * Alias para o status do stack (provisioning). Retorna tenant + provisioning.
 */
saasRouter.get('/tenants/:id/status', async (req: Request, res: Response): Promise<Response | void> => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, name, slug, status, subdomain, custom_domain FROM tenants WHERE id = ? LIMIT 1',
    [id]
  );
  const tenant = Array.isArray(rows) && (rows as Record<string, unknown>[]).length > 0 ? (rows as Record<string, unknown>[])[0] : null;
  if (!tenant) return res.status(404).json({ error: 'Provedor não encontrado' });
  const provisioning = await getTenantProvisioningStatus(id);
  return res.json({ ok: true, tenant, provisioning });
});

/**
 * GET /api/saas/tenants/:id/nginx-snippet
 * Retorna snippet Nginx pronto (porta real, barras finais, Websocket, dica sub_filter).
 */
saasRouter.get('/tenants/:id/nginx-snippet', async (req: Request, res: Response): Promise<Response | void> => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const pool = getPool();
  const [rows] = await pool.query('SELECT id, slug FROM tenants WHERE id = ? LIMIT 1', [id]);
  const tenant = Array.isArray(rows) && (rows as Record<string, unknown>[]).length > 0 ? (rows as Record<string, unknown>[])[0] : null;
  if (!tenant) return res.status(404).json({ error: 'Provedor não encontrado' });
  const provisioning = await getTenantProvisioningStatus(id);
  const slug = (tenant as { slug: string }).slug;
  const sitePort = provisioning?.ports?.sitePort;
  const adminPort = provisioning?.ports?.adminPort ?? null;
  if (sitePort == null) {
    return res.status(400).json({ error: 'Tenant sem stack provisionado (sitePort não definido).' });
  }
  const { snippet, needsAdminPort } = buildNginxSnippetForTenant(slug, sitePort, adminPort);
  return res.json({
    ok: true,
    slug,
    sitePort,
    adminPort,
    snippet,
    note: needsAdminPort
      ? 'Exponha portal_admin em 127.0.0.1:PORT no docker-compose do tenant (ports: - "127.0.0.1:PORT:3000"), depois troque ADMIN_PORT no snippet pela porta real e cole no Nginx.'
      : null,
  });
});

/**
 * GET /api/saas/tenants/:id/logs
 * Logs do stack Docker do tenant (últimos N eventos por serviço).
 * Query params:
 *   service: portal|radius|postgres|all (default: all)
 *   tail: número de linhas (default: 100)
 */
saasRouter.get('/tenants/:id/logs', async (req: Request, res: Response): Promise<Response | void> => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const serviceKey = (String(req.query.service || 'all').toLowerCase() as 'portal' | 'radius' | 'postgres' | 'all');
  const tail = req.query.tail ? Number(req.query.tail) || 100 : 100;
  const result = await getTenantStackLogs(id, serviceKey, tail);
  return res.json({
    ok: result.success,
    message: result.message,
    stdout: result.stdout,
    stderr: result.stderr,
  });
});

/**
 * POST /api/saas/tenants/:id/stack/restart
 * Reinicia o stack Docker do tenant (portal, site, RADIUS, Postgres).
 */
saasRouter.post('/tenants/:id/stack/restart', async (req: Request, res: Response): Promise<Response | void> => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const body = (req.body && typeof req.body === 'object') ? req.body as { services?: ('portal' | 'radius' | 'postgres')[] } : {};
  const services = Array.isArray(body.services) ? body.services : undefined;
  const result = await restartTenantStack(id, services);
  return res.json({ ok: result.success, message: result.message, log: result.log });
});

/**
 * POST /api/saas/tenants/:id/stack/remove
 * Remove apenas o stack Docker (docker compose down + rm), mantendo o registro do tenant.
 */
saasRouter.post('/tenants/:id/stack/remove', async (req: Request, res: Response): Promise<Response | void> => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const result = await deprovisionTenantStack(id);
  return res.json({ ok: result.success, message: result.message, log: result.log });
});

/**
 * GET /api/saas/tenants/:id/dns-ssl-status
 * Verifica DNS e certificado SSL para o domínio/subdomínio do provedor.
 */
saasRouter.get('/tenants/:id/dns-ssl-status', async (req: Request, res: Response): Promise<Response | void> => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT name, subdomain, custom_domain FROM tenants WHERE id = ? LIMIT 1',
    [id]
  );
  const row = Array.isArray(rows) && rows.length > 0 ? (rows as { name: string; subdomain: string | null; custom_domain: string | null }[])[0] : null;
  if (!row) return res.status(404).json({ error: 'Provedor não encontrado' });
  const baseDomain = (process.env.BASE_DOMAIN || '').trim().toLowerCase();
  const publicIp = (process.env.PUBLIC_IP || '').trim();
  let host: string | null = null;
  if (row.custom_domain) {
    host = row.custom_domain.toLowerCase();
  } else if (row.subdomain && baseDomain) {
    host = `${row.subdomain.toLowerCase()}.${baseDomain}`;
  }
  if (!host) return res.json({ ok: false, error: 'Sem domínio configurado (defina subdomínio ou domínio próprio).' });

  const dnsPromises = dns.promises;
  let aRecords: string[] = [];
  let cname: string | null = null;
  try {
    aRecords = await dnsPromises.resolve4(host);
  } catch {
    aRecords = [];
  }
  try {
    const cnames = await dnsPromises.resolveCname(host);
    cname = cnames[0] || null;
  } catch {
    cname = null;
  }
  const matchesPublicIp = publicIp && aRecords.includes(publicIp);

  const sslInfo: {
    present: boolean;
    validFrom?: string;
    validTo?: string;
    daysRemaining?: number;
    subjectCN?: string;
    issuerCN?: string;
  } = { present: false };

  await new Promise<void>((resolve) => {
    const socket = tls.connect(
      { host, port: 443, servername: host, timeout: 5000 },
      () => {
        const cert = socket.getPeerCertificate();
        if (cert && cert.valid_to) {
          sslInfo.present = true;
          sslInfo.validFrom = cert.valid_from;
          sslInfo.validTo = cert.valid_to;
          const expires = new Date(cert.valid_to);
          const now = new Date();
          const diffMs = expires.getTime() - now.getTime();
          sslInfo.daysRemaining = Math.round(diffMs / (1000 * 60 * 60 * 24));
          const subjCN = cert.subject?.CN as string | string[] | undefined;
          const issCN = cert.issuer?.CN as string | string[] | undefined;
          sslInfo.subjectCN = Array.isArray(subjCN) ? subjCN[0] : subjCN;
          sslInfo.issuerCN = Array.isArray(issCN) ? issCN[0] : issCN;
        }
        socket.end();
        resolve();
      }
    );
    socket.on('error', () => {
      sslInfo.present = false;
      resolve();
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve();
    });
  });

  return res.json({
    ok: true,
    host,
    dns: {
      aRecords,
      cname,
      matchesPublicIp,
      expectedIp: publicIp || null,
    },
    ssl: sslInfo,
  });
});

/**
 * POST /api/saas/tenants/:id/ssl-issue
 * Emite/renova certificado SSL via Certbot (requer CERTBOT_ENABLED=1 e CERTBOT_EMAIL no .env).
 */
saasRouter.post('/tenants/:id/ssl-issue', async (req: Request, res: Response): Promise<Response | void> => {
  if (String(process.env.CERTBOT_ENABLED || '').trim() !== '1') {
    return res.status(400).json({ error: 'CERTBOT_ENABLED=1 não definido no .env. Configure Certbot antes de usar este recurso.' });
  }
  const email = (process.env.CERTBOT_EMAIL || '').trim();
  if (!email) {
    return res.status(400).json({ error: 'CERTBOT_EMAIL não definido no .env.' });
  }
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT subdomain, custom_domain FROM tenants WHERE id = ? LIMIT 1',
    [id]
  );
  const row = Array.isArray(rows) && rows.length > 0 ? (rows as { subdomain: string | null; custom_domain: string | null }[])[0] : null;
  if (!row) return res.status(404).json({ error: 'Provedor não encontrado' });
  const baseDomain = (process.env.BASE_DOMAIN || '').trim().toLowerCase();
  let host: string | null = null;
  if (row.custom_domain) host = row.custom_domain.toLowerCase();
  else if (row.subdomain && baseDomain) host = `${row.subdomain.toLowerCase()}.${baseDomain}`;
  if (!host) return res.status(400).json({ error: 'Sem domínio configurado para emitir SSL.' });

  const args = ['certonly', '--nginx', '-d', host, '--non-interactive', '--agree-tos', '--email', email];
  const proc = spawn('certbot', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (c) => { stdout += c.toString(); });
  proc.stderr.on('data', (c) => { stderr += c.toString(); });
  proc.on('close', (code) => {
    const success = code === 0;
    res.json({
      ok: success,
      code,
      stdout,
      stderr,
    });
  });
  proc.on('error', (err) => {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  });
});

/**
 * GET /api/saas/tenants/:id/metrics
 * Métricas do provedor: clientes ativos, PPPoE online, banda contratada, faturamento.
 */
saasRouter.get('/tenants/:id/metrics', async (req: Request, res: Response): Promise<Response | void> => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  let client: pg.Client | null = null;
  const metrics = {
    customersActive: null as number | null,
    pppoeOnline: null as number | null,
    bandwidthMbps: null as number | null,
    revenueMonth: null as number | null,
  };
  try {
    client = await getTenantDbClient(id);
    if (!client) {
      return res.json({ ok: false, error: 'Banco do tenant não está configurado no provisioning (pgHostPort/dbName/dbUser/dbPass).' });
    }
    // Clientes ativos
    try {
      const r1 = await client.query('SELECT COUNT(*)::int AS c FROM customers WHERE active = true');
      metrics.customersActive = r1.rows[0]?.c ?? 0;
    } catch {
      metrics.customersActive = null;
    }
    // PPPoE online (radacct sem stop)
    try {
      const r2 = await client.query('SELECT COUNT(*)::int AS c FROM radacct WHERE acctstoptime IS NULL');
      metrics.pppoeOnline = r2.rows[0]?.c ?? 0;
    } catch {
      metrics.pppoeOnline = null;
    }
    // Banda contratada (soma de instalações ativas com plano associado)
    try {
      const r3 = await client.query(`
        SELECT COALESCE(SUM(
          CASE
            WHEN p.unit = 'Giga' THEN (p.speed_display::numeric * 1000)
            ELSE p.speed_display::numeric
          END
        ), 0)::int AS mbps
        FROM installations i
        JOIN plans p ON p.code = i.plan_code
        WHERE i.status = 'ACTIVE'
      `);
      metrics.bandwidthMbps = r3.rows[0]?.mbps ?? 0;
    } catch {
      metrics.bandwidthMbps = null;
    }
    // Faturamento do mês (invoices)
    try {
      const r4 = await client.query(`
        SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS total
        FROM invoices
        WHERE date_trunc('month', due_date) = date_trunc('month', CURRENT_DATE)
      `);
      const val = r4.rows[0]?.total;
      metrics.revenueMonth = val != null ? Number(val) : 0;
    } catch {
      metrics.revenueMonth = null;
    }
    return res.json({ ok: true, metrics });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg });
  } finally {
    if (client) {
      try { await client.end(); } catch { /* ignore */ }
    }
  }
});

/**
 * GET /api/saas/nginx-snippet
 * Retorna snippet Nginx com todos os tenants provisionados (sitePort + adminPort). Pronto para colar no server {}.
 */
saasRouter.get('/nginx-snippet', async (_req: Request, res: Response): Promise<Response | void> => {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, slug, config_json FROM tenants WHERE config_json IS NOT NULL ORDER BY slug'
  );
  const list = Array.isArray(rows) ? (rows as { id: number; slug: string; config_json: unknown }[]) : [];
  const included: { slug: string; sitePort: number; adminPort: number }[] = [];
  const skipped: { slug: string; reason: string }[] = [];
  for (const t of list) {
    const prov = (t.config_json && typeof t.config_json === 'object' && (t.config_json as Record<string, unknown>).provisioning) as Record<string, unknown> | undefined;
    const ports = prov?.ports as { sitePort?: number; adminPort?: number } | undefined;
    const sitePort = ports?.sitePort;
    const adminPort = ports?.adminPort ?? null;
    if (sitePort == null) continue;
    if (adminPort == null) {
      skipped.push({ slug: t.slug, reason: 'adminPort não definido (stack antigo)' });
      continue;
    }
    included.push({ slug: t.slug, sitePort, adminPort });
  }
  const fullSnippet = buildFullNginxSnippet(included);

  return res.json({
    ok: true,
    tenantsIncluded: included.length,
    skipped,
    snippet: fullSnippet,
    note: skipped.length
      ? `${skipped.length} tenant(s) omitido(s): adicione adminPort no stack ou use o snippet individual por tenant.`
      : null,
  });
});

/**
 * DELETE /api/saas/tenants/:id
 * Desprovisiona o stack (docker compose down, remove pasta), limpa config_json e marca tenant como CANCELLED.
 * Query ?hard=1 remove o registro do tenant do banco (use com cuidado).
 */
saasRouter.delete('/tenants/:id', async (req: Request, res: Response): Promise<Response | void> => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const hard = req.query.hard === '1' || req.query.hard === 'true';

  const pool = getPool();
  const [rows] = await pool.query('SELECT id, slug FROM tenants WHERE id = ? LIMIT 1', [id]);
  const tenant = Array.isArray(rows) && (rows as { id: number; slug: string }[]).length > 0 ? (rows as { id: number; slug: string }[])[0] : null;
  if (!tenant) return res.status(404).json({ error: 'Provedor não encontrado' });

  const deproResult = await deprovisionTenantStack(id);

  if (hard) {
    await pool.query('DELETE FROM tenant_user_roles WHERE tenant_id = ?', [id]);
    await pool.query('DELETE FROM tenant_role_permissions WHERE tenant_id = ?', [id]);
    await pool.query('DELETE FROM tenant_users WHERE tenant_id = ?', [id]);
    await pool.query('DELETE FROM tenant_roles WHERE tenant_id = ?', [id]);
    await pool.query('DELETE FROM tenant_nas WHERE tenant_id = ?', [id]).catch(() => {});
    await pool.query('DELETE FROM tenants WHERE id = ?', [id]);
    return res.json({ ok: true, message: 'Tenant e stack removidos.', deprovisioning: deproResult });
  }

  await pool.query("UPDATE tenants SET status = 'CANCELLED', updated_at = NOW() WHERE id = ?", [id]);
  return res.json({ ok: true, message: 'Stack derrubado e tenant marcado como CANCELLED.', deprovisioning: deproResult });
});

/**
 * PATCH /api/saas/tenants/:id
 * Atualiza tenant (domínio próprio, subdomínio, status). Admin do SaaS.
 */
saasRouter.patch('/tenants/:id', async (req: Request, res: Response): Promise<Response | void> => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  const body = req.body || {};
  const name = body.name !== undefined ? String(body.name).trim() : undefined;
  const customDomain = body.custom_domain !== undefined
    ? (body.custom_domain ? String(body.custom_domain).trim().toLowerCase() : null)
    : undefined;
  const subdomain = body.subdomain !== undefined
    ? (body.subdomain ? String(body.subdomain).trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : null)
    : undefined;
  const status = body.status !== undefined ? String(body.status).trim().toUpperCase() : undefined;
  const validStatus = ['ACTIVE', 'SUSPENDED', 'TRIAL', 'CANCELLED'];
  if (status !== undefined && !validStatus.includes(status)) {
    return res.status(400).json({ error: 'Status inválido. Use: ACTIVE, SUSPENDED, TRIAL, CANCELLED' });
  }
  if (name !== undefined && name.length < 2) {
    return res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres.' });
  }

  const pool = getPool();
  const updates: string[] = [];
  const params: Record<string, string | number | null> = { id };

  if (name !== undefined) {
    updates.push('name = :name');
    params.name = name;
  }
  if (customDomain !== undefined) {
    if (customDomain && customDomain.length < 3) {
      return res.status(400).json({ error: 'Domínio próprio deve ter pelo menos 3 caracteres.' });
    }
    updates.push('custom_domain = :custom_domain');
    params.custom_domain = customDomain;
  }
  if (subdomain !== undefined) {
    if (subdomain && !/^[a-z0-9-]+$/.test(subdomain)) {
      return res.status(400).json({ error: 'Subdomínio só pode conter letras minúsculas, números e hífens.' });
    }
    updates.push('subdomain = :subdomain');
    params.subdomain = subdomain;
  }
  if (status !== undefined) {
    updates.push('status = :status');
    params.status = status;
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar. Envie name, custom_domain, subdomain e/ou status.' });
  }

  if (customDomain) {
    const [existing] = await pool.query(
      'SELECT id FROM tenants WHERE custom_domain = :d AND id != :id LIMIT 1',
      { d: customDomain, id }
    );
    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json({ error: 'Este domínio próprio já está em uso por outro provedor.' });
    }
  }
  if (subdomain) {
    const [existing] = await pool.query(
      'SELECT id FROM tenants WHERE subdomain = :s AND id != :id LIMIT 1',
      { s: subdomain, id }
    );
    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json({ error: 'Este subdomínio já está em uso por outro provedor.' });
    }
  }

  await pool.query(
    `UPDATE tenants SET ${updates.join(', ')}, updated_at = NOW() WHERE id = :id`,
    params as Record<string, string | number>
  );
  return res.json({ ok: true });
});

// ---- RADIUS (admin SaaS) ----

/**
 * GET /api/saas/radius-status
 * Status do RADIUS global (.env) e por tenant (config_json.radius).
 */
saasRouter.get('/radius-status', async (_req: Request, res: Response): Promise<Response | void> => {
  const globalConfig = getRadiusConfig();
  const global = globalConfig
    ? { configured: true, host: globalConfig.host, port: globalConfig.port, nasIp: globalConfig.nasIp ?? null }
    : { configured: false, message: 'RADIUS global não configurado (RADIUS_HOST e RADIUS_SECRET no .env)' };

  const pool = getPool();
  let tenantsRadius: { tenantId: number; tenantName: string; slug: string; configured: boolean; host?: string; port?: number; nasIp?: string | null }[] = [];
  try {
    const [rows] = await pool.query(
      `SELECT id, name, slug, config_json FROM tenants WHERE status = 'ACTIVE'`
    );
    const list = Array.isArray(rows) ? (rows as { id: number; name: string; slug: string; config_json: unknown }[]) : [];
    tenantsRadius = list.map((t) => {
      let configured = false;
      let host: string | undefined;
      let port: number | undefined;
      let nasIp: string | null | undefined;
      if (t.config_json && typeof t.config_json === 'object' && t.config_json !== null) {
        const cfg = (t.config_json as { radius?: { host?: string; port?: number; secret?: string; nasIp?: string } }).radius;
        if (cfg && cfg.host && cfg.secret) {
          configured = true;
          host = cfg.host;
          port = cfg.port ?? 1812;
          nasIp = cfg.nasIp ?? null;
        }
      }
      return { tenantId: t.id, tenantName: t.name, slug: t.slug, configured, host, port, nasIp };
    });
  } catch {
    // tabela ou config_json pode não existir
  }
  return res.json({ ok: true, global, tenants: tenantsRadius });
});

/**
 * POST /api/saas/radius-restart
 * Reinicia o FreeRADIUS (freeradius-standalone) em modo standalone. Requer que o app rode com permissão para systemctl.
 */
saasRouter.post('/radius-restart', (_req: Request, res: Response): Response | void => {
  if (!isStandalone()) {
    return res.status(400).json({ ok: false, message: 'Restart do RADIUS só disponível em modo standalone (instalação nativa).' });
  }
  try {
    execSync('systemctl restart freeradius-standalone', { stdio: 'pipe', encoding: 'utf8' });
    return res.json({ ok: true, message: 'FreeRADIUS reiniciado com sucesso.' });
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    const msg = err.stderr || err.message || 'Falha ao reiniciar. Verifique se o serviço freeradius-standalone existe e se o app tem permissão (ex.: rodar como root).';
    return res.status(500).json({ ok: false, message: msg });
  }
});

/**
 * POST /api/saas/radius-test
 * Testa autenticação RADIUS: body { tenantId?: number, username, password }. Se tenantId, usa config do tenant.
 */
saasRouter.post('/radius-test', async (req: Request, res: Response): Promise<Response | void> => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!username) return res.status(400).json({ success: false, message: 'Informe o usuário.' });

  const tenantId = req.body?.tenantId != null ? Number(req.body.tenantId) : null;
  if (tenantId) {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT config_json FROM tenants WHERE id = ? AND status = ? LIMIT 1',
      [tenantId, 'ACTIVE']
    );
    const row = Array.isArray(rows) && (rows as { config_json: unknown }[]).length > 0 ? (rows as { config_json: unknown }[])[0] : null;
    const cfg = row?.config_json && typeof row.config_json === 'object' && row.config_json !== null
      ? (row.config_json as { radius?: { host?: string; port?: number; secret?: string; nasIp?: string } }).radius
      : null;
    if (!cfg || !cfg.host || !cfg.secret) {
      return res.json({
        success: false,
        message: 'Provedor sem RADIUS configurado. Provisione o stack do provedor (criar ou reinstalar) para preencher config_json.radius (host, porta, secret).',
      });
    }
    const config = {
      host: cfg.host,
      port: cfg.port ?? 1812,
      secret: cfg.secret,
      nasIp: cfg.nasIp,
    };
    const result = await authenticateWithConfig(config, username, password);
    if (result.success) return res.json({ success: true, message: result.message });

    // Diagnóstico: quando falha com tenant, verificar se o usuário está no radcheck do provedor
    let message = result.message;
    let client: pg.Client | null = null;
    try {
      client = await getTenantDbClient(tenantId);
      if (client) {
        try {
          const r = await client.query(
            `SELECT attribute, value FROM radcheck WHERE username = $1`,
            [username]
          );
          const rows = Array.isArray(r?.rows) ? r.rows as { attribute: string }[] : [];
          const inRadcheck = rows.length > 0;
          const hasPassword = rows.some((row: { attribute: string }) => row.attribute === 'Cleartext-Password');
          if (!inRadcheck) {
            message = 'Usuário não está no RADIUS deste provedor. Cadastre a instalação no Portal do Provedor (Clientes → instalação) com usuário e senha PPPoE e salve.';
          } else if (!hasPassword) {
            message = 'Usuário está no RADIUS mas sem senha definida. Defina a senha PPPoE na instalação (Portal do Provedor) e salve.';
          } else {
            message = 'Usuário existe no RADIUS; a senha digitada não confere. Use exatamente a senha PPPoE da instalação (Portal do Provedor → Clientes → instalação do cliente).';
          }
        } catch (queryErr: unknown) {
          const code = (queryErr as { code?: string })?.code;
          if (code === '42P01' || code === 'ER_NO_SUCH_TABLE') {
            message = 'RADIUS rejeitou. A tabela radcheck pode não existir no banco do provedor (reprovisione o stack se necessário). Confira no Portal do Provedor: Clientes → instalação → usuário e senha PPPoE.';
          }
        }
      } else {
        message = 'RADIUS rejeitou. Não foi possível consultar o banco do provedor (teste deve rodar no mesmo servidor do stack). Confira no Portal do Provedor: Clientes → instalação → usuário e senha PPPoE.';
      }
    } catch {
      // Conexão ao banco do tenant falhou (ex.: SaaS em outro host) — dar mensagem útil
      message = 'RADIUS rejeitou. Não foi possível consultar o banco do provedor (o teste deve rodar no mesmo servidor do stack ou com acesso ao Postgres do tenant). Confira no Portal do Provedor: Clientes → instalação → usuário e senha PPPoE.';
    } finally {
      if (client) {
        try { await client.end(); } catch { /* ignore */ }
      }
    }
    // Nunca devolver a mensagem genérica do RADIUS quando há tenant: preferir diagnóstico
    const genericMsg = 'Usuário ou senha inválidos. Confira no Portal do Provedor:';
    if (message && message.includes(genericMsg)) {
      message = 'RADIUS rejeitou esta combinação de usuário/senha. ' +
        'Confira no Portal do Provedor: Clientes → instalação do cliente → usuário e senha PPPoE (devem estar sincronizados no RADIUS). ' +
        'Se o diagnóstico não aparecer acima, o Admin do SaaS precisa rodar no mesmo servidor do stack do provedor para consultar o radcheck.';
    }
    return res.json({ success: false, message });
  }

  const globalConfig = getRadiusConfig();
  if (!globalConfig) {
    return res.json({ success: false, message: 'RADIUS global não configurado.' });
  }
  const result = await authenticateWithConfig(globalConfig, username, password);
  return res.json({ success: result.success, message: result.message });
});

// ---- Concentradores (NAS) por tenant ----

/**
 * GET /api/saas/tenants/:id/nas
 * Lista concentradores (NAS) do tenant.
 */
saasRouter.get('/tenants/:id/nas', async (req: Request, res: Response): Promise<Response | void> => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  let list: Record<string, unknown>[] = [];
  // 1) Tenta ler do banco do tenant (stack Docker), onde o portal do provedor cadastra as NAS
  let client: pg.Client | null = null;
  try {
    client = await getTenantDbClient(id);
    if (client) {
      const r = await client.query(
        'SELECT id, tenant_id, name, nas_ip, description, is_active, created_at FROM tenant_nas ORDER BY name'
      );
      list = Array.isArray(r.rows) ? (r.rows as Record<string, unknown>[]) : [];
    }
  } catch {
    // ignora erro e tenta fallback no banco central
  } finally {
    if (client) {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  // 2) Fallback: banco central (tenant_nas global) para instalações antigas
  if (!list.length) {
    const pool = getPool();
    try {
      const [rows] = await pool.query(
        'SELECT id, tenant_id, name, nas_ip, description, is_active, created_at FROM tenant_nas WHERE tenant_id = ? ORDER BY name',
        [id]
      );
      list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    } catch {
      // tabela tenant_nas pode não existir ainda (rodar sql/tenant_nas.sql)
    }
  }
  return res.json({ ok: true, nas: list });
});

/**
 * POST /api/saas/tenants/:id/nas
 * Cria concentrador (NAS) do tenant.
 */
saasRouter.post('/tenants/:id/nas', async (req: Request, res: Response): Promise<Response | void> => {
  const tenantId = Number(req.params.id);
  if (!tenantId) return res.status(400).json({ error: 'ID do tenant inválido' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = body.name != null ? String(body.name).trim() : '';
  const nasIp = body.nas_ip != null ? String(body.nas_ip).trim() : (body.nasIp != null ? String(body.nasIp).trim() : '');
  const description = body.description != null && body.description !== '' ? String(body.description).trim() : null;
  const isActive = body.is_active !== undefined ? Boolean(body.is_active) : (body.isActive !== undefined ? Boolean(body.isActive) : true);

  if (!name) return res.status(400).json({ error: 'Nome é obrigatório.' });
  if (!nasIp) return res.status(400).json({ error: 'IP do NAS é obrigatório.' });
  if (description !== null && description.length > 255) return res.status(400).json({ error: 'Descrição com mais de 255 caracteres.' });
  const pool = getPool();
  try {
    const [r] = await pool.query(
      'INSERT INTO tenant_nas (tenant_id, name, nas_ip, description, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [tenantId, name, nasIp, description, isActive]
    );
    const insertId = (r as { insertId?: number })?.insertId;
    if (insertId == null) return res.status(500).json({ error: 'Erro ao criar concentrador. Verifique o banco de dados.' });
    return res.status(201).json({ ok: true, id: insertId });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Tabela tenant_nas não existe. Execute no terminal: node scripts/create-tenant-nas.mjs',
        code: 'ER_NO_SUCH_TABLE',
      });
    }
    if (err?.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(404).json({ error: 'Provedor não encontrado' });
    }
    throw e;
  }
});

/**
 * PATCH /api/saas/tenants/:tenantId/nas/:nasId
 * Atualiza concentrador (NAS).
 */
saasRouter.patch('/tenants/:tenantId/nas/:nasId', async (req: Request, res: Response): Promise<Response | void> => {
  const tenantId = Number(req.params.tenantId);
  const nasId = Number(req.params.nasId);
  if (!tenantId || !nasId) return res.status(400).json({ error: 'IDs inválidos' });
  const body = req.body || {};
  const name = body.name != null ? String(body.name).trim() : undefined;
  const nas_ip = body.nas_ip != null ? String(body.nas_ip).trim() : undefined;
  const description = body.description !== undefined ? (body.description ? String(body.description).trim() : null) : undefined;
  const is_active = body.is_active !== undefined ? Boolean(body.is_active) : undefined;
  if (!name && !nas_ip && description === undefined && is_active === undefined) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
  }
  const pool = getPool();
  const updates: string[] = [];
  const params: (string | number | null)[] = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (nas_ip !== undefined) { updates.push('nas_ip = ?'); params.push(nas_ip); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
  params.push(nasId, tenantId);
  try {
    const [result] = await pool.query(
      `UPDATE tenant_nas SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
      params
    );
    const affected = (result as { affectedRows?: number })?.affectedRows ?? 0;
    if (affected === 0) return res.status(404).json({ error: 'Concentrador não encontrado' });
    return res.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Tabela tenant_nas não existe. Execute: node scripts/create-tenant-nas.mjs',
        code: 'ER_NO_SUCH_TABLE',
      });
    }
    throw e;
  }
});

/**
 * DELETE /api/saas/tenants/:tenantId/nas/:nasId
 * Remove concentrador (NAS).
 */
saasRouter.delete('/tenants/:tenantId/nas/:nasId', async (req: Request, res: Response): Promise<Response | void> => {
  const tenantId = Number(req.params.tenantId);
  const nasId = Number(req.params.nasId);
  if (!tenantId || !nasId) return res.status(400).json({ error: 'IDs inválidos' });
  const pool = getPool();
  try {
    const [result] = await pool.query('DELETE FROM tenant_nas WHERE id = ? AND tenant_id = ?', [nasId, tenantId]);
    const affected = (result as { affectedRows?: number })?.affectedRows ?? 0;
    if (affected === 0) return res.status(404).json({ error: 'Concentrador não encontrado' });
    return res.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'Tabela tenant_nas não existe. Execute: node scripts/create-tenant-nas.mjs',
        code: 'ER_NO_SUCH_TABLE',
      });
    }
    throw e;
  }
});
