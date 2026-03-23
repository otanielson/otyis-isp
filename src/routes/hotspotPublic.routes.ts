import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import { getPool } from '../db.js';
import { authenticateWithConfig } from '../radius.js';
import { disconnectUser } from '../services/radiusClient.js';
import {
  createEfiPixCharge,
  extractPaidTxidsFromWebhook,
  fetchEfiPixCharge,
  parseHotspotGatewayConfig,
  sanitizeHotspotTemplateConfig,
} from '../services/hotspotPix.js';
import { normalizeMac } from '../radius/radiusSync.js';

export const hotspotPublicRouter = Router();

interface HotspotPublicTemplate {
  id: number;
  tenant_id: number;
  name: string;
  slug: string;
  description: string | null;
  auth_type: string;
  portal_enabled: boolean;
  radius_enabled: boolean;
  free_minutes: number;
  otp_enabled: boolean;
  payment_required: boolean;
  payment_method: string | null;
  payment_amount: number | null;
  requires_phone: boolean;
  requires_name: boolean;
  auto_release_after_payment: boolean;
  bind_mac: boolean;
  session_timeout_minutes: number;
  redirect_url: string | null;
  is_default: boolean;
  is_active: boolean;
  config_json: unknown;
  pix_plans: Record<string, unknown>[];
}

function asyncHandler(fn: (req: Request, res: Response) => Promise<Response | void>) {
  return (req: Request, res: Response, _next: (err?: unknown) => void) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('[Hotspot Public API]', err);
      res.status(500).json({ message: err instanceof Error ? err.message : 'Erro interno' });
    });
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizePhone(value: unknown): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  return digits || null;
}

function boolish(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return /^(1|true|yes|sim|on)$/i.test(value.trim());
  return false;
}

function normalizeDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isTableNotFoundError(e: unknown): boolean {
  const err = e as { code?: string };
  return err?.code === '42P01' || err?.code === 'ER_NO_SUCH_TABLE';
}

function isStandalone(): boolean {
  return /^(1|true|yes)$/i.test(String(process.env.STANDALONE || '').trim());
}

async function resolveTenantId(
  pool: ReturnType<typeof getPool>,
  tenantSlug?: string | null
): Promise<{ tenantId: number; tenantSlug: string | null }> {
  if (tenantSlug) {
    const [rows] = await pool.query('SELECT id, slug FROM tenants WHERE slug = :slug LIMIT 1', { slug: tenantSlug });
    const row = Array.isArray(rows) && rows[0] ? (rows[0] as { id: number; slug: string | null }) : null;
    if (!row) throw new Error('Tenant do hotspot não encontrado.');
    return { tenantId: Number(row.id), tenantSlug: row.slug || tenantSlug };
  }
  if (isStandalone()) {
    return {
      tenantId: Number(process.env.TENANT_ID || 1) || 1,
      tenantSlug: process.env.TENANT_SLUG ? String(process.env.TENANT_SLUG) : null,
    };
  }
  throw new Error('Tenant do hotspot não informado.');
}

async function getHotspotTemplate(
  pool: ReturnType<typeof getPool>,
  tenantId: number,
  slug: string
): Promise<HotspotPublicTemplate> {
  const [rows] = await pool.query(
    `SELECT id, tenant_id, name, slug, description, auth_type, portal_enabled, radius_enabled,
            free_minutes, otp_enabled, payment_required, payment_method, payment_amount,
            requires_phone, requires_name, auto_release_after_payment, bind_mac,
            session_timeout_minutes, redirect_url, is_default, is_active, config_json
     FROM hotspot_templates
     WHERE tenant_id = :tenantId AND slug = :slug AND is_active = true
     LIMIT 1`,
    { tenantId, slug }
  );
  const template = Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null;
  if (!template) throw new Error('Modelo de hotspot não encontrado.');
  const [plans] = await pool.query(
    `SELECT id, name, price, duration_minutes, sort_order, active
     FROM hotspot_template_pix_plans
     WHERE tenant_id = :tenantId AND template_id = :templateId AND active = true
     ORDER BY sort_order ASC, id ASC`,
    { tenantId, templateId: Number(template.id) }
  );
  return {
    ...template,
    pix_plans: Array.isArray(plans) ? (plans as Record<string, unknown>[]) : [],
  } as HotspotPublicTemplate;
}

async function getHotspotTemplateByReference(
  pool: ReturnType<typeof getPool>,
  tenantId: number,
  templateId?: number | null,
  templateSlug?: string | null
): Promise<Record<string, unknown> | null> {
  if (templateId) {
    const [rows] = await pool.query(
      'SELECT id, tenant_id, slug, auto_release_after_payment, config_json FROM hotspot_templates WHERE tenant_id = :tenantId AND id = :id LIMIT 1',
      { tenantId, id: templateId }
    );
    return Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null;
  }
  if (templateSlug) {
    const [rows] = await pool.query(
      'SELECT id, tenant_id, slug, auto_release_after_payment, config_json FROM hotspot_templates WHERE tenant_id = :tenantId AND slug = :slug LIMIT 1',
      { tenantId, slug: templateSlug }
    );
    return Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null;
  }
  return null;
}

async function readHotspotRadiusConfig(
  pool: ReturnType<typeof getPool>,
  tenantId: number,
  templateConfig?: unknown
): Promise<{ host: string | null; port: number; secret: string | null; nasIp: string | null }> {
  let host = process.env.RADIUS_HOST || null;
  let port = Number(process.env.RADIUS_PORT || 1812) || 1812;
  let secret = process.env.RADIUS_SECRET || null;
  let nasIp = process.env.RADIUS_NAS_IP || null;

  if (!host || !secret || !nasIp) {
    try {
      const [rows] = await pool.query('SELECT config_json FROM tenants WHERE id = :tenantId LIMIT 1', { tenantId });
      const row = Array.isArray(rows) && rows[0] ? (rows[0] as { config_json?: unknown }) : null;
      const cfg = row?.config_json && typeof row.config_json === 'object'
        ? (row.config_json as Record<string, unknown>)
        : {};
      const radius = cfg.radius && typeof cfg.radius === 'object' ? (cfg.radius as Record<string, unknown>) : {};
      const provisioning = cfg.provisioning && typeof cfg.provisioning === 'object'
        ? (cfg.provisioning as Record<string, unknown>)
        : {};
      if (!host && typeof radius.host === 'string') host = radius.host;
      if (radius.port != null && Number(radius.port)) port = Number(radius.port);
      if (!secret) {
        if (typeof radius.secret === 'string') secret = radius.secret;
        else if (typeof provisioning.radiusSecret === 'string') secret = provisioning.radiusSecret;
      }
      if (!nasIp && typeof radius.nasIp === 'string') nasIp = radius.nasIp;
    } catch {
      // Mantém fallback do ambiente.
    }
  }

  const cfg = asRecord(templateConfig);
  if (typeof cfg.hotspot_radius_host === 'string' && cfg.hotspot_radius_host.trim()) host = cfg.hotspot_radius_host.trim();
  if (cfg.hotspot_radius_port != null && Number(cfg.hotspot_radius_port)) port = Number(cfg.hotspot_radius_port);
  if (typeof cfg.hotspot_radius_secret === 'string' && cfg.hotspot_radius_secret.trim()) secret = cfg.hotspot_radius_secret.trim();
  if (typeof cfg.hotspot_radius_nas_ip === 'string' && cfg.hotspot_radius_nas_ip.trim()) nasIp = cfg.hotspot_radius_nas_ip.trim();

  return { host, port, secret, nasIp };
}

function buildHotspotAuthResponse(session: Record<string, unknown>) {
  return {
    id: Number(session.id),
    session_key: stringOrNull(session.session_key),
    auth_mode: stringOrNull(session.auth_mode),
    status: stringOrNull(session.status),
    username: stringOrNull(session.username),
    password: stringOrNull(session.password),
    phone: stringOrNull(session.phone),
    mac_address: stringOrNull(session.mac_address),
    ip_address: stringOrNull(session.ip_address),
    voucher_code: stringOrNull(session.voucher_code),
    radius_username: stringOrNull(session.radius_username),
    radius_validated: boolish(session.radius_validated),
    redirect_url: stringOrNull(session.redirect_url),
    expires_at: session.expires_at || null,
    connected_at: session.connected_at || null,
    release_ready: !!stringOrNull(session.username) || boolish(session.radius_validated),
    metadata_json: asRecord(session.metadata_json),
  };
}

async function createHotspotAuthSession(
  pool: ReturnType<typeof getPool>,
  params: {
    tenantId: number;
    template: HotspotPublicTemplate;
    authMode: string;
    username?: string | null;
    password?: string | null;
    phone?: string | null;
    macAddress?: string | null;
    ipAddress?: string | null;
    voucherCode?: string | null;
    radiusUsername?: string | null;
    radiusValidated?: boolean;
    redirectUrl?: string | null;
    expiresAt?: string | Date | null;
    metadata?: Record<string, unknown>;
  }
): Promise<Record<string, unknown>> {
  const sessionKey = crypto.randomBytes(18).toString('hex');
  await pool.query(
    `INSERT INTO hotspot_auth_sessions (
       tenant_id, template_id, auth_mode, session_key, status, username, password,
       phone, mac_address, ip_address, voucher_code, radius_username, radius_validated,
       redirect_url, metadata_json, expires_at, connected_at, created_at, updated_at
     )
     VALUES (
       :tenantId, :templateId, :authMode, :sessionKey, 'CONNECTED', :username, :password,
       :phone, :macAddress, :ipAddress, :voucherCode, :radiusUsername, :radiusValidated,
       :redirectUrl, :metadataJson::jsonb, :expiresAt, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     )
     RETURNING id`,
    {
      tenantId: params.tenantId,
      templateId: Number(params.template.id),
      authMode: params.authMode,
      sessionKey,
      username: stringOrNull(params.username),
      password: stringOrNull(params.password),
      phone: stringOrNull(params.phone),
      macAddress: stringOrNull(params.macAddress),
      ipAddress: stringOrNull(params.ipAddress),
      voucherCode: stringOrNull(params.voucherCode),
      radiusUsername: stringOrNull(params.radiusUsername),
      radiusValidated: params.radiusValidated ? 1 : 0,
      redirectUrl: stringOrNull(params.redirectUrl) || stringOrNull(params.template.redirect_url) || '/',
      metadataJson: JSON.stringify(params.metadata || {}),
      expiresAt: params.expiresAt || null,
    }
  );
  const session = await loadHotspotAuthSessionByKey(pool, sessionKey);
  return session || { session_key: sessionKey };
}

async function createRadiusAccessForHotspot(
  pool: ReturnType<typeof getPool>,
  params: {
    sessionId: number;
    tenantId: number;
    durationMinutes: number;
    macAddress?: string | null;
    planName?: string | null;
  }
): Promise<{ username: string; password: string; sessionTimeoutSeconds: number }> {
  const username = `hotspot_${params.tenantId}_${params.sessionId}`;
  const password = crypto.randomBytes(6).toString('hex');
  const timeoutSeconds = Math.max(60, Math.round((Number(params.durationMinutes) || 60) * 60));
  const mac = normalizeMac(params.macAddress);

  await pool.query('DELETE FROM radcheck WHERE username = :username', { username });
  await pool.query('DELETE FROM radreply WHERE username = :username', { username });
  await pool.query('DELETE FROM radusergroup WHERE username = :username', { username });

  await pool.query(
    `INSERT INTO radcheck (username, attribute, op, value)
     VALUES (:username, 'Cleartext-Password', ':=', :value)`,
    { username, value: password }
  );
  if (mac) {
    await pool.query(
      `INSERT INTO radcheck (username, attribute, op, value)
       VALUES (:username, 'Calling-Station-Id', ':=', :value)`,
      { username, value: mac }
    );
  }
  await pool.query(
    `INSERT INTO radreply (username, attribute, op, value)
     VALUES (:username, 'Session-Timeout', '=', :value)`,
    { username, value: String(timeoutSeconds) }
  );
  await pool.query(
    `INSERT INTO radreply (username, attribute, op, value)
     VALUES (:username, 'Reply-Message', '=', :value)`,
    { username, value: `Acesso liberado: ${params.planName || 'Hotspot Pix'}` }
  );

  return { username, password, sessionTimeoutSeconds: timeoutSeconds };
}

async function releaseHotspotPaymentSession(
  pool: ReturnType<typeof getPool>,
  session: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (stringOrNull(session.released_username) && stringOrNull(session.released_password)) {
    return session;
  }
  const access = await createRadiusAccessForHotspot(pool, {
    sessionId: Number(session.id),
    tenantId: Number(session.tenant_id),
    durationMinutes: Number(session.duration_minutes) || 60,
    macAddress: stringOrNull(session.mac_address),
    planName: stringOrNull(session.plan_name),
  });
  await pool.query(
    `UPDATE hotspot_payment_sessions
     SET status = 'RELEASED',
         paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
         released_at = CURRENT_TIMESTAMP,
         released_username = :username,
         released_password = :password,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :id`,
    {
      id: Number(session.id),
      username: access.username,
      password: access.password,
    }
  );
  try {
    await disconnectUser(pool, access.username);
  } catch {
    // Não impede a liberação. Em muitos cenários o usuário ainda não abriu sessão autenticada.
  }
  return {
    ...session,
    status: 'RELEASED',
    paid_at: session.paid_at || new Date().toISOString(),
    released_at: new Date().toISOString(),
    released_username: access.username,
    released_password: access.password,
  };
}

async function loadPaymentSessionByKey(pool: ReturnType<typeof getPool>, sessionKey: string) {
  const [rows] = await pool.query(
    `SELECT *
     FROM hotspot_payment_sessions
     WHERE session_key = :sessionKey
     LIMIT 1`,
    { sessionKey }
  );
  return Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null;
}

function buildPublicSessionResponse(session: Record<string, unknown>) {
  return {
    id: Number(session.id),
    session_key: stringOrNull(session.session_key),
    status: stringOrNull(session.status),
    amount: Number(session.amount || 0),
    duration_minutes: Number(session.duration_minutes || 0),
    payer_name: stringOrNull(session.payer_name),
    payer_phone: stringOrNull(session.payer_phone),
    mac_address: stringOrNull(session.mac_address),
    ip_address: stringOrNull(session.ip_address),
    txid: stringOrNull(session.txid),
    charge_id: stringOrNull(session.charge_id),
    pix_qrcode: stringOrNull(session.pix_qrcode),
    pix_copia_cola: stringOrNull(session.pix_copia_cola),
    expires_at: session.expires_at || null,
    redirect_url: stringOrNull(session.redirect_url),
    paid_at: session.paid_at || null,
    released_at: session.released_at || null,
    released_username: stringOrNull(session.released_username),
    released_password: stringOrNull(session.released_password),
    release_ready: !!stringOrNull(session.released_username),
    template_id: Number(session.template_id || 0),
    plan_name: stringOrNull(session.plan_name),
  };
}

async function loadHotspotAuthSessionByKey(pool: ReturnType<typeof getPool>, sessionKey: string) {
  const [rows] = await pool.query(
    `SELECT *
     FROM hotspot_auth_sessions
     WHERE session_key = :sessionKey
     LIMIT 1`,
    { sessionKey }
  );
  return Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null;
}

hotspotPublicRouter.get('/hotspot/templates/:slug', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  try {
    const tenant = await resolveTenantId(pool, null);
    const template = await getHotspotTemplate(pool, tenant.tenantId, req.params.slug);
    return res.json({
      ok: true,
      tenant_slug: tenant.tenantSlug,
      template: {
        ...template,
        config_json: sanitizeHotspotTemplateConfig(template.config_json, { includeSecrets: false }),
      },
    });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Execute sql/hotspot_templates.sql' });
    throw e;
  }
}));

hotspotPublicRouter.get('/hotspot/default-template', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  try {
    const tenant = await resolveTenantId(pool, null);
    const [rows] = await pool.query(
      `SELECT id, name, slug, description, auth_type, portal_enabled, radius_enabled,
              free_minutes, otp_enabled, payment_required, payment_method, payment_amount,
              requires_phone, requires_name, auto_release_after_payment, bind_mac,
              session_timeout_minutes, redirect_url, is_default, is_active, config_json
       FROM hotspot_templates
       WHERE tenant_id = :tenantId AND is_active = true
       ORDER BY is_default DESC, name ASC
       LIMIT 1`,
      { tenantId: tenant.tenantId }
    );
    const templateRow = Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null;
    if (!templateRow) return res.status(404).json({ message: 'Nenhum modelo ativo encontrado.' });
    const template = await getHotspotTemplate(pool, tenant.tenantId, String(templateRow.slug || ''));
    return res.json({
      ok: true,
      tenant_slug: tenant.tenantSlug,
      template: {
        ...template,
        config_json: sanitizeHotspotTemplateConfig(template.config_json, { includeSecrets: false }),
      },
    });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Execute sql/hotspot_templates.sql' });
    throw e;
  }
}));

hotspotPublicRouter.get('/hotspot/:tenantSlug/templates/:slug', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  try {
    const tenant = await resolveTenantId(pool, req.params.tenantSlug);
    const template = await getHotspotTemplate(pool, tenant.tenantId, req.params.slug);
    return res.json({
      ok: true,
      tenant_slug: tenant.tenantSlug,
      template: {
        ...template,
        config_json: sanitizeHotspotTemplateConfig(template.config_json, { includeSecrets: false }),
      },
    });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Execute sql/hotspot_templates.sql' });
    throw e;
  }
}));

hotspotPublicRouter.get('/hotspot/:tenantSlug/default-template', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  try {
    const tenant = await resolveTenantId(pool, req.params.tenantSlug);
    const [rows] = await pool.query(
      `SELECT id, name, slug, description, auth_type, portal_enabled, radius_enabled,
              free_minutes, otp_enabled, payment_required, payment_method, payment_amount,
              requires_phone, requires_name, auto_release_after_payment, bind_mac,
              session_timeout_minutes, redirect_url, is_default, is_active, config_json
       FROM hotspot_templates
       WHERE tenant_id = :tenantId AND is_active = true
       ORDER BY is_default DESC, name ASC
       LIMIT 1`,
      { tenantId: tenant.tenantId }
    );
    const templateRow = Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null;
    if (!templateRow) return res.status(404).json({ message: 'Nenhum modelo ativo encontrado.' });
    const template = await getHotspotTemplate(pool, tenant.tenantId, String(templateRow.slug || ''));
    return res.json({
      ok: true,
      tenant_slug: tenant.tenantSlug,
      template: {
        ...template,
        config_json: sanitizeHotspotTemplateConfig(template.config_json, { includeSecrets: false }),
      },
    });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Execute sql/hotspot_templates.sql' });
    throw e;
  }
}));

async function createPixCharge(req: Request, res: Response, tenantSlug: string | null): Promise<Response> {
  const pool = getPool();
  const tenant = await resolveTenantId(pool, tenantSlug);
  const template = await getHotspotTemplate(pool, tenant.tenantId, req.params.slug);
  const authType = String(template.auth_type || '').toLowerCase();
  if (authType !== 'pix' && authType !== 'temporary_pix') {
    return res.status(400).json({ message: 'Este modelo não usa cobrança Pix.' });
  }
  const body = asRecord(req.body);
  const plans = Array.isArray(template.pix_plans) ? (template.pix_plans as Record<string, unknown>[]) : [];
  const requestedPlanId = Number(body.plan_id || 0) || null;
  const selectedPlan = requestedPlanId ? plans.find((plan) => Number(plan.id) === requestedPlanId) || null : null;
  const amount = selectedPlan ? Number(selectedPlan.price || 0) : Number(body.amount || template.payment_amount || 0);
  const durationMinutes = selectedPlan ? Number(selectedPlan.duration_minutes || 60) : Math.max(1, Number(body.duration_minutes || template.session_timeout_minutes || 60));
  const payerName = stringOrNull(body.payer_name);
  const payerPhone = normalizePhone(body.payer_phone);
  const payerDocument = stringOrNull(body.payer_document);
  const macAddress = stringOrNull(body.mac_address);
  const ipAddress = stringOrNull(body.ip_address);
  const sessionKey = crypto.randomBytes(18).toString('hex');
  const config = parseHotspotGatewayConfig(template.config_json);
  const webhookSecret = config.hotspotWebhookSecret || crypto.randomBytes(12).toString('hex');
  const webhookUrl = config.hotspotWebhookUrl || `${req.protocol}://${req.get('host') || 'localhost'}/api/hotspot/efi/webhook/${tenant.tenantSlug || tenant.tenantId}/${template.slug}/pix`;
  const charge = await createEfiPixCharge(template.config_json, {
    amount,
    payerName,
    payerPhone,
    payerDocument,
    description: stringOrNull(body.description) || `Hotspot ${template.name}`,
    expirationSeconds: Number(body.expiration_seconds || 900) || 900,
    externalReference: sessionKey,
  });
  const metadataJson = JSON.stringify({
    webhook_url: webhookUrl,
    gateway_name: config.hotspotGatewayName,
    gateway_type: config.hotspotGatewayType,
    imagem_qrcode: charge.imagemQrcode,
    link_visualizacao: charge.linkVisualizacao,
    external_reference: sessionKey,
  });
  const [ins] = await pool.query(
    `INSERT INTO hotspot_payment_sessions (
       tenant_id, template_id, gateway_type, charge_id, txid, status, amount, duration_minutes,
       payer_name, payer_phone, payer_document, mac_address, ip_address, session_key, pix_qrcode,
       pix_copia_cola, expires_at, metadata_json, gateway_response_json, webhook_secret, plan_id, plan_name, redirect_url,
       created_at, updated_at
     )
     VALUES (
       :tenant_id, :template_id, :gateway_type, :charge_id, :txid, :status, :amount, :duration_minutes,
       :payer_name, :payer_phone, :payer_document, :mac_address, :ip_address, :session_key, :pix_qrcode,
       :pix_copia_cola, CURRENT_TIMESTAMP + (:expires_interval || ' seconds')::interval, :metadata_json::jsonb,
       :gateway_response_json::jsonb, :webhook_secret, :plan_id, :plan_name, :redirect_url, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     )
     RETURNING id`,
    {
      tenant_id: tenant.tenantId,
      template_id: Number(template.id),
      gateway_type: 'efi',
      charge_id: charge.locationId ? String(charge.locationId) : charge.txid,
      txid: charge.txid,
      status: charge.status || 'ATIVA',
      amount,
      duration_minutes: durationMinutes,
      payer_name: payerName,
      payer_phone: payerPhone,
      payer_document: payerDocument,
      mac_address: macAddress,
      ip_address: ipAddress,
      session_key: sessionKey,
      pix_qrcode: charge.imagemQrcode,
      pix_copia_cola: charge.qrcode,
      expires_interval: String(Math.max(300, Number(body.expiration_seconds || 900) || 900)),
      metadata_json: metadataJson,
      gateway_response_json: JSON.stringify(charge.chargeResponse || {}),
      webhook_secret: webhookSecret,
      plan_id: selectedPlan ? Number(selectedPlan.id) : null,
      plan_name: selectedPlan ? String(selectedPlan.name || '') : null,
      redirect_url: stringOrNull(body.redirect_url) || stringOrNull(template.redirect_url) || '/wifi/sucesso',
    }
  );
  const sessionId = Number((ins as { insertId?: number }).insertId || 0);
  return res.status(201).json({
    ok: true,
    gateway: 'efi',
    environment: config.hotspotGatewaySandbox ? 'sandbox' : 'production',
    session_id: sessionId,
    session_key: sessionKey,
    webhook_url: webhookUrl,
    txid: charge.txid,
    amount,
    duration_minutes: durationMinutes,
    pix_copia_cola: charge.qrcode,
    pix_qrcode: charge.imagemQrcode,
    link_visualizacao: charge.linkVisualizacao,
    status: charge.status || 'ATIVA',
    success_url: `/hotspot/sucesso?session=${encodeURIComponent(sessionKey)}`,
    expired_url: `/hotspot/expirado?session=${encodeURIComponent(sessionKey)}`,
  });
}

hotspotPublicRouter.post('/hotspot/templates/:slug/pix/charges', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  return createPixCharge(req, res, null);
}));

hotspotPublicRouter.post('/hotspot/:tenantSlug/templates/:slug/pix/charges', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  return createPixCharge(req, res, req.params.tenantSlug);
}));

async function voucherLogin(req: Request, res: Response, tenantSlug: string | null): Promise<Response> {
  const pool = getPool();
  const tenant = await resolveTenantId(pool, tenantSlug);
  const template = await getHotspotTemplate(pool, tenant.tenantId, req.params.slug);
  const body = asRecord(req.body);
  const voucherCode = stringOrNull(body.voucher_code);
  const macAddress = stringOrNull(body.mac_address);
  const ipAddress = stringOrNull(body.ip_address);

  if (!voucherCode) return res.status(400).json({ message: 'Informe o voucher.' });

  const [rows] = await pool.query(
    `SELECT id, code, duration_minutes, used_at
     FROM vouchers
     WHERE tenant_id = :tenantId AND code = :code
     LIMIT 1`,
    { tenantId: tenant.tenantId, code: voucherCode }
  );
  const voucher = Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null;
  if (!voucher) return res.status(404).json({ message: 'Voucher não encontrado.' });
  if (voucher.used_at) return res.status(409).json({ message: 'Este voucher já foi utilizado.' });

  await pool.query(
    `UPDATE vouchers
     SET used_at = CURRENT_TIMESTAMP
     WHERE id = :id AND used_at IS NULL`,
    { id: Number(voucher.id) }
  );

  const session = await createHotspotAuthSession(pool, {
    tenantId: tenant.tenantId,
    template,
    authMode: 'voucher',
    username: `voucher_${voucher.id}`,
    password: voucherCode,
    macAddress,
    ipAddress,
    voucherCode,
    redirectUrl: stringOrNull(body.redirect_url),
    expiresAt: new Date(Date.now() + Math.max(1, Number(voucher.duration_minutes) || 60) * 60 * 1000),
    metadata: {
      duration_minutes: Number(voucher.duration_minutes) || 60,
      source: 'voucher',
    },
  });

  try {
    await disconnectUser(pool, `voucher_${voucher.id}`);
  } catch {
    // ignore
  }

  return res.json({
    ok: true,
    session: buildHotspotAuthResponse(session),
  });
}

hotspotPublicRouter.post('/hotspot/templates/:slug/voucher/login', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  return voucherLogin(req, res, null);
}));

hotspotPublicRouter.post('/hotspot/:tenantSlug/templates/:slug/voucher/login', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  return voucherLogin(req, res, req.params.tenantSlug);
}));

async function requestPhoneOtp(req: Request, res: Response, tenantSlug: string | null): Promise<Response> {
  const pool = getPool();
  const tenant = await resolveTenantId(pool, tenantSlug);
  const template = await getHotspotTemplate(pool, tenant.tenantId, req.params.slug);
  const body = asRecord(req.body);
  const phone = normalizePhone(body.phone);
  const macAddress = stringOrNull(body.mac_address);
  const ipAddress = stringOrNull(body.ip_address);

  if (!phone) return res.status(400).json({ message: 'Informe o telefone para receber o código.' });

  const sessionKey = crypto.randomBytes(18).toString('hex');
  const code = generateOtpCode();
  const deliveryChannel = 'demo';
  await pool.query(
    `INSERT INTO hotspot_login_otps (
       tenant_id, template_id, session_key, phone, code, delivery_channel, expires_at, metadata_json, created_at
     )
     VALUES (
       :tenantId, :templateId, :sessionKey, :phone, :code, :deliveryChannel,
       CURRENT_TIMESTAMP + interval '10 minutes', :metadataJson::jsonb, CURRENT_TIMESTAMP
     )`,
    {
      tenantId: tenant.tenantId,
      templateId: Number(template.id),
      sessionKey,
      phone,
      code,
      deliveryChannel,
      metadataJson: JSON.stringify({
        mac_address: macAddress,
        ip_address: ipAddress,
      }),
    }
  );

  return res.json({
    ok: true,
    session_key: sessionKey,
    phone,
    otp_expires_minutes: 10,
    delivery_channel: deliveryChannel,
    debug_code: deliveryChannel === 'demo' ? code : null,
    message: deliveryChannel === 'demo'
      ? 'Código OTP gerado em modo local. Use o código informado para validar o acesso.'
      : 'Código enviado para o telefone informado.',
  });
}

hotspotPublicRouter.post('/hotspot/templates/:slug/phone/request-otp', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  return requestPhoneOtp(req, res, null);
}));

hotspotPublicRouter.post('/hotspot/:tenantSlug/templates/:slug/phone/request-otp', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  return requestPhoneOtp(req, res, req.params.tenantSlug);
}));

async function verifyPhoneOtp(req: Request, res: Response, tenantSlug: string | null): Promise<Response> {
  const pool = getPool();
  const tenant = await resolveTenantId(pool, tenantSlug);
  const template = await getHotspotTemplate(pool, tenant.tenantId, req.params.slug);
  const body = asRecord(req.body);
  const sessionKey = stringOrNull(body.session_key);
  const code = normalizeDigits(body.code);
  if (!sessionKey || !code) return res.status(400).json({ message: 'Informe a sessão OTP e o código recebido.' });

  const [rows] = await pool.query(
    `SELECT *
     FROM hotspot_login_otps
     WHERE tenant_id = :tenantId
       AND template_id = :templateId
       AND session_key = :sessionKey
       AND used_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    {
      tenantId: tenant.tenantId,
      templateId: Number(template.id),
      sessionKey,
    }
  );
  const otp = Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null;
  if (!otp) return res.status(404).json({ message: 'Sessão OTP não encontrada ou expirada.' });
  if (String(otp.code || '') !== code) return res.status(400).json({ message: 'Código OTP inválido.' });

  await pool.query(
    `UPDATE hotspot_login_otps
     SET used_at = CURRENT_TIMESTAMP
     WHERE id = :id`,
    { id: Number(otp.id) }
  );

  const metadata = asRecord(otp.metadata_json);
  const access = await createRadiusAccessForHotspot(pool, {
    sessionId: Number(otp.id),
    tenantId: tenant.tenantId,
    durationMinutes: Number(template.session_timeout_minutes || 60) || 60,
    macAddress: stringOrNull(metadata.mac_address),
    planName: `${template.name} OTP`,
  });

  const session = await createHotspotAuthSession(pool, {
    tenantId: tenant.tenantId,
    template,
    authMode: 'phone_otp',
    username: access.username,
    password: access.password,
    phone: stringOrNull(otp.phone),
    macAddress: stringOrNull(metadata.mac_address),
    ipAddress: stringOrNull(metadata.ip_address),
    redirectUrl: stringOrNull(body.redirect_url),
    expiresAt: new Date(Date.now() + access.sessionTimeoutSeconds * 1000),
    metadata: {
      otp_delivery_channel: stringOrNull(otp.delivery_channel),
      source: 'phone_otp',
    },
  });

  return res.json({
    ok: true,
    session: buildHotspotAuthResponse(session),
  });
}

hotspotPublicRouter.post('/hotspot/templates/:slug/phone/verify-otp', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  return verifyPhoneOtp(req, res, null);
}));

hotspotPublicRouter.post('/hotspot/:tenantSlug/templates/:slug/phone/verify-otp', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  return verifyPhoneOtp(req, res, req.params.tenantSlug);
}));

async function radiusLogin(req: Request, res: Response, tenantSlug: string | null): Promise<Response> {
  const pool = getPool();
  const tenant = await resolveTenantId(pool, tenantSlug);
  const template = await getHotspotTemplate(pool, tenant.tenantId, req.params.slug);
  const body = asRecord(req.body);
  const username = stringOrNull(body.username);
  const password = String(body.password || '');
  const macAddress = stringOrNull(body.mac_address);
  const ipAddress = stringOrNull(body.ip_address);

  if (!username || !password) return res.status(400).json({ message: 'Informe usuário e senha do RADIUS.' });

  const radius = await readHotspotRadiusConfig(pool, tenant.tenantId, template.config_json);
  if (!radius.host || !radius.secret) {
    return res.status(503).json({ message: 'RADIUS não configurado para este tenant.' });
  }

  const result = await authenticateWithConfig(
    {
      host: radius.host,
      port: radius.port,
      secret: radius.secret,
      nasIp: radius.nasIp || undefined,
    },
    username,
    password
  );

  if (!result.success) {
    return res.status(401).json({ message: result.message || 'Autenticação RADIUS rejeitada.' });
  }

  const session = await createHotspotAuthSession(pool, {
    tenantId: tenant.tenantId,
    template,
    authMode: 'radius',
    username,
    phone: normalizePhone(body.phone),
    macAddress,
    ipAddress,
    radiusUsername: username,
    radiusValidated: true,
    redirectUrl: stringOrNull(body.redirect_url),
    expiresAt: new Date(Date.now() + Math.max(1, Number(template.session_timeout_minutes) || 60) * 60 * 1000),
    metadata: {
      radius_host: radius.host,
      radius_port: radius.port,
      source: 'radius',
    },
  });

  return res.json({
    ok: true,
    session: buildHotspotAuthResponse(session),
  });
}

hotspotPublicRouter.post('/hotspot/templates/:slug/radius/login', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  return radiusLogin(req, res, null);
}));

hotspotPublicRouter.post('/hotspot/:tenantSlug/templates/:slug/radius/login', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  return radiusLogin(req, res, req.params.tenantSlug);
}));

async function getSessionStatus(req: Request, res: Response): Promise<Response> {
  const pool = getPool();
  let session = await loadPaymentSessionByKey(pool, req.params.sessionKey);
  if (!session) return res.status(404).json({ message: 'Sessão de hotspot não encontrada.' });
  if (req.params.tenantSlug) {
      const tenant = await resolveTenantId(pool, req.params.tenantSlug);
      if (Number(session.tenant_id) !== tenant.tenantId) return res.status(404).json({ message: 'Sessão não encontrada.' });
  }
  const [templateRows] = await pool.query(
    'SELECT config_json, auto_release_after_payment FROM hotspot_templates WHERE id = :id AND tenant_id = :tenantId LIMIT 1',
    { id: Number(session.template_id), tenantId: Number(session.tenant_id) }
  );
  const template = Array.isArray(templateRows) && templateRows[0] ? (templateRows[0] as Record<string, unknown>) : null;
  const environment: 'sandbox' | 'production' | null = template
    ? (parseHotspotGatewayConfig(template.config_json).hotspotGatewaySandbox ? 'sandbox' : 'production')
    : null;
  const expiresAt = session.expires_at ? new Date(String(session.expires_at)).getTime() : 0;
  const expired = !!expiresAt && expiresAt <= Date.now() && !session.paid_at && !session.released_at;
  if (expired && String(session.status || '').toUpperCase() !== 'EXPIRED') {
    await pool.query(
      `UPDATE hotspot_payment_sessions
       SET status = 'EXPIRED',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      { id: Number(session.id) }
    );
    session = { ...session, status: 'EXPIRED' };
  }
  if (String(session.status || '').toUpperCase() !== 'RELEASED' && stringOrNull(session.txid)) {
    try {
      if (template) {
        const liveCharge = await fetchEfiPixCharge(template.config_json, String(session.txid));
        const liveStatus = String(liveCharge.status || '').toUpperCase();
        if (liveStatus === 'CONCLUIDA') {
          await pool.query(
            `UPDATE hotspot_payment_sessions
             SET status = 'PAID',
                 paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
                 gateway_response_json = :gateway_response_json::jsonb,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = :id`,
            { id: Number(session.id), gateway_response_json: JSON.stringify(liveCharge) }
          );
          session = {
            ...session,
            status: 'PAID',
            paid_at: session.paid_at || new Date().toISOString(),
          };
          if (boolish(template.auto_release_after_payment)) {
            session = await releaseHotspotPaymentSession(pool, session);
          }
        }
      }
    } catch {
      // Mantém o polling funcional mesmo se a consulta live falhar.
    }
  }
  const metadata = asRecord(session.metadata_json);
  const response = buildPublicSessionResponse(session);
  return res.json({
    ok: true,
    session: {
      ...response,
      gateway_name: stringOrNull(metadata.gateway_name),
      gateway_type: stringOrNull(metadata.gateway_type),
      webhook_url: stringOrNull(metadata.webhook_url),
      environment,
      expired: String(session.status || '').toUpperCase() === 'EXPIRED',
    },
  });
}

hotspotPublicRouter.get('/hotspot/sessions/:sessionKey', asyncHandler(getSessionStatus));
hotspotPublicRouter.get('/hotspot/sessions/:sessionKey/status', asyncHandler(getSessionStatus));
hotspotPublicRouter.get('/hotspot/:tenantSlug/sessions/:sessionKey', asyncHandler(getSessionStatus));
hotspotPublicRouter.get('/hotspot/:tenantSlug/sessions/:sessionKey/status', asyncHandler(getSessionStatus));

async function getConnectedSession(req: Request, res: Response): Promise<Response> {
  const pool = getPool();
  const authSession = await loadHotspotAuthSessionByKey(pool, req.params.sessionKey);
  if (authSession) {
    if (req.params.tenantSlug) {
      const tenant = await resolveTenantId(pool, req.params.tenantSlug);
      if (Number(authSession.tenant_id) !== tenant.tenantId) return res.status(404).json({ message: 'Sessão não encontrada.' });
    }
    return res.json({
      ok: true,
      mode: 'auth',
      session: buildHotspotAuthResponse(authSession),
    });
  }

  const paymentSession = await loadPaymentSessionByKey(pool, req.params.sessionKey);
  if (!paymentSession) return res.status(404).json({ message: 'Sessão não encontrada.' });
  if (req.params.tenantSlug) {
    const tenant = await resolveTenantId(pool, req.params.tenantSlug);
    if (Number(paymentSession.tenant_id) !== tenant.tenantId) return res.status(404).json({ message: 'Sessão não encontrada.' });
  }
  return res.json({
    ok: true,
    mode: 'payment',
    session: buildPublicSessionResponse(paymentSession),
  });
}

hotspotPublicRouter.get('/hotspot/sessions/:sessionKey/connected', asyncHandler(getConnectedSession));
hotspotPublicRouter.get('/hotspot/:tenantSlug/sessions/:sessionKey/connected', asyncHandler(getConnectedSession));

async function handleWebhook(req: Request, res: Response): Promise<Response> {
  const pool = getPool();
  const tenant = await resolveTenantId(pool, req.params.tenantSlug);
  const templateRef = stringOrNull(req.params.templateRef);
  const templateId = templateRef && /^\d+$/.test(templateRef) ? Number(templateRef) : 0;
  const templateSlug = templateId ? null : templateRef;
  const template = await getHotspotTemplateByReference(pool, tenant.tenantId, templateId || null, templateSlug);
  if (!template) return res.status(404).send('404');
  const resolvedTemplateId = Number(template.id || 0);

  const config = parseHotspotGatewayConfig(template.config_json);
  const expectedSecret = config.hotspotWebhookSecret;
  const incomingSecret = stringOrNull(req.headers['x-hotspot-webhook-secret']) || stringOrNull(req.query.secret);
  if (expectedSecret && incomingSecret !== expectedSecret) {
    return res.status(403).send('403');
  }

  const pixEvents = extractPaidTxidsFromWebhook(req.body);
  for (const event of pixEvents) {
    const [rows] = await pool.query(
      `SELECT *
       FROM hotspot_payment_sessions
       WHERE tenant_id = :tenantId AND template_id = :templateId AND txid = :txid
       LIMIT 1`,
      { tenantId: tenant.tenantId, templateId: resolvedTemplateId, txid: event.txid }
    );
    const session = Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null;
    if (!session) continue;
    await pool.query(
      `UPDATE hotspot_payment_sessions
       SET status = 'PAID',
           paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
           webhook_payload_json = :webhook_payload_json::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      { id: Number(session.id), webhook_payload_json: JSON.stringify(event.payload) }
    );
    if (boolish(template.auto_release_after_payment)) {
      await releaseHotspotPaymentSession(pool, {
        ...session,
        status: 'PAID',
        paid_at: session.paid_at || new Date().toISOString(),
      });
    }
  }
  return res.type('text/plain').send('200');
}

hotspotPublicRouter.post('/hotspot/efi/webhook/:tenantSlug/:templateRef', asyncHandler(handleWebhook));
hotspotPublicRouter.post('/hotspot/efi/webhook/:tenantSlug/:templateRef/pix', asyncHandler(handleWebhook));
