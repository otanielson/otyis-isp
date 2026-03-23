import fs from 'fs';
import path from 'path';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { getPool } from '../db.js';
import { getRadiusConfig, authenticate } from '../radius.js';
import { buildMikrotikHotspotConfig, configNumber, configString, configStringArray, readHotspotTemplateConfig, readPortalRadiusConfig } from './portalData.routes.js';
import { requireAdminKey } from '../utils/adminAuth.js';
import { createAdminSession, destroyAdminSession } from '../utils/adminSession.js';
import { normalizeWhatsapp } from '../utils/validation.js';

export const adminApiRouter = Router();

function dbBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 't' || value === 'true' || value === 'yes';
}

const hotspotCertsDir = path.join(process.cwd(), 'uploads', 'hotspot-certs');
if (!fs.existsSync(hotspotCertsDir)) fs.mkdirSync(hotspotCertsDir, { recursive: true });

const hotspotCertStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, hotspotCertsDir),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname || '').toLowerCase();
    cb(null, `hotspot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
  },
});

const uploadHotspotCert = multer({
  storage: hotspotCertStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (['.p12', '.pfx', '.pem', '.key'].includes(ext)) cb(null, true);
    else cb(new Error('Envie um certificado .p12, .pfx, .pem ou .key'));
  },
});

/** Garante que um pedido instalado exista em customers e tenha loyalty (Clube Multi). */
async function syncInstalledLeadToCustomer(
  pool: Awaited<ReturnType<typeof getPool>>,
  lead: { customer_name: string; whatsapp: string; email: string | null }
): Promise<number> {
  const whatsapp = normalizeWhatsapp(lead.whatsapp || '');
  if (!whatsapp) return 0;
  const name = String(lead.customer_name || '').trim() || 'Cliente';
  const email = lead.email ? String(lead.email).trim() : null;

  const [existing] = await pool.query(
    'SELECT id FROM customers WHERE whatsapp = :w LIMIT 1',
    { w: whatsapp }
  );
  const existingList = Array.isArray(existing) ? existing : [];
  let customerId: number;
  if (existingList.length) {
    customerId = (existingList[0] as { id: number }).id;
    await pool.query(
      'UPDATE customers SET name = :name, email = COALESCE(:email, email) WHERE id = :cid',
      { name, email, cid: customerId }
    );
  } else {
    const [ins] = await pool.query(
      'INSERT INTO customers (name, whatsapp, email) VALUES (:name, :w, :email) RETURNING id',
      { name, w: whatsapp, email }
    );
    customerId = (ins as { insertId: number }).insertId;
  }
  const [loyalty] = await pool.query(
    'SELECT customer_id FROM loyalty_accounts WHERE customer_id = :cid LIMIT 1',
    { cid: customerId }
  );
  if (!Array.isArray(loyalty) || loyalty.length === 0) {
    await pool.query(
      "INSERT INTO loyalty_accounts (customer_id, points_balance, tier) VALUES (:cid, 0, 'BRONZE')",
      { cid: customerId }
    );
  }
  return customerId;
}

/** Cria ou atualiza instalação a partir do pedido instalado (sistema ISP). */
async function syncInstalledLeadToInstallation(
  pool: Awaited<ReturnType<typeof getPool>>,
  lead: { id: number; customer_id?: number; whatsapp: string; plan_code: string; vencimento: number; address_json: string | object }
): Promise<void> {
  let customerId = lead.customer_id;
  if (!customerId) {
    const [rows] = await pool.query(
      'SELECT id FROM customers WHERE whatsapp = :w LIMIT 1',
      { w: normalizeWhatsapp(lead.whatsapp) }
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return;
    customerId = (list[0] as { id: number }).id;
  }
  const planCode = String(lead.plan_code || '100').trim();
  const dueDay = Math.min(28, Math.max(1, Number(lead.vencimento) || 10));
  const addressJson = lead.address_json != null
    ? (typeof lead.address_json === 'string' ? lead.address_json : JSON.stringify(lead.address_json))
    : null;
  try {
    const [ex] = await pool.query('SELECT id FROM installations WHERE customer_id = :cid LIMIT 1', { cid: customerId });
    const has = Array.isArray(ex) && ex.length > 0;
    if (has) {
      await pool.query(
        `UPDATE installations SET subscription_request_id = :lid, plan_code = :plan, due_day = :dueDay,
         address_json = COALESCE(:addr, address_json), status = 'ACTIVE', updated_at = NOW() WHERE customer_id = :cid`,
        { lid: lead.id, plan: planCode, dueDay, addr: addressJson, cid: customerId }
      );
    } else {
      const pppoeUser = `multi${customerId}`;
      try {
        await pool.query(
          `INSERT INTO installations (customer_id, subscription_request_id, plan_code, due_day, address_json, status, installed_at, pppoe_user)
           VALUES (:cid, :lid, :plan, :dueDay, :addr, 'ACTIVE', CURDATE(), :pppoe)`,
          { cid: customerId, lid: lead.id, plan: planCode, dueDay, addr: addressJson, pppoe: pppoeUser }
        );
      } catch {
        await pool.query(
          `INSERT INTO installations (customer_id, subscription_request_id, plan_code, due_day, address_json, status, installed_at)
           VALUES (:cid, :lid, :plan, :dueDay, :addr, 'ACTIVE', CURDATE())`,
          { cid: customerId, lid: lead.id, plan: planCode, dueDay, addr: addressJson }
        );
      }
    }
  } catch {
    /* installations table may not exist */
  }
}

adminApiRouter.post('/login', (req: Request, res: Response): Response | void => {
  const key = (req.body?.key as string)?.trim();
  const envKey = process.env.ADMIN_KEY?.trim();
  if (!envKey) {
    return res.status(500).json({ message: 'ADMIN_KEY não configurado. Crie um arquivo .env na raiz do projeto e defina ADMIN_KEY=sua-chave-secreta (veja .env.example).' });
  }
  if (!key) {
    return res.status(401).json({ message: 'Chave não informada. Envie { "key": "sua-chave" } no body da requisição.' });
  }
  if (key !== envKey) {
    return res.status(401).json({ message: 'Chave inválida. Verifique se a chave é exatamente a mesma definida em ADMIN_KEY no .env do servidor.' });
  }
  const token = createAdminSession();
  // secure: true só em HTTPS (em HTTP o browser não envia o cookie e o login falha)
  const isSecure = req.secure || req.get('x-forwarded-proto') === 'https';
  res.cookie('admin_session', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
  return res.json({ ok: true });
});

adminApiRouter.post('/logout', (req: Request, res: Response): Response | void => {
  const token = req.cookies?.admin_session;
  if (token) destroyAdminSession(token);
  const isSecure = req.secure || req.get('x-forwarded-proto') === 'https';
  res.clearCookie('admin_session', { path: '/', secure: isSecure, sameSite: 'lax' });
  return res.json({ ok: true });
});

adminApiRouter.use(requireAdminKey);

function asyncHandler(fn: (req: Request, res: Response) => Promise<Response | void>) {
  return (req: Request, res: Response, _next: (err?: unknown) => void) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('[Admin API]', err);
      res.status(500).json({ message: err instanceof Error ? err.message : 'Erro interno' });
    });
  };
}

function isTableNotFoundError(e: unknown): boolean {
  const err = e as { code?: string };
  return err?.code === '42P01' || err?.code === 'ER_NO_SUCH_TABLE';
}

adminApiRouter.post('/upload-hotspot-cert', (req: Request, res: Response, next): void => {
  uploadHotspotCert.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ ok: false, message: 'Arquivo muito grande. Máximo: 8MB.' });
        return;
      }
      res.status(400).json({ ok: false, message: err instanceof Error ? err.message : 'Falha no upload.' });
      return;
    }
    next();
  });
}, (req: Request, res: Response): Response => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) return res.status(400).json({ ok: false, message: 'Nenhum arquivo enviado.' });
  return res.json({
    ok: true,
    filename: file.filename,
    absolute_path: file.path,
    relative_path: path.relative(process.cwd(), file.path).replace(/\\/g, '/'),
    original_name: file.originalname,
  });
});

adminApiRouter.get('/stats', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const queries = [
    pool.query('SELECT COUNT(*) AS c FROM subscription_requests'),
    pool.query("SELECT COUNT(*) AS c FROM raffle_entries WHERE source='STAND'"),
    pool.query('SELECT COUNT(*) AS c FROM raffle_winners'),
    pool.query('SELECT COUNT(*) AS c FROM customers'),
    pool.query("SELECT id, name, status FROM raffle_campaigns WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1"),
  ];
  let plansCount = 0;
  try {
    const [p] = await pool.query('SELECT COUNT(*) AS c FROM plans WHERE active = true');
    plansCount = (p as { c: number }[])?.[0]?.c ?? 0;
  } catch {
    /* plans table may not exist */
  }
  const [[leadsRows], [standRows], [winnersRows], [custRows], [campRows]] = await Promise.all(queries);
  const leadCount = (leadsRows as { c: number }[])?.[0]?.c ?? 0;
  const standCount = (standRows as { c: number }[])?.[0]?.c ?? 0;
  const winnerCount = (winnersRows as { c: number }[])?.[0]?.c ?? 0;
  const customerCount = (custRows as { c: number }[])?.[0]?.c ?? 0;
  const camp = Array.isArray(campRows) && (campRows as unknown[]).length ? (campRows as { id: number; name: string; status: string }[])[0] : null;
  return res.json({
    ok: true,
    leadCount,
    standCount,
    winnerCount,
    customerCount,
    plansCount,
    activeCampaign: camp,
  });
}));

adminApiRouter.get('/radius-status', (_req: Request, res: Response): Response => {
  const config = getRadiusConfig();
  if (!config) {
    return res.json({ configured: false, message: 'RADIUS não configurado. Defina RADIUS_HOST e RADIUS_SECRET no .env' });
  }
  return res.json({
    configured: true,
    host: config.host,
    port: config.port,
    nasIp: config.nasIp ?? null,
  });
});

adminApiRouter.post('/radius-test', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!username) {
    return res.status(400).json({ success: false, message: 'Informe o usuário.' });
  }
  const result = await authenticate(username, password);
  return res.json({ success: result.success, message: result.message ?? undefined });
}));

adminApiRouter.get('/wifi-templates', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
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
}));

adminApiRouter.get('/wifi-templates/:id/mikrotik-config', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).json({ message: 'Template inválido.' });
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      `SELECT id, tenant_id, name, slug, description, auth_type, portal_enabled, radius_enabled,
              free_minutes, otp_enabled, payment_required, payment_method, payment_amount,
              requires_phone, requires_name, auto_release_after_payment, bind_mac,
              session_timeout_minutes, redirect_url, is_default, is_active, config_json
       FROM hotspot_templates
       WHERE tenant_id = 1 AND id = :id
       LIMIT 1`,
      { id }
    );
    const template = Array.isArray(rows) && rows[0] ? (rows[0] as {
      id: number;
      name: string;
      slug: string;
      auth_type: string;
      portal_enabled: boolean;
      radius_enabled: boolean;
      free_minutes: number;
      otp_enabled: boolean;
      payment_required: boolean;
      payment_method: string | null;
      bind_mac: boolean;
      session_timeout_minutes: number;
      redirect_url: string | null;
      config_json?: unknown;
    }) : null;
    if (!template) return res.status(404).json({ message: 'Template Wi-Fi não encontrado.' });

    const radius = await readPortalRadiusConfig(pool, 1);
    const cfg = readHotspotTemplateConfig(template);
    const origin = `${req.protocol}://${req.get('host') || 'localhost'}`;
    const portalUrl = configString(cfg, 'mikrotik_portal_url')
      || `${origin}/hotspot/${radius.slug || process.env.TENANT_SLUG || 'tenant'}/${template.slug}`;
    const interfaceName = configString(cfg, 'mikrotik_interface') || 'bridge-hotspot';
    const bridgeName = configString(cfg, 'mikrotik_bridge') || interfaceName;
    const hotspotAddress = configString(cfg, 'mikrotik_hotspot_address') || '10.10.10.1';
    const hotspotMask = Math.min(30, Math.max(24, configNumber(cfg, 'mikrotik_hotspot_mask') || 24));
    const poolStart = configString(cfg, 'mikrotik_pool_start') || '10.10.10.10';
    const poolEnd = configString(cfg, 'mikrotik_pool_end') || '10.10.10.254';
    const dnsName = configString(cfg, 'mikrotik_dns_name') || 'login.multi.local';
    const ssid = configString(cfg, 'mikrotik_ssid') || 'WiFi Multi';
    const radiusHostOverride = configString(cfg, 'hotspot_radius_host');
    const radiusPortOverride = configString(cfg, 'hotspot_radius_port');
    const radiusNasIpOverride = configString(cfg, 'hotspot_radius_nas_ip');
    const coaPort = Math.max(1, Math.min(65535, configNumber(cfg, 'mikrotik_coa_port') || 3799));
    const paymentGatewayHost = configString(cfg, 'mikrotik_payment_host');
    const walledGardenHosts = configStringArray(cfg, 'mikrotik_walled_garden');

    const generated = buildMikrotikHotspotConfig({
      template,
      radius,
      interfaceName,
      bridgeName,
      hotspotAddress,
      hotspotMask,
      poolStart,
      poolEnd,
      dnsName,
      ssid,
      radiusHostOverride,
      radiusPortOverride,
      radiusNasIpOverride,
      coaPort,
      portalUrl,
      paymentGatewayHost,
      walledGardenHosts,
    });

    return res.json({
      ok: true,
      template: {
        id: template.id,
        name: template.name,
        slug: template.slug,
        auth_type: template.auth_type,
      },
      file_name: generated.fileName,
      summary: generated.summary,
      warnings: generated.warnings,
      script: generated.script,
    });
  } catch (e) {
    if (isTableNotFoundError(e)) {
      return res.status(503).json({ message: 'Tabela hotspot_templates não existe. Execute sql/hotspot_templates.sql' });
    }
    throw e;
  }
}));

adminApiRouter.get('/wifi-payment-gateways', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
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
}));

adminApiRouter.put('/wifi-templates/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
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
}));

adminApiRouter.post('/wifi-templates/:id/default', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
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
}));

adminApiRouter.get('/leads', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, protocol, plan_code, customer_name, whatsapp, vencimento, status, created_at
     FROM subscription_requests
     ORDER BY id DESC
     LIMIT 500`
  );
  return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
}));

adminApiRouter.get('/stand', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT re.id, re.entry_number, re.created_at, c.name, c.whatsapp, rc.name AS campaign
     FROM raffle_entries re
     JOIN customers c ON c.id = re.customer_id
     JOIN raffle_campaigns rc ON rc.id = re.campaign_id
     WHERE re.source='STAND'
     ORDER BY re.id DESC
     LIMIT 1000`
  );
  return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
}));

adminApiRouter.post('/raffles/:campaignId/draw', asyncHandler(async (req: Request, res: Response) => {
  const campaignId = Number(req.params.campaignId);
  const prize = String(req.body?.prize ?? 'Prêmio');
  if (!campaignId) return res.status(400).json({ message: 'campaignId inválido' });

  const pool = getPool();

  const [pick] = await pool.query(
    `SELECT re.customer_id
     FROM raffle_entries re
     LEFT JOIN raffle_winners rw ON rw.campaign_id=re.campaign_id AND rw.customer_id=re.customer_id
     WHERE re.campaign_id=:cid AND rw.id IS NULL
     ORDER BY RAND()
     LIMIT 1`,
    { cid: campaignId }
  );

  const pickList = Array.isArray(pick) ? (pick as { customer_id: number }[]) : [];
  if (!pickList.length) {
    return res.status(409).json({ message: 'Sem entradas disponíveis para sortear (ou todos já ganharam).' });
  }

  const customerId = pickList[0].customer_id;

  await pool.query(
    'INSERT INTO raffle_winners (campaign_id, customer_id, prize) VALUES (:camp, :cust, :prize)',
    { camp: campaignId, cust: customerId, prize }
  );

  const [winner] = await pool.query(
    `SELECT c.name, c.whatsapp, rc.name AS campaign, :prize AS prize
     FROM customers c
     JOIN raffle_campaigns rc ON rc.id=:camp
     WHERE c.id=:cust LIMIT 1`,
    { camp: campaignId, cust: customerId, prize }
  );
  const winnerList = Array.isArray(winner) ? winner : [];

  return res.json({ ok: true, winner: winnerList[0] ?? null });
}));

adminApiRouter.get('/raffles/active', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const [rows] = await pool.query(
    "SELECT id, name, status, created_at FROM raffle_campaigns WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1"
  );
  const list = Array.isArray(rows) ? rows : [];
  return res.json({ ok: true, campaign: list[0] ?? null });
}));

adminApiRouter.get('/plans', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  let rows: unknown;
  try {
    [rows] = await pool.query(
      'SELECT id, code, speed_display, unit, tagline, features_json, badge, sort_order, active, price FROM plans ORDER BY sort_order ASC'
    );
  } catch {
    [rows] = await pool.query(
      'SELECT id, code, speed_display, unit, tagline, features_json, badge, sort_order, active FROM plans ORDER BY sort_order ASC'
    );
  }
  return res.json({ ok: true, plans: Array.isArray(rows) ? rows : [] });
}));

adminApiRouter.post('/plans', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const body = req.body || {};
  const code = String(body.code ?? '').trim();
  const speedDisplay = String(body.speed_display ?? body.speedDisplay ?? code).trim();
  const unit = String(body.unit ?? 'Mega').trim();
  const tagline = String(body.tagline ?? '').trim();
  const features = Array.isArray(body.features_json) ? body.features_json : (body.features ? [].concat(body.features) : []);
  const badge = ['', 'popular', 'top'].includes(String(body.badge ?? '')) ? body.badge : '';
  const sortOrder = Number(body.sort_order ?? body.sortOrder ?? 0);
  const price = body.price !== undefined && body.price !== null && body.price !== '' ? Number(body.price) : 99.9;
  if (!code) return res.status(400).json({ message: 'Código do plano é obrigatório' });

  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO plans (code, speed_display, unit, tagline, features_json, badge, sort_order, active, price)
       VALUES (:code, :speed_display, :unit, :tagline, :features_json, :badge, :sort_order, 1, :price)`,
      { code, speed_display: speedDisplay, unit, tagline, features_json: JSON.stringify(features), badge, sort_order: sortOrder, price }
    );
  } catch {
    await pool.query(
      `INSERT INTO plans (code, speed_display, unit, tagline, features_json, badge, sort_order, active)
       VALUES (:code, :speed_display, :unit, :tagline, :features_json, :badge, :sort_order, 1)`,
      { code, speed_display: speedDisplay, unit, tagline, features_json: JSON.stringify(features), badge, sort_order: sortOrder }
    );
  }
  return res.json({ ok: true });
}));

adminApiRouter.put('/plans/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const body = req.body || {};
  if (!id) return res.status(400).json({ message: 'ID inválido' });

  const pool = getPool();
  const updates: string[] = [];
  const params: Record<string, unknown> = { id };

  if (body.code !== undefined) { updates.push('code = :code'); params.code = String(body.code).trim(); }
  if (body.speed_display !== undefined) { updates.push('speed_display = :speed_display'); params.speed_display = String(body.speed_display).trim(); }
  if (body.unit !== undefined) { updates.push('unit = :unit'); params.unit = String(body.unit).trim(); }
  if (body.tagline !== undefined) { updates.push('tagline = :tagline'); params.tagline = String(body.tagline).trim(); }
  if (body.features_json !== undefined) { updates.push('features_json = :features_json'); params.features_json = JSON.stringify(Array.isArray(body.features_json) ? body.features_json : []); }
  if (body.badge !== undefined) { updates.push('badge = :badge'); params.badge = ['', 'popular', 'top'].includes(String(body.badge)) ? body.badge : ''; }
  if (body.sort_order !== undefined) { updates.push('sort_order = :sort_order'); params.sort_order = Number(body.sort_order); }
  if (body.active !== undefined) { updates.push('active = :active'); params.active = body.active ? 1 : 0; }
  if (body.price !== undefined && body.price !== null && body.price !== '') { updates.push('price = :price'); params.price = Number(body.price); }

  if (updates.length === 0) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
  await pool.query(`UPDATE plans SET ${updates.join(', ')} WHERE id = :id`, params as Record<string, string | number>);
  return res.json({ ok: true });
}));

adminApiRouter.delete('/plans/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  await pool.query('UPDATE plans SET active = false WHERE id = :id', { id });
  return res.json({ ok: true });
}));

adminApiRouter.get('/leads/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM subscription_requests WHERE id = :id LIMIT 1',
    { id }
  );
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return res.status(404).json({ message: 'Pedido não encontrado' });
  return res.json({ ok: true, lead: list[0] });
}));

adminApiRouter.patch('/leads/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const status = String(req.body?.status ?? '').trim().toUpperCase();
  const valid = ['NEW', 'CONTACTED', 'SCHEDULED', 'INSTALLED', 'CANCELLED'];
  if (!valid.includes(status)) return res.status(400).json({ message: 'Status inválido' });

  const pool = getPool();

  if (status === 'INSTALLED') {
    const [leadRows] = await pool.query(
      'SELECT id, customer_name, whatsapp, email, plan_code, vencimento, address_json FROM subscription_requests WHERE id = :id LIMIT 1',
      { id }
    );
    const leadList = Array.isArray(leadRows) ? leadRows : [];
    if (leadList.length) {
      const lead = leadList[0] as { id: number; customer_name: string; whatsapp: string; email: string | null; plan_code: string; vencimento: number; address_json: string | object };
      const customerId = await syncInstalledLeadToCustomer(pool, lead);
      await syncInstalledLeadToInstallation(pool, { ...lead, customer_id: customerId });
    }
  }

  await pool.query('UPDATE subscription_requests SET status = :status WHERE id = :id', { status, id });
  return res.json({ ok: true });
}));

adminApiRouter.get('/customers', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const [installedLeads] = await pool.query(
    'SELECT id, customer_name, whatsapp, email, plan_code, vencimento, address_json FROM subscription_requests WHERE status = :status',
    { status: 'INSTALLED' }
  );
  const toSync = Array.isArray(installedLeads) ? installedLeads : [];
  for (const lead of toSync) {
    try {
      const l = lead as { id: number; customer_name: string; whatsapp: string; email: string | null; plan_code: string; vencimento: number; address_json: string | object };
      const customerId = await syncInstalledLeadToCustomer(pool, l);
      await syncInstalledLeadToInstallation(pool, { ...l, customer_id: customerId });
    } catch (e) {
      console.error('[Admin] sync lead to customer:', e);
    }
  }
  let rows: unknown;
  try {
    [rows] = await pool.query(
      `SELECT c.id, c.name, c.whatsapp, c.email, c.cpf_cnpj, c.created_at, (COALESCE(c.active, true))::int AS active,
              COALESCE(la.points_balance, 0) AS points_balance, COALESCE(la.tier, 'BRONZE') AS tier,
              inst.plan_code AS installation_plan, inst.status AS installation_status, inst.address_json AS installation_address,
              inst.due_day AS installation_due_day
       FROM customers c
       LEFT JOIN loyalty_accounts la ON la.customer_id = c.id
       LEFT JOIN installations inst ON inst.customer_id = c.id
       ORDER BY c.created_at DESC
       LIMIT 500`
    );
  } catch {
    try {
      [rows] = await pool.query(
        `SELECT c.id, c.name, c.whatsapp, c.email, c.created_at, (COALESCE(c.active, true))::int AS active,
                COALESCE(la.points_balance, 0) AS points_balance, COALESCE(la.tier, 'BRONZE') AS tier,
                inst.plan_code AS installation_plan, inst.status AS installation_status, inst.address_json AS installation_address,
                inst.due_day AS installation_due_day
         FROM customers c
         LEFT JOIN loyalty_accounts la ON la.customer_id = c.id
         LEFT JOIN installations inst ON inst.customer_id = c.id
         ORDER BY c.created_at DESC
         LIMIT 500`
      );
    } catch {
      [rows] = await pool.query(
        `SELECT c.id, c.name, c.whatsapp, c.email, c.created_at,
                1 AS active,
                COALESCE(la.points_balance, 0) AS points_balance, COALESCE(la.tier, 'BRONZE') AS tier
         FROM customers c
         LEFT JOIN loyalty_accounts la ON la.customer_id = c.id
         ORDER BY c.created_at DESC
         LIMIT 500`
      );
    }
  }
  const customerList = Array.isArray(rows) ? rows : [];
  const [subs] = await pool.query(
    `SELECT whatsapp, plan_code, cpf_cnpj FROM subscription_requests WHERE status = 'INSTALLED' ORDER BY id DESC`
  );
  const subsByWhatsapp = new Map<string, { plan_code: string; cpf_cnpj: string }>();
  for (const s of Array.isArray(subs) ? subs : []) {
    const row = s as { whatsapp: string; plan_code: string; cpf_cnpj: string };
    const w = normalizeWhatsapp(row.whatsapp);
    if (!subsByWhatsapp.has(w)) subsByWhatsapp.set(w, { plan_code: row.plan_code || '', cpf_cnpj: row.cpf_cnpj || '' });
  }
  for (const r of customerList) {
    const cust = r as Record<string, unknown> & { whatsapp: string };
    const extra = subsByWhatsapp.get(cust.whatsapp);
    if (extra) {
      if (cust.plan_code == null) cust.plan_code = extra.plan_code;
      if (cust.cpf_cnpj == null || cust.cpf_cnpj === '') cust.cpf_cnpj = extra.cpf_cnpj;
    }
    if (cust.plan_code == null && cust.installation_plan) cust.plan_code = cust.installation_plan;
    if (!cust.plan_code) cust.plan_code = '';
    if (cust.cpf_cnpj == null) cust.cpf_cnpj = '';
  }
  return res.json({ ok: true, rows: customerList });
}));

adminApiRouter.get('/customers/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  let rows: unknown;
  try {
    [rows] = await pool.query(
      `SELECT c.id, c.name, c.whatsapp, c.email, c.cpf_cnpj, c.created_at, (COALESCE(c.active, true))::int AS active,
              COALESCE(la.points_balance, 0) AS points_balance, COALESCE(la.tier, 'BRONZE') AS tier
       FROM customers c
       LEFT JOIN loyalty_accounts la ON la.customer_id = c.id
       WHERE c.id = :id LIMIT 1`,
      { id }
    );
  } catch {
    [rows] = await pool.query(
      `SELECT c.id, c.name, c.whatsapp, c.email, c.created_at, (COALESCE(c.active, true))::int AS active,
              COALESCE(la.points_balance, 0) AS points_balance, COALESCE(la.tier, 'BRONZE') AS tier
       FROM customers c
       LEFT JOIN loyalty_accounts la ON la.customer_id = c.id
       WHERE c.id = :id LIMIT 1`,
      { id }
    );
  }
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return res.status(404).json({ message: 'Cliente não encontrado' });
  const row = list[0] as Record<string, unknown>;
  const [subs] = await pool.query(
    'SELECT plan_code, cpf_cnpj FROM subscription_requests WHERE status = ? AND whatsapp = ? ORDER BY id DESC LIMIT 1',
    ['INSTALLED', row.whatsapp]
  );
  const subList = Array.isArray(subs) ? subs : [];
  if (subList.length) {
    const s = subList[0] as { plan_code: string; cpf_cnpj: string };
    if (row.plan_code == null) row.plan_code = s.plan_code;
    if (row.cpf_cnpj == null || row.cpf_cnpj === '') row.cpf_cnpj = s.cpf_cnpj;
  }
  let installation: Record<string, unknown> | null = null;
  let invoices: unknown[] = [];
  try {
    const [instRows] = await pool.query(
      'SELECT id, plan_code, due_day, address_json, status, installed_at, ont_serial, cto_code, pppoe_user, pppoe_password, notes FROM installations WHERE customer_id = :cid LIMIT 1',
      { cid: id }
    );
    if (Array.isArray(instRows) && instRows.length) installation = instRows[0] as Record<string, unknown>;
  } catch {
    try {
      const [instRows] = await pool.query(
        'SELECT id, plan_code, due_day, address_json, status, installed_at, ont_serial, cto_code, notes FROM installations WHERE customer_id = :cid LIMIT 1',
        { cid: id }
      );
      if (Array.isArray(instRows) && instRows.length) installation = instRows[0] as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  try {
    const [invRows] = await pool.query(
      'SELECT id, ref_month, due_date, amount, plan_code, status, paid_at, created_at FROM invoices WHERE customer_id = :cid ORDER BY ref_month DESC LIMIT 24',
      { cid: id }
    );
    invoices = Array.isArray(invRows) ? invRows : [];
    const today = new Date().toISOString().slice(0, 10);
    for (const r of invoices) {
      const inv = r as { status: string; due_date: string };
      if (inv.status === 'PENDING' && inv.due_date < today) inv.status = 'OVERDUE';
    }
  } catch {
    /* ignore */
  }
  return res.json({ ok: true, customer: row, installation, invoices });
}));

adminApiRouter.put('/customers/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const body = req.body || {};
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const name = body.name !== undefined ? String(body.name).trim() : undefined;
  const email = body.email !== undefined ? (body.email ? String(body.email).trim() : null) : undefined;
  const cpfCnpj = body.cpf_cnpj !== undefined ? (body.cpf_cnpj ? String(body.cpf_cnpj).trim().replace(/\D/g, '') : null) : undefined;
  const active = body.active;
  const pool = getPool();
  const updates: string[] = [];
  const params: Record<string, string | number | null> = { id };
  if (name !== undefined) {
    updates.push('name = :name');
    params.name = name || null;
  }
  if (email !== undefined) {
    updates.push('email = :email');
    params.email = email;
  }
  if (cpfCnpj !== undefined) {
    updates.push('cpf_cnpj = :cpf_cnpj');
    params.cpf_cnpj = cpfCnpj || null;
  }
  if (active !== undefined) {
    const val = active === true || active === 1 || active === '1' ? 1 : 0;
    updates.push('active = :active');
    params.active = val;
  }
  if (updates.length === 0) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
  try {
    await pool.query(`UPDATE customers SET ${updates.join(', ')} WHERE id = :id`, params);
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : '';
    if (msg.includes('cpf_cnpj')) {
      const withoutCpf = updates.filter((u) => !u.includes('cpf_cnpj'));
      const withoutCpfParams = { ...params };
      delete withoutCpfParams.cpf_cnpj;
      if (withoutCpf.length) await pool.query(`UPDATE customers SET ${withoutCpf.join(', ')} WHERE id = :id`, withoutCpfParams);
    } else throw e;
  }
  return res.json({ ok: true });
}));

adminApiRouter.patch('/customers/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const active = req.body?.active;
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const val = active === true || active === 1 || active === '1' ? 1 : 0;
  const pool = getPool();
  await pool.query('UPDATE customers SET active = :active WHERE id = :id', { active: val, id });
  return res.json({ ok: true });
}));

adminApiRouter.get('/finance/stats', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  let pending = 0; let paid = 0; let overdue = 0; let pendingAmount = 0; let paidAmount = 0;
  try {
    const [[p], [pa], [o], [paAmt], [pdAmt]] = await Promise.all([
      pool.query("SELECT COUNT(*) AS c FROM invoices WHERE status = 'PENDING'"),
      pool.query("SELECT COUNT(*) AS c FROM invoices WHERE status = 'PAID'"),
      pool.query("SELECT COUNT(*) AS c FROM invoices WHERE status = 'OVERDUE'"),
      pool.query("SELECT COALESCE(SUM(amount), 0) AS t FROM invoices WHERE status IN ('PENDING','OVERDUE')"),
      pool.query("SELECT COALESCE(SUM(amount), 0) AS t FROM invoices WHERE status = 'PAID'"),
    ]);
    pending = (p as { c: number }[])?.[0]?.c ?? 0;
    paid = (pa as { c: number }[])?.[0]?.c ?? 0;
    overdue = (o as { c: number }[])?.[0]?.c ?? 0;
    pendingAmount = (paAmt as { t: number }[])?.[0]?.t ?? 0;
    paidAmount = (pdAmt as { t: number }[])?.[0]?.t ?? 0;
  } catch {
    /* invoices table may not exist */
  }
  return res.json({ ok: true, pending, paid, overdue, pendingAmount, paidAmount });
}));

adminApiRouter.get('/finance/invoices', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const status = req.query.status as string | undefined;
  const refMonth = req.query.ref_month as string | undefined;
  const customerId = req.query.customer_id ? Number(req.query.customer_id) : undefined;
  let sql = `SELECT i.id, i.customer_id, i.ref_month, i.due_date, i.amount, i.plan_code, i.status, i.paid_at, i.created_at,
             c.name AS customer_name, c.whatsapp
             FROM invoices i
             JOIN customers c ON c.id = i.customer_id
             WHERE 1=1`;
  const params: Record<string, string | number> = {};
  if (status) { sql += ' AND i.status = :status'; params.status = status; }
  if (refMonth) { sql += ' AND i.ref_month = :ref_month'; params.ref_month = refMonth; }
  if (customerId) { sql += ' AND i.customer_id = :customer_id'; params.customer_id = customerId; }
  sql += ' ORDER BY i.due_date DESC, i.id DESC LIMIT 500';
  const [rows] = await pool.query(sql, Object.keys(params).length ? params : []);
  const list = Array.isArray(rows) ? rows : [];
  const today = new Date().toISOString().slice(0, 10);
  for (const r of list) {
    const row = r as { status: string; due_date: string };
    if (row.status === 'PENDING' && row.due_date < today) row.status = 'OVERDUE';
  }
  return res.json({ ok: true, rows: list });
}));

adminApiRouter.post('/finance/invoices/generate', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const refMonth = String(req.body?.ref_month ?? '').trim() || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(refMonth)) return res.status(400).json({ message: 'ref_month inválido (use YYYY-MM)' });
  const pool = getPool();
  const [customers] = await pool.query(
    `SELECT c.id, c.whatsapp FROM customers c
     WHERE (COALESCE(c.active, true))::int = 1
     AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = c.id AND i.ref_month = :rm)`,
    { rm: refMonth }
  );
  const custList: { id: number; plan_code: string; due_day: number }[] = [];
  const instByCid = new Map<number, { plan_code: string; due_day: number }>();
  const subsByW = new Map<string, { plan_code: string; vencimento: number }>();
  try {
    const [inst] = await pool.query(
      "SELECT customer_id, plan_code, due_day FROM installations WHERE status = 'ACTIVE'"
    );
    for (const row of Array.isArray(inst) ? inst : []) {
      const r = row as { customer_id: number; plan_code: string; due_day: number };
      instByCid.set(r.customer_id, { plan_code: r.plan_code || '100', due_day: r.due_day || 10 });
    }
  } catch {
    /* ignore */
  }
  try {
    const [subs] = await pool.query(
      'SELECT whatsapp, plan_code, vencimento FROM subscription_requests WHERE status = ?',
      ['INSTALLED']
    );
    for (const s of Array.isArray(subs) ? subs : []) {
      const row = s as { whatsapp: string; plan_code: string; vencimento: number };
      const w = normalizeWhatsapp(row.whatsapp);
      if (!subsByW.has(w)) subsByW.set(w, { plan_code: row.plan_code, vencimento: row.vencimento });
    }
  } catch {
    /* ignore */
  }
  for (const c of Array.isArray(customers) ? customers : []) {
    const row = c as { id: number; whatsapp: string };
    const fromInst = instByCid.get(row.id);
    const sub = subsByW.get(row.whatsapp) || subsByW.get(normalizeWhatsapp(row.whatsapp));
    custList.push({
      id: row.id,
      plan_code: fromInst?.plan_code || sub?.plan_code || '100',
      due_day: fromInst?.due_day ?? sub?.vencimento ?? 10,
    });
  }
  let priceByPlan = new Map<string, number>();
  try {
    const [planPrices] = await pool.query('SELECT code, COALESCE(price, 99.90) AS price FROM plans WHERE active = true');
    for (const p of Array.isArray(planPrices) ? planPrices : []) {
      const row = p as { code: string; price: number };
      priceByPlan.set(row.code, Number(row.price));
    }
  } catch {
    /* price column may not exist */
  }
  let created = 0;
  for (const cust of custList) {
    const planCode = cust.plan_code || '100';
    const dueDay = Math.min(28, Math.max(1, cust.due_day ?? 10));
    const dueDate = `${refMonth}-${String(dueDay).padStart(2, '0')}`;
    const amount = priceByPlan.get(planCode) ?? 99.90;
    try {
      await pool.query(
        `INSERT INTO invoices (customer_id, ref_month, due_date, amount, plan_code, status)
         VALUES (:cid, :rm, :due, :amt, :plan, 'PENDING')`,
        { cid: cust.id, rm: refMonth, due: dueDate, amt: amount, plan: planCode }
      );
      created++;
    } catch {
      /* duplicate or other */
    }
  }
  return res.json({ ok: true, created, refMonth });
}));

adminApiRouter.patch('/finance/invoices/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const paid = req.body?.paid;
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  if (paid === true || paid === 1 || paid === '1') {
    await pool.query(
      "UPDATE invoices SET status = 'PAID', paid_at = NOW() WHERE id = :id",
      { id }
    );
  } else if (paid === false || paid === 0 || paid === '0') {
    await pool.query(
      "UPDATE invoices SET status = 'PENDING', paid_at = NULL WHERE id = :id",
      { id }
    );
  } else {
    return res.status(400).json({ message: 'Envie paid: true ou false' });
  }
  return res.json({ ok: true });
}));

adminApiRouter.get('/installations', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const status = req.query.status as string | undefined;
  let sql = `SELECT inst.id, inst.customer_id, inst.plan_code, inst.due_day, inst.address_json, inst.status AS installation_status,
             inst.installed_at, inst.ont_serial, inst.cto_code, inst.pppoe_user, inst.created_at,
             c.name AS customer_name, c.whatsapp
             FROM installations inst
             JOIN customers c ON c.id = inst.customer_id
             WHERE 1=1`;
  const params: Record<string, string> = {};
  if (status) { sql += ' AND inst.status = :status'; params.status = status; }
  sql += ' ORDER BY inst.id DESC LIMIT 500';
  const [rows] = await pool.query(sql, Object.keys(params).length ? params : []);
  return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
}));

adminApiRouter.patch('/installations/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const status = String(req.body?.status ?? '').trim().toUpperCase();
  const valid = ['ACTIVE', 'SUSPENDED', 'CANCELLED'];
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  if (!valid.includes(status)) return res.status(400).json({ message: 'Status inválido (ACTIVE, SUSPENDED, CANCELLED)' });
  const pool = getPool();
  await pool.query('UPDATE installations SET status = :status, updated_at = NOW() WHERE id = :id', { status, id });
  if (status === 'SUSPENDED') {
    await pool.query(
      'UPDATE customers c SET active = false FROM installations i WHERE i.customer_id = c.id AND i.id = :id',
      { id }
    );
  } else if (status === 'ACTIVE') {
    await pool.query(
      'UPDATE customers c SET active = true FROM installations i WHERE i.customer_id = c.id AND i.id = :id',
      { id }
    );
  }
  return res.json({ ok: true });
}));

adminApiRouter.put('/installations/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const body = req.body || {};
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const updates: string[] = [];
  const params: Record<string, string | number | null> = { id };
  if (body.plan_code !== undefined) { updates.push('plan_code = :plan_code'); params.plan_code = String(body.plan_code).trim(); }
  if (body.due_day !== undefined) { updates.push('due_day = :due_day'); params.due_day = Math.min(28, Math.max(1, Number(body.due_day) || 10)); }
  if (body.address_json !== undefined) { updates.push('address_json = :address_json'); params.address_json = typeof body.address_json === 'string' ? body.address_json : JSON.stringify(body.address_json || {}); }
  if (body.ont_serial !== undefined) { updates.push('ont_serial = :ont_serial'); params.ont_serial = body.ont_serial ? String(body.ont_serial).trim() : null; }
  if (body.cto_code !== undefined) { updates.push('cto_code = :cto_code'); params.cto_code = body.cto_code ? String(body.cto_code).trim() : null; }
  if (body.notes !== undefined) { updates.push('notes = :notes'); params.notes = body.notes ? String(body.notes).trim() : null; }
  if (body.pppoe_user !== undefined) { updates.push('pppoe_user = :pppoe_user'); params.pppoe_user = body.pppoe_user ? String(body.pppoe_user).trim() : null; }
  if (body.pppoe_password !== undefined) { updates.push('pppoe_password = :pppoe_password'); params.pppoe_password = body.pppoe_password ? String(body.pppoe_password) : null; }
  if (updates.length === 0) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
  await pool.query(`UPDATE installations SET ${updates.join(', ')}, updated_at = NOW() WHERE id = :id`, params);
  return res.json({ ok: true });
}));

adminApiRouter.get('/campaigns', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, name, status, created_at FROM raffle_campaigns ORDER BY id DESC LIMIT 50'
  );
  return res.json({ ok: true, campaigns: Array.isArray(rows) ? rows : [] });
}));

adminApiRouter.post('/campaigns', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const name = String(req.body?.name ?? 'Nova Campanha').trim();
  if (!name) return res.status(400).json({ message: 'Nome obrigatório' });
  const pool = getPool();
  const [r] = await pool.query(
    "INSERT INTO raffle_campaigns (name, status) VALUES (:name, 'ACTIVE') RETURNING id",
    { name }
  );
  const ins = r as { insertId: number };
  return res.json({ ok: true, id: ins.insertId });
}));

adminApiRouter.get('/winners', asyncHandler(async (req: Request, res: Response) => {
  const campaignId = Number(req.query.campaignId ?? 0);
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT rw.id, rw.prize, rw.created_at, c.name, c.whatsapp, rc.name AS campaign
     FROM raffle_winners rw
     JOIN customers c ON c.id = rw.customer_id
     JOIN raffle_campaigns rc ON rc.id = rw.campaign_id
     ${campaignId ? 'WHERE rw.campaign_id=:cid' : ''}
     ORDER BY rw.id DESC
     LIMIT 1000`,
    campaignId ? { cid: campaignId } : {}
  );
  return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
}));

adminApiRouter.get('/clube-page', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  let config: unknown;
  try {
    const [rows] = await pool.query('SELECT config_json FROM clube_page_config WHERE id = 1 LIMIT 1');
    const list = Array.isArray(rows) ? rows : [];
    if (list.length) {
      const row = list[0] as { config_json: string | object };
      config = typeof row.config_json === 'string' ? JSON.parse(row.config_json) : row.config_json;
    }
  } catch {
    config = null;
  }
  if (!config || typeof config !== 'object') {
    return res.json({ ok: true, config: null, message: 'Execute sql/clube_page_config.sql para criar a tabela.' });
  }
  return res.json({ ok: true, config });
}));

adminApiRouter.put('/clube-page', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const body = req.body?.config ?? req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ message: 'Envie { config: { hero, benefits, points, actions, cta } }' });
  }
  const pool = getPool();
  const configJson = JSON.stringify(body);
  await pool.query(
    `INSERT INTO clube_page_config (id, config_json) VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET config_json = $2::jsonb`,
    [configJson, configJson]
  );
  return res.json({ ok: true });
}));
