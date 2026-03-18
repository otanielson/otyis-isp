import { Router, type Request, type Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { lookup } from 'dns/promises';
import { getPool } from '../db.js';
import { requireAuth } from '../middlewares/auth.js';
import { normalizeWhatsapp } from '../utils/validation.js';
import { enqueueNotification } from '../utils/notify.js';
import { execSync } from 'child_process';
import { getTenantStackLogs, getTenantDbClient } from '../provisioning/index.js';
import { dockerLogs, dockerContainerStatus } from '../provisioning/dockerRunner.js';
import { ensureReduzidoGroup, syncInstallationToRadius, syncPlanToRadgroupreply, removeUserFromRadius } from '../radius/radiusSync.js';
import { authenticateWithConfig } from '../radius.js';
import { disconnectUser, coaUpdateRate } from '../services/radiusClient.js';
import { syncNasToRadius, removeNasFromRadius, syncAllTenantNasToRadius } from '../services/nasSync.js';

export const portalDataRouter = Router();
portalDataRouter.use(requireAuth);

function tenantId(req: Request): number {
  return req.user!.tenantId;
}

function isStandalone(): boolean {
  return /^1|true|yes$/i.test(String(process.env.STANDALONE || '').trim());
}

function normalizeNasIp(value: string | null | undefined): string {
  return String(value || '').trim().split('/')[0].trim();
}

interface RadiusInstallationIdentity {
  providerName: string;
  fantasyName: string | null;
  shortName: string | null;
  legalName: string | null;
  slug: string | null;
}

interface RadiusPortalConfig extends RadiusInstallationIdentity {
  radiusHost: string | null;
  radiusPort: string;
  radiusSecret: string | null;
  radiusNasIp: string | null;
  radiusMode: 'standalone' | 'tenant';
  radiusService: string;
}

async function getRadiusInstallationIdentity(
  pool: Awaited<ReturnType<typeof getPool>>,
  tid: number
): Promise<RadiusInstallationIdentity> {
  let legalName: string | null = null;
  let slug: string | null = null;
  try {
    const [tenantRows] = await pool.query(
      'SELECT name, slug FROM tenants WHERE id = :tid LIMIT 1',
      { tid }
    );
    const tenantRow = Array.isArray(tenantRows) && tenantRows.length > 0
      ? (tenantRows as { name: string; slug: string }[])[0]
      : null;
    legalName = tenantRow?.name ?? null;
    slug = tenantRow?.slug ?? null;
  } catch {
    // fallback abaixo
  }

  let fantasyName: string | null = null;
  let shortName: string | null = null;
  try {
    const [providerRows] = await pool.query(
      'SELECT fantasy_name, short_name FROM provider_settings WHERE tenant_id = :tid LIMIT 1',
      { tid }
    );
    const providerRow = Array.isArray(providerRows) && providerRows.length > 0
      ? (providerRows as { fantasy_name: string | null; short_name: string | null }[])[0]
      : null;
    fantasyName = providerRow?.fantasy_name ?? null;
    shortName = providerRow?.short_name ?? null;
  } catch {
    // provider_settings pode ainda não existir
  }

  const providerName = fantasyName || shortName || legalName || `Provedor ${tid}`;
  return { providerName, fantasyName, shortName, legalName, slug };
}

function getRadiusServiceUnit(identity: RadiusInstallationIdentity): string {
  if (isStandalone()) return 'freeradius-standalone';
  return identity.slug ? `freeradius-tenant@${identity.slug}` : 'freeradius-standalone';
}

function isRadiusUdpListening(): boolean {
  try {
    const out = execSync('ss -lunp', { encoding: 'utf8', maxBuffer: 512 * 1024 });
    return out.includes(':1812') && out.includes(':1813');
  } catch {
    return false;
  }
}

function isSystemdUnitActive(unit: string): boolean {
  try {
    const out = execSync(`systemctl is-active ${unit}`, { encoding: 'utf8' });
    return out.trim() === 'active';
  } catch {
    return false;
  }
}

async function readPortalRadiusConfig(
  pool: Awaited<ReturnType<typeof getPool>>,
  tid: number
): Promise<RadiusPortalConfig> {
  const identity = await getRadiusInstallationIdentity(pool, tid);
  let radiusHost: string | null = process.env.RADIUS_HOST || null;
  let radiusPort: string | null = process.env.RADIUS_PORT ? String(process.env.RADIUS_PORT) : null;
  let radiusSecret: string | null = process.env.RADIUS_SECRET || null;
  let radiusNasIp: string | null = process.env.RADIUS_NAS_IP || null;
  if (!radiusHost || !radiusPort || !radiusSecret || !radiusNasIp) {
    try {
      const [rows] = await pool.query(
        'SELECT config_json FROM tenants WHERE id = :tid LIMIT 1',
        { tid }
      );
      const r = Array.isArray(rows) && rows[0] ? (rows[0] as { config_json?: unknown }) : null;
      const cfg = r?.config_json && typeof r.config_json === 'object' ? (r.config_json as Record<string, unknown>) : {};
      const radius = cfg.radius && typeof cfg.radius === 'object' ? (cfg.radius as Record<string, unknown>) : {};
      const prov = cfg.provisioning && typeof cfg.provisioning === 'object' ? (cfg.provisioning as Record<string, unknown>) : {};
      if (!radiusHost && typeof radius.host === 'string') radiusHost = radius.host;
      if (!radiusPort && radius.port != null) radiusPort = String(radius.port);
      if (!radiusSecret) {
        if (typeof radius.secret === 'string') radiusSecret = radius.secret;
        else if (typeof prov.radiusSecret === 'string') radiusSecret = prov.radiusSecret;
      }
      if (!radiusNasIp && typeof radius.nasIp === 'string') radiusNasIp = radius.nasIp;
    } catch {
      // tenants.config_json pode não existir
    }
  }
  if (!radiusPort) radiusPort = '1812';
  return {
    ...identity,
    radiusHost,
    radiusPort,
    radiusSecret,
    radiusNasIp,
    radiusMode: isStandalone() ? 'standalone' : 'tenant',
    radiusService: getRadiusServiceUnit(identity),
  };
}

function asyncHandler(fn: (req: Request, res: Response) => Promise<Response | void>) {
  return (req: Request, res: Response, _next: (err?: unknown) => void) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('[Portal Data API]', err);
      res.status(500).json({ message: err instanceof Error ? err.message : 'Erro interno' });
    });
  };
}

/** Retorna true se o erro indica tabela inexistente (PostgreSQL 42P01 ou MySQL ER_NO_SUCH_TABLE). */
function isTableNotFoundError(e: unknown): boolean {
  const err = e as { code?: string };
  return err?.code === '42P01' || err?.code === 'ER_NO_SUCH_TABLE';
}

/** Retorna true se o erro indica coluna inexistente (PostgreSQL 42703). */
function isColumnNotFoundError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === '42703' || (typeof err?.message === 'string' && /column .* does not exist/i.test(err.message));
}

/** Sync installed lead to customer with tenant_id. */
async function syncInstalledLeadToCustomer(
  pool: Awaited<ReturnType<typeof getPool>>,
  lead: { customer_name: string; whatsapp: string; email: string | null; tenant_id?: number },
  tid: number
): Promise<number> {
  const whatsapp = normalizeWhatsapp(lead.whatsapp || '');
  if (!whatsapp) return 0;
  const name = String(lead.customer_name || '').trim() || 'Cliente';
  const email = lead.email ? String(lead.email).trim() : null;

  const [existing] = await pool.query(
    'SELECT id FROM customers WHERE whatsapp = :w AND tenant_id = :tid LIMIT 1',
    { w: whatsapp, tid }
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
      'INSERT INTO customers (name, whatsapp, email, tenant_id) VALUES (:name, :w, :email, :tid) RETURNING id',
      { name, w: whatsapp, email, tid }
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

/** Sync installed lead to installation (customer already has tenant_id). */
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
    // Sincronizar usuário PPPoE com FreeRADIUS do tenant (radcheck/radusergroup no mesmo banco do container)
    try {
      const [instRows] = await pool.query(
        'SELECT pppoe_user, pppoe_password, plan_code, status FROM installations WHERE customer_id = :cid LIMIT 1',
        { cid: customerId }
      );
      const inst = Array.isArray(instRows) && (instRows as { pppoe_user?: string | null; pppoe_password?: string | null; plan_code?: string | null; status?: string }[]).length
        ? (instRows as { pppoe_user?: string | null; pppoe_password?: string | null; plan_code?: string | null; status?: string }[])[0]
        : null;
      if (inst?.pppoe_user)
        await syncInstallationToRadius(pool, inst.pppoe_user, inst.pppoe_password ?? null, inst.plan_code ?? planCode, inst.status ?? 'ACTIVE', {});
    } catch (_) { /* tabelas RADIUS podem não existir */ }
  } catch {
    /* installations table may not exist */
  }
}

// ---- Stats ----
portalDataRouter.get('/reports/summary', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  let proposals = 0; let proposalsApproved = 0; let contracts = 0; let contractsActive = 0;
  let serviceOrders = 0; let serviceOrdersOpen = 0; let tickets = 0; let ticketsOpen = 0;
  try {
    const [[p], [pa], [c], [ca], [so], [soo], [t], [to]] = await Promise.all([
      pool.query('SELECT COUNT(*) AS c FROM proposals WHERE tenant_id = :tid', { tid }),
      pool.query("SELECT COUNT(*) AS c FROM proposals WHERE tenant_id = :tid AND status = 'APPROVED'", { tid }),
      pool.query('SELECT COUNT(*) AS c FROM contracts WHERE tenant_id = :tid', { tid }),
      pool.query("SELECT COUNT(*) AS c FROM contracts WHERE tenant_id = :tid AND status = 'ACTIVE'", { tid }),
      pool.query('SELECT COUNT(*) AS c FROM service_orders WHERE tenant_id = :tid', { tid }),
      pool.query("SELECT COUNT(*) AS c FROM service_orders WHERE tenant_id = :tid AND status IN ('OPEN','IN_PROGRESS','PENDING')", { tid }),
      pool.query('SELECT COUNT(*) AS c FROM tickets WHERE tenant_id = :tid', { tid }),
      pool.query("SELECT COUNT(*) AS c FROM tickets WHERE tenant_id = :tid AND status IN ('OPEN','IN_PROGRESS','PENDING')", { tid }),
    ]);
    proposals = (p as { c: number }[])?.[0]?.c ?? 0;
    proposalsApproved = (pa as { c: number }[])?.[0]?.c ?? 0;
    contracts = (c as { c: number }[])?.[0]?.c ?? 0;
    contractsActive = (ca as { c: number }[])?.[0]?.c ?? 0;
    serviceOrders = (so as { c: number }[])?.[0]?.c ?? 0;
    serviceOrdersOpen = (soo as { c: number }[])?.[0]?.c ?? 0;
    tickets = (t as { c: number }[])?.[0]?.c ?? 0;
    ticketsOpen = (to as { c: number }[])?.[0]?.c ?? 0;
  } catch {
    /* tables may not exist */
  }
  return res.json({
    ok: true,
    proposals,
    proposalsApproved,
    contracts,
    contractsActive,
    serviceOrders,
    serviceOrdersOpen,
    tickets,
    ticketsOpen,
  });
}));

portalDataRouter.get('/stats', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const queries = [
    pool.query('SELECT COUNT(*) AS c FROM subscription_requests WHERE tenant_id = :tid', { tid }),
    pool.query(
      `SELECT COUNT(*) AS c FROM raffle_entries re
       INNER JOIN customers c ON c.id = re.customer_id AND c.tenant_id = :tid
       WHERE re.source = 'STAND'`,
      { tid }
    ),
    pool.query(
      `SELECT COUNT(*) AS c FROM raffle_winners rw
       INNER JOIN customers c ON c.id = rw.customer_id AND c.tenant_id = :tid`,
      { tid }
    ),
    pool.query('SELECT COUNT(*) AS c FROM customers WHERE tenant_id = :tid', { tid }),
    pool.query(
      "SELECT id, name, status FROM raffle_campaigns WHERE status = 'ACTIVE' AND (tenant_id = :tid OR tenant_id IS NULL) ORDER BY id DESC LIMIT 1",
      { tid }
    ),
  ];
  let plansCount = 0;
  try {
    const [p] = await pool.query('SELECT COUNT(*) AS c FROM plans WHERE active = true AND tenant_id = :tid', { tid });
    plansCount = (p as { c: number }[])?.[0]?.c ?? 0;
  } catch {
    /* plans table may not have tenant_id in older DB */
    try {
      const [p] = await pool.query('SELECT COUNT(*) AS c FROM plans WHERE active = true', []);
      plansCount = (p as { c: number }[])?.[0]?.c ?? 0;
    } catch {
      /* ignore */
    }
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

// ---- Concentradores (NAS) do tenant ----
/** GET /api/portal/nas — Lista NAS com status de conexão (sessões ativas no RADIUS por nasipaddress). */
portalDataRouter.get('/nas', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  let list: Record<string, unknown>[] = [];
  try {
    const [rows] = await pool.query(
      'SELECT id, tenant_id, name, nas_ip, description, is_active, created_at FROM tenant_nas WHERE tenant_id = :tid ORDER BY name',
      { tid }
    );
    list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  } catch {
    // tabela tenant_nas pode não existir
  }

  const nasStatusByIp: Record<string, { active_sessions: number; last_activity: string | null }> = {};
  try {
    const [radRows] = await pool.query(
      `SELECT regexp_replace(nasipaddress::text, '/.*$', '') AS nas_ip,
              COUNT(*) FILTER (WHERE acctstoptime IS NULL) AS active_sessions,
              MAX(acctupdatetime) AS last_activity
       FROM radacct GROUP BY nasipaddress`
    );
    const radList = Array.isArray(radRows) ? radRows : [];
    for (const r of radList as { nas_ip: string; active_sessions: string | number; last_activity: string | null }[]) {
      const ip = normalizeNasIp(r.nas_ip);
      if (!ip) continue;
      nasStatusByIp[ip] = {
        active_sessions: Number(r.active_sessions) || 0,
        last_activity: r.last_activity ? String(r.last_activity) : null,
      };
    }
  } catch {
    // radacct pode não existir
  }

  const now = Date.now();
  const ONLINE_WINDOW_MS = 15 * 60 * 1000; // 15 min: NAS com accounting nesse período = online

  for (const n of list) {
    const ip = normalizeNasIp(n.nas_ip as string);
    const st = nasStatusByIp[ip];
    const activeSessions = st?.active_sessions ?? 0;
    const lastActivity = st?.last_activity ?? null;
    n.active_sessions = activeSessions;
    n.last_activity = lastActivity;
    const recentActivity =
      lastActivity && now - new Date(lastActivity).getTime() < ONLINE_WINDOW_MS;
    n.online = activeSessions > 0 || !!recentActivity;
  }

  return res.json({ ok: true, nas: list });
}));

/** POST /api/portal/nas/sync — Sincroniza todos os NAS do tenant para a tabela nas (FreeRADIUS). */
portalDataRouter.post('/nas/sync', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const result = await syncAllTenantNasToRadius(pool, tid);
  if (!result.ok) return res.status(503).json({ message: result.message || 'Falha ao sincronizar NAS' });
  return res.json({ ok: true, synced: result.synced });
}));

portalDataRouter.post('/nas', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = body.name != null ? String(body.name).trim() : '';
  const nasIp = body.nas_ip != null ? String(body.nas_ip).trim() : (body.nasIp != null ? String(body.nasIp).trim() : '');
  const description = body.description != null && body.description !== '' ? String(body.description).trim() : null;
  const isActive = body.is_active !== undefined ? Boolean(body.is_active) : (body.isActive !== undefined ? Boolean(body.isActive) : true);
  const nasSecret = body.nas_secret != null && body.nas_secret !== '' ? String(body.nas_secret).trim() : null;

  if (!name) return res.status(400).json({ message: 'Nome é obrigatório.' });
  if (!nasIp) return res.status(400).json({ message: 'IP do NAS é obrigatório.' });
  const pool = getPool();
  try {
    let r: unknown;
    try {
      [r] = await pool.query(
        `INSERT INTO tenant_nas (tenant_id, name, nas_ip, description, is_active, nas_secret)
         VALUES (:tid, :name, :nasIp, :description, :isActive, :nasSecret) RETURNING id`,
        { tid, name, nasIp, description, isActive, nasSecret }
      );
    } catch (colErr: unknown) {
      const ce = colErr as { code?: string };
      if (ce?.code === '42703') {
        [r] = await pool.query(
          'INSERT INTO tenant_nas (tenant_id, name, nas_ip, description, is_active) VALUES (:tid, :name, :nasIp, :description, :isActive) RETURNING id',
          { tid, name, nasIp, description, isActive }
        );
      } else throw colErr;
    }
    const resObj = r as { insertId?: number };
    const insertId = resObj?.insertId;
    if (insertId == null) return res.status(500).json({ message: 'Erro ao criar concentrador' });
    if (isActive) {
      await syncNasToRadius(pool, tid, { nas_ip: nasIp, name, description, nas_secret: nasSecret }).catch(() => {});
    }
    return res.status(201).json({ ok: true, id: insertId });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'ER_NO_SUCH_TABLE' || err?.code === '42P01') {
      return res.status(503).json({ message: 'Tabela tenant_nas não existe. Execute: node scripts/create-tenant-nas.mjs' });
    }
    throw e;
  }
}));

portalDataRouter.patch('/nas/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const body = req.body || {};
  const name = body.name != null ? String(body.name).trim() : undefined;
  const nas_ip = body.nas_ip != null ? String(body.nas_ip).trim() : undefined;
  const description = body.description !== undefined ? (body.description ? String(body.description).trim() : null) : undefined;
  const is_active = body.is_active !== undefined ? Boolean(body.is_active) : undefined;
  const nas_secret = body.nas_secret !== undefined ? (body.nas_secret ? String(body.nas_secret).trim() : null) : undefined;
  if (!name && !nas_ip && description === undefined && is_active === undefined && nas_secret === undefined) {
    return res.status(400).json({ message: 'Nenhum campo para atualizar.' });
  }
  const pool = getPool();
  const updates: string[] = [];
  const params: Record<string, string | number | null | boolean> = { id, tid };
  if (name !== undefined) { updates.push('name = :name'); params.name = name; }
  if (nas_ip !== undefined) { updates.push('nas_ip = :nas_ip'); params.nas_ip = nas_ip; }
  if (description !== undefined) { updates.push('description = :description'); params.description = description; }
  if (is_active !== undefined) { updates.push('is_active = :is_active'); params.is_active = is_active; }
  if (nas_secret !== undefined) { updates.push('nas_secret = :nas_secret'); params.nas_secret = nas_secret; }
  try {
    const [cur] = await pool.query(
      'SELECT nas_ip, is_active FROM tenant_nas WHERE id = :id AND tenant_id = :tid',
      { id, tid }
    );
    const curList = Array.isArray(cur) ? cur : [];
    const oldRow = curList[0] as { nas_ip?: string; is_active?: boolean } | undefined;
    if (!oldRow) return res.status(404).json({ message: 'Concentrador não encontrado' });

    let updateResult: unknown;
    try {
      [updateResult] = await pool.query(
        `UPDATE tenant_nas SET ${updates.join(', ')}, updated_at = NOW() WHERE id = :id AND tenant_id = :tid`,
        params
      );
    } catch (colErr: unknown) {
      const ce = colErr as { code?: string };
      if (ce?.code === '42703' && nas_secret !== undefined) {
        const u2 = updates.filter((u) => !u.startsWith('nas_secret'));
        const p2 = { ...params }; delete p2.nas_secret;
        if (u2.length === 0) return res.status(400).json({ message: 'Nenhum campo para atualizar.' });
        [updateResult] = await pool.query(
          `UPDATE tenant_nas SET ${u2.join(', ')}, updated_at = NOW() WHERE id = :id AND tenant_id = :tid`,
          p2
        );
      } else throw colErr;
    }
    const affected = (updateResult as { affectedRows?: number })?.affectedRows ?? 0;
    if (affected === 0) return res.status(404).json({ message: 'Concentrador não encontrado' });

    const [updated] = await pool.query(
      'SELECT nas_ip, name, description, nas_secret, is_active FROM tenant_nas WHERE id = :id AND tenant_id = :tid',
      { id, tid }
    );
    const updList = Array.isArray(updated) ? updated : [];
    const row = updList[0] as { nas_ip: string; name: string; description?: string | null; nas_secret?: string | null; is_active?: boolean } | undefined;
    if (row) {
      if (row.is_active === false) await removeNasFromRadius(pool, row.nas_ip).catch(() => {});
      else await syncNasToRadius(pool, tid, row).catch(() => {});
      if (nas_ip !== undefined && oldRow.nas_ip !== nas_ip) await removeNasFromRadius(pool, oldRow.nas_ip!).catch(() => {});
    }
    return res.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'ER_NO_SUCH_TABLE' || err?.code === '42P01') {
      return res.status(503).json({ message: 'Tabela tenant_nas não existe.' });
    }
    throw e;
  }
}));

portalDataRouter.delete('/nas/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  try {
    const [cur] = await pool.query('SELECT nas_ip FROM tenant_nas WHERE id = :id AND tenant_id = :tid', { id, tid });
    const curList = Array.isArray(cur) ? cur : [];
    const old = curList[0] as { nas_ip?: string } | undefined;
    const [result] = await pool.query('DELETE FROM tenant_nas WHERE id = :id AND tenant_id = :tid', { id, tid });
    const affected = (result as { affectedRows?: number })?.affectedRows ?? 0;
    if (affected === 0) return res.status(404).json({ message: 'Concentrador não encontrado' });
    if (old?.nas_ip) await removeNasFromRadius(pool, old.nas_ip).catch(() => {});
    return res.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'ER_NO_SUCH_TABLE' || err?.code === '42P01') {
      return res.status(503).json({ message: 'Tabela tenant_nas não existe.' });
    }
    throw e;
  }
}));

// ---- Leads ----
portalDataRouter.get('/leads', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, protocol, plan_code, customer_name, whatsapp, vencimento, status, created_at
     FROM subscription_requests
     WHERE tenant_id = :tid
     ORDER BY id DESC
     LIMIT 500`,
    { tid }
  );
  return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
}));

portalDataRouter.get('/leads/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM subscription_requests WHERE id = :id AND tenant_id = :tid LIMIT 1',
    { id, tid }
  );
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return res.status(404).json({ message: 'Pedido não encontrado' });
  return res.json({ ok: true, lead: list[0] });
}));

portalDataRouter.patch('/leads/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const status = String(req.body?.status ?? '').trim().toUpperCase();
  const valid = ['NEW', 'CONTACTED', 'SCHEDULED', 'INSTALLED', 'CANCELLED'];
  if (!valid.includes(status)) return res.status(400).json({ message: 'Status inválido' });

  const tid = tenantId(req);
  const pool = getPool();

  const [leadRows] = await pool.query(
    'SELECT id, customer_name, whatsapp, email, plan_code, vencimento, address_json, tenant_id FROM subscription_requests WHERE id = :id AND tenant_id = :tid LIMIT 1',
    { id, tid }
  );
  const leadList = Array.isArray(leadRows) ? leadRows : [];
  if (!leadList.length) return res.status(404).json({ message: 'Pedido não encontrado' });

  if (status === 'INSTALLED') {
    const lead = leadList[0] as { id: number; customer_name: string; whatsapp: string; email: string | null; plan_code: string; vencimento: number; address_json: string | object; tenant_id?: number };
    const leadTenantId = lead.tenant_id ?? tid;
    const customerId = await syncInstalledLeadToCustomer(pool, lead, leadTenantId);
    await syncInstalledLeadToInstallation(pool, { ...lead, customer_id: customerId });
  }

  await pool.query('UPDATE subscription_requests SET status = :status WHERE id = :id AND tenant_id = :tid', { status, id, tid });
  return res.json({ ok: true });
}));

// ---- Plans ----
const PLANS_BASE_COLS = 'id, code, speed_display, unit, tagline, features_json, badge, sort_order, active';
const PLANS_BASE_WITH_PRICE = `${PLANS_BASE_COLS}, COALESCE(price, 99.90) AS price`;
const PLANS_EXTRA_COLS = 'speed_download_mbps, speed_upload_mbps, nas_ids, block_auto, block_days_after_due, block_radius_group, quota_gb, quota_period, quota_exceeded_group, framed_pool, vlan_id, block_redirect_url';

portalDataRouter.get('/plans', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  let rows: unknown;
  const withExtras = `${PLANS_BASE_COLS}, COALESCE(price, 99.90) AS price, ${PLANS_EXTRA_COLS}`;

  // 1) Tenta buscar planos específicos do tenant (com price para edição no portal e exibição no site)
  try {
    [rows] = await pool.query(
      `SELECT ${withExtras} FROM plans WHERE tenant_id = :tid ORDER BY sort_order ASC`,
      { tid }
    );
  } catch {
    try {
      [rows] = await pool.query(
        `SELECT ${PLANS_BASE_WITH_PRICE} FROM plans WHERE tenant_id = :tid ORDER BY sort_order ASC`,
        { tid }
      );
    } catch {
      try {
        [rows] = await pool.query(
          `SELECT ${PLANS_BASE_COLS} FROM plans WHERE tenant_id = :tid ORDER BY sort_order ASC`,
          { tid }
        );
      } catch {
        rows = [];
      }
    }
  }

  let list = Array.isArray(rows) ? rows : [];

  // 2) Fallback: planos globais (sem tenant)
  if (!list.length) {
    try {
      const [globalRows] = await pool.query(
        `SELECT ${withExtras} FROM plans ORDER BY sort_order ASC`
      );
      list = Array.isArray(globalRows) ? globalRows as unknown[] : [];
    } catch {
      try {
        const [globalRows] = await pool.query(
          `SELECT ${PLANS_BASE_WITH_PRICE} FROM plans ORDER BY sort_order ASC`
        );
        list = Array.isArray(globalRows) ? globalRows as unknown[] : [];
      } catch {
        try {
          const [globalRows] = await pool.query(
            `SELECT ${PLANS_BASE_COLS} FROM plans ORDER BY sort_order ASC`
          );
          list = Array.isArray(globalRows) ? globalRows as unknown[] : [];
        } catch {
          const [globalRows] = await pool.query(
            `SELECT id, code, speed_display, unit, tagline, features_json, badge, sort_order, active FROM plans ORDER BY sort_order ASC`
          );
          list = Array.isArray(globalRows) ? globalRows as unknown[] : [];
        }
      }
    }
  }

  // Garantir price numérico quando coluna não existir
  list = list.map((p: unknown) => {
    const row = p as Record<string, unknown>;
    if (row.price == null && (row as { price?: number }).price !== 0) row.price = 99.9;
    return row;
  });

  return res.json({ ok: true, plans: list });
}));

portalDataRouter.post('/plans', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const code = String(body.code ?? '').trim();
  const speedDisplay = String(body.speed_display ?? body.speedDisplay ?? code).trim();
  const unit = String(body.unit ?? 'Mega').trim();
  const tagline = String(body.tagline ?? '').trim();
  const features = Array.isArray(body.features_json) ? body.features_json : (body.features ? [].concat(body.features) : []);
  const badge = ['', 'popular', 'top'].includes(String(body.badge ?? '')) ? body.badge : '';
  const sortOrder = Number(body.sort_order ?? body.sortOrder ?? 0);
  const price = body.price !== undefined && body.price !== null && body.price !== '' ? Number(body.price) : 99.9;
  const speedDownloadMbps = body.speed_download_mbps != null && body.speed_download_mbps !== '' ? Number(body.speed_download_mbps) : null;
  const speedUploadMbps = body.speed_upload_mbps != null && body.speed_upload_mbps !== '' ? Number(body.speed_upload_mbps) : null;
  const nasIds = Array.isArray(body.nas_ids) ? body.nas_ids : (body.nas_ids != null ? [].concat(body.nas_ids) : null);
  const blockAuto = Boolean(body.block_auto);
  const blockDaysAfterDue = Number(body.block_days_after_due ?? 5) || 5;
  const blockRadiusGroup = String(body.block_radius_group ?? 'bloqueado').trim() || 'bloqueado';
  if (!code) return res.status(400).json({ message: 'Código do plano é obrigatório' });

  const pool = getPool();
  // Postgres: coluna active é BOOLEAN; usar literal TRUE no SQL evita "expression is of type integer"
  const baseParams = {
    code,
    speed_display: speedDisplay,
    unit,
    tagline,
    features_json: JSON.stringify(features),
    badge,
    sort_order: sortOrder,
    price,
    tid,
    speed_download_mbps: speedDownloadMbps,
    speed_upload_mbps: speedUploadMbps,
    nas_ids: nasIds ? JSON.stringify(nasIds) : null,
    block_auto: blockAuto,
    block_days_after_due: blockDaysAfterDue,
    block_radius_group: blockRadiusGroup,
  };
  try {
    await pool.query(
      `INSERT INTO plans (code, speed_display, unit, tagline, features_json, badge, sort_order, active, price, tenant_id,
        speed_download_mbps, speed_upload_mbps, nas_ids, block_auto, block_days_after_due, block_radius_group)
       VALUES (:code, :speed_display, :unit, :tagline, :features_json, :badge, :sort_order, TRUE, :price, :tid,
        :speed_download_mbps, :speed_upload_mbps, CAST(:nas_ids AS jsonb), :block_auto, :block_days_after_due, :block_radius_group)`,
      { ...baseParams, nas_ids: nasIds ? JSON.stringify(nasIds) : null }
    );
  } catch {
    try {
      await pool.query(
        `INSERT INTO plans (code, speed_display, unit, tagline, features_json, badge, sort_order, active, price, tenant_id)
         VALUES (:code, :speed_display, :unit, :tagline, :features_json, :badge, :sort_order, TRUE, :price, :tid)`,
        { code, speed_display: speedDisplay, unit, tagline, features_json: JSON.stringify(features), badge, sort_order: sortOrder, price, tid }
      );
    } catch {
      await pool.query(
        `INSERT INTO plans (code, speed_display, unit, tagline, features_json, badge, sort_order, active)
         VALUES (:code, :speed_display, :unit, :tagline, :features_json, :badge, :sort_order, TRUE)`,
        { code, speed_display: speedDisplay, unit, tagline, features_json: JSON.stringify(features), badge, sort_order: sortOrder }
      );
    }
  }
  try {
    const framedPool = body.framed_pool != null ? String(body.framed_pool).trim() || null : null;
    const vlanId = body.vlan_id != null && body.vlan_id !== '' ? Number(body.vlan_id) : null;
    await syncPlanToRadgroupreply(pool, code, speedDownloadMbps, speedUploadMbps, { framedPool, vlanId });
  } catch (_) { /* tabelas RADIUS podem não existir */ }
  try {
    const quotaGb = body.quota_gb != null && body.quota_gb !== '' ? Number(body.quota_gb) : null;
    const quotaPeriod = ['daily', 'weekly', 'monthly'].includes(String(body.quota_period ?? '')) ? body.quota_period : 'monthly';
    const quotaExceededGroup = String(body.quota_exceeded_group ?? 'reduzido_10m').trim() || 'reduzido_10m';
    const framedPoolCol = body.framed_pool != null ? String(body.framed_pool).trim() || null : null;
    const vlanIdCol = body.vlan_id != null && body.vlan_id !== '' ? Number(body.vlan_id) : null;
    const blockRedirectUrl = body.block_redirect_url != null ? String(body.block_redirect_url).trim() || null : null;
    await pool.query(
      `UPDATE plans SET quota_gb = :quota_gb, quota_period = :quota_period, quota_exceeded_group = :quota_exceeded_group, framed_pool = :framed_pool, vlan_id = :vlan_id, block_redirect_url = :block_redirect_url WHERE code = :code AND tenant_id = :tid`,
      { quota_gb: quotaGb, quota_period: quotaPeriod, quota_exceeded_group: quotaExceededGroup, framed_pool: framedPoolCol, vlan_id: vlanIdCol, block_redirect_url: blockRedirectUrl, code, tid }
    );
  } catch (_) { /* colunas podem não existir */ }
  return res.json({ ok: true });
}));

portalDataRouter.put('/plans/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const body = req.body || {};
  if (!id) return res.status(400).json({ message: 'ID inválido' });

  const pool = getPool();
  const updates: string[] = [];
  const params: Record<string, unknown> = { id, tid };

  if (body.code !== undefined) { updates.push('code = :code'); params.code = String(body.code).trim(); }
  if (body.speed_display !== undefined) { updates.push('speed_display = :speed_display'); params.speed_display = String(body.speed_display).trim(); }
  if (body.unit !== undefined) { updates.push('unit = :unit'); params.unit = String(body.unit).trim(); }
  if (body.tagline !== undefined) { updates.push('tagline = :tagline'); params.tagline = String(body.tagline).trim(); }
  if (body.features_json !== undefined) { updates.push('features_json = :features_json'); params.features_json = JSON.stringify(Array.isArray(body.features_json) ? body.features_json : []); }
  if (body.badge !== undefined) { updates.push('badge = :badge'); params.badge = ['', 'popular', 'top'].includes(String(body.badge)) ? body.badge : ''; }
  if (body.sort_order !== undefined) { updates.push('sort_order = :sort_order'); params.sort_order = Number(body.sort_order); }
  if (body.active !== undefined) { updates.push('active = (COALESCE(CAST(:active AS int), 0) != 0)'); params.active = body.active ? 1 : 0; }
  if (body.price !== undefined && body.price !== null && body.price !== '') { updates.push('price = :price'); params.price = Number(body.price); }
  if (body.speed_download_mbps !== undefined) { updates.push('speed_download_mbps = :speed_download_mbps'); params.speed_download_mbps = body.speed_download_mbps != null && body.speed_download_mbps !== '' ? Number(body.speed_download_mbps) : null; }
  if (body.speed_upload_mbps !== undefined) { updates.push('speed_upload_mbps = :speed_upload_mbps'); params.speed_upload_mbps = body.speed_upload_mbps != null && body.speed_upload_mbps !== '' ? Number(body.speed_upload_mbps) : null; }
  if (body.nas_ids !== undefined) { updates.push('nas_ids = CAST(:nas_ids AS jsonb)'); params.nas_ids = Array.isArray(body.nas_ids) ? JSON.stringify(body.nas_ids) : null; }
  if (body.block_auto !== undefined) { updates.push('block_auto = :block_auto'); params.block_auto = Boolean(body.block_auto); }
  if (body.block_days_after_due !== undefined) { updates.push('block_days_after_due = :block_days_after_due'); params.block_days_after_due = Number(body.block_days_after_due ?? 5) || 5; }
  if (body.block_radius_group !== undefined) { updates.push('block_radius_group = :block_radius_group'); params.block_radius_group = String(body.block_radius_group ?? 'bloqueado').trim() || 'bloqueado'; }
  if (body.quota_gb !== undefined) { updates.push('quota_gb = :quota_gb'); params.quota_gb = body.quota_gb != null && body.quota_gb !== '' ? Number(body.quota_gb) : null; }
  if (body.quota_period !== undefined) { updates.push('quota_period = :quota_period'); params.quota_period = ['daily', 'weekly', 'monthly'].includes(String(body.quota_period)) ? body.quota_period : 'monthly'; }
  if (body.quota_exceeded_group !== undefined) { updates.push('quota_exceeded_group = :quota_exceeded_group'); params.quota_exceeded_group = String(body.quota_exceeded_group ?? 'reduzido_10m').trim() || 'reduzido_10m'; }
  if (body.framed_pool !== undefined) { updates.push('framed_pool = :framed_pool'); params.framed_pool = body.framed_pool != null ? String(body.framed_pool).trim() || null : null; }
  if (body.vlan_id !== undefined) { updates.push('vlan_id = :vlan_id'); params.vlan_id = body.vlan_id != null && body.vlan_id !== '' ? Number(body.vlan_id) : null; }
  if (body.block_redirect_url !== undefined) { updates.push('block_redirect_url = :block_redirect_url'); params.block_redirect_url = body.block_redirect_url != null ? String(body.block_redirect_url).trim() || null : null; }

  if (updates.length === 0) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
  await pool.query(`UPDATE plans SET ${updates.join(', ')} WHERE id = :id AND tenant_id = :tid`, params as Record<string, string | number>);
  try {
    let planRows: unknown;
    try {
      [planRows] = await pool.query(
        'SELECT code, speed_download_mbps, speed_upload_mbps, framed_pool, vlan_id FROM plans WHERE id = :id AND tenant_id = :tid LIMIT 1',
      { id, tid }
      );
    } catch {
      [planRows] = await pool.query(
        'SELECT code, speed_download_mbps, speed_upload_mbps FROM plans WHERE id = :id AND tenant_id = :tid LIMIT 1',
        { id, tid }
      );
    }
    const plan = Array.isArray(planRows) && (planRows as unknown[]).length ? ((planRows as unknown[])[0] as { code: string; speed_download_mbps: number | null; speed_upload_mbps: number | null; framed_pool?: string | null; vlan_id?: number | null }) : null;
    if (plan) await syncPlanToRadgroupreply(pool, plan.code, plan.speed_download_mbps, plan.speed_upload_mbps, { framedPool: plan.framed_pool ?? null, vlanId: plan.vlan_id ?? null });
  } catch (_) { /* tabelas RADIUS podem não existir */ }
  return res.json({ ok: true });
}));

portalDataRouter.delete('/plans/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  await pool.query('UPDATE plans SET active = false WHERE id = :id AND tenant_id = :tid', { id, tid });
  return res.json({ ok: true });
}));

/** POST /api/portal/block-overdue — Bloqueia clientes inadimplentes (aplica grupo RADIUS de bloqueio) */
portalDataRouter.post('/block-overdue', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const today = new Date().toISOString().slice(0, 10);

  const [rows] = await pool.query(
    `SELECT c.id, i.pppoe_user, i.plan_code, p.block_radius_group
     FROM customers c
     JOIN installations i ON i.customer_id = c.id
     JOIN invoices inv ON inv.customer_id = c.id
     JOIN plans p ON p.code = i.plan_code AND (p.tenant_id = :tid OR p.tenant_id IS NULL)
     WHERE c.tenant_id = :tid
       AND i.pppoe_user IS NOT NULL AND i.pppoe_user != ''
       AND p.block_auto = true
       AND inv.status IN ('PENDING', 'OVERDUE')
       AND inv.due_date + COALESCE(p.block_days_after_due, 5) <= :today::date
     GROUP BY c.id, i.pppoe_user, i.plan_code, p.block_radius_group`,
    { tid, today }
  );

  const toBlock = Array.isArray(rows) ? (rows as { pppoe_user: string; block_radius_group: string }[]) : [];
  let blocked = 0;

  for (const row of toBlock) {
    const username = String(row.pppoe_user || '').trim();
    const groupName = String(row.block_radius_group || 'bloqueado').trim();
    if (!username) continue;
    try {
      await pool.query('DELETE FROM radusergroup WHERE username = :username', { username });
      await pool.query(
        'INSERT INTO radusergroup (username, groupname, priority) VALUES (:username, :groupname, 1)',
        { username, groupname: groupName }
      );
      blocked++;
    } catch (e) {
      console.error('[block-overdue]', username, e);
    }
  }

  return res.json({ ok: true, blocked, total: toBlock.length });
}));

/** POST /api/portal/unblock-paid — Desbloqueia clientes em dia (volta grupo RADIUS para o plano) */
portalDataRouter.post('/unblock-paid', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const today = new Date().toISOString().slice(0, 10);

  const [rows] = await pool.query(
    `SELECT i.pppoe_user, i.plan_code
     FROM customers c
     JOIN installations i ON i.customer_id = c.id
     JOIN plans p ON p.code = i.plan_code AND (p.tenant_id = :tid OR p.tenant_id IS NULL)
     WHERE c.tenant_id = :tid
       AND i.status = 'ACTIVE'
       AND i.pppoe_user IS NOT NULL AND i.pppoe_user != ''
       AND NOT EXISTS (
         SELECT 1 FROM invoices inv
         WHERE inv.customer_id = c.id AND inv.status IN ('PENDING', 'OVERDUE')
           AND inv.due_date + COALESCE(p.block_days_after_due, 5) <= :today::date
       )`,
    { tid, today }
  );

  const toUnblock = Array.isArray(rows) ? (rows as { pppoe_user: string; plan_code: string }[]) : [];
  let unblocked = 0;
  for (const row of toUnblock) {
    const username = String(row.pppoe_user || '').trim();
    const groupName = String(row.plan_code || '').trim();
    if (!username || !groupName) continue;
    try {
      await pool.query('DELETE FROM radusergroup WHERE username = :username', { username });
      await pool.query(
        'INSERT INTO radusergroup (username, groupname, priority) VALUES (:username, :groupname, 1)',
        { username, groupname: groupName }
      );
      unblocked++;
    } catch (e) {
      console.error('[unblock-paid]', username, e);
    }
  }
  return res.json({ ok: true, unblocked, total: toUnblock.length });
}));

// ---- Proposals & templates ----
portalDataRouter.get('/proposal-templates', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  let rows: unknown;
  try {
    [rows] = await pool.query(
      'SELECT id, name, description, plan_code, default_amount, valid_days, is_active, created_at FROM proposal_templates WHERE tenant_id = :tid AND is_active = TRUE ORDER BY name',
      { tid }
    );
  } catch {
    rows = [];
  }
  return res.json({ ok: true, templates: Array.isArray(rows) ? rows : [] });
}));

portalDataRouter.post('/proposal-templates', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const description = body.description != null ? String(body.description).trim() : null;
  const planCode = body.plan_code != null ? String(body.plan_code).trim() || null : null;
  const defaultAmount = body.default_amount != null && body.default_amount !== '' ? Number(body.default_amount) : null;
  const validDays = body.valid_days != null && body.valid_days !== '' ? Number(body.valid_days) : 15;
  if (!name) return res.status(400).json({ message: 'Nome do modelo é obrigatório' });
  const pool = getPool();
  const [r] = await pool.query(
    `INSERT INTO proposal_templates (tenant_id, name, description, plan_code, default_amount, valid_days)
     VALUES (:tid, :name, :description, :planCode, :amount, :validDays) RETURNING id`,
    { tid, name, description, planCode, amount: defaultAmount, validDays }
  );
  const insertId = (r as { insertId?: number })?.insertId;
  return res.status(201).json({ ok: true, id: insertId });
}));

portalDataRouter.put('/proposal-templates/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const body = req.body || {};
  const updates: string[] = [];
  const params: Record<string, string | number | null | boolean> = { id, tid };
  if (body.name !== undefined) {
    updates.push('name = :name');
    params.name = String(body.name || '').trim();
  }
  if (body.description !== undefined) {
    updates.push('description = :description');
    params.description = body.description ? String(body.description).trim() : null;
  }
  if (body.plan_code !== undefined) {
    updates.push('plan_code = :plan_code');
    params.plan_code = body.plan_code ? String(body.plan_code).trim() : null;
  }
  if (body.default_amount !== undefined) {
    updates.push('default_amount = :default_amount');
    params.default_amount = body.default_amount !== null && body.default_amount !== '' ? Number(body.default_amount) : null;
  }
  if (body.valid_days !== undefined) {
    updates.push('valid_days = :valid_days');
    params.valid_days = Number(body.valid_days) || 15;
  }
  if (body.is_active !== undefined) {
    updates.push('is_active = :is_active');
    params.is_active = !!body.is_active;
  }
  if (!updates.length) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
  const pool = getPool();
  const [r] = await pool.query(
    `UPDATE proposal_templates SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid`,
    params
  );
  if ((r as { affectedRows?: number })?.affectedRows === 0) return res.status(404).json({ message: 'Modelo não encontrado' });
  return res.json({ ok: true });
}));

portalDataRouter.delete('/proposal-templates/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const [r] = await pool.query(
    'UPDATE proposal_templates SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid',
    { id, tid }
  );
  if ((r as { affectedRows?: number })?.affectedRows === 0) return res.status(404).json({ message: 'Modelo não encontrado' });
  return res.json({ ok: true });
}));

// ---- Proposals ----
portalDataRouter.get('/proposals', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const status = req.query.status as string | undefined;
  let sql = `SELECT p.id, p.customer_id, p.customer_name, p.customer_whatsapp, p.plan_code, p.amount, p.valid_until, p.status, p.notes, p.created_at
             FROM proposals p WHERE p.tenant_id = :tid`;
  const params: Record<string, string | number> = { tid };
  if (status) { sql += ' AND p.status = :status'; params.status = status; }
  sql += ' ORDER BY p.id DESC LIMIT 500';
  try {
    const [rows] = await pool.query(sql, params);
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
}));

portalDataRouter.post('/proposals', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const customerId = body.customer_id != null ? Number(body.customer_id) : null;
  const customerName = body.customer_name ? String(body.customer_name).trim() : null;
  const customerWhatsapp = body.customer_whatsapp ? String(body.customer_whatsapp).trim() : null;
  const planCode = String(body.plan_code || '').trim();
  const amount = Number(body.amount) || 0;
  const validUntil = body.valid_until ? String(body.valid_until).trim() : null;
  const notes = body.notes ? String(body.notes).trim() : null;
  if (!planCode) return res.status(400).json({ message: 'Plano é obrigatório' });

  const pool = getPool();
  const [r] = await pool.query(
    `INSERT INTO proposals (tenant_id, customer_id, customer_name, customer_whatsapp, plan_code, amount, valid_until, status, notes)
     VALUES (:tid, :customerId, :customerName, :customerWhatsapp, :planCode, :amount, CAST(:validUntil AS DATE), 'DRAFT', :notes) RETURNING id`,
    { tid, customerId, customerName, customerWhatsapp, planCode, amount, validUntil: validUntil || null, notes: notes || null }
  );
  const insertId = (r as { insertId?: number })?.insertId;
  return res.status(201).json({ ok: true, id: insertId });
}));

portalDataRouter.patch('/proposals/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const status = String(req.body?.status ?? '').trim().toUpperCase();
  const valid = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'CONVERTED'];
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  if (!valid.includes(status)) return res.status(400).json({ message: 'Status inválido' });

  const pool = getPool();
  const [propRows] = await pool.query(
    'SELECT id, customer_id, customer_name, customer_whatsapp, plan_code, amount FROM proposals WHERE id = :id AND tenant_id = :tid LIMIT 1',
    { id, tid }
  );
  const prop = Array.isArray(propRows) ? (propRows as { customer_id: number | null; customer_name: string; customer_whatsapp: string; plan_code: string; amount: number }[])[0] : null;
  if (!prop) return res.status(404).json({ message: 'Proposta não encontrada' });

  const [result] = await pool.query(
    'UPDATE proposals SET status = :status, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid',
    { status, id, tid }
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0) return res.status(404).json({ message: 'Proposta não encontrada' });

  if (status === 'CONVERTED') {
    const customerId = prop.customer_id || null;
    try {
      const [soIns] = await pool.query(
        `INSERT INTO service_orders (tenant_id, customer_id, type, status, proposal_id, description)
         VALUES (:tid, :customerId, 'INSTALLATION', 'OPEN', :proposalId, :desc) RETURNING id`,
        { tid, customerId, proposalId: id, desc: `Instalação - proposta #${id} convertida` }
      );
      const soId = (soIns as { insertId?: number })?.insertId;
      return res.json({ ok: true, serviceOrderId: soId });
    } catch (e) {
      console.error('[proposals] convert to OS:', e);
    }
  }
  return res.json({ ok: true });
}));

/** POST /api/portal/proposals/:id/emit-contract — Emite contrato a partir de proposta APPROVED */
portalDataRouter.post('/proposals/:id/emit-contract', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const pool = getPool();

  const [propRows] = await pool.query(
    'SELECT id, customer_id, customer_name, customer_whatsapp, plan_code, amount FROM proposals WHERE id = :id AND tenant_id = :tid AND status = :status LIMIT 1',
    { id, tid, status: 'APPROVED' }
  );
  const prop = Array.isArray(propRows) ? (propRows as { customer_id: number | null; plan_code: string; amount: number }[])[0] : null;
  if (!prop) return res.status(400).json({ message: 'Proposta não encontrada ou não está aprovada' });

  const dueDay = Math.min(28, Math.max(1, Number(req.body?.due_day) || 10));
  const today = new Date().toISOString().slice(0, 10);

  const [r] = await pool.query(
    `INSERT INTO contracts (tenant_id, customer_id, proposal_id, plan_code, amount, due_day, status, signed_at, starts_at)
     VALUES (:tid, :customerId, :proposalId, :planCode, :amount, :dueDay, 'ACTIVE', CAST(:today AS DATE), CAST(:today AS DATE)) RETURNING id`,
    { tid, customerId: prop.customer_id, proposalId: id, planCode: prop.plan_code, amount: prop.amount, dueDay, today }
  );
  const contractId = (r as { insertId?: number })?.insertId;
  return res.status(201).json({ ok: true, id: contractId });
}));

// ---- Service Orders ----
portalDataRouter.get('/service-orders', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const status = req.query.status as string | undefined;
  const type = req.query.type as string | undefined;
  let sql = `SELECT so.id, so.customer_id, so.type, so.status, so.assigned_to, so.due_date, so.completed_at, so.description, so.resolution, so.created_at,
             c.name AS customer_name, c.whatsapp AS customer_whatsapp
             FROM service_orders so
             LEFT JOIN customers c ON c.id = so.customer_id AND c.tenant_id = :tid
             WHERE so.tenant_id = :tid`;
  const params: Record<string, string | number> = { tid };
  if (status) { sql += ' AND so.status = :status'; params.status = status; }
  if (type) { sql += ' AND so.type = :type'; params.type = type; }
  sql += ' ORDER BY so.id DESC LIMIT 500';
  try {
    const [rows] = await pool.query(sql, params);
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
}));

portalDataRouter.post('/service-orders', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const customerId = body.customer_id != null ? Number(body.customer_id) : null;
  const type = ['INSTALLATION', 'MAINTENANCE', 'SUPPORT', 'UPGRADE', 'OTHER'].includes(String(body.type || '').toUpperCase())
    ? String(body.type).toUpperCase() : 'INSTALLATION';
  const description = body.description ? String(body.description).trim() : null;
  const dueRaw = body.due_date ? String(body.due_date).trim() : '';
  if (dueRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dueRaw)) {
    return res.status(400).json({ message: 'Data prevista inválida. Use o formato YYYY-MM-DD.' });
  }
  const dueDate = dueRaw || null;
  const assignedTo = body.assigned_to != null ? Number(body.assigned_to) : null;

  const pool = getPool();
  const [r] = await pool.query(
    `INSERT INTO service_orders (tenant_id, customer_id, type, status, assigned_to, due_date, description)
     VALUES (:tid, :customerId, :type, 'OPEN', :assignedTo, CAST(:dueDate AS DATE), :description) RETURNING id`,
    { tid, customerId, type, assignedTo: assignedTo || null, dueDate: dueDate || null, description: description || null }
  );
  const insertId = (r as { insertId?: number })?.insertId;
  return res.status(201).json({ ok: true, id: insertId });
}));

portalDataRouter.patch('/service-orders/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const body = req.body || {};
  const status = body.status ? String(body.status).trim().toUpperCase() : undefined;
  const resolution = body.resolution !== undefined ? String(body.resolution || '').trim() : undefined;
  const validStatus = ['OPEN', 'IN_PROGRESS', 'PENDING', 'COMPLETED', 'CANCELLED'];
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  if (status && !validStatus.includes(status)) return res.status(400).json({ message: 'Status inválido' });

  const pool = getPool();
  const lockedStatusOs = ['COMPLETED', 'CANCELLED'];
  if (status) {
    const [rows] = await pool.query(
      'SELECT status FROM service_orders WHERE id = :id AND tenant_id = :tid',
      { id, tid }
    );
    const current = Array.isArray(rows) ? (rows as { status?: string }[])[0]?.status : undefined;
    if (current && lockedStatusOs.includes(current)) {
      return res.status(400).json({ message: 'Status não pode ser alterado após concluído ou cancelado.' });
    }
  }

  const updates: string[] = [];
  const params: Record<string, string | number | null> = { id, tid };
  if (status) { updates.push('status = :status'); params.status = status; }
  if (resolution !== undefined) { updates.push('resolution = :resolution'); params.resolution = resolution || null; }
  if (status === 'COMPLETED') { updates.push('completed_at = CURRENT_TIMESTAMP'); }
  if (updates.length === 0) return res.status(400).json({ message: 'Nenhum campo para atualizar' });

  const [result] = await pool.query(
    `UPDATE service_orders SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid`,
    params
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0) return res.status(404).json({ message: 'Ordem de serviço não encontrada' });
  return res.json({ ok: true });
}));

// ---- Tickets ----
portalDataRouter.get('/tickets', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const status = req.query.status as string | undefined;
  let sql = `SELECT t.id, t.customer_id, t.subject, t.priority, t.status, t.assigned_to,
                    t.defect_text, t.solution_text, t.closed_at, t.created_at,
                    c.name AS customer_name, c.whatsapp AS customer_whatsapp
             FROM tickets t
             LEFT JOIN customers c ON c.id = t.customer_id AND (c.tenant_id = :tid OR c.tenant_id IS NULL)
             WHERE t.tenant_id = :tid`;
  const params: Record<string, string | number> = { tid };
  if (status) { sql += ' AND t.status = :status'; params.status = status; }
  sql += ' ORDER BY t.id DESC LIMIT 500';
  try {
    const [rows] = await pool.query(sql, params);
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
}));

portalDataRouter.post('/tickets', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const customerId = body.customer_id != null ? Number(body.customer_id) : null;
  const subject = String(body.subject || '').trim();
  const priority = ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(String(body.priority || '').toUpperCase())
    ? String(body.priority).toUpperCase() : 'NORMAL';
  const defectText = body.defect_text != null ? String(body.defect_text).trim() || null : null;
  const solutionText = body.solution_text != null ? String(body.solution_text).trim() || null : null;
  if (!subject) return res.status(400).json({ message: 'Assunto é obrigatório' });

  const pool = getPool();
  const [r] = await pool.query(
    `INSERT INTO tickets (tenant_id, customer_id, subject, priority, status, defect_text, solution_text)
     VALUES (:tid, :customerId, :subject, :priority, 'OPEN', :defectText, :solutionText) RETURNING id`,
    { tid, customerId: customerId || null, subject, priority, defectText, solutionText }
  );
  const insertId = (r as { insertId?: number })?.insertId;
  return res.status(201).json({ ok: true, id: insertId });
}));

portalDataRouter.patch('/tickets/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const body = req.body || {};
  const status = body.status ? String(body.status).trim().toUpperCase() : undefined;
  const validStatus = ['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'];
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  if (status && !validStatus.includes(status)) return res.status(400).json({ message: 'Status inválido' });

  const pool = getPool();
  const lockedStatusTicket = ['RESOLVED', 'CLOSED'];
  if (status) {
    const [rows] = await pool.query(
      'SELECT status FROM tickets WHERE id = :id AND tenant_id = :tid',
      { id, tid }
    );
    const current = Array.isArray(rows) ? (rows as { status?: string }[])[0]?.status : undefined;
    if (current && lockedStatusTicket.includes(current)) {
      return res.status(400).json({ message: 'Status não pode ser alterado após resolvido ou fechado.' });
    }
  }

  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const params: Record<string, string | number | null> = { id, tid };
  if (status) { updates.push('status = :status'); params.status = status; }
  if (body.priority) {
    const priority = String(body.priority).trim().toUpperCase();
    if (!['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority)) {
      return res.status(400).json({ message: 'Prioridade inválida' });
    }
    updates.push('priority = :priority');
    params.priority = priority;
  }
  if (body.defect_text !== undefined) {
    updates.push('defect_text = :defectText');
    params.defectText = body.defect_text ? String(body.defect_text).trim() : null;
  }
  if (body.solution_text !== undefined) {
    updates.push('solution_text = :solutionText');
    params.solutionText = body.solution_text ? String(body.solution_text).trim() : null;
  }
  if (status === 'RESOLVED' || status === 'CLOSED') { updates.push('closed_at = CURRENT_TIMESTAMP'); }

  const [result] = await pool.query(
    `UPDATE tickets SET ${updates.join(', ')} WHERE id = :id AND tenant_id = :tid`,
    params
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0) return res.status(404).json({ message: 'Ticket não encontrado' });
  return res.json({ ok: true });
}));

// Tickets de um cliente (Ocorrências na ficha)
portalDataRouter.get('/customers/:id/tickets', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const customerId = Number(req.params.id);
  if (!customerId) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.customer_id, t.subject, t.priority, t.status, t.assigned_to,
              t.defect_text, t.solution_text, t.closed_at, t.created_at
       FROM tickets t
       WHERE t.tenant_id = :tid AND t.customer_id = :customerId
       ORDER BY t.id DESC LIMIT 200`,
      { tid, customerId }
    );
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
}));


// ---- Contracts ----
portalDataRouter.get('/contracts', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const status = req.query.status as string | undefined;
  const customerId = req.query.customer_id ? Number(req.query.customer_id) : undefined;
  let sql = `SELECT ct.id, ct.customer_id, ct.proposal_id, ct.plan_code, ct.amount, ct.due_day, ct.status, ct.signed_at, ct.starts_at, ct.ends_at, ct.created_at,
             c.name AS customer_name, c.whatsapp
             FROM contracts ct
             LEFT JOIN customers c ON c.id = ct.customer_id AND c.tenant_id = :tid
             WHERE ct.tenant_id = :tid`;
  const params: Record<string, string | number> = { tid };
  if (status) { sql += ' AND ct.status = :status'; params.status = status; }
  if (customerId) { sql += ' AND ct.customer_id = :customer_id'; params.customer_id = customerId; }
  sql += ' ORDER BY ct.id DESC LIMIT 500';
  try {
    const [rows] = await pool.query(sql, params);
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
}));

portalDataRouter.post('/contracts', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const customerId = body.customer_id != null ? Number(body.customer_id) : null;
  const planCode = String(body.plan_code || '').trim();
  const amount = Number(body.amount) || 0;
  const dueDay = Math.min(28, Math.max(1, Number(body.due_day) || 10));
  const proposalId = body.proposal_id != null ? Number(body.proposal_id) : null;
  if (!planCode) return res.status(400).json({ message: 'Plano é obrigatório' });

  const pool = getPool();
  const today = new Date().toISOString().slice(0, 10);
  const [r] = await pool.query(
    `INSERT INTO contracts (tenant_id, customer_id, proposal_id, plan_code, amount, due_day, status, signed_at, starts_at)
     VALUES (:tid, :customerId, :proposalId, :planCode, :amount, :dueDay, 'ACTIVE', CAST(:today AS DATE), CAST(:today AS DATE)) RETURNING id`,
    { tid, customerId, proposalId, planCode, amount, dueDay, today }
  );
  const rows = Array.isArray(r) ? r : [];
  const contractId = rows.length ? (rows[0] as { id?: number })?.id : (r as { insertId?: number })?.insertId;

  if (contractId && customerId) {
    try {
      const [upd] = await pool.query(
        `UPDATE customer_comodato SET contract_id = :contractId
         WHERE tenant_id = :tid AND customer_id = :customerId AND movement_type = 'COMODATO' AND status = 'OPEN'
         AND (contract_id IS NULL OR contract_id = 0)`,
        { tid, customerId, contractId }
      );
      const linked = (upd as { affectedRows?: number; rowCount?: number })?.affectedRows ?? (upd as { rowCount?: number })?.rowCount ?? 0;
      return res.status(201).json({ ok: true, id: contractId, comodato_linked: Number(linked) > 0 });
    } catch {
      /* tabela customer_comodato pode não existir */
    }
  }
  return res.status(201).json({ ok: true, id: contractId });
}));

portalDataRouter.patch('/contracts/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const body = req.body || {};
  const status = body.status ? String(body.status).trim().toUpperCase() : undefined;
  const validStatus = ['DRAFT', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'];
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  if (status && !validStatus.includes(status)) return res.status(400).json({ message: 'Status inválido' });

  const pool = getPool();
  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const params: Record<string, string | number | null> = { id, tid };
  if (status) { updates.push('status = :status'); params.status = status; }
  if (body.ends_at !== undefined) { updates.push('ends_at = CAST(:ends_at AS DATE)'); params.ends_at = body.ends_at ? String(body.ends_at).trim() : null; }

  const [result] = await pool.query(
    `UPDATE contracts SET ${updates.join(', ')} WHERE id = :id AND tenant_id = :tid`,
    params
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0) return res.status(404).json({ message: 'Contrato não encontrado' });
  return res.json({ ok: true });
}));

portalDataRouter.delete('/contracts/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });

  const pool = getPool();
  const [result] = await pool.query(
    'DELETE FROM contracts WHERE id = :id AND tenant_id = :tid',
    { id, tid }
  );
  const affected = (result as { affectedRows?: number })?.affectedRows ?? (result as { rowCount?: number })?.rowCount ?? 0;
  if (affected === 0) return res.status(404).json({ message: 'Contrato não encontrado' });
  return res.json({ ok: true });
}));

/** GET /contracts/:id/print — HTML do contrato para impressão (usa modelo padrão + dados do contrato/cliente) */
portalDataRouter.get('/contracts/:id/print', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });

  const pool = getPool();
  const [contractRows] = await pool.query(
    `SELECT ct.id, ct.customer_id, ct.plan_code, ct.amount, ct.due_day, ct.status, ct.starts_at, ct.created_at,
             c.name AS customer_name, c.whatsapp AS customer_whatsapp
             FROM contracts ct
             LEFT JOIN customers c ON c.id = ct.customer_id AND c.tenant_id = :tid
             WHERE ct.id = :id AND ct.tenant_id = :tid`,
    { id, tid }
  );
  const contract = Array.isArray(contractRows) && contractRows.length > 0 ? (contractRows as Record<string, unknown>[])[0] : null;
  if (!contract) return res.status(404).json({ message: 'Contrato não encontrado' });

  const customerId = Number(contract.customer_id);
  let comodatoText = 'Nenhum equipamento em comodato vinculado a este contrato.';
  try {
    const [comodatoRows] = await pool.query(
      `SELECT id, notes, total_value, items_json, movement_type
       FROM customer_comodato
       WHERE tenant_id = :tid AND customer_id = :customerId
         AND movement_type = 'COMODATO' AND status = 'OPEN'
         AND (contract_id IS NULL OR contract_id = :contractId)
       ORDER BY id ASC`,
      { tid, customerId, contractId: id }
    );
    const comodatoList = Array.isArray(comodatoRows) ? (comodatoRows as Record<string, unknown>[]) : [];
    if (comodatoList.length > 0) {
      const parts: string[] = [];
      for (const row of comodatoList) {
        const notes = row.notes ? String(row.notes).trim() : '';
        let itemsDesc = '';
        const itemsJson = row.items_json;
        if (itemsJson != null) {
          try {
            const items = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
            if (Array.isArray(items)) {
              itemsDesc = items
                .map((it: { qty?: number; quantity?: number; name?: string; description?: string }) => {
                  const qty = Number(it?.qty ?? it?.quantity ?? 1);
                  const name = String(it?.name ?? it?.description ?? 'Item').trim();
                  return qty + 'x ' + name;
                })
                .join(', ');
            }
          } catch {
            itemsDesc = String(itemsJson).slice(0, 200);
          }
        }
        if (itemsDesc) parts.push(itemsDesc);
        if (notes) parts.push(notes);
      }
      comodatoText = parts.length > 0 ? parts.join(' — ') : 'Equipamentos em comodato registrados (ver detalhes no sistema).';
    }
  } catch {
    /* customer_comodato pode não existir */
  }

  let bodyHtml = '';
  try {
    const [tplRows] = await pool.query(
      `SELECT body_html FROM contract_templates WHERE tenant_id = :tid AND is_active IS NOT FALSE ORDER BY is_default DESC, id ASC LIMIT 1`,
      { tid }
    );
    const tpl = Array.isArray(tplRows) && tplRows.length > 0 ? (tplRows as { body_html?: string }[])[0] : null;
    bodyHtml = (tpl?.body_html || '').trim() || '<p>Contrato #{{contract_id}}</p><p>Cliente: {{customer_name}}</p><p>Plano: {{plan_code}} — Valor: R$ {{amount}} — Vencimento: dia {{due_day}}</p><p>Equipamentos em comodato: {{comodato_items}}</p><p>Data: {{date}}</p>';
  } catch (e) {
    if (isTableNotFoundError(e)) bodyHtml = '<p>Contrato #{{contract_id}}</p><p>Cliente: {{customer_name}}</p><p>Plano: {{plan_code}} — R$ {{amount}} — Venc. dia {{due_day}}</p><p>{{date}}</p>';
    else throw e;
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const startsAt = contract.starts_at ? String(contract.starts_at).slice(0, 10) : dateStr;
  const amountStr = Number(contract.amount) || 0;
  const replacements: Record<string, string> = {
    '{{contract_id}}': String(contract.id),
    '{{customer_name}}': String(contract.customer_name || ''),
    '{{customer_whatsapp}}': String(contract.customer_whatsapp || ''),
    '{{plan_code}}': String(contract.plan_code || ''),
    '{{amount}}': amountStr.toFixed(2).replace('.', ','),
    '{{due_day}}': String(contract.due_day ?? ''),
    '{{starts_at}}': startsAt,
    '{{date}}': dateStr,
    '{{comodato_items}}': comodatoText,
  };
  let html = bodyHtml;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(key).join(value);
  }

  const fullPage =
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Contrato #' + id + '</title>' +
    '<style>body{font-family:Georgia,serif;max-width:700px;margin:24px auto;padding:20px;font-size:12pt;line-height:1.5;color:#222;} ' +
    'h1{font-size:1.25rem;border-bottom:1px solid #ccc;padding-bottom:8px;} ' +
    'p{margin:0.6em 0;} @media print{body{margin:0;padding:16px;}}</style></head><body>' +
    html +
    '</body></html>';

  res.type('html').send(fullPage);
  return res as Response;
}));

/** Merge template body_html com mapa de variáveis (para preview e geração de documento) */
function mergeContractTemplate(
  bodyHtml: string,
  replacements: Record<string, string>
): string {
  let html = (bodyHtml || '').trim();
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(key).join(value ?? '');
  }
  return html;
}

/** POST /contract-templates/preview — Pré-visualização do contrato com dados do wizard (draft) */
portalDataRouter.post('/contract-templates/preview', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const templateId = body.template_id != null ? Number(body.template_id) : null;
  const pool = getPool();
  let bodyHtml: string;
  if (templateId) {
    const [tplRows] = await pool.query(
      'SELECT body_html FROM contract_templates WHERE id = :id AND tenant_id = :tid',
      { id: templateId, tid }
    );
    const tpl = Array.isArray(tplRows) && tplRows.length > 0 ? (tplRows as { body_html?: string }[])[0] : null;
    bodyHtml = (tpl?.body_html || '').trim() || '<p>Contrato</p><p>Cliente: {{customer_name}}</p><p>Plano: {{plan_code}} — R$ {{amount}} — Venc. dia {{due_day}}</p><p>{{date}}</p>';
  } else {
    const [tplRows] = await pool.query(
      `SELECT body_html FROM contract_templates WHERE tenant_id = :tid AND is_active IS NOT FALSE ORDER BY is_default DESC, id ASC LIMIT 1`,
      { tid }
    );
    const tpl = Array.isArray(tplRows) && tplRows.length > 0 ? (tplRows as { body_html?: string }[])[0] : null;
    bodyHtml = (tpl?.body_html || '').trim() || '<p>Contrato</p><p>Cliente: {{customer_name}}</p><p>Plano: {{plan_code}} — R$ {{amount}} — Venc. dia {{due_day}}</p><p>{{date}}</p>';
  }
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const replacements: Record<string, string> = {
    '{{contract_id}}': String(body.contract_id ?? '—'),
    '{{customer_name}}': String(body.customer_name ?? ''),
    '{{customer_whatsapp}}': String(body.customer_whatsapp ?? ''),
    '{{customer_document}}': String(body.customer_document ?? ''),
    '{{customer_address}}': String(body.customer_address ?? ''),
    '{{plan_code}}': String(body.plan_code ?? ''),
    '{{amount}}': (Number(body.amount) || 0).toFixed(2).replace('.', ','),
    '{{due_day}}': String(body.due_day ?? ''),
    '{{starts_at}}': String(body.starts_at ?? today),
    '{{date}}': today,
    '{{comodato_items}}': String(body.comodato_items ?? 'Nenhum equipamento em comodato.'),
    '{{observations}}': String(body.observations ?? ''),
  };
  const html = mergeContractTemplate(bodyHtml, replacements);
  const fullPage =
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pré-visualização do contrato</title>' +
    '<style>body{font-family:Georgia,serif;max-width:700px;margin:24px auto;padding:20px;font-size:12pt;line-height:1.5;color:#222;} ' +
    'h1{font-size:1.25rem;border-bottom:1px solid #ccc;padding-bottom:8px;} p{margin:0.6em 0;} ' +
    '@media print{body{margin:0;padding:16px;}}</style></head><body>' + html + '</body></html>';
  res.type('html').send(fullPage);
  return res as Response;
}));

// ---- Contract documents (documentos anexados ao contrato) ----
/** POST /contracts/:id/documents — Gera e salva documento do contrato (HTML a partir do modelo) */
portalDataRouter.post('/contracts/:id/documents', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const contractId = Number(req.params.id);
  const tid = tenantId(req);
  const body = req.body || {};
  const templateId = body.template_id != null ? Number(body.template_id) : null;
  if (!contractId) return res.status(400).json({ message: 'ID do contrato inválido' });

  const pool = getPool();
  const [contractRows] = await pool.query(
    `SELECT ct.id, ct.customer_id, ct.plan_code, ct.amount, ct.due_day, ct.starts_at,
             c.name AS customer_name, c.whatsapp AS customer_whatsapp
             FROM contracts ct
             LEFT JOIN customers c ON c.id = ct.customer_id AND c.tenant_id = :tid
             WHERE ct.id = :contractId AND ct.tenant_id = :tid`,
    { contractId, tid }
  );
  const contract = Array.isArray(contractRows) && contractRows.length > 0 ? (contractRows as Record<string, unknown>[])[0] : null;
  if (!contract) return res.status(404).json({ message: 'Contrato não encontrado' });

  let bodyHtml: string;
  let finalTemplateId: number | null = templateId;
  if (templateId) {
    const [tplRows] = await pool.query(
      'SELECT body_html FROM contract_templates WHERE id = :id AND tenant_id = :tid',
      { id: templateId, tid }
    );
    const tpl = Array.isArray(tplRows) && tplRows.length > 0 ? (tplRows as { body_html?: string }[])[0] : null;
    if (!tpl) return res.status(400).json({ message: 'Modelo de contrato não encontrado' });
    bodyHtml = (tpl.body_html || '').trim();
  } else {
    const [tplRows] = await pool.query(
      `SELECT id, body_html FROM contract_templates WHERE tenant_id = :tid AND is_active IS NOT FALSE ORDER BY is_default DESC, id ASC LIMIT 1`,
      { tid }
    );
    const tpl = Array.isArray(tplRows) && tplRows.length > 0 ? (tplRows as { id?: number; body_html?: string }[])[0] : null;
    finalTemplateId = tpl?.id ?? null;
    bodyHtml = (tpl?.body_html || '').trim() || '<p>Contrato #{{contract_id}}</p><p>Cliente: {{customer_name}}</p><p>Plano: {{plan_code}} — R$ {{amount}} — Venc. dia {{due_day}}</p><p>{{date}}</p>';
  }

  let comodatoText = 'Nenhum equipamento em comodato vinculado a este contrato.';
  try {
    const [comodatoRows] = await pool.query(
      `SELECT notes, items_json FROM customer_comodato
       WHERE tenant_id = :tid AND customer_id = :customerId AND movement_type = 'COMODATO' AND status = 'OPEN'
         AND (contract_id IS NULL OR contract_id = :contractId) ORDER BY id ASC`,
      { tid, customerId: contract.customer_id, contractId }
    );
    const list = Array.isArray(comodatoRows) ? (comodatoRows as Record<string, unknown>[]) : [];
    if (list.length > 0) {
      comodatoText = list.map((row: Record<string, unknown>) => String(row.notes || row.items_json || '')).filter(Boolean).join(' — ') || comodatoText;
    }
  } catch {
    /* ignore */
  }

  const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const startsAt = contract.starts_at ? String(contract.starts_at).slice(0, 10) : dateStr;
  const replacements: Record<string, string> = {
    '{{contract_id}}': String(contract.id),
    '{{customer_name}}': String(contract.customer_name || ''),
    '{{customer_whatsapp}}': String(contract.customer_whatsapp || ''),
    '{{plan_code}}': String(contract.plan_code || ''),
    '{{amount}}': (Number(contract.amount) || 0).toFixed(2).replace('.', ','),
    '{{due_day}}': String(contract.due_day ?? ''),
    '{{starts_at}}': startsAt,
    '{{date}}': dateStr,
    '{{comodato_items}}': comodatoText,
  };
  const contentHtml = mergeContractTemplate(bodyHtml, replacements);
  const fullPage =
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Contrato #' + contractId + '</title>' +
    '<style>body{font-family:Georgia,serif;max-width:700px;margin:24px auto;padding:20px;font-size:12pt;line-height:1.5;color:#222;} ' +
    'h1{font-size:1.25rem;border-bottom:1px solid #ccc;} p{margin:0.6em 0;} @media print{body{margin:0;padding:16px;}}</style></head><body>' +
    contentHtml + '</body></html>';

  try {
    const [ins] = await pool.query(
      `INSERT INTO contract_documents (tenant_id, contract_id, template_id, status, content_html)
       VALUES (:tid, :contractId, :templateId, 'GERADO', :contentHtml) RETURNING id`,
      { tid, contractId, templateId: finalTemplateId, contentHtml: fullPage }
    );
    const docId = (ins as { insertId?: number })?.insertId ?? (Array.isArray(ins) && ins.length > 0 ? (ins as { id: number }[])[0]?.id : null);
    return res.status(201).json({ ok: true, id: docId, status: 'GERADO' });
  } catch (e) {
    if (isTableNotFoundError(e)) {
      return res.status(201).json({
        ok: true,
        id: null,
        status: 'GERADO',
        saved: false,
        warning: 'Documento gerado, mas não foi salvo porque a tabela contract_documents não existe.',
      });
    }
    throw e;
  }
}));

/** GET /contracts/:contractId/documents/:docId — Retorna HTML do documento (visualizar/imprimir) — rota mais específica primeiro */
portalDataRouter.get('/contracts/:contractId/documents/:docId', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const contractId = Number(req.params.contractId);
  const docId = Number(req.params.docId);
  const tid = tenantId(req);
  if (!contractId || !docId) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT content_html FROM contract_documents WHERE id = :docId AND contract_id = :contractId AND tenant_id = :tid',
    { docId, contractId, tid }
  );
  const row = Array.isArray(rows) && rows.length > 0 ? (rows as { content_html?: string }[])[0] : null;
  if (!row || !row.content_html) return res.status(404).json({ message: 'Documento não encontrado' });
  res.type('html').send(row.content_html);
  return res as Response;
}));

/** GET /contracts/:id/documents — Lista documentos anexados ao contrato */
portalDataRouter.get('/contracts/:id/documents', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const contractId = Number(req.params.id);
  const tid = tenantId(req);
  if (!contractId) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      `SELECT id, contract_id, template_id, status, signed_at, created_at
       FROM contract_documents WHERE contract_id = :contractId AND tenant_id = :tid ORDER BY created_at DESC`,
      { contractId, tid }
    );
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
}));

// ---- Contract templates (modelos de contrato) ----
portalDataRouter.get('/contract-templates', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  let sql = `SELECT id, name, description, body_html, is_default, is_active, created_at, updated_at
             FROM contract_templates WHERE tenant_id = :tid`;
  const params: Record<string, number> = { tid };
  const onlyActive = req.query.active === 'true' || req.query.active === '1';
  if (onlyActive) { sql += ' AND is_active = TRUE'; }
  sql += ' ORDER BY is_default DESC, name ASC';
  try {
    const [rows] = await pool.query(sql, params);
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
}));

portalDataRouter.post('/contract-templates', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const name = String(body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Nome do modelo é obrigatório' });
  const description = body.description != null ? String(body.description).trim() || null : null;
  const bodyHtml = body.body_html != null ? String(body.body_html) : null;
  const isDefault = body.is_default === true || body.is_default === 'true' || body.is_default === 1;
  const pool = getPool();
  if (isDefault) {
    await pool.query(
      'UPDATE contract_templates SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = :tid',
      { tid }
    );
  }
  const [r] = await pool.query(
    `INSERT INTO contract_templates (tenant_id, name, description, body_html, is_default, is_active)
     VALUES (:tid, :name, :description, :bodyHtml, :isDefault, TRUE) RETURNING id`,
    { tid, name, description, bodyHtml: bodyHtml || null, isDefault }
  );
  const insertId = (r as { insertId?: number })?.insertId;
  return res.status(201).json({ ok: true, id: insertId });
}));

portalDataRouter.put('/contract-templates/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const body = req.body || {};
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const params: Record<string, string | number | boolean | null> = { id, tid };
  if (body.name !== undefined) { updates.push('name = :name'); params.name = String(body.name).trim(); }
  if (body.description !== undefined) { updates.push('description = :description'); params.description = body.description ? String(body.description).trim() : null; }
  if (body.body_html !== undefined) { updates.push('body_html = :body_html'); params.body_html = body.body_html ? String(body.body_html) : null; }
  if (body.is_active !== undefined) { updates.push('is_active = :is_active'); params.is_active = body.is_active === true || body.is_active === 'true' || body.is_active === 1; }
  if (body.is_default !== undefined) {
    const isDefault = body.is_default === true || body.is_default === 'true' || body.is_default === 1;
    updates.push('is_default = :is_default');
    params.is_default = isDefault;
    if (isDefault) {
      await pool.query(
        'UPDATE contract_templates SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = :tid AND id <> :id',
        { tid, id }
      );
    }
  }
  if (updates.length <= 1) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
  const [result] = await pool.query(
    `UPDATE contract_templates SET ${updates.join(', ')} WHERE id = :id AND tenant_id = :tid`,
    params
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0) return res.status(404).json({ message: 'Modelo não encontrado' });
  return res.json({ ok: true });
}));

portalDataRouter.delete('/contract-templates/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const pool = getPool();
  const [result] = await pool.query(
    'UPDATE contract_templates SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid',
    { id, tid }
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0) return res.status(404).json({ message: 'Modelo não encontrado' });
  return res.json({ ok: true });
}));

// ---- Customer history ----
portalDataRouter.get('/customers/:id/history', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const customerId = Number(req.params.id);
  const tid = tenantId(req);
  if (!customerId) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT h.id, h.type, h.subject, h.content, h.created_at
     FROM customer_history h
     WHERE h.customer_id = :cid AND h.tenant_id = :tid
     ORDER BY h.created_at DESC LIMIT 100`,
    { cid: customerId, tid }
  );
  return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
}));

portalDataRouter.post('/customers/:id/history', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const customerId = Number(req.params.id);
  const tid = tenantId(req);
  const body = req.body || {};
  const type = ['NOTE', 'CONTACT', 'CONTRACT', 'INSTALLATION', 'PAYMENT', 'TICKET', 'OS', 'OTHER'].includes(String(body.type || '').toUpperCase())
    ? String(body.type).toUpperCase() : 'NOTE';
  const subject = body.subject ? String(body.subject).trim() : null;
  const content = body.content ? String(body.content).trim() : null;
  if (!customerId) return res.status(400).json({ message: 'ID inválido' });

  const pool = getPool();
  const [r] = await pool.query(
    `INSERT INTO customer_history (tenant_id, customer_id, type, subject, content)
     VALUES (:tid, :cid, :type, :subject, :content) RETURNING id`,
    { tid, cid: customerId, type, subject, content }
  );
  const insertId = (r as { insertId?: number })?.insertId;
  return res.status(201).json({ ok: true, id: insertId });
}));

/** GET /api/portal/customers/:id/radius-sessions — Extrato de acesso (sessões RADIUS) do cliente */
portalDataRouter.get('/customers/:id/radius-sessions', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const customerId = Number(req.params.id);
  const tid = tenantId(req);
  const from = (req.query.from as string) || '';
  const to = (req.query.to as string) || '';
  if (!customerId) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const [instRows] = await pool.query(
    `SELECT inst.pppoe_user FROM installations inst
     JOIN customers c ON c.id = inst.customer_id AND (c.tenant_id = :tid OR c.tenant_id IS NULL)
     WHERE inst.customer_id = :cid LIMIT 1`,
    { cid: customerId, tid }
  );
  const inst = Array.isArray(instRows) && instRows.length ? (instRows[0] as { pppoe_user: string | null }) : null;
  const username = inst?.pppoe_user ? String(inst.pppoe_user).trim() : null;
  if (!username) return res.json({ ok: true, rows: [], username: null });

  let sql = `SELECT radacctid, acctsessionid, acctuniqueid, username, groupname, nasipaddress, nasportid,
       acctstarttime, acctstoptime, acctsessiontime, acctinputoctets, acctoutputoctets,
       acctterminatecause, framedipaddress
       FROM radacct WHERE username = :username`;
  const params: Record<string, string | number> = { username };
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    sql += ' AND acctstarttime >= :from::timestamp';
    params.from = from;
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    sql += ' AND acctstarttime < (:to::date + interval \'1 day\')';
    params.to = to;
  }
  sql += ' ORDER BY acctstarttime DESC LIMIT 500';
  let rows: unknown[] = [];
  const summary: { totalSessions: number; totalDownload: number; totalUpload: number } = {
    totalSessions: 0,
    totalDownload: 0,
    totalUpload: 0,
  };
  try {
    const [r] = await pool.query(sql, params);
    rows = Array.isArray(r) ? r : [];

    let summarySql = `SELECT COUNT(*)::int AS total_sessions,
       COALESCE(SUM(acctinputoctets), 0)::bigint AS total_download,
       COALESCE(SUM(acctoutputoctets), 0)::bigint AS total_upload
       FROM radacct WHERE username = :username`;
    const summaryParams: Record<string, string | number> = { username };
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      summarySql += ' AND acctstarttime >= :from::timestamp';
      summaryParams.from = from;
    }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      summarySql += ' AND acctstarttime < (:to::date + interval \'1 day\')';
      summaryParams.to = to;
    }
    const [sumRows] = await pool.query(summarySql, summaryParams);
    const sumRow = Array.isArray(sumRows) && sumRows[0] ? (sumRows[0] as { total_sessions: number; total_download: string; total_upload: string }) : null;
    if (sumRow) {
      summary.totalSessions = sumRow.total_sessions ?? 0;
      summary.totalDownload = Number(sumRow.total_download) || 0;
      summary.totalUpload = Number(sumRow.total_upload) || 0;
    }
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [], username, summary });
    throw e;
  }
  return res.json({ ok: true, rows, username, summary });
}));

// ---- Customers ----
portalDataRouter.get('/customers', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const [installedLeads] = await pool.query(
    'SELECT id, customer_name, whatsapp, email, plan_code, vencimento, address_json, tenant_id FROM subscription_requests WHERE status = :status AND tenant_id = :tid',
    { status: 'INSTALLED', tid }
  );
  const toSync = Array.isArray(installedLeads) ? installedLeads : [];
  for (const lead of toSync) {
    try {
      const l = lead as { id: number; customer_name: string; whatsapp: string; email: string | null; plan_code: string; vencimento: number; address_json: string | object; tenant_id?: number };
      const leadTid = (l as { tenant_id?: number }).tenant_id ?? tid;
      const customerId = await syncInstalledLeadToCustomer(pool, l, leadTid);
      await syncInstalledLeadToInstallation(pool, { ...l, customer_id: customerId });
    } catch (e) {
      console.error('[Portal] sync lead to customer:', e);
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
       WHERE c.tenant_id = :tid
       ORDER BY c.created_at DESC
       LIMIT 500`,
      { tid }
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
         WHERE c.tenant_id = :tid
         ORDER BY c.created_at DESC
         LIMIT 500`,
        { tid }
      );
    } catch {
      [rows] = await pool.query(
        `SELECT c.id, c.name, c.whatsapp, c.email, c.created_at,
                1 AS active,
                COALESCE(la.points_balance, 0) AS points_balance, COALESCE(la.tier, 'BRONZE') AS tier
         FROM customers c
         LEFT JOIN loyalty_accounts la ON la.customer_id = c.id
         WHERE c.tenant_id = :tid
         ORDER BY c.created_at DESC
         LIMIT 500`,
        { tid }
      );
    }
  }
  const customerList = Array.isArray(rows) ? rows : [];
  const [subs] = await pool.query(
    `SELECT whatsapp, plan_code, cpf_cnpj FROM subscription_requests WHERE status = 'INSTALLED' AND tenant_id = :tid ORDER BY id DESC`,
    { tid }
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

/** Create new customer (and optionally installation). Body: name, whatsapp, email?, cpf_cnpj?, active?, installation? */
portalDataRouter.post('/customers', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const name = String(body.name || '').trim() || null;
  const whatsappRaw = body.whatsapp != null ? String(body.whatsapp).trim() : '';
  const whatsapp = normalizeWhatsapp(whatsappRaw);
  if (!name) return res.status(400).json({ message: 'Nome é obrigatório' });
  if (!whatsapp || whatsapp.length < 10) return res.status(400).json({ message: 'WhatsApp é obrigatório e deve ter pelo menos 10 dígitos' });
  const email = body.email != null ? (body.email ? String(body.email).trim() : null) : null;
  const cpfCnpj = body.cpf_cnpj != null ? (body.cpf_cnpj ? String(body.cpf_cnpj).trim().replace(/\D/g, '') : null) : null;
  const active = body.active === false || body.active === 0 || body.active === '0' ? 0 : 1;
  const addressJson = body.address_json != null
    ? (typeof body.address_json === 'string' ? body.address_json : JSON.stringify(body.address_json))
    : null;
  const pool = getPool();

  const [existing] = await pool.query(
    'SELECT id FROM customers WHERE whatsapp = :w AND tenant_id = :tid LIMIT 1',
    { w: whatsapp, tid }
  );
  if (Array.isArray(existing) && existing.length) {
    return res.status(409).json({ message: 'Já existe um cliente com este WhatsApp' });
  }

  const insertCols = ['name', 'whatsapp', 'email', 'tenant_id', 'active'];
  const insertVals = [':name', ':w', ':email', ':tid', ':active'];
  const insertParams: Record<string, string | number | null | boolean> = { name: name || 'Cliente', w: whatsapp, email, tid, active };
  if (cpfCnpj !== undefined && cpfCnpj !== null) {
    insertCols.push('cpf_cnpj');
    insertVals.push(':cpf_cnpj');
    insertParams.cpf_cnpj = cpfCnpj;
  }
  if (addressJson !== undefined && addressJson !== null) {
    insertCols.push('address_json');
    insertVals.push('CAST(:address_json AS jsonb)');
    insertParams.address_json = addressJson;
  }
  const insertSql = `INSERT INTO customers (${insertCols.join(', ')}) VALUES (${insertVals.join(', ')}) RETURNING id`;

  let customerId: number;
  const [ins] = await pool.query(insertSql, insertParams);
  customerId = (ins as { insertId: number }).insertId;

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

  const installation = body.installation && typeof body.installation === 'object' ? body.installation as Record<string, unknown> : null;
  if (installation) {
    const planCode = String(installation.plan_code || '100').trim();
    const dueDay = Math.min(28, Math.max(1, Number(installation.due_day) || 10));
    const addressJson = installation.address_json != null
      ? (typeof installation.address_json === 'string' ? installation.address_json : JSON.stringify(installation.address_json))
      : null;
    const pppoeUser = installation.pppoe_user ? String(installation.pppoe_user).trim() : `multi${customerId}`;
    const pppoePassword = installation.pppoe_password ? String(installation.pppoe_password).trim() : null;
    try {
      let instSql = `INSERT INTO installations (customer_id, plan_code, due_day, address_json, status, installed_at, pppoe_user`;
      const instParams: Record<string, string | number | null> = { cid: customerId, plan: planCode, dueDay, addr: addressJson, pppoe: pppoeUser };
      if (pppoePassword) {
        instSql += ', pppoe_password';
        instParams.pppoe_password = pppoePassword;
      }
      const ont = installation.ont_serial ? String(installation.ont_serial).trim() : null;
      const cto = installation.cto_code ? String(installation.cto_code).trim() : null;
      const notes = installation.notes ? String(installation.notes).trim() : null;
      if (ont) { instSql += ', ont_serial'; instParams.ont_serial = ont; }
      if (cto) { instSql += ', cto_code'; instParams.cto_code = cto; }
      if (notes) { instSql += ', notes'; instParams.notes = notes; }
      instSql += ') VALUES (:cid, :plan, :dueDay, :addr, \'ACTIVE\', CURDATE(), :pppoe';
      if (pppoePassword) instSql += ', :pppoe_password';
      if (ont) instSql += ', :ont_serial';
      if (cto) instSql += ', :cto_code';
      if (notes) instSql += ', :notes';
      instSql += ')';
      await pool.query(instSql, instParams);
      try {
        await syncInstallationToRadius(pool, pppoeUser, pppoePassword, planCode, 'ACTIVE', {});
      } catch (_) { /* tabelas RADIUS podem não existir */ }
    } catch (e) {
      try {
        await pool.query(
          `INSERT INTO installations (customer_id, plan_code, due_day, address_json, status, installed_at)
           VALUES (:cid, :plan, :dueDay, :addr, 'ACTIVE', CURDATE())`,
          { cid: customerId, plan: planCode, dueDay, addr: addressJson }
        );
        try {
          await syncInstallationToRadius(pool, pppoeUser, null, planCode, 'ACTIVE', {});
        } catch (_) { /* tabelas RADIUS podem não existir */ }
      } catch {
        /* installations table may not exist or no pppoe columns */
      }
    }
  }

  return res.status(201).json({ ok: true, id: customerId, message: 'Cliente cadastrado com sucesso' });
}));

portalDataRouter.get('/customers/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  let rows: unknown;
  const tenantCond = '(c.tenant_id = :tid OR c.tenant_id IS NULL)';
  try {
    [rows] = await pool.query(
      `SELECT c.id, c.name, c.whatsapp, c.email, c.cpf_cnpj, c.address_json, c.notes, c.created_at, (COALESCE(c.active, true))::int AS active,
              COALESCE(la.points_balance, 0) AS points_balance, COALESCE(la.tier, 'BRONZE') AS tier
       FROM customers c
       LEFT JOIN loyalty_accounts la ON la.customer_id = c.id
       WHERE c.id = :id AND ${tenantCond} LIMIT 1`,
      { id, tid }
    );
  } catch {
    try {
      [rows] = await pool.query(
        `SELECT c.id, c.name, c.whatsapp, c.email, c.created_at, (COALESCE(c.active, true))::int AS active,
                COALESCE(la.points_balance, 0) AS points_balance, COALESCE(la.tier, 'BRONZE') AS tier
         FROM customers c
         LEFT JOIN loyalty_accounts la ON la.customer_id = c.id
         WHERE c.id = :id AND ${tenantCond} LIMIT 1`,
        { id, tid }
      );
    } catch {
      try {
        [rows] = await pool.query(
          `SELECT c.id, c.name, c.whatsapp, c.email, c.created_at, 1 AS active, 0 AS points_balance, 'BRONZE' AS tier
           FROM customers c
           WHERE c.id = :id AND ${tenantCond} LIMIT 1`,
          { id, tid }
        );
      } catch {
        [rows] = await pool.query(
          `SELECT c.id, c.name, c.whatsapp, c.email, c.created_at, 1 AS active, 0 AS points_balance, 'BRONZE' AS tier
           FROM customers c
           WHERE c.id = :id LIMIT 1`,
          { id }
        );
      }
    }
  }
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return res.status(404).json({ message: 'Cliente não encontrado' });
  const row = list[0] as Record<string, unknown>;
  if (row.tenant_id != null && row.tenant_id !== tid) return res.status(404).json({ message: 'Cliente não encontrado' });
  try {
    const [subs] = await pool.query(
      'SELECT plan_code, cpf_cnpj FROM subscription_requests WHERE status = ? AND whatsapp = ? AND tenant_id = ? ORDER BY id DESC LIMIT 1',
      ['INSTALLED', row.whatsapp, tid]
    );
    const subList = Array.isArray(subs) ? subs : [];
    if (subList.length) {
      const s = subList[0] as { plan_code: string; cpf_cnpj: string };
      if (row.plan_code == null) row.plan_code = s.plan_code;
      if (row.cpf_cnpj == null || row.cpf_cnpj === '') row.cpf_cnpj = s.cpf_cnpj;
    }
  } catch {
    /* subscription_requests pode não existir ou ter schema diferente */
  }
  let installation: Record<string, unknown> | null = null;
  let invoices: unknown[] = [];
  try {
    const [instRows] = await pool.query(
      'SELECT inst.id, inst.plan_code, inst.due_day, inst.address_json, inst.status AS status, inst.installed_at, inst.ont_serial, inst.cto_code, inst.pppoe_user, inst.pppoe_password, inst.notes, inst.mac_authorized FROM installations inst JOIN customers c ON c.id = inst.customer_id AND (c.tenant_id = :tid OR c.tenant_id IS NULL) WHERE inst.customer_id = :cid LIMIT 1',
      { tid, cid: id }
    );
    if (Array.isArray(instRows) && instRows.length) installation = instRows[0] as Record<string, unknown>;
  } catch {
    try {
      const [instRows] = await pool.query(
        'SELECT inst.id, inst.plan_code, inst.due_day, inst.address_json, inst.status, inst.installed_at, inst.ont_serial, inst.cto_code, inst.pppoe_user, inst.notes FROM installations inst JOIN customers c ON c.id = inst.customer_id AND (c.tenant_id = :tid OR c.tenant_id IS NULL) WHERE inst.customer_id = :cid LIMIT 1',
        { tid, cid: id }
      );
      if (Array.isArray(instRows) && instRows.length) installation = instRows[0] as Record<string, unknown>;
    } catch {
      try {
        const [instRows] = await pool.query(
          'SELECT id, plan_code, due_day, address_json, status, installed_at, ont_serial, cto_code, pppoe_user, notes FROM installations WHERE customer_id = :cid LIMIT 1',
          { cid: id }
        );
        if (Array.isArray(instRows) && instRows.length) installation = instRows[0] as Record<string, unknown>;
      } catch {
        try {
          const [instRows] = await pool.query(
            'SELECT inst.id, inst.plan_code, inst.due_day, inst.address_json, inst.status, inst.installed_at, inst.ont_serial, inst.cto_code, inst.notes FROM installations inst JOIN customers c ON c.id = inst.customer_id AND (c.tenant_id = :tid OR c.tenant_id IS NULL) WHERE inst.customer_id = :cid LIMIT 1',
            { tid, cid: id }
          );
          if (Array.isArray(instRows) && instRows.length) installation = instRows[0] as Record<string, unknown>;
        } catch {
          /* installations pode não existir ou ter schema diferente */
        }
      }
    }
  }
  try {
    const [invRows] = await pool.query(
      'SELECT id, ref_month, due_date, amount, plan_code, status, paid_at, created_at FROM invoices i JOIN customers c ON c.id = i.customer_id AND (c.tenant_id = :tid OR c.tenant_id IS NULL) WHERE i.customer_id = :cid ORDER BY ref_month DESC LIMIT 24',
      { tid, cid: id }
    );
    invoices = Array.isArray(invRows) ? invRows : [];
    const today = new Date().toISOString().slice(0, 10);
    for (const r of invoices) {
      const inv = r as { status: string; due_date: string };
      if (inv.status === 'PENDING' && inv.due_date < today) inv.status = 'OVERDUE';
    }
  } catch {
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
      /* invoices pode não existir */
    }
  }
  return res.json({ ok: true, customer: row, installation, invoices });
}));

portalDataRouter.put('/customers/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const body = req.body || {};
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const name = body.name !== undefined ? String(body.name).trim() : undefined;
  const email = body.email !== undefined ? (body.email ? String(body.email).trim() : null) : undefined;
  const cpfCnpj = body.cpf_cnpj !== undefined ? (body.cpf_cnpj ? String(body.cpf_cnpj).trim().replace(/\D/g, '') : null) : undefined;
  const addressJson = body.address_json !== undefined ? (body.address_json ? (typeof body.address_json === 'string' ? body.address_json : JSON.stringify(body.address_json)) : null) : undefined;
  const notes = body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : undefined;
  const active = body.active;
  const pool = getPool();
  const updates: string[] = [];
  const params: Record<string, string | number | null> = { id, tid };
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
  if (addressJson !== undefined) {
    updates.push('address_json = CAST(:address_json AS jsonb)');
    params.address_json = addressJson;
  }
  if (notes !== undefined) {
    updates.push('notes = :notes');
    params.notes = notes;
  }
  if (active !== undefined) {
    const val = active === true || active === 1 || active === '1' ? 1 : 0;
    updates.push('active = :active');
    params.active = val;
  }
  if (updates.length === 0) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
  const whereWithTenant = 'id = :id AND (tenant_id = :tid OR tenant_id IS NULL)';
  try {
    const [result] = await pool.query(`UPDATE customers SET ${updates.join(', ')} WHERE ${whereWithTenant}`, params);
    const affected = (result as { affectedRows?: number })?.affectedRows ?? 0;
    if (affected === 0) return res.status(404).json({ message: 'Cliente não encontrado' });
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : '';
    if (msg.includes('tenant_id') || msg.includes('column')) {
      const [result] = await pool.query(`UPDATE customers SET ${updates.join(', ')} WHERE id = :id`, { ...params } as Record<string, string | number | null>);
      const affected = (result as { affectedRows?: number })?.affectedRows ?? 0;
      if (affected === 0) return res.status(404).json({ message: 'Cliente não encontrado' });
    } else if (msg.includes('cpf_cnpj')) {
      const withoutCpf = updates.filter((u) => !u.includes('cpf_cnpj'));
      const withoutCpfParams = { ...params };
      delete withoutCpfParams.cpf_cnpj;
      if (withoutCpf.length) await pool.query(`UPDATE customers SET ${withoutCpf.join(', ')} WHERE ${whereWithTenant}`, withoutCpfParams);
    } else throw e;
  }
  return res.json({ ok: true });
}));

portalDataRouter.patch('/customers/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const active = req.body?.active;
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const val = active === true || active === 1 || active === '1' ? 1 : 0;
  const pool = getPool();
  try {
    const [r] = await pool.query('UPDATE customers SET active = :active WHERE id = :id AND (tenant_id = :tid OR tenant_id IS NULL)', { active: val, id, tid });
    const affected = (r as { rowCount?: number })?.rowCount ?? (r as { affectedRows?: number })?.affectedRows ?? 0;
    if (affected === 0) return res.status(404).json({ message: 'Cliente não encontrado' });
  } catch {
    const [r] = await pool.query('UPDATE customers SET active = :active WHERE id = :id', { active: val, id });
    const affected = (r as { rowCount?: number })?.rowCount ?? (r as { affectedRows?: number })?.affectedRows ?? 0;
    if (affected === 0) return res.status(404).json({ message: 'Cliente não encontrado' });
  }
  return res.json({ ok: true });
}));

// ---- Installations ----
portalDataRouter.post('/installations', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const customerId = body.customer_id != null ? Number(body.customer_id) : null;
  const planCode = String(body.plan_code || '').trim();
  const dueDay = Math.min(28, Math.max(1, Number(body.due_day) || 10));
  if (!customerId) return res.status(400).json({ message: 'Cliente é obrigatório' });
  if (!planCode) return res.status(400).json({ message: 'Plano é obrigatório' });
  const pool = getPool();
  const today = new Date().toISOString().slice(0, 10);
  const addressJson = body.address_json != null
    ? (typeof body.address_json === 'string' ? body.address_json : JSON.stringify(body.address_json))
    : null;
  const pppoeUser = body.pppoe_user ? String(body.pppoe_user).trim() : null;
  const pppoePassword = body.pppoe_password ? String(body.pppoe_password) : null;
  const ctoCode = body.cto_code ? String(body.cto_code).trim() : null;
  const notes = body.notes ? String(body.notes).trim() : null;
  try {
    const [custRows] = await pool.query('SELECT 1 FROM customers WHERE id = :customerId AND tenant_id = :tid LIMIT 1', { customerId, tid });
    if (!Array.isArray(custRows) || custRows.length === 0) return res.status(400).json({ message: 'Cliente não encontrado' });
    const [instRows] = await pool.query('SELECT id FROM installations WHERE customer_id = :customerId LIMIT 1', { customerId });
    if (Array.isArray(instRows) && instRows.length > 0) return res.status(400).json({ message: 'Cliente já possui instalação. Use editar para alterar.' });

    const macAuthorizedParam = body.mac_authorized != null ? String(body.mac_authorized).trim() || null : null;
    let r: unknown;
    try {
      [r] = await pool.query(
        `INSERT INTO installations (customer_id, plan_code, due_day, address_json, status, installed_at, pppoe_user, pppoe_password, cto_code, notes, mac_authorized)
         VALUES (:customerId, :planCode, :dueDay, :addressJson, 'ACTIVE', CAST(:today AS DATE), :pppoeUser, :pppoePassword, :ctoCode, :notes, :mac_authorized) RETURNING id`,
        { customerId, planCode, dueDay, addressJson, today, pppoeUser: pppoeUser || null, pppoePassword: pppoePassword || null, ctoCode: ctoCode || null, notes: notes || null, mac_authorized: macAuthorizedParam }
      );
    } catch (insErr) {
      if (isColumnNotFoundError(insErr)) {
        try {
          [r] = await pool.query(
            `INSERT INTO installations (customer_id, plan_code, due_day, address_json, status, installed_at, pppoe_user, pppoe_password, cto_code, notes)
             VALUES (:customerId, :planCode, :dueDay, :addressJson, 'ACTIVE', CAST(:today AS DATE), :pppoeUser, :pppoePassword, :ctoCode, :notes) RETURNING id`,
            { customerId, planCode, dueDay, addressJson, today, pppoeUser: pppoeUser || null, pppoePassword: pppoePassword || null, ctoCode: ctoCode || null, notes: notes || null }
          );
        } catch (insErr2) {
          if (isColumnNotFoundError(insErr2)) {
            [r] = await pool.query(
              `INSERT INTO installations (customer_id, plan_code, due_day, address_json, status, installed_at, pppoe_user, cto_code, notes)
               VALUES (:customerId, :planCode, :dueDay, :addressJson, 'ACTIVE', CAST(:today AS DATE), :pppoeUser, :ctoCode, :notes) RETURNING id`,
              { customerId, planCode, dueDay, addressJson, today, pppoeUser: pppoeUser || null, ctoCode: ctoCode || null, notes: notes || null }
            );
          } else {
            throw insErr2;
          }
        }
      } else {
        throw insErr;
      }
    }
    const rows = Array.isArray(r) ? r : [];
    const insertId = rows.length ? (rows[0] as { id?: number })?.id : (r as { insertId?: number })?.insertId;
    try {
      await syncInstallationToRadius(pool, pppoeUser, pppoePassword, planCode, 'ACTIVE', { macAuthorized: macAuthorizedParam });
    } catch (_) { /* tabelas RADIUS podem não existir */ }
    return res.status(201).json({ ok: true, id: insertId });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Tabela installations não disponível' });
    throw e;
  }
}));

portalDataRouter.get('/installations', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const status = req.query.status as string | undefined;
  const pool = getPool();
  let sql = `SELECT inst.id, inst.customer_id, inst.plan_code, inst.due_day, inst.address_json, inst.status AS installation_status,
             inst.installed_at, inst.ont_serial, inst.cto_code, inst.pppoe_user, inst.created_at,
             c.name AS customer_name, c.whatsapp
             FROM installations inst
             JOIN customers c ON c.id = inst.customer_id AND c.tenant_id = :tid
             WHERE 1=1`;
  const params: Record<string, string | number> = { tid };
  if (status) { sql += ' AND inst.status = :status'; params.status = status; }
  sql += ' ORDER BY inst.id DESC LIMIT 500';
  const [rows] = await pool.query(sql, params);
  return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
}));

portalDataRouter.patch('/installations/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const status = String(req.body?.status ?? '').trim().toUpperCase();
  const valid = ['ACTIVE', 'SUSPENDED', 'CANCELLED'];
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  if (!valid.includes(status)) return res.status(400).json({ message: 'Status inválido (ACTIVE, SUSPENDED, CANCELLED)' });
  const pool = getPool();
  const [affected] = await pool.query(
    'UPDATE installations inst SET status = :status, updated_at = NOW() FROM customers c WHERE c.id = inst.customer_id AND c.tenant_id = :tid AND inst.id = :id',
    { tid, status, id }
  );
  const affectedRows = (affected as { affectedRows?: number })?.affectedRows ?? 0;
  if (affectedRows === 0) return res.status(404).json({ message: 'Instalação não encontrada' });
  if (status === 'SUSPENDED') {
    await pool.query(
      'UPDATE customers c SET active = false FROM installations i WHERE i.customer_id = c.id AND i.id = :id AND c.tenant_id = :tid',
      { id, tid }
    );
  } else if (status === 'ACTIVE') {
    await pool.query(
      'UPDATE customers c SET active = true FROM installations i WHERE i.customer_id = c.id AND i.id = :id AND c.tenant_id = :tid',
      { id, tid }
    );
  }
  try {
    let instRows: unknown;
    try {
      [instRows] = await pool.query(
        'SELECT inst.pppoe_user, inst.pppoe_password, inst.plan_code, inst.status, inst.mac_authorized FROM installations inst JOIN customers c ON c.id = inst.customer_id AND c.tenant_id = :tid WHERE inst.id = :id LIMIT 1',
        { id, tid }
      );
    } catch {
      [instRows] = await pool.query(
        'SELECT inst.pppoe_user, inst.pppoe_password, inst.plan_code, inst.status FROM installations inst JOIN customers c ON c.id = inst.customer_id AND c.tenant_id = :tid WHERE inst.id = :id LIMIT 1',
        { id, tid }
      );
    }
    const inst = Array.isArray(instRows) && (instRows as unknown[]).length ? ((instRows as unknown[])[0] as { pppoe_user: string | null; pppoe_password: string | null; plan_code: string | null; status: string; mac_authorized?: string | null }) : null;
    if (inst) {
      if (status === 'CANCELLED') {
        await removeUserFromRadius(pool, inst.pppoe_user);
      } else {
        await syncInstallationToRadius(pool, inst.pppoe_user, inst.pppoe_password, inst.plan_code, inst.status, { macAuthorized: inst.mac_authorized ?? null });
      }
    }
  } catch (_) { /* tabelas RADIUS podem não existir */ }
  return res.json({ ok: true });
}));

portalDataRouter.put('/installations/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const body = req.body || {};
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const updates: string[] = [];
  const params: Record<string, string | number | null> = { id, tid };
  if (body.plan_code !== undefined) { updates.push('inst.plan_code = :plan_code'); params.plan_code = String(body.plan_code).trim(); }
  if (body.due_day !== undefined) { updates.push('inst.due_day = :due_day'); params.due_day = Math.min(28, Math.max(1, Number(body.due_day) || 10)); }
  if (body.address_json !== undefined) { updates.push('inst.address_json = :address_json'); params.address_json = typeof body.address_json === 'string' ? body.address_json : JSON.stringify(body.address_json || {}); }
  if (body.ont_serial !== undefined) { updates.push('inst.ont_serial = :ont_serial'); params.ont_serial = body.ont_serial ? String(body.ont_serial).trim() : null; }
  if (body.cto_code !== undefined) { updates.push('inst.cto_code = :cto_code'); params.cto_code = body.cto_code ? String(body.cto_code).trim() : null; }
  if (body.notes !== undefined) { updates.push('inst.notes = :notes'); params.notes = body.notes ? String(body.notes).trim() : null; }
  if (body.pppoe_user !== undefined) { updates.push('inst.pppoe_user = :pppoe_user'); params.pppoe_user = body.pppoe_user ? String(body.pppoe_user).trim() : null; }
  if (body.pppoe_password !== undefined) { updates.push('inst.pppoe_password = :pppoe_password'); params.pppoe_password = body.pppoe_password ? String(body.pppoe_password) : null; }
  if (body.mac_authorized !== undefined) { updates.push('inst.mac_authorized = :mac_authorized'); params.mac_authorized = body.mac_authorized != null ? String(body.mac_authorized).trim() || null : null; }
  if (updates.length === 0) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
  const setClause = updates.map((u) => u.replace(/^inst\./, '')).join(', ');
  try {
    const [affected] = await pool.query(
      `UPDATE installations inst SET ${setClause}, updated_at = NOW() FROM customers c WHERE c.id = inst.customer_id AND c.tenant_id = :tid AND inst.id = :id`,
      params
    );
    const affectedRows = (affected as { affectedRows?: number; rowCount?: number })?.affectedRows ?? (affected as { rowCount?: number })?.rowCount ?? 0;
    if (affectedRows === 0) return res.status(404).json({ message: 'Instalação não encontrada' });
    try {
      let ir: unknown;
      try {
        [ir] = await pool.query(
          'SELECT inst.pppoe_user, inst.pppoe_password, inst.plan_code, inst.status, inst.mac_authorized FROM installations inst JOIN customers c ON c.id = inst.customer_id AND c.tenant_id = :tid WHERE inst.id = :id LIMIT 1',
          { id, tid }
        );
      } catch {
        [ir] = await pool.query(
          'SELECT inst.pppoe_user, inst.pppoe_password, inst.plan_code, inst.status FROM installations inst JOIN customers c ON c.id = inst.customer_id AND c.tenant_id = :tid WHERE inst.id = :id LIMIT 1',
          { id, tid }
        );
      }
      const inst = Array.isArray(ir) && (ir as unknown[]).length ? ((ir as unknown[])[0] as { pppoe_user: string | null; pppoe_password: string | null; plan_code: string | null; status: string; mac_authorized?: string | null }) : null;
      if (inst) await syncInstallationToRadius(pool, inst.pppoe_user, inst.pppoe_password, inst.plan_code, inst.status, { macAuthorized: inst.mac_authorized ?? null });
    } catch (_) { /* tabelas RADIUS podem não existir */ }
    return res.json({ ok: true });
  } catch (e) {
    if (isColumnNotFoundError(e) && body.pppoe_password !== undefined) {
      const updatesWithoutPwd = updates.filter((u) => !u.includes('pppoe_password'));
      if (updatesWithoutPwd.length === 0) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
      const { pppoe_password: _rem, ...paramsWithoutPwd } = params;
      const [affected] = await pool.query(
        `UPDATE installations inst SET ${updatesWithoutPwd.map((u) => u.replace(/^inst\./, '')).join(', ')}, updated_at = NOW() FROM customers c WHERE c.id = inst.customer_id AND c.tenant_id = :tid AND inst.id = :id`,
        paramsWithoutPwd
      );
      const affectedRows = (affected as { affectedRows?: number; rowCount?: number })?.affectedRows ?? (affected as { rowCount?: number })?.rowCount ?? 0;
      if (affectedRows === 0) return res.status(404).json({ message: 'Instalação não encontrada' });
      try {
        let ir2: unknown;
        try {
          [ir2] = await pool.query(
            'SELECT inst.pppoe_user, inst.pppoe_password, inst.plan_code, inst.status, inst.mac_authorized FROM installations inst JOIN customers c ON c.id = inst.customer_id AND c.tenant_id = :tid WHERE inst.id = :id LIMIT 1',
            { id, tid }
          );
        } catch {
          [ir2] = await pool.query(
            'SELECT inst.pppoe_user, inst.pppoe_password, inst.plan_code, inst.status FROM installations inst JOIN customers c ON c.id = inst.customer_id AND c.tenant_id = :tid WHERE inst.id = :id LIMIT 1',
            { id, tid }
          );
        }
        const inst = Array.isArray(ir2) && (ir2 as unknown[]).length ? ((ir2 as unknown[])[0] as { pppoe_user: string | null; pppoe_password: string | null; plan_code: string | null; status: string; mac_authorized?: string | null }) : null;
        if (inst) await syncInstallationToRadius(pool, inst.pppoe_user, inst.pppoe_password, inst.plan_code, inst.status, { macAuthorized: inst.mac_authorized ?? null });
      } catch (_) { /* tabelas RADIUS podem não existir */ }
      return res.json({ ok: true });
    }
    throw e;
  }
}));

// ---- Customer comodato / venda ----
portalDataRouter.get('/customers/:id/comodato', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const customerId = Number(req.params.id);
  if (!customerId) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      `SELECT id, customer_id, contract_id, os_id, nf_number, movement_type, status,
              notes, total_value, items_json, created_at, created_by,
              endereco_instalacao, data_entrega, tecnico_responsavel, contrato_pdf_url, assinatura_digital,
              data_devolucao, condicao_devolucao, multa_valor, fatura_id
       FROM customer_comodato
       WHERE tenant_id = :tid AND customer_id = :customerId
       ORDER BY id DESC LIMIT 500`,
      { tid, customerId }
    );
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
}));

portalDataRouter.post('/customers/:id/comodato', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const customerId = Number(req.params.id);
  if (!customerId) return res.status(400).json({ message: 'ID inválido' });
  const body = req.body || {};
  const movementType = String(body.movement_type || '').toUpperCase();
  if (!['COMODATO', 'VENDA', 'AVULSO', 'ALUGUEL'].includes(movementType)) {
    return res.status(400).json({ message: 'movement_type deve ser COMODATO, VENDA, AVULSO ou ALUGUEL' });
  }
  const totalValue = body.total_value != null ? Number(body.total_value) : 0;
  const notes = body.notes != null ? String(body.notes).trim() || null : null;
  const contractId = body.contract_id != null ? Number(body.contract_id) || null : null;
  const osId = body.os_id != null ? Number(body.os_id) || null : null;
  const nfNumber = body.nf_number != null ? String(body.nf_number).trim() || null : null;
  const createdBy = body.created_by != null ? String(body.created_by).trim() || null : null;
  const itemsJson = body.items_json != null
    ? (typeof body.items_json === 'string' ? body.items_json : JSON.stringify(body.items_json))
    : null;
  const enderecoInstalacao = body.endereco_instalacao != null ? String(body.endereco_instalacao).trim() || null : null;
  const dataEntrega = body.data_entrega != null ? String(body.data_entrega).trim() || null : null;
  const tecnicoResponsavel = body.tecnico_responsavel != null ? String(body.tecnico_responsavel).trim() || null : null;
  const contratoPdfUrl = body.contrato_pdf_url != null ? String(body.contrato_pdf_url).trim() || null : null;
  const assinaturaDigital = body.assinatura_digital != null ? String(body.assinatura_digital).trim() || null : null;
  const pool = getPool();
  try {
    const [r] = await pool.query(
      `INSERT INTO customer_comodato
       (tenant_id, customer_id, contract_id, os_id, nf_number, movement_type, status, notes, total_value, items_json, created_by,
        endereco_instalacao, data_entrega, tecnico_responsavel, contrato_pdf_url, assinatura_digital)
       VALUES (:tid, :customerId, :contractId, :osId, :nfNumber, :movementType, 'OPEN', :notes, :totalValue, :itemsJson, :createdBy,
        :endereco_instalacao, :data_entrega::date, :tecnico_responsavel, :contrato_pdf_url, :assinatura_digital)
       RETURNING id`,
      {
        tid,
        customerId,
        contractId,
        osId,
        nfNumber,
        movementType,
        notes,
        totalValue: Number.isFinite(totalValue) ? totalValue : 0,
        itemsJson,
        createdBy,
        endereco_instalacao: enderecoInstalacao,
        data_entrega: dataEntrega,
        tecnico_responsavel: tecnicoResponsavel,
        contrato_pdf_url: contratoPdfUrl,
        assinatura_digital: assinaturaDigital
      }
    );
    const insertId = (r as { insertId?: number })?.insertId;
    const dataInstalacao = dataEntrega || new Date().toISOString().slice(0, 10);
    if (insertId && itemsJson) {
      try {
        const items = JSON.parse(itemsJson) as Array<Record<string, unknown>>;
        if (Array.isArray(items)) {
          for (const it of items) {
            const macItem = it.mac ? String(it.mac).trim() : null;
            const serialItem = it.serial ? String(it.serial).trim() : null;
            if (!macItem && !serialItem) continue;
            await pool.query(
              `INSERT INTO equipamento_historico (tenant_id, customer_comodato_id, customer_id, produto_id, equipamento_nome, marca, modelo, mac, serial, patrimonio, valor, data_instalacao)
               VALUES (:tid, :comodatoId, :customerId, :produtoId, :equipamentoNome, :marca, :modelo, :mac, :serial, :patrimonio, :valor, :data_instalacao::date)`,
              {
                tid,
                comodatoId: insertId,
                customerId,
                produtoId: it.product_id != null ? Number(it.product_id) : null,
                equipamentoNome: (it.name || it.equipamento_nome || it.produto_nome) ? String(it.name || it.equipamento_nome || it.produto_nome).trim() : null,
                marca: it.marca ? String(it.marca).trim() : null,
                modelo: it.modelo ? String(it.modelo).trim() : null,
                mac: macItem,
                serial: serialItem,
                patrimonio: it.patrimonio ? String(it.patrimonio).trim() : null,
                valor: it.valor != null ? Number(it.valor) : null,
                data_instalacao: dataInstalacao
              }
            );
          }
        }
      } catch (_) { /* equipamento_historico pode não existir ou items_json inválido */ }
    }
    return res.status(201).json({ ok: true, id: insertId });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Tabela customer_comodato não disponível. Execute a migração.' });
    throw e;
  }
}));

portalDataRouter.patch('/customers/:id/comodato/:movId', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const customerId = Number(req.params.id);
  const movId = Number(req.params.movId);
  if (!customerId || !movId) return res.status(400).json({ message: 'ID inválido' });
  const body = req.body || {};
  const pool = getPool();
  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const params: Record<string, string | number | null> = { tid, customerId, movId };
  if (body.status) {
    const status = String(body.status).trim().toUpperCase();
    if (!['OPEN', 'RETURNED', 'CLOSED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ message: 'Status inválido' });
    }
    updates.push('status = :status');
    params.status = status;
  }
  if (body.notes !== undefined) {
    updates.push('notes = :notes');
    params.notes = body.notes ? String(body.notes).trim() : null;
  }
  if (body.total_value !== undefined) {
    const v = Number(body.total_value);
    if (!Number.isFinite(v)) return res.status(400).json({ message: 'total_value inválido' });
    updates.push('total_value = :totalValue');
    params.totalValue = v;
  }
  if (body.data_devolucao !== undefined) {
    updates.push('data_devolucao = :data_devolucao::date');
    params.data_devolucao = body.data_devolucao ? String(body.data_devolucao).trim() : null;
  }
  if (body.condicao_devolucao !== undefined) {
    const cond = String(body.condicao_devolucao || '').trim().toUpperCase();
    if (cond && !['PERFEITO', 'DANIFICADO', 'NAO_DEVOLVIDO'].includes(cond)) {
      return res.status(400).json({ message: 'condicao_devolucao deve ser PERFEITO, DANIFICADO ou NAO_DEVOLVIDO' });
    }
    updates.push('condicao_devolucao = :condicao_devolucao');
    params.condicao_devolucao = cond || null;
  }
  if (body.multa_valor !== undefined) {
    const m = Number(body.multa_valor);
    updates.push('multa_valor = :multa_valor');
    params.multa_valor = Number.isFinite(m) ? m : null;
  }
  if (body.fatura_id !== undefined) {
    const fid = body.fatura_id != null ? Number(body.fatura_id) : null;
    updates.push('fatura_id = :fatura_id');
    params.fatura_id = fid;
  }
  if (updates.length === 1) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
  try {
    const [r] = await pool.query(
      `UPDATE customer_comodato
       SET ${updates.join(', ')}
       WHERE id = :movId AND customer_id = :customerId AND tenant_id = :tid`,
      params
    );
    const affectedRows = (r as { affectedRows?: number })?.affectedRows ?? 0;
    if (affectedRows === 0) return res.status(404).json({ message: 'Registro de comodato/venda não encontrado' });
    if (body.data_devolucao !== undefined || body.condicao_devolucao !== undefined || body.multa_valor !== undefined || body.fatura_id !== undefined) {
      try {
        const histUpdates: string[] = [];
        const histParams: Record<string, unknown> = { tid, movId };
        if (body.data_devolucao !== undefined) {
          histUpdates.push('data_devolucao = :data_devolucao::date');
          histParams.data_devolucao = body.data_devolucao ? String(body.data_devolucao).trim() : null;
        }
        if (body.condicao_devolucao !== undefined) {
          histUpdates.push('condicao_devolucao = :condicao_devolucao');
          histParams.condicao_devolucao = body.condicao_devolucao ? String(body.condicao_devolucao).trim().toUpperCase() : null;
        }
        if (body.multa_valor !== undefined) {
          histUpdates.push('multa_valor = :multa_valor');
          histParams.multa_valor = body.multa_valor != null ? Number(body.multa_valor) : null;
        }
        if (body.fatura_id !== undefined) {
          histUpdates.push('fatura_id = :fatura_id');
          histParams.fatura_id = body.fatura_id != null ? Number(body.fatura_id) : null;
        }
        if (histUpdates.length > 0) {
          await pool.query(
            `UPDATE equipamento_historico SET ${histUpdates.join(', ')} WHERE tenant_id = :tid AND customer_comodato_id = :movId`,
            histParams
          );
        }
      } catch (_) { /* tabela pode não existir */ }
    }
    return res.json({ ok: true });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Tabela customer_comodato não disponível. Execute a migração.' });
    throw e;
  }
}));

/** GET /equipamento-historico?mac=...&serial=... — Histórico do equipamento por MAC e/ou Serial */
portalDataRouter.get('/equipamento-historico', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const mac = (req.query.mac as string)?.trim() || null;
  const serial = (req.query.serial as string)?.trim() || null;
  if (!mac && !serial) {
    return res.status(400).json({ message: 'Informe mac ou serial na query' });
  }
  const pool = getPool();
  try {
    let sql = `SELECT h.id, h.customer_comodato_id, h.customer_id, h.produto_id, h.equipamento_nome, h.marca, h.modelo, h.mac, h.serial, h.patrimonio,
               h.valor, h.data_instalacao, h.data_devolucao, h.condicao_devolucao, h.multa_valor, h.fatura_id, h.created_at,
               c.name AS customer_name
               FROM equipamento_historico h
               LEFT JOIN customers c ON c.id = h.customer_id AND c.tenant_id = h.tenant_id
               WHERE h.tenant_id = :tid`;
    const params: Record<string, unknown> = { tid };
    if (mac) {
      sql += ' AND h.mac ILIKE :mac';
      params.mac = mac.includes('%') ? mac : '%' + mac + '%';
    }
    if (serial) {
      sql += ' AND h.serial ILIKE :serial';
      params.serial = serial.includes('%') ? serial : '%' + serial + '%';
    }
    sql += ' ORDER BY h.data_instalacao DESC, h.id DESC LIMIT 200';
    const [rows] = await pool.query(sql, params);
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
}));

// ---- Traffic extract (stub para futuro RADIUS/OLT) ----
portalDataRouter.get('/customers/:id/traffic/summary', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const customerId = Number(req.params.id);
  if (!customerId) return res.status(400).json({ message: 'ID inválido' });
  const dateFrom = (req.query.date_from as string | undefined) || null;
  const dateTo = (req.query.date_to as string | undefined) || null;
  const period = (req.query.period as string | undefined) || null;
  // Versão inicial: não integra ainda com RADIUS/OLT; retorna estrutura vazia porém estável.
  return res.json({
    ok: true,
    customer_id: customerId,
    filters: { date_from: dateFrom, date_to: dateTo, period },
    summary: {
      download_bytes: 0,
      upload_bytes: 0,
      peak_download_bps: 0,
      peak_upload_bps: 0,
      avg_download_bps: 0,
      avg_upload_bps: 0,
    },
    sessions: []
  });
}));

// ---- Finance ----
portalDataRouter.get('/finance/stats', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const refMonth = (req.query.ref_month as string) || undefined;
  let pending = 0; let paid = 0; let overdue = 0; let pendingAmount = 0; let paidAmount = 0; let overdueAmount = 0; let totalInMonth = 0; let countInMonth = 0;
  const params: Record<string, string | number> = { tid };
  if (refMonth) params.ref_month = refMonth;
  const monthCond = refMonth ? ' AND i.ref_month = :ref_month' : '';
  try {
    const [[p], [pa], [o], [paAmt], [pdAmt], [ovAmt], totMonthRes] = await Promise.all([
      pool.query("SELECT COUNT(*) AS c FROM invoices i JOIN customers c ON c.id = i.customer_id AND c.tenant_id = :tid WHERE i.status = 'PENDING'" + monthCond, params),
      pool.query("SELECT COUNT(*) AS c FROM invoices i JOIN customers c ON c.id = i.customer_id AND c.tenant_id = :tid WHERE i.status = 'PAID'" + monthCond, params),
      pool.query("SELECT COUNT(*) AS c FROM invoices i JOIN customers c ON c.id = i.customer_id AND c.tenant_id = :tid WHERE i.status = 'OVERDUE'" + monthCond, params),
      pool.query("SELECT COALESCE(SUM(i.amount), 0) AS t FROM invoices i JOIN customers c ON c.id = i.customer_id AND c.tenant_id = :tid WHERE i.status IN ('PENDING','OVERDUE')" + monthCond, params),
      pool.query("SELECT COALESCE(SUM(i.amount), 0) AS t FROM invoices i JOIN customers c ON c.id = i.customer_id AND c.tenant_id = :tid WHERE i.status = 'PAID'" + monthCond, params),
      pool.query("SELECT COALESCE(SUM(i.amount), 0) AS t FROM invoices i JOIN customers c ON c.id = i.customer_id AND c.tenant_id = :tid WHERE i.status = 'OVERDUE'" + monthCond, params),
      refMonth ? pool.query("SELECT COALESCE(SUM(i.amount), 0) AS t, COUNT(*) AS c FROM invoices i JOIN customers c ON c.id = i.customer_id AND c.tenant_id = :tid WHERE i.ref_month = :ref_month", params) : Promise.resolve([[{ t: 0, c: 0 }]]),
    ]);
    pending = (p as { c: number }[])?.[0]?.c ?? 0;
    paid = (pa as { c: number }[])?.[0]?.c ?? 0;
    overdue = (o as { c: number }[])?.[0]?.c ?? 0;
    pendingAmount = (paAmt as { t: number }[])?.[0]?.t ?? 0;
    paidAmount = (pdAmt as { t: number }[])?.[0]?.t ?? 0;
    overdueAmount = (ovAmt as { t: number }[])?.[0]?.t ?? 0;
    if (refMonth && Array.isArray(totMonthRes)) {
      const rows = totMonthRes[0] as { t: number; c: number }[] | undefined;
      if (rows && rows[0]) {
        totalInMonth = Number(rows[0].t) ?? 0;
        countInMonth = Number(rows[0].c) ?? 0;
      }
    }
  } catch {
    /* invoices table may not exist */
  }
  return res.json({ ok: true, pending, paid, overdue, pendingAmount, paidAmount, overdueAmount, totalInMonth, countInMonth });
}));

portalDataRouter.get('/finance/invoices', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const status = req.query.status as string | undefined;
  const refMonth = req.query.ref_month as string | undefined;
  const customerId = req.query.customer_id ? Number(req.query.customer_id) : undefined;
  let sql = `SELECT i.id, i.customer_id, i.ref_month, i.due_date, i.amount, i.plan_code, i.status, i.paid_at, i.created_at,
             c.name AS customer_name, c.whatsapp
             FROM invoices i
             JOIN customers c ON c.id = i.customer_id AND c.tenant_id = :tid
             WHERE 1=1`;
  const params: Record<string, string | number> = { tid };
  if (status) { sql += ' AND i.status = :status'; params.status = status; }
  if (refMonth) { sql += ' AND i.ref_month = :ref_month'; params.ref_month = refMonth; }
  if (customerId) { sql += ' AND i.customer_id = :customer_id'; params.customer_id = customerId; }
  sql += ' ORDER BY i.due_date DESC, i.id DESC LIMIT 500';
  const [rows] = await pool.query(sql, params);
  const list = Array.isArray(rows) ? rows : [];
  const today = new Date().toISOString().slice(0, 10);
  for (const r of list) {
    const row = r as { status: string; due_date: string };
    if (row.status === 'PENDING' && row.due_date < today) row.status = 'OVERDUE';
  }
  return res.json({ ok: true, rows: list });
}));

portalDataRouter.post('/finance/invoices/generate', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const refMonth = String(req.body?.ref_month ?? '').trim() || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(refMonth)) return res.status(400).json({ message: 'ref_month inválido (use YYYY-MM)' });
  const pool = getPool();
  const [customers] = await pool.query(
    `SELECT c.id, c.whatsapp FROM customers c
     WHERE c.tenant_id = :tid AND (COALESCE(c.active, true))::int = 1
     AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = c.id AND i.ref_month = :rm)`,
    { tid, rm: refMonth }
  );
  const custList: { id: number; plan_code: string; due_day: number }[] = [];
  const instByCid = new Map<number, { plan_code: string; due_day: number }>();
  const subsByW = new Map<string, { plan_code: string; vencimento: number }>();
  try {
    const [inst] = await pool.query(
      `SELECT inst.customer_id, inst.plan_code, inst.due_day FROM installations inst
       JOIN customers c ON c.id = inst.customer_id AND c.tenant_id = :tid WHERE inst.status = 'ACTIVE'`,
      { tid }
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
      'SELECT whatsapp, plan_code, vencimento FROM subscription_requests WHERE status = ? AND tenant_id = :tid',
      ['INSTALLED', tid]
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
    const [planPrices] = await pool.query('SELECT code, COALESCE(price, 99.90) AS price FROM plans WHERE active = true AND tenant_id = :tid', { tid });
    for (const p of Array.isArray(planPrices) ? planPrices : []) {
      const row = p as { code: string; price: number };
      priceByPlan.set(row.code, Number(row.price));
    }
  } catch {
    try {
      const [planPrices] = await pool.query('SELECT code, COALESCE(price, 99.90) AS price FROM plans WHERE active = true');
      for (const p of Array.isArray(planPrices) ? planPrices : []) {
        const row = p as { code: string; price: number };
        priceByPlan.set(row.code, Number(row.price));
      }
    } catch {
      /* ignore */
    }
  }
  let created = 0;
  for (const cust of custList) {
    const planCode = cust.plan_code || '100';
    const dueDay = Math.min(28, Math.max(1, cust.due_day ?? 10));
    const dueDate = `${refMonth}-${String(dueDay).padStart(2, '0')}`;
    const amount = priceByPlan.get(planCode) ?? 99.90;
    try {
      const [ins] = await pool.query(
        `INSERT INTO invoices (customer_id, ref_month, due_date, amount, plan_code, status)
         VALUES (:cid, :rm, :due, :amt, :plan, 'PENDING') RETURNING id`,
        { cid: cust.id, rm: refMonth, due: dueDate, amt: amount, plan: planCode }
      );
      const insertId = (ins as { insertId?: number })?.insertId ?? 0;
      created++;
      // Enfileira notificação de fatura gerada (implementação real pode usar provider externo)
      void enqueueNotification({
        tenantId: tid,
        customerId: cust.id,
        channel: 'WHATSAPP',
        type: 'INVOICE_GENERATED',
        payload: { invoiceId: insertId, refMonth, dueDate, amount, planCode },
      });
    } catch {
      /* duplicate or other */
    }
  }
  return res.json({ ok: true, created, refMonth });
}));

/** Agenda um carnê (parcelas) gerando várias faturas para um cliente. */
portalDataRouter.post('/finance/invoices/schedule', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const customerId = Number(body.customer_id);
  if (!customerId) return res.status(400).json({ message: 'customer_id é obrigatório' });
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'amount inválido' });
  let dueDay = Number(body.due_day ?? 10);
  if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 28) return res.status(400).json({ message: 'due_day deve ser entre 1 e 28' });
  let installments = Number(body.installments ?? 12);
  if (!Number.isInteger(installments) || installments < 1 || installments > 60) return res.status(400).json({ message: 'installments deve ser entre 1 e 60' });
  const startRefMonthRaw = String(body.start_ref_month ?? '').trim() || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(startRefMonthRaw)) return res.status(400).json({ message: 'start_ref_month inválido (use YYYY-MM)' });
  const planCode = (body.plan_code as string | undefined)?.trim() || '100';
  const notes = (body.notes as string | undefined)?.trim() || null;

  const pool = getPool();

  // Garante que o cliente pertence ao tenant
  const [custCheck] = await pool.query(
    'SELECT id FROM customers WHERE id = :cid AND tenant_id = :tid LIMIT 1',
    { cid: customerId, tid }
  );
  if (!Array.isArray(custCheck) || custCheck.length === 0) {
    return res.status(404).json({ message: 'Cliente não encontrado para este tenant' });
  }

  function addMonths(refMonth: string, offset: number): string {
    const y = Number(refMonth.slice(0, 4));
    const m = Number(refMonth.slice(5, 7));
    if (!Number.isFinite(y) || !Number.isFinite(m)) return refMonth;
    const base = (m - 1) + offset;
    const ny = y + Math.floor(base / 12);
    const nm = (base % 12 + 12) % 12; // garante 0-11
    const mm = String(nm + 1).padStart(2, '0');
    return `${ny}-${mm}`;
  }

  let created = 0;
  for (let i = 0; i < installments; i++) {
    const refMonth = addMonths(startRefMonthRaw, i);
    const d = Math.min(28, Math.max(1, dueDay));
    const dueDate = `${refMonth}-${String(d).padStart(2, '0')}`;
    try {
      const [ins] = await pool.query(
        `INSERT INTO invoices (customer_id, ref_month, due_date, amount, plan_code, status, notes)
         VALUES (:cid, :rm, :due, :amt, :plan, 'PENDING', :notes)
         ON CONFLICT (customer_id, ref_month) DO NOTHING`,
        { cid: customerId, rm: refMonth, due: dueDate, amt: amount, plan: planCode, notes }
      );
      const meta = ins as { affectedRows?: number };
      const affected = meta?.affectedRows ?? 0;
      if (affected > 0) created++;
    } catch (e) {
      if (!isTableNotFoundError(e)) {
        // Em caso de erro inesperado, interrompe o loop e retorna
        throw e;
      }
    }
  }

  return res.json({
    ok: true,
    customer_id: customerId,
    created,
    start_ref_month: startRefMonthRaw,
    installments,
  });
}));

portalDataRouter.patch('/finance/invoices/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const paid = req.body?.paid;
  const status = (req.body?.status as string)?.trim()?.toUpperCase();
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();

  if (status === 'CANCELLED') {
    const [r] = await pool.query(
      "UPDATE invoices i SET status = 'CANCELLED', paid_at = NULL FROM customers c WHERE c.id = i.customer_id AND c.tenant_id = :tid AND i.id = :id",
      { tid, id }
    );
    if ((r as { affectedRows?: number })?.affectedRows === 0) return res.status(404).json({ message: 'Fatura não encontrada' });
    return res.json({ ok: true });
  }

  if (paid === true || paid === 1 || paid === '1') {
    const [rows] = await pool.query(
      'SELECT i.id, i.customer_id, i.ref_month, i.amount FROM invoices i JOIN customers c ON c.id = i.customer_id AND c.tenant_id = :tid WHERE i.id = :id LIMIT 1',
      { tid, id }
    );
    const inv = Array.isArray(rows) && rows.length ? (rows[0] as { id: number; customer_id: number; ref_month: string; amount: number }) : null;
    if (!inv) return res.status(404).json({ message: 'Fatura não encontrada' });
    const [r] = await pool.query(
      "UPDATE invoices i SET status = 'PAID', paid_at = NOW() FROM customers c WHERE c.id = i.customer_id AND c.tenant_id = :tid AND i.id = :id",
      { tid, id }
    );
    if ((r as { affectedRows?: number })?.affectedRows === 0) return res.status(404).json({ message: 'Fatura não encontrada' });
    try {
      await pool.query(
        `INSERT INTO caixa_movimentos (tenant_id, tipo, description, amount, invoice_id, movement_date)
         VALUES (:tid, 'RECEITA', :desc, :amt, :invId, CURRENT_DATE)`,
        { tid, desc: 'Quitação fatura #' + id + ' (' + inv.ref_month + ')', amt: Number(inv.amount), invId: id }
      );
    } catch (e) {
      if (!isTableNotFoundError(e)) throw e;
    }
    void enqueueNotification({
      tenantId: tid,
      customerId: inv.customer_id,
      channel: 'WHATSAPP',
      type: 'INVOICE_PAID',
      payload: { invoiceId: id, refMonth: inv.ref_month, amount: inv.amount },
    });
    return res.json({ ok: true });
  }

  if (paid === false || paid === 0 || paid === '0') {
    const [r] = await pool.query(
      "UPDATE invoices i SET status = 'PENDING', paid_at = NULL FROM customers c WHERE c.id = i.customer_id AND c.tenant_id = :tid AND i.id = :id",
      { tid, id }
    );
    if ((r as { affectedRows?: number })?.affectedRows === 0) return res.status(404).json({ message: 'Fatura não encontrada' });
    return res.json({ ok: true });
  }

  return res.status(400).json({ message: 'Envie paid: true/false ou status: CANCELLED' });
}));

portalDataRouter.put('/finance/invoices/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const body = req.body || {};
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const updates: string[] = [];
  const params: Record<string, string | number> = { id, tid };
  if (body.due_date !== undefined) {
    const d = String(body.due_date).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { updates.push('due_date = CAST(:due_date AS DATE)'); params.due_date = d; }
  }
  if (body.amount !== undefined) {
    const a = Number(body.amount);
    if (Number.isFinite(a) && a >= 0) { updates.push('amount = :amount'); params.amount = a; }
  }
  if (body.plan_code !== undefined) { updates.push('plan_code = :plan_code'); params.plan_code = String(body.plan_code).trim(); }
  if (body.notes !== undefined) { updates.push('notes = :notes'); params.notes = body.notes ? String(body.notes).trim() : ''; }
  if (!updates.length) return res.json({ ok: true });
  try {
    const [r] = await pool.query(
      'UPDATE invoices i SET ' + updates.join(', ') + ' FROM customers c WHERE c.id = i.customer_id AND c.tenant_id = :tid AND i.id = :id',
      params
    );
    if ((r as { affectedRows?: number })?.affectedRows === 0) return res.status(404).json({ message: 'Fatura não encontrada' });
    return res.json({ ok: true });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Fatura não encontrada' });
    throw e;
  }
}));

// ---- Caixa (movimento de caixa) ----
portalDataRouter.get('/finance/caixa/movements', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const dateFrom = (req.query.date_from as string)?.trim();
  const dateTo = (req.query.date_to as string)?.trim();
  const tipo = (req.query.tipo as string)?.trim()?.toUpperCase();
  let sql = `SELECT m.id, m.tipo, m.description, m.amount, m.invoice_id, m.movement_date, m.created_at
             FROM caixa_movimentos m WHERE m.tenant_id = :tid`;
  const params: Record<string, string | number> = { tid };
  if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) { sql += ' AND m.movement_date >= CAST(:date_from AS DATE)'; params.date_from = dateFrom; }
  if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) { sql += ' AND m.movement_date <= CAST(:date_to AS DATE)'; params.date_to = dateTo; }
  if (tipo === 'RECEITA' || tipo === 'DESPESA') { sql += ' AND m.tipo = :tipo'; params.tipo = tipo; }
  sql += ' ORDER BY m.movement_date DESC, m.id DESC LIMIT 500';
  try {
    const [rows] = await pool.query(sql, params);
    const list = Array.isArray(rows) ? rows : [];
    let totalReceita = 0; let totalDespesa = 0;
    for (const r of list) {
      const row = r as { tipo: string; amount: number };
      if (row.tipo === 'RECEITA') totalReceita += Number(row.amount);
      else totalDespesa += Number(row.amount);
    }
    return res.json({ ok: true, rows: list, totalReceita, totalDespesa, saldo: totalReceita - totalDespesa });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [], totalReceita: 0, totalDespesa: 0, saldo: 0 });
    throw e;
  }
}));

portalDataRouter.post('/finance/caixa/movements', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const tipo = (body.tipo as string)?.trim()?.toUpperCase() || 'RECEITA';
  if (tipo !== 'RECEITA' && tipo !== 'DESPESA') return res.status(400).json({ message: 'tipo deve ser RECEITA ou DESPESA' });
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'amount inválido' });
  const description = (body.description as string)?.trim() || null;
  const movementDate = (body.movement_date as string)?.trim() || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(movementDate)) return res.status(400).json({ message: 'movement_date inválido (YYYY-MM-DD)' });
  const pool = getPool();
  try {
    const [ins] = await pool.query(
      `INSERT INTO caixa_movimentos (tenant_id, tipo, description, amount, movement_date)
       VALUES (:tid, :tipo, :desc, :amt, CAST(:movDate AS DATE)) RETURNING id`,
      { tid, tipo, desc: description, amt: Math.abs(amount), movDate: movementDate }
    );
    const newId = (ins as { insertId?: number })?.insertId ?? (Array.isArray(ins) && (ins as unknown[])[0] ? ((ins as unknown[])[0] as { id: number }).id : null);
    return res.status(201).json({ ok: true, id: newId });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Tabela caixa_movimentos não existe. Execute a migração.' });
    throw e;
  }
}));

// ---- Payment gateways (EFI/GerenciaNet, etc.) ----
portalDataRouter.get('/finance/gateways', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const activeOnly = req.query.active;
  const search = (req.query.search as string)?.trim();
  let sql = 'SELECT id, tenant_id, description, gateway_type, portadores, pix, card, boleto, retorno, config, active, created_at, updated_at FROM payment_gateways WHERE tenant_id = :tid';
  const params: Record<string, unknown> = { tid };
  if (activeOnly === '1' || activeOnly === 'true') {
    sql += ' AND active = true';
  } else if (activeOnly === '0' || activeOnly === 'false') {
    sql += ' AND active = false';
  }
  if (search) {
    sql += ' AND (description ILIKE :search OR gateway_type ILIKE :search2)';
    params.search = '%' + search + '%';
    params.search2 = '%' + search + '%';
  }
  sql += ' ORDER BY description ASC';
  try {
    const [rows] = await pool.query(sql, params);
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
}));

portalDataRouter.get('/finance/gateways/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      'SELECT id, tenant_id, description, gateway_type, portadores, pix, card, boleto, retorno, config, active, created_at, updated_at FROM payment_gateways WHERE id = :id AND tenant_id = :tid LIMIT 1',
      { id, tid }
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return res.status(404).json({ message: 'Gateway não encontrado' });
    return res.json(list[0]);
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Gateway não encontrado' });
    throw e;
  }
}));

portalDataRouter.post('/finance/gateways', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const description = String(body.description ?? '').trim();
  if (!description) return res.status(400).json({ message: 'Descrição é obrigatória' });
  const gateway_type = String(body.gateway_type ?? 'gerencianet').trim().toLowerCase().replace(/\s+/g, '_') || 'gerencianet';
  const portadores = body.portadores != null ? String(body.portadores) : null;
  const pix = !!body.pix;
  const card = !!body.card;
  const boleto = !!body.boleto;
  const retorno = !!body.retorno;
  const config = body.config != null ? (typeof body.config === 'string' ? JSON.parse(body.config) : body.config) : null;
  const active = body.active !== false && body.active !== 'false' && body.active !== 0;
  const pool = getPool();
  try {
    const [insertResult, insertRows] = await pool.query(
      `INSERT INTO payment_gateways (tenant_id, description, gateway_type, portadores, pix, card, boleto, retorno, config, active)
       VALUES (:tid, :description, :gateway_type, :portadores, :pix, :card, :boleto, :retorno, :config::jsonb, :active)
       RETURNING id`,
      { tid, description, gateway_type, portadores, pix, card, boleto, retorno, config: config ? JSON.stringify(config) : null, active }
    );
    const meta = insertResult as { insertId?: number };
    let id = meta?.insertId;
    if (id == null && Array.isArray(insertRows) && insertRows.length) {
      id = (insertRows[0] as { id: number }).id;
    }
    if (id == null) {
      const [rows] = await pool.query('SELECT id FROM payment_gateways WHERE tenant_id = :tid ORDER BY id DESC LIMIT 1', { tid });
      const list = Array.isArray(rows) ? rows : [];
      id = list.length ? (list[0] as { id: number }).id : undefined;
    }
    return res.status(201).json({ id: id ?? 0, ok: true });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Tabela payment_gateways não existe. Execute sql/payment_gateways.sql' });
    throw e;
  }
}));

portalDataRouter.put('/finance/gateways/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  const body = req.body || {};
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const description = body.description != null ? String(body.description).trim() : undefined;
  const gateway_type = body.gateway_type != null ? String(body.gateway_type).trim().toLowerCase().replace(/\s+/g, '_') : undefined;
  const portadores = body.portadores !== undefined ? (body.portadores == null ? null : String(body.portadores)) : undefined;
  const pix = body.pix !== undefined ? !!body.pix : undefined;
  const card = body.card !== undefined ? !!body.card : undefined;
  const boleto = body.boleto !== undefined ? !!body.boleto : undefined;
  const retorno = body.retorno !== undefined ? !!body.retorno : undefined;
  const config = body.config !== undefined ? (typeof body.config === 'string' ? (body.config ? JSON.parse(body.config) : null) : body.config) : undefined;
  const active = body.active !== undefined ? (body.active !== false && body.active !== 'false' && body.active !== 0) : undefined;
  const pool = getPool();
  const updates: string[] = [];
  const params: Record<string, unknown> = { id, tid };
  if (description !== undefined) { updates.push('description = :description'); params.description = description; }
  if (gateway_type !== undefined) { updates.push('gateway_type = :gateway_type'); params.gateway_type = gateway_type; }
  if (portadores !== undefined) { updates.push('portadores = :portadores'); params.portadores = portadores; }
  if (pix !== undefined) { updates.push('pix = :pix'); params.pix = pix; }
  if (card !== undefined) { updates.push('card = :card'); params.card = card; }
  if (boleto !== undefined) { updates.push('boleto = :boleto'); params.boleto = boleto; }
  if (retorno !== undefined) { updates.push('retorno = :retorno'); params.retorno = retorno; }
  if (config !== undefined) {
    if (config && typeof config === 'object' && !(config as Record<string, unknown>).client_secret) {
      const [cur] = await pool.query('SELECT config FROM payment_gateways WHERE id = :id AND tenant_id = :tid LIMIT 1', { id, tid });
      const curRow = Array.isArray(cur) && cur.length ? (cur[0] as { config?: Record<string, unknown> }) : null;
      const curConfig = curRow?.config && typeof curRow.config === 'object' ? curRow.config as Record<string, unknown> : {};
      const merged = { ...curConfig, ...(config as Record<string, unknown>) };
      updates.push('config = :config::jsonb');
      params.config = JSON.stringify(merged);
    } else {
      updates.push('config = :config::jsonb');
      params.config = config ? JSON.stringify(config) : null;
    }
  }
  if (active !== undefined) { updates.push('active = :active'); params.active = active; }
  if (!updates.length) return res.json({ ok: true });
  updates.push('updated_at = CURRENT_TIMESTAMP');
  try {
    const [r] = await pool.query(
      'UPDATE payment_gateways SET ' + updates.join(', ') + ' WHERE id = :id AND tenant_id = :tid',
      params
    );
    const affected = (r as { affectedRows?: number })?.affectedRows ?? 0;
    if (affected === 0) return res.status(404).json({ message: 'Gateway não encontrado' });
    return res.json({ ok: true });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Tabela payment_gateways não existe' });
    throw e;
  }
}));

portalDataRouter.delete('/finance/gateways/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  try {
    const [r] = await pool.query('DELETE FROM payment_gateways WHERE id = :id AND tenant_id = :tid', { id, tid });
    const affected = (r as { affectedRows?: number })?.affectedRows ?? 0;
    if (affected === 0) return res.status(404).json({ message: 'Gateway não encontrado' });
    return res.json({ ok: true });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Gateway não encontrado' });
    throw e;
  }
}));

// ---- Carnê (lotes de carnê: gerar, imprimir, confirmação de entrega) ----
portalDataRouter.get('/finance/carne/lots', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const refMonth = (req.query.ref_month as string)?.trim();
  const status = (req.query.status as string)?.trim();
  let sql = 'SELECT id, ref_month, name, status, total_customers, total_invoices, created_at, updated_at FROM carne_lots WHERE tenant_id = :tid';
  const params: Record<string, string | number> = { tid };
  if (refMonth && /^\d{4}-\d{2}$/.test(refMonth)) { sql += ' AND ref_month = :ref_month'; params.ref_month = refMonth; }
  if (status) { sql += ' AND status = :status'; params.status = status; }
  sql += ' ORDER BY created_at DESC, id DESC LIMIT 100';
  try {
    const [rows] = await pool.query(sql, params);
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
}));

portalDataRouter.post('/finance/carne/lots', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const refMonth = String(req.body?.ref_month ?? '').trim() || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(refMonth)) return res.status(400).json({ message: 'ref_month inválido (use YYYY-MM)' });
  const name = (req.body?.name as string)?.trim() || null;
  const pool = getPool();
  try {
    const [custRows] = await pool.query(
      `SELECT DISTINCT i.customer_id FROM invoices i
       JOIN customers c ON c.id = i.customer_id AND c.tenant_id = :tid
       WHERE i.ref_month = :rm`,
      { tid, rm: refMonth }
    );
    const customerIds = (Array.isArray(custRows) ? custRows : []).map((r) => (r as { customer_id: number }).customer_id);
    if (customerIds.length === 0) return res.status(400).json({ message: 'Nenhuma fatura encontrada para a competência ' + refMonth });

    const [invCount] = await pool.query(
      `SELECT COUNT(*) AS c FROM invoices i JOIN customers c ON c.id = i.customer_id AND c.tenant_id = :tid WHERE i.ref_month = :rm`,
      { tid, rm: refMonth }
    );
    const totalInvoices = (invCount as { c: number }[])?.[0]?.c ?? 0;

    const [ins] = await pool.query(
      `INSERT INTO carne_lots (tenant_id, ref_month, name, status, total_customers, total_invoices)
       VALUES (:tid, :rm, :name, 'GENERATED', :tc, :ti) RETURNING id`,
      { tid, rm: refMonth, name, tc: customerIds.length, ti: totalInvoices }
    );
    const lotId = (ins as { insertId?: number })?.insertId ?? (Array.isArray(ins) && (ins as unknown[])[0] ? ((ins as unknown[])[0] as { id: number }).id : null);
    if (lotId == null) return res.status(500).json({ message: 'Erro ao criar lote' });

    for (const cid of customerIds) {
      await pool.query(
        'INSERT INTO carne_lot_items (carne_lot_id, customer_id) VALUES (:lid, :cid) ON CONFLICT (carne_lot_id, customer_id) DO NOTHING',
        { lid: lotId, cid }
      );
    }
    return res.status(201).json({ ok: true, id: Number(lotId), ref_month: refMonth, total_customers: customerIds.length, total_invoices: totalInvoices });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Tabelas de carnê não existem. Execute a migração carne_lots.sql' });
    throw e;
  }
}));

portalDataRouter.get('/finance/carne/lots/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  try {
    const [lotRows] = await pool.query(
      'SELECT id, ref_month, name, status, total_customers, total_invoices, created_at, updated_at FROM carne_lots WHERE id = :id AND tenant_id = :tid LIMIT 1',
      { id, tid }
    );
    const lot = Array.isArray(lotRows) && lotRows.length ? (lotRows[0] as Record<string, unknown>) : null;
    if (!lot) return res.status(404).json({ message: 'Lote não encontrado' });

    const [itemRows] = await pool.query(
      `SELECT i.id, i.customer_id, i.printed_at, i.delivered_at, i.delivery_notes, c.name AS customer_name, c.whatsapp
       FROM carne_lot_items i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.carne_lot_id = :id ORDER BY c.name`,
      { id }
    );
    const items = Array.isArray(itemRows) ? itemRows : [];
    return res.json({ ...lot, items });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Lote não encontrado' });
    throw e;
  }
}));

portalDataRouter.get('/finance/carne/lots/:id/print', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  try {
    const [lotRows] = await pool.query(
      'SELECT id, ref_month, name, status, total_customers, total_invoices FROM carne_lots WHERE id = :id AND tenant_id = :tid LIMIT 1',
      { id, tid }
    );
    const lot = Array.isArray(lotRows) && lotRows.length ? (lotRows[0] as { id: number; ref_month: string; name: string | null }) : null;
    if (!lot) return res.status(404).json({ message: 'Lote não encontrado' });

    const [itemRows] = await pool.query(
      `SELECT i.id, i.customer_id, c.name AS customer_name, c.whatsapp, c.email
       FROM carne_lot_items i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.carne_lot_id = :id ORDER BY c.name`,
      { id }
    );
    const items = Array.isArray(itemRows) ? itemRows : [];
    const printData: { customer_id: number; customer_name: string; whatsapp: string; email: string | null; invoices: unknown[] }[] = [];
    for (const it of items) {
      const row = it as { id: number; customer_id: number; customer_name: string; whatsapp: string; email: string | null };
      const [invRows] = await pool.query(
        'SELECT id, ref_month, due_date, amount, plan_code, status FROM invoices WHERE customer_id = :cid AND ref_month = :rm ORDER BY due_date',
        { cid: row.customer_id, rm: lot.ref_month }
      );
      printData.push({
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        whatsapp: row.whatsapp || '',
        email: row.email || null,
        invoices: Array.isArray(invRows) ? invRows : [],
      });
    }
    return res.json({ ok: true, lot: { id: lot.id, ref_month: lot.ref_month, name: lot.name }, items: printData });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Lote não encontrado' });
    throw e;
  }
}));

portalDataRouter.patch('/finance/carne/lots/:id/items/:itemId', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const lotId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const tid = tenantId(req);
  const body = req.body || {};
  if (!lotId || !itemId) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const deliveredAt = body.delivered_at !== undefined ? (body.delivered_at ? new Date().toISOString() : null) : undefined;
  const deliveryNotes = body.delivery_notes !== undefined ? String(body.delivery_notes) : undefined;
  try {
    const [check] = await pool.query('SELECT 1 FROM carne_lots WHERE id = :lid AND tenant_id = :tid LIMIT 1', { lid: lotId, tid });
    if (!Array.isArray(check) || check.length === 0) return res.status(404).json({ message: 'Lote não encontrado' });
    const updates: string[] = [];
    const params: Record<string, unknown> = { itemId, lid: lotId };
    if (deliveredAt !== undefined) { updates.push('delivered_at = :delivered_at'); params.delivered_at = deliveredAt; }
    if (deliveryNotes !== undefined) { updates.push('delivery_notes = :delivery_notes'); params.delivery_notes = deliveryNotes; }
    if (updates.length === 0) return res.json({ ok: true });
    const [r] = await pool.query(
      'UPDATE carne_lot_items SET ' + updates.join(', ') + ' WHERE id = :itemId AND carne_lot_id = :lid',
      params
    );
    const affected = (r as { affectedRows?: number })?.affectedRows ?? 0;
    if (affected === 0) return res.status(404).json({ message: 'Item não encontrado' });
    return res.json({ ok: true });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Não encontrado' });
    throw e;
  }
}));

portalDataRouter.post('/finance/carne/lots/:id/confirm-delivery', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const lotId = Number(req.params.id);
  const tid = tenantId(req);
  const body = req.body || {};
  if (!lotId) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  try {
    const [check] = await pool.query('SELECT 1 FROM carne_lots WHERE id = :lid AND tenant_id = :tid LIMIT 1', { lid: lotId, tid });
    if (!Array.isArray(check) || check.length === 0) return res.status(404).json({ message: 'Lote não encontrado' });
    const now = new Date().toISOString();
    if (body.all === true) {
      const [r] = await pool.query(
        'UPDATE carne_lot_items SET delivered_at = :now WHERE carne_lot_id = :lid AND delivered_at IS NULL',
        { now, lid: lotId }
      );
      const affected = (r as { affectedRows?: number })?.affectedRows ?? 0;
      return res.json({ ok: true, updated: affected });
    }
    const items = Array.isArray(body.items) ? body.items : [];
    let updated = 0;
    for (const it of items) {
      const itemId = Number(it?.id ?? it?.itemId);
      if (!itemId) continue;
      await pool.query(
        'UPDATE carne_lot_items SET delivered_at = COALESCE(:delivered_at, CURRENT_TIMESTAMP), delivery_notes = COALESCE(:notes, delivery_notes) WHERE id = :itemId AND carne_lot_id = :lid',
        { delivered_at: it.delivered_at || now, notes: it.delivery_notes ?? null, itemId, lid: lotId }
      );
      updated++;
    }
    return res.json({ ok: true, updated });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Não encontrado' });
    throw e;
  }
}));

portalDataRouter.patch('/finance/carne/lots/:id/printed', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const lotId = Number(req.params.id);
  const tid = tenantId(req);
  if (!lotId) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  try {
    const [check] = await pool.query('SELECT 1 FROM carne_lots WHERE id = :lid AND tenant_id = :tid LIMIT 1', { lid: lotId, tid });
    if (!Array.isArray(check) || check.length === 0) return res.status(404).json({ message: 'Lote não encontrado' });
    await pool.query('UPDATE carne_lot_items SET printed_at = COALESCE(printed_at, CURRENT_TIMESTAMP) WHERE carne_lot_id = :lid', { lid: lotId });
    await pool.query('UPDATE carne_lots SET updated_at = CURRENT_TIMESTAMP WHERE id = :lid', { lid: lotId });
    return res.json({ ok: true });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Lote não encontrado' });
    throw e;
  }
}));

// ---- Finance: Fornecedores (suppliers) ----
portalDataRouter.get('/finance/suppliers', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const search = (req.query.search as string)?.trim();
  const ativo = req.query.ativo as string | undefined;
  let sql = `SELECT id, tipo_pessoa, situacao_fiscal, nome_razao, nome_fantasia, responsavel, contato, cpf_cnpj, ie, im,
             endereco, numero, bairro, cidade, cep, uf, email, telefones, celulares, observacao, ativo, created_at
             FROM suppliers WHERE tenant_id = :tid`;
  const params: Record<string, string | number> = { tid };
  if (search) { sql += ' AND (nome_razao ILIKE :search OR nome_fantasia ILIKE :search OR cpf_cnpj ILIKE :search)'; params.search = '%' + search + '%'; }
  if (ativo === '1') { sql += ' AND ativo = true'; }
  if (ativo === '0') { sql += ' AND ativo = false'; }
  sql += ' ORDER BY nome_razao ASC LIMIT 500';
  try {
    const [rows] = await pool.query(sql, params);
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
}));

portalDataRouter.get('/finance/suppliers/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      'SELECT * FROM suppliers WHERE id = :id AND tenant_id = :tid LIMIT 1',
      { id, tid }
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return res.status(404).json({ message: 'Fornecedor não encontrado' });
    return res.json(list[0]);
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Fornecedor não encontrado' });
    throw e;
  }
}));

portalDataRouter.post('/finance/suppliers', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const nome_razao = String(body.nome_razao ?? '').trim();
  if (!nome_razao) return res.status(400).json({ message: 'Nome/Razão social obrigatório' });
  const pool = getPool();
  try {
    const [r] = await pool.query(
      `INSERT INTO suppliers (tenant_id, tipo_pessoa, situacao_fiscal, nome_razao, nome_fantasia, responsavel, contato,
       cpf_cnpj, rg, rg_emissor, ie, im, contribuinte_icms, endereco, numero, bairro, cidade, cep, uf, pais, complemento,
       referencia, email, telefones, celulares, fax, observacao, ativo)
       VALUES (:tid, :tipo_pessoa, :situacao_fiscal, :nome_razao, :nome_fantasia, :responsavel, :contato,
       :cpf_cnpj, :rg, :rg_emissor, :ie, :im, :contribuinte_icms, :endereco, :numero, :bairro, :cidade, :cep, :uf, :pais,
       :complemento, :referencia, :email, :telefones, :celulares, :fax, :observacao, :ativo) RETURNING id`,
      {
        tid,
        tipo_pessoa: String(body.tipo_pessoa ?? 'JURIDICA').toUpperCase().slice(0, 16) || 'JURIDICA',
        situacao_fiscal: body.situacao_fiscal ? String(body.situacao_fiscal).trim().slice(0, 32) : null,
        nome_razao: nome_razao.slice(0, 190),
        nome_fantasia: body.nome_fantasia ? String(body.nome_fantasia).trim().slice(0, 190) : null,
        responsavel: body.responsavel ? String(body.responsavel).trim().slice(0, 190) : null,
        contato: body.contato ? String(body.contato).trim().slice(0, 190) : null,
        cpf_cnpj: body.cpf_cnpj ? String(body.cpf_cnpj).trim().slice(0, 32) : null,
        rg: body.rg ? String(body.rg).trim().slice(0, 32) : null,
        rg_emissor: body.rg_emissor ? String(body.rg_emissor).trim().slice(0, 32) : null,
        ie: body.ie ? String(body.ie).trim().slice(0, 32) : null,
        im: body.im ? String(body.im).trim().slice(0, 32) : null,
        contribuinte_icms: !!body.contribuinte_icms,
        endereco: body.endereco ? String(body.endereco).trim().slice(0, 190) : null,
        numero: body.numero ? String(body.numero).trim().slice(0, 32) : null,
        bairro: body.bairro ? String(body.bairro).trim().slice(0, 120) : null,
        cidade: body.cidade ? String(body.cidade).trim().slice(0, 120) : null,
        cep: body.cep ? String(body.cep).trim().slice(0, 16) : null,
        uf: body.uf ? String(body.uf).trim().slice(0, 8) : null,
        pais: body.pais ? String(body.pais).trim().slice(0, 64) : 'BR',
        complemento: body.complemento ? String(body.complemento).trim().slice(0, 190) : null,
        referencia: body.referencia ? String(body.referencia).trim().slice(0, 190) : null,
        email: body.email ? String(body.email).trim().slice(0, 190) : null,
        telefones: body.telefones ? String(body.telefones).trim().slice(0, 190) : null,
        celulares: body.celulares ? String(body.celulares).trim().slice(0, 190) : null,
        fax: body.fax ? String(body.fax).trim().slice(0, 64) : null,
        observacao: body.observacao ? String(body.observacao).trim() : null,
        ativo: body.ativo !== false
      }
    );
    const id = (r as { insertId?: number })?.insertId;
    if (id == null) return res.status(500).json({ message: 'Erro ao criar fornecedor' });
    return res.status(201).json({ ok: true, id });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Tabela suppliers não disponível. Execute: node scripts/update-databases.mjs' });
    throw e;
  }
}));

portalDataRouter.put('/finance/suppliers/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const body = req.body || {};
  const nome_razao = String(body.nome_razao ?? '').trim();
  if (!nome_razao) return res.status(400).json({ message: 'Nome/Razão social obrigatório' });
  const pool = getPool();
  try {
    const [r] = await pool.query(
      `UPDATE suppliers SET tipo_pessoa = :tipo_pessoa, situacao_fiscal = :situacao_fiscal, nome_razao = :nome_razao,
       nome_fantasia = :nome_fantasia, responsavel = :responsavel, contato = :contato, cpf_cnpj = :cpf_cnpj,
       rg = :rg, rg_emissor = :rg_emissor, ie = :ie, im = :im, contribuinte_icms = :contribuinte_icms,
       endereco = :endereco, numero = :numero, bairro = :bairro, cidade = :cidade, cep = :cep, uf = :uf, pais = :pais,
       complemento = :complemento, referencia = :referencia, email = :email, telefones = :telefones,
       celulares = :celulares, fax = :fax, observacao = :observacao, ativo = :ativo, updated_at = CURRENT_TIMESTAMP
       WHERE id = :id AND tenant_id = :tid`,
      {
        id,
        tid,
        tipo_pessoa: String(body.tipo_pessoa ?? 'JURIDICA').toUpperCase().slice(0, 16) || 'JURIDICA',
        situacao_fiscal: body.situacao_fiscal ? String(body.situacao_fiscal).trim().slice(0, 32) : null,
        nome_razao: nome_razao.slice(0, 190),
        nome_fantasia: body.nome_fantasia ? String(body.nome_fantasia).trim().slice(0, 190) : null,
        responsavel: body.responsavel ? String(body.responsavel).trim().slice(0, 190) : null,
        contato: body.contato ? String(body.contato).trim().slice(0, 190) : null,
        cpf_cnpj: body.cpf_cnpj ? String(body.cpf_cnpj).trim().slice(0, 32) : null,
        rg: body.rg ? String(body.rg).trim().slice(0, 32) : null,
        rg_emissor: body.rg_emissor ? String(body.rg_emissor).trim().slice(0, 32) : null,
        ie: body.ie ? String(body.ie).trim().slice(0, 32) : null,
        im: body.im ? String(body.im).trim().slice(0, 32) : null,
        contribuinte_icms: !!body.contribuinte_icms,
        endereco: body.endereco ? String(body.endereco).trim().slice(0, 190) : null,
        numero: body.numero ? String(body.numero).trim().slice(0, 32) : null,
        bairro: body.bairro ? String(body.bairro).trim().slice(0, 120) : null,
        cidade: body.cidade ? String(body.cidade).trim().slice(0, 120) : null,
        cep: body.cep ? String(body.cep).trim().slice(0, 16) : null,
        uf: body.uf ? String(body.uf).trim().slice(0, 8) : null,
        pais: body.pais ? String(body.pais).trim().slice(0, 64) : 'BR',
        complemento: body.complemento ? String(body.complemento).trim().slice(0, 190) : null,
        referencia: body.referencia ? String(body.referencia).trim().slice(0, 190) : null,
        email: body.email ? String(body.email).trim().slice(0, 190) : null,
        telefones: body.telefones ? String(body.telefones).trim().slice(0, 190) : null,
        celulares: body.celulares ? String(body.celulares).trim().slice(0, 190) : null,
        fax: body.fax ? String(body.fax).trim().slice(0, 64) : null,
        observacao: body.observacao ? String(body.observacao).trim() : null,
        ativo: body.ativo !== false
      }
    );
    const affected = (r as { rowCount?: number })?.rowCount ?? (r as { affectedRows?: number })?.affectedRows ?? 0;
    if (!affected) return res.status(404).json({ message: 'Fornecedor não encontrado' });
    return res.json({ ok: true });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Fornecedor não encontrado' });
    throw e;
  }
}));

portalDataRouter.delete('/finance/suppliers/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  try {
    const [r] = await pool.query('DELETE FROM suppliers WHERE id = :id AND tenant_id = :tid', { id, tid });
    const affected = (r as { rowCount?: number })?.rowCount ?? (r as { affectedRows?: number })?.affectedRows ?? 0;
    if (!affected) return res.status(404).json({ message: 'Fornecedor não encontrado' });
    return res.json({ ok: true });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Fornecedor não encontrado' });
    throw e;
  }
}));

// ---- Finance: Plano de Contas (chart_of_accounts) ----
portalDataRouter.get('/finance/chart-of-accounts', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const tipo = (req.query.tipo as string)?.toUpperCase();
  const ativo = req.query.ativo as string | undefined;
  let sql = `SELECT id, tipo, codigo_financeiro, descricao, dre, dre_tipo, sici_conta, visivel, conta_plano,
             suspender_servico, cobranca_automatica, incluir_lucro_ajustado, incluir_sped_1601, incluir_nfse_lote,
             demonstrativo_boleto, ativo, created_at
             FROM chart_of_accounts WHERE tenant_id = :tid`;
  const params: Record<string, string | number> = { tid };
  if (tipo === 'RECEITA' || tipo === 'DESPESA') { sql += ' AND tipo = :tipo'; params.tipo = tipo; }
  if (ativo === '1') { sql += ' AND ativo = true'; }
  if (ativo === '0') { sql += ' AND ativo = false'; }
  sql += ' ORDER BY codigo_financeiro ASC LIMIT 500';
  try {
    const [rows] = await pool.query(sql, params);
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
}));

portalDataRouter.get('/finance/chart-of-accounts/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      'SELECT * FROM chart_of_accounts WHERE id = :id AND tenant_id = :tid LIMIT 1',
      { id, tid }
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return res.status(404).json({ message: 'Plano de contas não encontrado' });
    return res.json(list[0]);
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Plano de contas não encontrado' });
    throw e;
  }
}));

portalDataRouter.post('/finance/chart-of-accounts', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const tipo = String(body.tipo ?? 'DESPESA').toUpperCase();
  if (tipo !== 'RECEITA' && tipo !== 'DESPESA') return res.status(400).json({ message: 'Tipo deve ser RECEITA ou DESPESA' });
  const codigo_financeiro = String(body.codigo_financeiro ?? '').trim();
  const descricao = String(body.descricao ?? '').trim();
  if (!codigo_financeiro || !descricao) return res.status(400).json({ message: 'Código e descrição obrigatórios' });
  const pool = getPool();
  try {
    const [r] = await pool.query(
      `INSERT INTO chart_of_accounts (tenant_id, tipo, codigo_financeiro, descricao, dre, dre_tipo, sici_conta,
       visivel, conta_plano, suspender_servico, cobranca_automatica, incluir_lucro_ajustado, incluir_sped_1601,
       incluir_nfse_lote, demonstrativo_boleto, ativo)
       VALUES (:tid, :tipo, :codigo_financeiro, :descricao, :dre, :dre_tipo, :sici_conta, :visivel, :conta_plano,
       :suspender_servico, :cobranca_automatica, :incluir_lucro_ajustado, :incluir_sped_1601, :incluir_nfse_lote,
       :demonstrativo_boleto, :ativo) RETURNING id`,
      {
        tid,
        tipo,
        codigo_financeiro: codigo_financeiro.slice(0, 32),
        descricao: descricao.slice(0, 190),
        dre: body.dre ? String(body.dre).trim().slice(0, 64) : null,
        dre_tipo: body.dre_tipo ? String(body.dre_tipo).trim().slice(0, 64) : null,
        sici_conta: body.sici_conta ? String(body.sici_conta).trim().slice(0, 64) : null,
        visivel: body.visivel !== false,
        conta_plano: String(body.conta_plano ?? 'NORMAL').toUpperCase().slice(0, 32) || 'NORMAL',
        suspender_servico: !!body.suspender_servico,
        cobranca_automatica: !!body.cobranca_automatica,
        incluir_lucro_ajustado: !!body.incluir_lucro_ajustado,
        incluir_sped_1601: !!body.incluir_sped_1601,
        incluir_nfse_lote: !!body.incluir_nfse_lote,
        demonstrativo_boleto: body.demonstrativo_boleto ? String(body.demonstrativo_boleto).trim() : null,
        ativo: body.ativo !== false
      }
    );
    const id = (r as { insertId?: number })?.insertId;
    if (id == null) return res.status(500).json({ message: 'Erro ao criar plano de contas' });
    return res.status(201).json({ ok: true, id });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Tabela chart_of_accounts não disponível. Execute: node scripts/update-databases.mjs' });
    throw e;
  }
}));

portalDataRouter.put('/finance/chart-of-accounts/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const body = req.body || {};
  const tipo = String(body.tipo ?? 'DESPESA').toUpperCase();
  if (tipo !== 'RECEITA' && tipo !== 'DESPESA') return res.status(400).json({ message: 'Tipo deve ser RECEITA ou DESPESA' });
  const codigo_financeiro = String(body.codigo_financeiro ?? '').trim();
  const descricao = String(body.descricao ?? '').trim();
  if (!codigo_financeiro || !descricao) return res.status(400).json({ message: 'Código e descrição obrigatórios' });
  const pool = getPool();
  try {
    const [r] = await pool.query(
      `UPDATE chart_of_accounts SET tipo = :tipo, codigo_financeiro = :codigo_financeiro, descricao = :descricao,
       dre = :dre, dre_tipo = :dre_tipo, sici_conta = :sici_conta, visivel = :visivel, conta_plano = :conta_plano,
       suspender_servico = :suspender_servico, cobranca_automatica = :cobranca_automatica,
       incluir_lucro_ajustado = :incluir_lucro_ajustado, incluir_sped_1601 = :incluir_sped_1601,
       incluir_nfse_lote = :incluir_nfse_lote, demonstrativo_boleto = :demonstrativo_boleto, ativo = :ativo,
       updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid`,
      {
        id,
        tid,
        tipo,
        codigo_financeiro: codigo_financeiro.slice(0, 32),
        descricao: descricao.slice(0, 190),
        dre: body.dre ? String(body.dre).trim().slice(0, 64) : null,
        dre_tipo: body.dre_tipo ? String(body.dre_tipo).trim().slice(0, 64) : null,
        sici_conta: body.sici_conta ? String(body.sici_conta).trim().slice(0, 64) : null,
        visivel: body.visivel !== false,
        conta_plano: String(body.conta_plano ?? 'NORMAL').toUpperCase().slice(0, 32) || 'NORMAL',
        suspender_servico: !!body.suspender_servico,
        cobranca_automatica: !!body.cobranca_automatica,
        incluir_lucro_ajustado: !!body.incluir_lucro_ajustado,
        incluir_sped_1601: !!body.incluir_sped_1601,
        incluir_nfse_lote: !!body.incluir_nfse_lote,
        demonstrativo_boleto: body.demonstrativo_boleto ? String(body.demonstrativo_boleto).trim() : null,
        ativo: body.ativo !== false
      }
    );
    const affected = (r as { rowCount?: number })?.rowCount ?? (r as { affectedRows?: number })?.affectedRows ?? 0;
    if (!affected) return res.status(404).json({ message: 'Plano de contas não encontrado' });
    return res.json({ ok: true });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Plano de contas não encontrado' });
    throw e;
  }
}));

portalDataRouter.delete('/finance/chart-of-accounts/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  try {
    const [r] = await pool.query('DELETE FROM chart_of_accounts WHERE id = :id AND tenant_id = :tid', { id, tid });
    const affected = (r as { rowCount?: number })?.rowCount ?? (r as { affectedRows?: number })?.affectedRows ?? 0;
    if (!affected) return res.status(404).json({ message: 'Plano de contas não encontrado' });
    return res.json({ ok: true });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Plano de contas não encontrado' });
    throw e;
  }
}));

// ---- Finance: Contas a Pagar (payables) ----
portalDataRouter.get('/finance/payables', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const status = (req.query.status as string)?.toUpperCase();
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  let sql = `SELECT p.id, p.empresa, p.cidade, p.fornecedor_id, p.funcionario, p.tipo_documento, p.plano_contas_id,
             p.descricao, p.observacao, p.tipo_nota_fiscal, p.nota_fiscal, p.emissao, p.valor, p.valor_fixo,
             p.forma_pagamento, p.vencimento, p.competencia, p.tipo_parcelamento, p.parcelas, p.status, p.created_at,
             s.nome_razao AS fornecedor_nome, c.descricao AS plano_descricao
             FROM payables p
             LEFT JOIN suppliers s ON s.id = p.fornecedor_id AND s.tenant_id = p.tenant_id
             LEFT JOIN chart_of_accounts c ON c.id = p.plano_contas_id AND c.tenant_id = p.tenant_id
             WHERE p.tenant_id = :tid`;
  const params: Record<string, string | number | undefined> = { tid };
  if (status === 'ABERTO' || status === 'PAGO' || status === 'CANCELADO') { sql += ' AND p.status = :status'; params.status = status; }
  if (from) { sql += ' AND p.vencimento >= CAST(:from AS DATE)'; params.from = from; }
  if (to) { sql += ' AND p.vencimento <= CAST(:to AS DATE)'; params.to = to; }
  sql += ' ORDER BY p.vencimento ASC, p.id ASC LIMIT 500';
  try {
    const [rows] = await pool.query(sql, params);
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
}));

portalDataRouter.get('/finance/payables/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      'SELECT * FROM payables WHERE id = :id AND tenant_id = :tid LIMIT 1',
      { id, tid }
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return res.status(404).json({ message: 'Conta a pagar não encontrada' });
    return res.json(list[0]);
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Conta a pagar não encontrada' });
    throw e;
  }
}));

portalDataRouter.post('/finance/payables', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const descricao = String(body.descricao ?? '').trim();
  const vencimento = body.vencimento ? String(body.vencimento).trim().slice(0, 10) : null;
  const valor = Number(body.valor);
  if (!vencimento || isNaN(valor)) return res.status(400).json({ message: 'Vencimento e valor obrigatórios' });
  const pool = getPool();
  try {
    const [r] = await pool.query(
      `INSERT INTO payables (tenant_id, empresa, cidade, fornecedor_id, funcionario, tipo_documento, plano_contas_id,
       descricao, observacao, tipo_nota_fiscal, nota_fiscal, emissao, valor, valor_fixo, forma_pagamento,
       pix_qrcode, pix_copia_cola, linha_digitavel_boleto, vencimento, competencia, tipo_parcelamento, parcelas, status)
       VALUES (:tid, :empresa, :cidade, :fornecedor_id, :funcionario, :tipo_documento, :plano_contas_id,
       :descricao, :observacao, :tipo_nota_fiscal, :nota_fiscal, CAST(:emissao AS DATE), :valor, :valor_fixo,
       :forma_pagamento, :pix_qrcode, :pix_copia_cola, :linha_digitavel_boleto, CAST(:vencimento AS DATE),
       CAST(:competencia AS DATE), :tipo_parcelamento, :parcelas, COALESCE(:status, 'ABERTO')) RETURNING id`,
      {
        tid,
        empresa: body.empresa ? String(body.empresa).trim().slice(0, 190) : null,
        cidade: body.cidade ? String(body.cidade).trim().slice(0, 120) : null,
        fornecedor_id: body.fornecedor_id != null ? Number(body.fornecedor_id) : null,
        funcionario: body.funcionario ? String(body.funcionario).trim().slice(0, 190) : null,
        tipo_documento: body.tipo_documento ? String(body.tipo_documento).trim().slice(0, 64) : null,
        plano_contas_id: body.plano_contas_id != null ? Number(body.plano_contas_id) : null,
        descricao: descricao.slice(0, 255) || null,
        observacao: body.observacao ? String(body.observacao).trim() : null,
        tipo_nota_fiscal: body.tipo_nota_fiscal ? String(body.tipo_nota_fiscal).trim().slice(0, 32) : null,
        nota_fiscal: body.nota_fiscal ? String(body.nota_fiscal).trim().slice(0, 64) : null,
        emissao: body.emissao ? String(body.emissao).trim().slice(0, 10) : null,
        valor: isNaN(valor) ? 0 : valor,
        valor_fixo: !!body.valor_fixo,
        forma_pagamento: body.forma_pagamento ? String(body.forma_pagamento).trim().slice(0, 64) : null,
        pix_qrcode: body.pix_qrcode ? String(body.pix_qrcode).trim() : null,
        pix_copia_cola: body.pix_copia_cola ? String(body.pix_copia_cola).trim() : null,
        linha_digitavel_boleto: body.linha_digitavel_boleto ? String(body.linha_digitavel_boleto).trim().slice(0, 255) : null,
        vencimento,
        competencia: body.competencia ? String(body.competencia).trim().slice(0, 10) : null,
        tipo_parcelamento: body.tipo_parcelamento ? String(body.tipo_parcelamento).trim().slice(0, 64) : null,
        parcelas: body.parcelas != null ? Number(body.parcelas) : null,
        status: (body.status && ['ABERTO', 'PAGO', 'CANCELADO'].includes(String(body.status))) ? String(body.status) : 'ABERTO'
      }
    );
    const id = (r as { insertId?: number })?.insertId;
    if (id == null) return res.status(500).json({ message: 'Erro ao criar conta a pagar' });
    return res.status(201).json({ ok: true, id });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Tabela payables não disponível. Execute: node scripts/update-databases.mjs' });
    throw e;
  }
}));

portalDataRouter.put('/finance/payables/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const body = req.body || {};
  const pool = getPool();
  try {
    const [r] = await pool.query(
      `UPDATE payables SET empresa = :empresa, cidade = :cidade, fornecedor_id = :fornecedor_id, funcionario = :funcionario,
       tipo_documento = :tipo_documento, plano_contas_id = :plano_contas_id, descricao = :descricao, observacao = :observacao,
       tipo_nota_fiscal = :tipo_nota_fiscal, nota_fiscal = :nota_fiscal, emissao = CAST(:emissao AS DATE), valor = :valor,
       valor_fixo = :valor_fixo, forma_pagamento = :forma_pagamento, pix_qrcode = :pix_qrcode, pix_copia_cola = :pix_copia_cola,
       linha_digitavel_boleto = :linha_digitavel_boleto, vencimento = CAST(:vencimento AS DATE), competencia = CAST(:competencia AS DATE),
       tipo_parcelamento = :tipo_parcelamento, parcelas = :parcelas, status = :status, updated_at = CURRENT_TIMESTAMP
       WHERE id = :id AND tenant_id = :tid`,
      {
        id,
        tid,
        empresa: body.empresa != null ? String(body.empresa).trim().slice(0, 190) : null,
        cidade: body.cidade != null ? String(body.cidade).trim().slice(0, 120) : null,
        fornecedor_id: body.fornecedor_id != null ? Number(body.fornecedor_id) : null,
        funcionario: body.funcionario != null ? String(body.funcionario).trim().slice(0, 190) : null,
        tipo_documento: body.tipo_documento != null ? String(body.tipo_documento).trim().slice(0, 64) : null,
        plano_contas_id: body.plano_contas_id != null ? Number(body.plano_contas_id) : null,
        descricao: body.descricao != null ? String(body.descricao).trim().slice(0, 255) : null,
        observacao: body.observacao != null ? String(body.observacao).trim() : null,
        tipo_nota_fiscal: body.tipo_nota_fiscal != null ? String(body.tipo_nota_fiscal).trim().slice(0, 32) : null,
        nota_fiscal: body.nota_fiscal != null ? String(body.nota_fiscal).trim().slice(0, 64) : null,
        emissao: body.emissao ? String(body.emissao).trim().slice(0, 10) : null,
        valor: typeof body.valor === 'number' ? body.valor : Number(body.valor) || 0,
        valor_fixo: !!body.valor_fixo,
        forma_pagamento: body.forma_pagamento != null ? String(body.forma_pagamento).trim().slice(0, 64) : null,
        pix_qrcode: body.pix_qrcode != null ? String(body.pix_qrcode).trim() : null,
        pix_copia_cola: body.pix_copia_cola != null ? String(body.pix_copia_cola).trim() : null,
        linha_digitavel_boleto: body.linha_digitavel_boleto != null ? String(body.linha_digitavel_boleto).trim().slice(0, 255) : null,
        vencimento: body.vencimento ? String(body.vencimento).trim().slice(0, 10) : null,
        competencia: body.competencia ? String(body.competencia).trim().slice(0, 10) : null,
        tipo_parcelamento: body.tipo_parcelamento != null ? String(body.tipo_parcelamento).trim().slice(0, 64) : null,
        parcelas: body.parcelas != null ? Number(body.parcelas) : null,
        status: (body.status && ['ABERTO', 'PAGO', 'CANCELADO'].includes(String(body.status))) ? String(body.status) : 'ABERTO'
      }
    );
    const affected = (r as { rowCount?: number })?.rowCount ?? (r as { affectedRows?: number })?.affectedRows ?? 0;
    if (!affected) return res.status(404).json({ message: 'Conta a pagar não encontrada' });
    return res.json({ ok: true });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Conta a pagar não encontrada' });
    throw e;
  }
}));

portalDataRouter.patch('/finance/payables/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const id = Number(req.params.id);
  const tid = tenantId(req);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const body = req.body || {};
  const status = (body.status as string)?.toUpperCase();
  if (!status || !['ABERTO', 'PAGO', 'CANCELADO'].includes(status)) return res.status(400).json({ message: 'Status inválido' });
  const pool = getPool();
  try {
    const [r] = await pool.query(
      'UPDATE payables SET status = :status, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid',
      { id, tid, status }
    );
    const affected = (r as { rowCount?: number })?.rowCount ?? (r as { affectedRows?: number })?.affectedRows ?? 0;
    if (!affected) return res.status(404).json({ message: 'Conta a pagar não encontrada' });
    return res.json({ ok: true });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(404).json({ message: 'Conta a pagar não encontrada' });
    throw e;
  }
}));

// ---- Notifications queue (admin view) ----
portalDataRouter.get('/notifications', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const status = (req.query.status as string | undefined)?.toUpperCase();
  const pool = getPool();
  let sql = `SELECT id, tenant_id, customer_id, channel, type, to_address, status, created_at, sent_at, last_error
             FROM message_queue
             WHERE tenant_id = :tid`;
  const params: Record<string, string | number> = { tid };
  if (status && ['PENDING', 'SENT', 'ERROR'].includes(status)) {
    sql += ' AND status = :status';
    params.status = status;
  }
  sql += ' ORDER BY created_at DESC, id DESC LIMIT 200';
  let rows: unknown;
  try {
    [rows] = await pool.query(sql, params);
  } catch {
    rows = [];
  }
  return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
}));

// ---- Campaigns ----
portalDataRouter.get('/campaigns', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      'SELECT id, name, status, created_at FROM raffle_campaigns WHERE tenant_id = :tid OR tenant_id IS NULL ORDER BY id DESC LIMIT 50',
      { tid }
    );
    return res.json({ ok: true, campaigns: Array.isArray(rows) ? rows : [] });
  } catch {
    const [rows] = await pool.query(
      'SELECT id, name, status, created_at FROM raffle_campaigns ORDER BY id DESC LIMIT 50'
    );
    return res.json({ ok: true, campaigns: Array.isArray(rows) ? rows : [] });
  }
}));

portalDataRouter.post('/campaigns', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const name = String(req.body?.name ?? 'Nova Campanha').trim();
  if (!name) return res.status(400).json({ message: 'Nome obrigatório' });
  const pool = getPool();
  try {
    const [r] = await pool.query(
      "INSERT INTO raffle_campaigns (name, status, tenant_id) VALUES (:name, 'ACTIVE', :tid) RETURNING id",
      { name, tid }
    );
    const ins = r as { insertId: number };
    return res.json({ ok: true, id: ins.insertId });
  } catch {
    const [r] = await pool.query(
      "INSERT INTO raffle_campaigns (name, status) VALUES (:name, 'ACTIVE') RETURNING id",
      { name }
    );
    const ins = r as { insertId: number };
    return res.json({ ok: true, id: ins.insertId });
  }
}));

// ---- Stand ----
portalDataRouter.get('/stand', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT re.id, re.entry_number, re.created_at, c.name, c.whatsapp, rc.name AS campaign
     FROM raffle_entries re
     JOIN customers c ON c.id = re.customer_id AND c.tenant_id = :tid
     JOIN raffle_campaigns rc ON rc.id = re.campaign_id
     WHERE re.source = 'STAND'
     ORDER BY re.id DESC
     LIMIT 1000`,
    { tid }
  );
  return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
}));

// ---- Winners ----
portalDataRouter.get('/winners', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const campaignId = Number(req.query.campaignId ?? 0);
  const pool = getPool();
  let sql = `SELECT rw.id, rw.prize, rw.created_at, c.name, c.whatsapp, rc.name AS campaign
     FROM raffle_winners rw
     JOIN customers c ON c.id = rw.customer_id AND c.tenant_id = :tid
     JOIN raffle_campaigns rc ON rc.id = rw.campaign_id`;
  const params: Record<string, number> = { tid };
  if (campaignId) { sql += ' WHERE rw.campaign_id = :cid'; params.cid = campaignId; }
  sql += ' ORDER BY rw.id DESC LIMIT 1000';
  const [rows] = await pool.query(sql, params);
  return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
}));

// ---- Raffles ----
portalDataRouter.get('/raffles/active', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      "SELECT id, name, status, created_at FROM raffle_campaigns WHERE status = 'ACTIVE' AND (tenant_id = :tid OR tenant_id IS NULL) ORDER BY id DESC LIMIT 1",
      { tid }
    );
    const list = Array.isArray(rows) ? rows : [];
    return res.json({ ok: true, campaign: list[0] ?? null });
  } catch {
    const [rows] = await pool.query(
      "SELECT id, name, status, created_at FROM raffle_campaigns WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1"
    );
    const list = Array.isArray(rows) ? rows : [];
    return res.json({ ok: true, campaign: list[0] ?? null });
  }
}));

portalDataRouter.post('/raffles/:campaignId/draw', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const campaignId = Number(req.params.campaignId);
  const tid = tenantId(req);
  const prize = String(req.body?.prize ?? 'Prêmio');
  if (!campaignId) return res.status(400).json({ message: 'campaignId inválido' });

  const pool = getPool();

  const [campCheck] = await pool.query(
    'SELECT id FROM raffle_campaigns WHERE id = :cid AND (tenant_id = :tid OR tenant_id IS NULL) LIMIT 1',
    { cid: campaignId, tid }
  );
  if (!Array.isArray(campCheck) || campCheck.length === 0) {
    return res.status(404).json({ message: 'Campanha não encontrada' });
  }

  const [pick] = await pool.query(
    `SELECT re.customer_id
     FROM raffle_entries re
     INNER JOIN customers c ON c.id = re.customer_id AND c.tenant_id = :tid
     LEFT JOIN raffle_winners rw ON rw.campaign_id = re.campaign_id AND rw.customer_id = re.customer_id
     WHERE re.campaign_id = :cid AND rw.id IS NULL
     ORDER BY RAND()
     LIMIT 1`,
    { tid, cid: campaignId }
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
     JOIN raffle_campaigns rc ON rc.id = :camp
     WHERE c.id = :cust LIMIT 1`,
    { camp: campaignId, cust: customerId, prize }
  );
  const winnerList = Array.isArray(winner) ? winner : [];

  return res.json({ ok: true, winner: winnerList[0] ?? null });
}));

// ---- Clube page (global; clube_page_config has no tenant_id) ----
portalDataRouter.get('/clube-page', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  let config: unknown;
  try {
    const [rows] = await pool.query('SELECT config_json FROM clube_page_config WHERE id = 1 LIMIT 1');
    const list = Array.isArray(rows) ? rows : [];
    if (list.length) {
      const row = list[0] as { config_json: string | object };
      config = typeof row.config_json === 'string' ? JSON.parse(row.config_json as string) : row.config_json;
    }
  } catch {
    config = null;
  }
  if (!config || typeof config !== 'object') {
    return res.json({ ok: true, config: null, message: 'Execute sql/clube_page_config.sql para criar a tabela.' });
  }
  return res.json({ ok: true, config });
}));

portalDataRouter.put('/clube-page', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
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

// ---- Upload de logo (portal) ----
const webUploadsDir = path.join(process.cwd(), 'web', 'uploads');
function ensureUploadsDir(): void {
  try {
    fs.mkdirSync(webUploadsDir, { recursive: true });
  } catch {
    // ignora
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

portalDataRouter.post('/upload-logo', (req: Request, res: Response, next: () => void) => {
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

// ---- Provider settings (dados do provedor por tenant) ----
portalDataRouter.get('/provider', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
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
      { tid }
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      return res.json({
        ok: true,
        settings: {
          fantasy_name: null,
          legal_name: null,
          document: null,
          ie: null,
          im: null,
          whatsapp: null,
          phone: null,
          email: null,
          website: null,
          street: null,
          number: null,
          complement: null,
          neighborhood: null,
          city: null,
          state: null,
          zip: null,
          logo_portal: null,
          logo_site: null,
          logo_receipt: null,
          color_primary: null,
          color_accent: null,
          short_name: null,
          timezone: null
        }
      });
    }
    return res.json({ ok: true, settings: list[0] });
  } catch (e) {
    if (isTableNotFoundError(e)) {
      return res.status(503).json({ ok: false, message: 'Tabela provider_settings não existe. Execute sql/provider_settings.sql.' });
    }
    throw e;
  }
}));

portalDataRouter.put('/provider', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
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

  if (!fantasyName && !legalName) {
    return res.status(400).json({ message: 'Informe pelo menos o nome fantasia ou razão social.' });
  }

  const pool = getPool();
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
        tid,
        fantasyName,
        legalName,
        document,
        ie,
        im,
        whatsapp,
        phone,
        email,
        website,
        street,
        number,
        complement,
        neighborhood,
        city,
        state,
        zip,
        logoPortal,
        logoSite,
        logoReceipt,
        colorPrimary,
        colorAccent,
        shortName,
        timezone
      }
    );
    return res.json({ ok: true });
  } catch (e) {
    if (isTableNotFoundError(e)) {
      return res.status(503).json({ ok: false, message: 'Tabela provider_settings não existe. Execute sql/provider_settings.sql.' });
    }
    throw e;
  }
}));

// ---- Receipt templates (modelos de recibos / documentos) ----
portalDataRouter.get('/receipt-templates', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      'SELECT template_key, name, description, body FROM receipt_templates WHERE tenant_id = :tid ORDER BY template_key',
      { tid }
    );
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
}));

portalDataRouter.get('/receipt-templates/:key', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const key = String(req.params.key || '').trim();
  if (!key) return res.status(400).json({ message: 'template_key inválido' });
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      'SELECT template_key, name, description, body FROM receipt_templates WHERE tenant_id = :tid AND template_key = :key LIMIT 1',
      { tid, key }
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      return res.json({
        ok: true,
        template: {
          template_key: key,
          name: '',
          description: '',
          body: ''
        }
      });
    }
    return res.json({ ok: true, template: list[0] });
  } catch (e) {
    if (isTableNotFoundError(e)) {
      return res.status(503).json({ ok: false, message: 'Tabela receipt_templates não existe. Execute sql/receipt_templates.pg.sql.' });
    }
    throw e;
  }
}));

portalDataRouter.put('/receipt-templates/:key', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const key = String(req.params.key || '').trim();
  if (!key) return res.status(400).json({ message: 'template_key inválido' });
  const body = req.body || {};
  const name = String(body.name || '').trim() || key;
  const description = body.description != null ? String(body.description).trim() || null : null;
  const tplBody = String(body.body || '').trim();
  if (!tplBody) return res.status(400).json({ message: 'body do modelo é obrigatório' });
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO receipt_templates (tenant_id, template_key, name, description, body)
       VALUES (:tid, :key, :name, :description, :body)
       ON CONFLICT (tenant_id, template_key) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         body = EXCLUDED.body,
         updated_at = CURRENT_TIMESTAMP`,
      { tid, key, name, description, body: tplBody }
    );
    return res.json({ ok: true });
  } catch (e) {
    if (isTableNotFoundError(e)) {
      return res.status(503).json({ ok: false, message: 'Tabela receipt_templates não existe. Execute sql/receipt_templates.pg.sql.' });
    }
    throw e;
  }
}));

// ---- RADIUS: status, sessões online, estatísticas, disconnect, auth failures ----
/** GET /api/portal/radius/status — Indica se o RADIUS está online (banco acessível) ou parado */
portalDataRouter.get('/radius/status', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const tid = tenantId(_req);
  const identity = await getRadiusInstallationIdentity(pool, tid);
  const serviceUnit = getRadiusServiceUnit(identity);
  const systemdActive = isSystemdUnitActive(serviceUnit);
  const udpListening = isRadiusUdpListening();
  try {
    await pool.query('SELECT 1 FROM radacct LIMIT 1');
    const serviceRunning = systemdActive || udpListening;
    const serviceLabel = systemdActive
      ? `${serviceUnit} (systemd)`
      : udpListening
        ? 'FreeRADIUS (UDP 1812/1813)'
        : serviceUnit;
    return res.json({
      status: serviceRunning ? 'online' : 'stopped',
      message: serviceRunning
        ? `${identity.providerName}: ${serviceLabel} em execução e banco RADIUS acessível.`
        : `Serviço ${serviceUnit} não está ativo.`,
      db_ok: true,
      service_running: serviceRunning,
      service_status: systemdActive ? 'active (systemd)' : (udpListening ? 'listening (udp)' : 'inactive'),
      service_name: serviceUnit,
      provider_name: identity.providerName,
      provider_fantasy_name: identity.fantasyName,
      provider_short_name: identity.shortName,
      provider_legal_name: identity.legalName,
      radius_mode: isStandalone() ? 'standalone' : 'tenant',
      standalone: isStandalone(),
    });
  } catch (e) {
    if (isTableNotFoundError(e)) {
      const serviceRunning = systemdActive || udpListening;
      const serviceLabel = systemdActive
        ? `${serviceUnit} (systemd)`
        : udpListening
          ? 'FreeRADIUS (UDP 1812/1813)'
          : serviceUnit;
      return res.json({
        status: 'stopped',
        message: serviceRunning
          ? `${identity.providerName}: ${serviceLabel} está ativo, mas a tabela radacct não existe.`
          : `Serviço ${serviceUnit} não está ativo.`,
        db_ok: false,
        service_running: serviceRunning,
        service_status: systemdActive ? 'active (systemd)' : (udpListening ? 'listening (udp)' : 'inactive'),
        service_name: serviceUnit,
        provider_name: identity.providerName,
        provider_fantasy_name: identity.fantasyName,
        provider_short_name: identity.shortName,
        provider_legal_name: identity.legalName,
        radius_mode: isStandalone() ? 'standalone' : 'tenant',
        standalone: isStandalone(),
      });
    }
    return res.json({
      status: 'stopped',
      message: 'Banco RADIUS inacessível.',
      db_ok: false,
      service_running: systemdActive || udpListening,
      service_status: systemdActive ? 'active (systemd)' : (udpListening ? 'listening (udp)' : 'inactive'),
      service_name: serviceUnit,
      provider_name: identity.providerName,
      provider_fantasy_name: identity.fantasyName,
      provider_short_name: identity.shortName,
      provider_legal_name: identity.legalName,
      radius_mode: isStandalone() ? 'standalone' : 'tenant',
      standalone: isStandalone(),
    });
  }
}));

/** GET /api/portal/radius/init-status — Inicialização do FreeRADIUS: banco OK, serviço (systemd ou container) rodando */
portalDataRouter.get('/radius/init-status', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const tid = tenantId(req);
  const identity = await getRadiusInstallationIdentity(pool, tid);
  const slug = (req.tenant?.slug || process.env.TENANT_SLUG || process.env.TENANT || '').toString().trim();
  let standalone = isStandalone();
  const containerName = standalone ? '' : (slug ? `radius_${slug}` : '');
  const serviceUnit = getRadiusServiceUnit(identity);
  const udpListening = isRadiusUdpListening();

  let dbOk = false;
  try {
    await pool.query('SELECT 1 FROM radacct LIMIT 1');
    dbOk = true;
  } catch (e) {
    if (!isTableNotFoundError(e)) throw e;
  }

  let containerRunning = false;
  let containerStatus = 'unknown';
  let containerError: string | undefined;
  let radiusViaSystemd = false;

  if (standalone) {
    try {
      const out = execSync(`systemctl is-active ${serviceUnit}`, { encoding: 'utf8' });
      if (out.trim() === 'active') {
        containerRunning = true;
        containerStatus = 'active (systemd)';
        radiusViaSystemd = true;
      } else {
        containerStatus = out.trim() || 'inactive';
      }
    } catch {
      containerStatus = 'inactive';
      containerError = 'Serviço freeradius-standalone não está ativo.';
    }
  } else if (slug) {
    try {
      const out = execSync(`systemctl is-active ${serviceUnit}`, { encoding: 'utf8' });
      if (out.trim() === 'active') {
        containerRunning = true;
        containerStatus = 'active (systemd)';
        radiusViaSystemd = true;
      } else {
        containerStatus = out.trim() || 'inactive';
      }
    } catch {
      try {
        const st = await dockerContainerStatus(containerName);
        containerRunning = st.running;
        containerStatus = st.status;
        containerError = st.error;
      } catch {
        containerStatus = 'unavailable';
      }
    }
  }

  if (!containerRunning && udpListening) {
    containerRunning = true;
    containerStatus = 'listening (udp)';
  }

  let initOk = false;
  let initMessage = '';
  let dockerCliUnavailable = false;
  let networkReachable: boolean | undefined;
  const initHints: string[] = [];

  if (!standalone && containerName) {
    try {
      await lookup(containerName, { family: 4, all: false });
      networkReachable = true;
    } catch {
      networkReachable = false;
    }
  }

  if (containerRunning) {
    if (radiusViaSystemd) {
      initOk = true;
      initMessage = standalone
        ? `FreeRADIUS (${serviceUnit}) em execução no host e pronto para processar requisições.`
        : `FreeRADIUS (${serviceUnit}) em execução no host e pronto para processar requisições.`;
    } else if (udpListening) {
      initOk = true;
      initMessage = 'FreeRADIUS escutando em UDP 1812/1813 e pronto para processar requisições.';
    } else if (!standalone) {
      try {
        const logResult = await dockerLogs(containerName, 80);
        const fullLog = ((logResult.stdout || '') + '\n' + (logResult.stderr || '')).toLowerCase();
        if (
          fullLog.includes('ready to process requests') ||
          fullLog.includes('listening on') ||
          fullLog.includes('ready to process')
        ) {
          initOk = true;
          initMessage = 'FreeRADIUS iniciado e pronto para processar requisições.';
        } else if (fullLog.includes('error') || fullLog.includes('failed') || fullLog.includes('fatal')) {
          initMessage = 'Logs indicam erros no startup. Verifique a aba Logs do RADIUS.';
          initHints.push('Verifique os logs na seção "Servidor RADIUS & Logs" abaixo.');
        } else {
          initMessage = 'Container em execução. Inicialização em andamento ou logs não disponíveis.';
        }
      } catch {
        initMessage = 'Não foi possível ler os logs do container.';
      }
    }
  } else {
    if (standalone) {
      initMessage = `FreeRADIUS não está rodando. No host: systemctl start ${serviceUnit} (ou confira se o serviço existe).`;
      initHints.push(`No host: systemctl status ${serviceUnit} e journalctl -u ${serviceUnit} -f`);
    } else if (containerName) {
      const errLower = (containerError || '').toLowerCase();
      dockerCliUnavailable =
        containerStatus === 'error' &&
        (containerError?.includes('ENOENT') || (errLower.includes('docker') && (errLower.includes('not found') || errLower.includes('enoent'))));
      if (dockerCliUnavailable) {
        initMessage = `FreeRADIUS no host: verifique com systemctl status ${serviceUnit}.`;
        initHints.push(`No host: systemctl status ${serviceUnit} e journalctl -u ${serviceUnit} -f`);
      } else {
        initMessage = containerStatus === 'not_found' || containerStatus === 'unavailable'
          ? `FreeRADIUS não está rodando. No host: systemctl start ${serviceUnit} (ou confira se o serviço existe).`
          : `Status: ${containerStatus}.`;
        if (containerError && !containerError.includes('ENOENT')) initHints.push(containerError);
      }
    } else {
      initMessage = 'Slug do tenant não definido; não é possível verificar o container.';
    }
  }

  return res.json({
    ok: true,
    provider_name: identity.providerName,
    provider_fantasy_name: identity.fantasyName,
    provider_short_name: identity.shortName,
    provider_legal_name: identity.legalName,
    radius_service: serviceUnit,
    db_ok: dbOk,
    container_running: containerRunning,
    container_status: containerStatus,
    docker_cli_unavailable: dockerCliUnavailable,
    network_reachable: networkReachable,
    init_ok: initOk,
    init_message: initMessage,
    init_hints: initHints.length ? initHints : undefined,
    standalone,
  });
}));

/** GET /api/portal/radius/online — Clientes conectados (radacct com acctstoptime IS NULL) + nome NAS e grupo */
portalDataRouter.get('/radius/online', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  let rows: unknown[] = [];
  try {
    const [r] = await pool.query(
      `SELECT a.username, a.framedipaddress,
              regexp_replace(a.nasipaddress::text, '/.*$', '') AS nasipaddress,
              a.acctstarttime, a.acctsessiontime,
              a.acctinputoctets, a.acctoutputoctets, a.acctsessionid, a.acctuniqueid,
              a.groupname, a.acctupdatetime,
              n.shortname AS nas_shortname, n.description AS nas_description
       FROM radacct a
       LEFT JOIN nas n ON n.nasname = regexp_replace(a.nasipaddress::text, '/.*$', '')
       WHERE a.acctstoptime IS NULL ORDER BY a.acctstarttime DESC LIMIT 500`
    );
    rows = Array.isArray(r) ? r : [];
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    if (isColumnNotFoundError(e)) {
      const [fallback] = await pool.query(
        `SELECT username, framedipaddress, nasipaddress, acctstarttime, acctsessiontime,
                acctinputoctets, acctoutputoctets, acctsessionid, acctuniqueid
         FROM radacct WHERE acctstoptime IS NULL ORDER BY acctstarttime DESC LIMIT 500`
      );
      return res.json({ ok: true, rows: Array.isArray(fallback) ? fallback : [] });
    }
    throw e;
  }
  return res.json({ ok: true, rows });
}));

/** GET /api/portal/radius/stats — Estatísticas da rede (online, tráfego hoje, pico simultâneo, total usuários RADIUS) */
portalDataRouter.get('/radius/stats', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const today = new Date().toISOString().slice(0, 10);
  let online = 0;
  let trafficToday = { input: 0, output: 0 };
  let peakToday = 0;
  let peakConcurrent = 0;
  let totalUsers = 0;
  try {
    const [onRows] = await pool.query(
      'SELECT COUNT(*)::int AS c FROM radacct WHERE acctstoptime IS NULL'
    );
    online = (Array.isArray(onRows) && onRows[0]) ? (onRows[0] as { c: number }).c : 0;

    const [trafficRows] = await pool.query(
      `SELECT COALESCE(SUM(acctinputoctets), 0)::bigint AS input, COALESCE(SUM(acctoutputoctets), 0)::bigint AS output
       FROM radacct WHERE acctstarttime >= :today::date AND acctstarttime < (:today::date + interval '1 day')`,
      { today }
    );
    const tr = Array.isArray(trafficRows) && trafficRows[0] ? (trafficRows[0] as { input: string; output: string }) : null;
    if (tr) {
      trafficToday = { input: Number(tr.input) || 0, output: Number(tr.output) || 0 };
    }

    const [peakRows] = await pool.query(
      `SELECT COUNT(*)::int AS c FROM radacct
       WHERE acctstarttime >= :today::date AND acctstarttime < (:today::date + interval '1 day')`,
      { today }
    );
    peakToday = (Array.isArray(peakRows) && peakRows[0]) ? (peakRows[0] as { c: number }).c : 0;

    try {
      const [peakConcurrentRows] = await pool.query(
        `WITH ev AS (
          SELECT acctstarttime AS ts, 1 AS delta FROM radacct
          WHERE acctstarttime >= :today::date AND acctstarttime < (:today::date + interval '1 day')
          UNION ALL
          SELECT COALESCE(acctstoptime, CURRENT_TIMESTAMP), -1 FROM radacct
          WHERE (acctstarttime >= :today::date AND acctstarttime < (:today::date + interval '1 day'))
            AND (acctstoptime IS NULL OR (acctstoptime >= :today::date AND acctstoptime < (:today::date + interval '1 day')))
        )
        SELECT COALESCE(MAX(SUM(delta) OVER (ORDER BY ts, delta DESC)), 0)::int AS peak FROM ev`
      );
      peakConcurrent = (Array.isArray(peakConcurrentRows) && peakConcurrentRows[0])
        ? (peakConcurrentRows[0] as { peak: number }).peak
        : peakToday;
    } catch {
      peakConcurrent = peakToday;
    }

    try {
      const [userRows] = await pool.query(
        `SELECT COUNT(DISTINCT username)::int AS c FROM (
          SELECT username FROM radcheck WHERE username IS NOT NULL AND username != ''
          UNION
          SELECT username FROM radusergroup WHERE username IS NOT NULL AND username != ''
        ) u`
      );
      totalUsers = (Array.isArray(userRows) && userRows[0]) ? (userRows[0] as { c: number }).c : 0;
    } catch {
      totalUsers = 0;
    }
  } catch (e) {
    if (isTableNotFoundError(e)) {
      return res.json({
        ok: true,
        online: 0,
        trafficToday: { input: 0, output: 0 },
        peakToday: 0,
        peakConcurrent: 0,
        totalUsers: 0,
      });
    }
    throw e;
  }
  return res.json({
    ok: true,
    online,
    trafficToday,
    peakToday,
    peakConcurrent: peakConcurrent || peakToday,
    totalUsers,
  });
}));

/** GET /api/portal/radius/summary — Resumo para o provedor: usuários por grupo, sessões hoje, etc. */
portalDataRouter.get('/radius/summary', asyncHandler(async (_req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const today = new Date().toISOString().slice(0, 10);
  const out: {
    totalUsers: number;
    usersByGroup: { groupname: string; count: number }[];
    sessionsStartedToday: number;
    sessionsEndedToday: number;
  } = { totalUsers: 0, usersByGroup: [], sessionsStartedToday: 0, sessionsEndedToday: 0 };
  try {
    const [userRows] = await pool.query(
      `SELECT COUNT(DISTINCT username)::int AS c FROM (
        SELECT username FROM radcheck WHERE username IS NOT NULL AND username != ''
        UNION
        SELECT username FROM radusergroup WHERE username IS NOT NULL AND username != ''
      ) u`
    );
    out.totalUsers = (Array.isArray(userRows) && userRows[0]) ? (userRows[0] as { c: number }).c : 0;

    const [groupRows] = await pool.query(
      `SELECT groupname, COUNT(*)::int AS count FROM radusergroup
       WHERE groupname IS NOT NULL AND groupname != '' GROUP BY groupname ORDER BY count DESC LIMIT 50`
    );
    out.usersByGroup = Array.isArray(groupRows) ? (groupRows as { groupname: string; count: number }[]) : [];

    const [startRows] = await pool.query(
      `SELECT COUNT(*)::int AS c FROM radacct
       WHERE acctstarttime >= :today::date AND acctstarttime < (:today::date + interval '1 day')`,
      { today }
    );
    out.sessionsStartedToday = (Array.isArray(startRows) && startRows[0]) ? (startRows[0] as { c: number }).c : 0;

    const [endRows] = await pool.query(
      `SELECT COUNT(*)::int AS c FROM radacct
       WHERE acctstoptime >= :today::date AND acctstoptime < (:today::date + interval '1 day')`,
      { today }
    );
    out.sessionsEndedToday = (Array.isArray(endRows) && endRows[0]) ? (endRows[0] as { c: number }).c : 0;
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, ...out });
    throw e;
  }
  return res.json({ ok: true, ...out });
}));

/** GET /api/portal/radius/user/:username — Informações do usuário no RADIUS (radcheck, radreply, grupo, última sessão) */
portalDataRouter.get('/radius/user/:username', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const username = (req.params.username ?? '').toString().trim();
  if (!username) return res.status(400).json({ message: 'username é obrigatório' });
  const pool = getPool();
  const result: {
    username: string;
    radcheck: { attribute: string; op: string; value: string }[];
    radreply: { attribute: string; op: string; value: string }[];
    groups: { groupname: string; priority: number }[];
    lastSession: Record<string, unknown> | null;
    onlineNow: boolean;
  } = {
    username,
    radcheck: [],
    radreply: [],
    groups: [],
    lastSession: null,
    onlineNow: false,
  };
  try {
    const [checkRows] = await pool.query(
      'SELECT attribute, op, value FROM radcheck WHERE username = :username',
      { username }
    );
    result.radcheck = Array.isArray(checkRows) ? (checkRows as { attribute: string; op: string; value: string }[]) : [];

    const [replyRows] = await pool.query(
      'SELECT attribute, op, value FROM radreply WHERE username = :username',
      { username }
    );
    result.radreply = Array.isArray(replyRows) ? (replyRows as { attribute: string; op: string; value: string }[]) : [];

    const [groupRows] = await pool.query(
      'SELECT groupname, priority FROM radusergroup WHERE username = :username ORDER BY priority',
      { username }
    );
    result.groups = Array.isArray(groupRows) ? (groupRows as { groupname: string; priority: number }[]) : [];

    const [lastRows] = await pool.query(
      `SELECT radacctid, acctsessionid, acctstarttime, acctstoptime, acctsessiontime, acctinputoctets, acctoutputoctets,
              nasipaddress, framedipaddress, groupname, acctterminatecause
       FROM radacct WHERE username = :username ORDER BY acctstarttime DESC LIMIT 1`,
      { username }
    );
    const lastList = Array.isArray(lastRows) ? lastRows : [];
    if (lastList.length) {
      const row = lastList[0] as Record<string, unknown>;
      result.lastSession = row;
      result.onlineNow = row.acctstoptime == null;
    }
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, ...result });
    throw e;
  }
  return res.json({ ok: true, ...result });
}));

/** GET /api/portal/radius/auth-failures — Últimas falhas de autenticação (radpostauth do tenant) */
portalDataRouter.get('/radius/auth-failures', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));
  let rows: unknown[] = [];
  let client: import('pg').Client | null = null;
  try {
    client = await getTenantDbClient(tid);
    if (client) {
      const r = await client.query(
        `SELECT id, username, reply, calledstationid, callingstationid, authdate
         FROM radpostauth ORDER BY authdate DESC LIMIT $1`,
        [limit]
      );
      rows = Array.isArray(r?.rows) ? r.rows : [];
    } else {
      const [r] = await getPool().query(
        `SELECT id, username, reply, calledstationid, callingstationid, authdate
         FROM radpostauth ORDER BY authdate DESC LIMIT :limit`,
        { limit }
      );
      rows = Array.isArray(r) ? r : [];
    }
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
  return res.json({ ok: true, rows });
}));

portalDataRouter.post('/radius/restart', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const radius = await readPortalRadiusConfig(pool, tid);
  const unit = radius.radiusService;
  try {
    execSync(`systemctl restart ${unit}`, { stdio: 'pipe' });
    return res.json({ ok: true, message: `Serviço ${unit} reiniciado com sucesso.`, service_name: unit });
  } catch (e) {
    const err = e as { message?: string; stderr?: string };
    const msg = err.stderr || err.message || `Falha ao reiniciar ${unit}.`;
    return res.status(500).json({
      ok: false,
      message: msg,
      service_name: unit,
      provider_name: radius.providerName,
    });
  }
}));

portalDataRouter.post('/radius/test', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!username) return res.status(400).json({ success: false, message: 'Informe o usuário.' });

  const tid = tenantId(req);
  const pool = getPool();
  const radius = await readPortalRadiusConfig(pool, tid);
  if (!radius.radiusHost || !radius.radiusSecret) {
    return res.json({ success: false, message: 'RADIUS não configurado nesta instalação.' });
  }

  const result = await authenticateWithConfig(
    {
      host: radius.radiusHost,
      port: Number(radius.radiusPort || 1812),
      secret: radius.radiusSecret,
      nasIp: radius.radiusNasIp || undefined,
    },
    username,
    password
  );

  if (result.success) {
    return res.json({
      success: true,
      message: `RADIUS (${radius.providerName}) respondeu Access-Accept.`,
      provider_name: radius.providerName,
      service_name: radius.radiusService,
    });
  }

  let message = result.message || 'Autenticação rejeitada.';
  let client: Awaited<ReturnType<typeof getTenantDbClient>> | null = null;
  try {
    client = await getTenantDbClient(tid);
    if (client) {
      try {
        const q = await client.query(
          'SELECT attribute, value FROM radcheck WHERE username = $1',
          [username]
        );
        const rows = Array.isArray(q?.rows) ? q.rows as { attribute: string }[] : [];
        const inRadcheck = rows.length > 0;
        const hasPassword = rows.some((row: { attribute: string }) => row.attribute === 'Cleartext-Password');
        if (!inRadcheck) {
          message = 'Usuário não está no RADIUS desta instalação. Cadastre a instalação no Portal do Provedor (Clientes → instalação) com usuário e senha PPPoE e salve.';
        } else if (!hasPassword) {
          message = 'Usuário está no RADIUS mas sem senha definida. Defina a senha PPPoE na instalação do cliente e salve.';
        } else {
          message = 'Usuário existe no RADIUS; a senha digitada não confere. Use exatamente a senha PPPoE da instalação do cliente.';
        }
      } catch (queryErr: unknown) {
        const code = (queryErr as { code?: string })?.code;
        if (code === '42P01' || code === 'ER_NO_SUCH_TABLE') {
          message = 'RADIUS rejeitou. A tabela radcheck pode não existir no banco desta instalação.';
        }
      }
    } else {
      message = 'RADIUS rejeitou. Não foi possível consultar o banco desta instalação.';
    }
  } catch {
    message = 'RADIUS rejeitou. Não foi possível consultar o banco desta instalação.';
  } finally {
    if (client) {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  return res.json({
    success: false,
    message,
    provider_name: radius.providerName,
    service_name: radius.radiusService,
  });
}));

/** POST /api/portal/radius/apply-quota — Aplica franquia: quem excedeu vai para grupo reduzido (radacct) */
portalDataRouter.post('/radius/apply-quota', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  try {
    await ensureReduzidoGroup(pool);
  } catch (_) { /* tabelas RADIUS podem não existir */ }

  let plansWithQuota: { code: string; quota_gb: number; quota_period: string; quota_exceeded_group: string }[] = [];
  try {
    const [rows] = await pool.query(
      `SELECT code, quota_gb, quota_period, COALESCE(quota_exceeded_group, 'reduzido_10m') AS quota_exceeded_group
       FROM plans WHERE quota_gb IS NOT NULL AND quota_gb > 0 AND (tenant_id = :tid OR tenant_id IS NULL)`,
      { tid }
    );
    plansWithQuota = Array.isArray(rows) ? (rows as { code: string; quota_gb: number; quota_period: string; quota_exceeded_group: string }[]) : [];
  } catch {
    return res.json({ ok: true, applied: 0, reduced: 0, restored: 0, message: 'Coluna quota_gb não existe. Execute sql/radius_advanced.pg.sql' });
  }

  if (!plansWithQuota.length) return res.json({ ok: true, applied: 0, reduced: 0, restored: 0 });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';
  const dayOfWeek = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  let reduced = 0;
  let restored = 0;

  for (const plan of plansWithQuota) {
    const quotaBytes = Number(plan.quota_gb) * 1e9;
    const period = String(plan.quota_period || 'monthly').toLowerCase();
    const startDate = period === 'daily' ? today : period === 'weekly' ? weekStartStr : monthStart;
    const endDate = period === 'daily' ? today : period === 'weekly' ? today : today;

    const [instRows] = await pool.query(
      `SELECT i.pppoe_user FROM installations i
       JOIN customers c ON c.id = i.customer_id AND c.tenant_id = :tid
       WHERE i.plan_code = :planCode AND i.status = 'ACTIVE' AND i.pppoe_user IS NOT NULL AND i.pppoe_user != ''`,
      { tid, planCode: plan.code }
    );
    const users = Array.isArray(instRows) ? (instRows as { pppoe_user: string }[]) : [];
    for (const u of users) {
      const username = String(u.pppoe_user || '').trim();
      if (!username) continue;
      let sumBytes = 0;
      try {
        const [sumRows] = await pool.query(
          `SELECT COALESCE(SUM(acctinputoctets), 0)::bigint + COALESCE(SUM(acctoutputoctets), 0)::bigint AS total
           FROM radacct WHERE username = :username
             AND acctstarttime >= :startDate::date AND acctstarttime < (:endDate::date + interval '1 day')`,
          { username, startDate, endDate }
        );
        const row = Array.isArray(sumRows) && sumRows[0] ? (sumRows[0] as { total: string }) : null;
        sumBytes = row ? Number(row.total) || 0 : 0;
      } catch {
        continue;
      }
      const overQuota = sumBytes >= quotaBytes;
      const groupName = overQuota ? String(plan.quota_exceeded_group || 'reduzido_10m').trim() : plan.code;
      try {
        await pool.query('DELETE FROM radusergroup WHERE username = :username', { username });
        await pool.query(
          'INSERT INTO radusergroup (username, groupname, priority) VALUES (:username, :groupname, 1)',
          { username, groupname: groupName }
        );
        if (overQuota) reduced++;
        else restored++;
      } catch (_) { /* ignore */ }
    }
  }
  return res.json({ ok: true, applied: reduced + restored, reduced, restored });
}));

/** POST /api/portal/radius/disconnect — Desconecta cliente (CoA Disconnect-Request) */
portalDataRouter.post('/radius/disconnect', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const username = (req.body?.username ?? req.body?.user ?? '').toString().trim();
  if (!username) return res.status(400).json({ message: 'username é obrigatório' });
  const pool = getPool();
  try {
    const result = await disconnectUser(pool, username);
    if (result.ok) return res.json({ ok: true, message: 'Disconnect enviado' });
    if (result.message?.includes('sessão') || result.message?.includes('Nenhuma')) return res.status(404).json({ message: result.message });
    if (result.message?.includes('configurado') || result.message?.includes('não encontrado')) return res.status(503).json({ message: result.message });
    return res.status(500).json({ message: result.message || 'Falha ao desconectar' });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Tabela radacct não disponível' });
    throw e;
  }
}));

/** POST /api/portal/radius/coa — Atualiza sessão (CoA-Request) com novo perfil, ex.: velocidade */
portalDataRouter.post('/radius/coa', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const username = (req.body?.username ?? req.body?.user ?? '').toString().trim();
  const rate = (req.body?.rate ?? req.body?.Mikrotik_Rate_Limit ?? '').toString().trim();
  if (!username) return res.status(400).json({ message: 'username é obrigatório' });
  if (!rate) return res.status(400).json({ message: 'rate é obrigatório (ex.: 10M/10M)' });
  const pool = getPool();
  try {
    const result = await coaUpdateRate(pool, username, rate);
    if (result.ok) return res.json({ ok: true, message: 'CoA enviado' });
    if (result.message?.includes('sessão') || result.message?.includes('Nenhuma')) return res.status(404).json({ message: result.message });
    if (result.message?.includes('configurado') || result.message?.includes('não encontrado')) return res.status(503).json({ message: result.message });
    return res.status(500).json({ message: result.message || 'Falha ao enviar CoA' });
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Tabela radacct não disponível' });
    throw e;
  }
}));

/** GET/PUT /api/portal/radius/config — Config RADIUS do tenant (redirect inadimplência) + credenciais (host, port, secret) para o provedor configurar o NAS */
portalDataRouter.get('/radius/config', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  let blockRedirectUrl: string | null = null;
  try {
    const [rows] = await pool.query(
      'SELECT block_redirect_url FROM tenant_radius_config WHERE tenant_id = :tid LIMIT 1',
      { tid }
    );
    const row = Array.isArray(rows) && rows[0] ? (rows[0] as { block_redirect_url: string | null }) : null;
    blockRedirectUrl = row?.block_redirect_url ?? null;
  } catch {
    // tabela pode não existir
  }
  const radius = await readPortalRadiusConfig(pool, tid);
  return res.json({
    ok: true,
    provider_name: radius.providerName,
    provider_fantasy_name: radius.fantasyName,
    provider_short_name: radius.shortName,
    provider_legal_name: radius.legalName,
    block_redirect_url: blockRedirectUrl,
    radius_host: radius.radiusHost,
    radius_port: radius.radiusPort,
    radius_secret: radius.radiusSecret,
    radius_nas_ip: radius.radiusNasIp,
    radius_mode: radius.radiusMode,
    radius_service: radius.radiusService,
    standalone: isStandalone(),
  });
}));

portalDataRouter.put('/radius/config', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const blockRedirectUrl = req.body?.block_redirect_url != null ? String(req.body.block_redirect_url).trim() || null : null;
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO tenant_radius_config (tenant_id, block_redirect_url, updated_at)
       VALUES (:tid, :url, CURRENT_TIMESTAMP)
       ON CONFLICT (tenant_id) DO UPDATE SET block_redirect_url = :url, updated_at = CURRENT_TIMESTAMP`,
      { tid, url: blockRedirectUrl }
    );
    if (blockRedirectUrl) {
      await pool.query(
        `DELETE FROM radgroupreply WHERE groupname = 'bloqueado' AND attribute = 'WISPr-Redirect-URL'`
      );
      await pool.query(
        `INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES ('bloqueado', 'WISPr-Redirect-URL', '=', :url)`,
        { url: blockRedirectUrl }
      );
    } else {
      await pool.query(
        `DELETE FROM radgroupreply WHERE groupname = 'bloqueado' AND attribute = 'WISPr-Redirect-URL'`
      );
    }
  } catch (e) {
    if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Tabela tenant_radius_config não existe. Execute sql/radius_advanced.pg.sql' });
    throw e;
  }
  return res.json({ ok: true, block_redirect_url: blockRedirectUrl });
}));

/** GET/POST /api/portal/vouchers — Vouchers para Hotspot / Portal Captive */
portalDataRouter.get('/vouchers', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  let rows: unknown[] = [];
  try {
    const [r] = await pool.query(
      'SELECT id, code, duration_minutes, data_limit_mb, created_at, used_at FROM vouchers WHERE tenant_id = :tid ORDER BY id DESC LIMIT 200',
      { tid }
    );
    rows = Array.isArray(r) ? r : [];
  } catch (e) {
    if (isTableNotFoundError(e)) return res.json({ ok: true, rows: [] });
    throw e;
  }
  return res.json({ ok: true, rows });
}));

portalDataRouter.post('/vouchers', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const count = Math.min(50, Math.max(1, Number(body.count) || 1));
  const durationMinutes = Math.min(10080, Math.max(1, Number(body.duration_minutes) ?? 240));
  const dataLimitMb = body.data_limit_mb != null && body.data_limit_mb !== '' ? Number(body.data_limit_mb) : null;
  const pool = getPool();
  const created: { id: number; code: string }[] = [];
  for (let i = 0; i < count; i++) {
    const code = (body.prefix ?? 'V') + String(Math.random()).slice(2, 10) + (i > 0 ? '-' + i : '');
    try {
      const [ins] = await pool.query(
        `INSERT INTO vouchers (tenant_id, code, duration_minutes, data_limit_mb) VALUES (:tid, :code, :dur, :dataLimit) RETURNING id`,
        { tid, code, dur: durationMinutes, dataLimit: dataLimitMb }
      );
      const id = Array.isArray(ins) && (ins as { id: number }[])[0] ? (ins as { id: number }[])[0].id : 0;
      if (id) {
        created.push({ id, code });
        const radiusUser = `voucher_${id}`;
        const sessionTimeout = String(durationMinutes * 60);
        await pool.query('DELETE FROM radcheck WHERE username = :username', { username: radiusUser });
        await pool.query('DELETE FROM radreply WHERE username = :username', { username: radiusUser });
        await pool.query(
          `INSERT INTO radcheck (username, attribute, op, value) VALUES (:username, 'Cleartext-Password', ':=', :value)`,
          { username: radiusUser, value: code }
        );
        await pool.query(
          `INSERT INTO radreply (username, attribute, op, value) VALUES (:username, 'Session-Timeout', '=', :value)`,
          { username: radiusUser, value: sessionTimeout }
        );
      }
    } catch (e) {
      if (isTableNotFoundError(e)) return res.status(503).json({ message: 'Tabela vouchers não existe. Execute sql/radius_advanced.pg.sql' });
      throw e;
    }
  }
  return res.status(201).json({ ok: true, created, count: created.length });
}));

// ---- System: RADIUS logs (FreeRADIUS do tenant ou RADIUS externo via SQL) ----
portalDataRouter.get('/system/radius/logs', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const tail = req.query.tail ? Math.max(10, Math.min(2000, Number(req.query.tail) || 200)) : 200;
  const userFilter = (req.query.user as string | undefined)?.trim();

  let logs = '';
  let ok = false;
  let message = '';

  const slug = (req.tenant?.slug || process.env.TENANT_SLUG || process.env.TENANT || '').toString().trim();
  let dockerUnavailable = false;

  // 0) Modo standalone: logs via journalctl do freeradius-standalone
  if (isStandalone()) {
    try {
      const out = execSync(`journalctl -u freeradius-standalone -n ${tail} --no-pager`, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      });
      let text = (out || '').trim();
      if (userFilter) {
        const lower = userFilter.toLowerCase();
        text = text.split('\n').filter((l) => l.toLowerCase().includes(lower)).join('\n');
      }
      logs = text || '(Nenhuma linha recente no journal para freeradius-standalone.)';
      ok = true;
      message = 'Logs do serviço freeradius-standalone (journalctl).';
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      logs = `(Não foi possível ler journalctl -u freeradius-standalone: ${errMsg})`;
      ok = false;
      message = 'Erro ao ler logs do FreeRADIUS. No host: journalctl -u freeradius-standalone -n ' + tail + ' --no-pager';
    }
  }

  // 1) Se não standalone e temos slug, tenta docker logs do container radius_<slug>
  if (!ok && !isStandalone() && slug) {
    try {
      const dockerResult = await dockerLogs(`radius_${slug}`, tail);
      const errText = (dockerResult.stderr || '').toLowerCase();
      if (errText.includes('enoent') || errText.includes('docker') && errText.includes('not found')) {
        dockerUnavailable = true;
      }
      const out = ((dockerResult.stdout || '') + (dockerResult.stderr ? '\n' + dockerResult.stderr : '')).trim();
      if (dockerResult.success || (out && !dockerUnavailable)) {
        logs = out || '(Container sem saída recente.)';
        ok = true;
        message = 'Logs do container FreeRADIUS (radius_' + slug + ').';
      }
    } catch {
      /* segue para próximo método */
    }
  }

  // 2) Se ainda não tem logs, não é standalone e docker está disponível, tenta getTenantStackLogs (requer stackPath no banco central)
  if ((!ok || !logs.trim()) && !isStandalone() && !dockerUnavailable) {
    try {
      const result = await getTenantStackLogs(tid, 'radius', tail);
      const errText = (result.message || '').toLowerCase();
      if (errText.includes('enoent')) dockerUnavailable = true;
      logs = result.stdout || '';
      ok = result.success;
      message = result.message;
    } catch {
      /* segue para fallback */
    }
  }

  // 2b) Fallback: instalação standalone (freeradius-standalone) sem STANDALONE no .env — tenta journalctl
  if (!ok && slug) {
    try {
      const out = execSync(`journalctl -u freeradius-standalone -n ${tail} --no-pager`, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      });
      let text = (out || '').trim();
      if (userFilter) {
        const lower = userFilter.toLowerCase();
        text = text.split('\n').filter((l) => l.toLowerCase().includes(lower)).join('\n');
      }
      logs = text || '(Nenhuma linha recente no journal para freeradius-standalone.)';
      ok = true;
      message = 'Logs do serviço freeradius-standalone (journalctl).';
    } catch {
      /* segue para radpostauth */
    }
  }

  // 3) Se não houver stack provisionado ou não houver logs (ou docker indisponível), faz fallback para tabela radpostauth do tenant
  if (!ok || !logs.trim()) {
    let radiusClient: import('pg').Client | null = null;
    try {
      radiusClient = await getTenantDbClient(tid);
      let list: { authdate: string; username: string | null; reply: string | null; callingstationid: string | null; calledstationid: string | null; pass?: string | null }[] = [];
      if (radiusClient) {
        const sql = userFilter
          ? `SELECT authdate, username, reply, callingstationid, calledstationid, pass FROM radpostauth WHERE username ILIKE $1 OR callingstationid ILIKE $1 OR calledstationid ILIKE $1 OR reply ILIKE $1 ORDER BY authdate DESC LIMIT $2`
          : `SELECT authdate, username, reply, callingstationid, calledstationid, pass FROM radpostauth ORDER BY authdate DESC LIMIT $1`;
        const params = userFilter ? [`%${userFilter}%`, tail] : [tail];
        const r = await radiusClient.query(sql, params);
        list = Array.isArray(r?.rows) ? (r.rows as typeof list) : [];
      } else {
        const pool = getPool();
        const params: Record<string, unknown> = { limit: tail };
        let sql = 'SELECT authdate, username, reply, callingstationid, calledstationid, pass FROM radpostauth';
        if (userFilter) {
          sql += ' WHERE username ILIKE :user OR callingstationid ILIKE :user OR calledstationid ILIKE :user OR reply ILIKE :user';
          params.user = `%${userFilter}%`;
        }
        sql += ' ORDER BY authdate DESC LIMIT :limit';
        const [rows] = await pool.query(sql, params);
        list = Array.isArray(rows) ? (rows as typeof list) : [];
      }
      if (list.length) {
        logs = list
          .map((r) => {
            const ts = r.authdate;
            const u = r.username || '';
            const rep = r.reply || '';
            const calling = r.callingstationid || '';
            const called = r.calledstationid || '';
            return `[${ts}] user=\"${u}\" reply=\"${rep}\" calling=\"${calling}\" called=\"${called}\"`;
          })
          .join('\n');
      } else {
        logs = '(Nenhum registro em radpostauth para este filtro/intervalo.)';
      }
      ok = true;
      message = isStandalone()
        ? 'Logs da tabela radpostauth (autenticações). Para logs do processo FreeRADIUS no host: journalctl -u freeradius-standalone -n ' + tail + ' --no-pager.'
        : dockerUnavailable
          ? 'Docker CLI não disponível neste container. Logs da tabela radpostauth (autenticações do tenant). No host (na pasta do stack): docker compose logs freeradius --tail ' + tail + ' ou docker ps -a para ver o nome do container.'
          : 'Logs obtidos da tabela radpostauth (FreeRADIUS SQL do tenant).';
    } catch (e) {
      if (!isTableNotFoundError(e)) throw e;
      if (!logs.trim()) {
        logs = isStandalone()
          ? '(Nenhum registro em radpostauth. Para logs do processo: journalctl -u freeradius-standalone -n ' + tail + ' --no-pager.)'
          : dockerUnavailable
            ? '(Docker CLI não encontrado. No host, na pasta do stack (ex.: /var/www/otyis-isp): docker compose logs freeradius --tail ' + tail + '. Ou: docker ps -a para listar containers e docker logs <nome> --tail ' + tail + '.)'
            : '(Nenhum log disponível: tenant sem stack provisionado e sem tabela radpostauth.)';
        ok = false;
        message = 'RADIUS sem logs disponíveis.';
      }
    } finally {
      if (radiusClient) {
        try {
          await radiusClient.end();
        } catch {
          /* ignore */
        }
      }
    }
  } else if (userFilter) {
    // Filtro em memória quando veio dos logs do container
    const lines = logs.split('\n');
    const lower = userFilter.toLowerCase();
    const filtered = lines.filter((l) => l.toLowerCase().includes(lower));
    logs = filtered.join('\n');
  }

  return res.json({
    ok,
    message,
    logs,
  });
}));
