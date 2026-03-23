import { Router, type Request, type Response } from 'express';
import { getPool } from '../db.js';
import { normalizeWhatsapp } from '../utils/validation.js';
import { getTenantOrDefault } from '../tenant.js';
import { requireClientAuth } from '../middlewares/clientAuth.js';
import { signClientToken } from '../utils/clientJwt.js';
import { enqueueNotification } from '../utils/notify.js';

export const clientRouter = Router();

function asyncHandler(fn: (req: Request, res: Response) => Promise<Response | void>) {
  return (req: Request, res: Response, _next: (err?: unknown) => void) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('[Client API]', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erro interno' });
    });
  };
}

clientRouter.post(
  '/login',
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const body = req.body || {};
    const rawCpf = body.cpfCnpj ?? body.cpf_cnpj ?? '';
    const rawWhatsapp = body.whatsapp ?? body.telefone ?? '';
    const cpf = String(rawCpf || '').replace(/\D/g, '').trim();
    const whatsappNorm = normalizeWhatsapp(String(rawWhatsapp || ''));

    if (!cpf || cpf.length < 11) {
      return res.status(400).json({ error: 'Informe um CPF/CNPJ válido.' });
    }
    if (!whatsappNorm || whatsappNorm.length < 10) {
      return res.status(400).json({ error: 'Informe um WhatsApp válido com DDD.' });
    }

    const tenant = await getTenantOrDefault(req);
    if (!tenant) return res.status(503).json({ error: 'Tenant não configurado' });

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, name, whatsapp, cpf_cnpj, tenant_id
       FROM customers
       WHERE tenant_id = :tid AND cpf_cnpj = :cpf AND whatsapp = :w
       LIMIT 1`,
      { tid: tenant.id, cpf, w: whatsappNorm }
    );
    const list = Array.isArray(rows)
      ? (rows as { id: number; name: string; whatsapp: string; cpf_cnpj: string }[])
      : [];
    if (!list.length) {
      return res.status(401).json({ error: 'Cliente não encontrado com estes dados.' });
    }

    const customer = list[0];
    const token = signClientToken({ tenantId: tenant.id, customerId: customer.id });

    return res.json({
      token,
      customer: {
        id: customer.id,
        name: customer.name,
        whatsapp: customer.whatsapp,
        cpf_cnpj: customer.cpf_cnpj,
      },
    });
  })
);

clientRouter.get(
  '/me',
  requireClientAuth,
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const auth = req.client!;
    const pool = getPool();

    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.whatsapp, c.email, c.cpf_cnpj, c.address_json, c.notes,
              COALESCE(c.active, true) AS active,
              COALESCE(la.points_balance, 0) AS points_balance,
              COALESCE(la.tier, 'BRONZE') AS tier
       FROM customers c
       LEFT JOIN loyalty_accounts la ON la.customer_id = c.id
       WHERE c.id = :cid AND c.tenant_id = :tid
       LIMIT 1`,
      { cid: auth.customerId, tid: auth.tenantId }
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return res.status(404).json({ error: 'Cliente não encontrado' });
    const customer = list[0] as Record<string, unknown>;

    let installation: unknown = null;
    try {
      const [instRows] = await pool.query(
        `SELECT id, plan_code, due_day, address_json, status, installed_at, ont_serial, cto_code, notes, pppoe_user
         FROM installations
         WHERE customer_id = :cid
         LIMIT 1`,
        { cid: auth.customerId }
      );
      installation = Array.isArray(instRows) && instRows.length ? instRows[0] : null;
    } catch {
      installation = null;
    }

    return res.json({ ok: true, customer, installation });
  })
);

clientRouter.get(
  '/invoices',
  requireClientAuth,
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const auth = req.client!;
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT i.id, i.ref_month, i.due_date, i.amount, i.plan_code, i.status, i.paid_at, i.created_at, i.notes
       FROM invoices i
       WHERE i.customer_id = :cid
       ORDER BY i.due_date DESC, i.id DESC
       LIMIT 50`,
      { cid: auth.customerId }
    );
    const list = Array.isArray(rows) ? rows : [];
    const today = new Date().toISOString().slice(0, 10);
    for (const r of list) {
      const inv = r as { status: string; due_date: string };
      if (inv.status === 'PENDING' && inv.due_date < today) inv.status = 'OVERDUE';
    }
    return res.json({ ok: true, rows: list });
  })
);

clientRouter.get(
  '/contracts',
  requireClientAuth,
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const auth = req.client!;
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, proposal_id, plan_code, amount, due_day, status, signed_at, starts_at, ends_at, created_at, notes
       FROM contracts
       WHERE tenant_id = :tid AND customer_id = :cid
       ORDER BY created_at DESC
       LIMIT 20`,
      { tid: auth.tenantId, cid: auth.customerId }
    );
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  })
);

clientRouter.get(
  '/tickets',
  requireClientAuth,
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const auth = req.client!;
    const pool = getPool();
    let sql = `SELECT id, subject, priority, status, created_at, closed_at,
                      defect_text, solution_text, technical_category, channel,
                      ticket_type, assigned_to_name
               FROM tickets
               WHERE tenant_id = :tid AND customer_id = :cid`;
    const params: Record<string, string | number> = { tid: auth.tenantId, cid: auth.customerId };
    const status = req.query.status as string | undefined;
    if (status) {
      sql += ' AND status = :status';
      params.status = status.toUpperCase();
    }
    sql += ' ORDER BY created_at DESC LIMIT 50';
    const [rows] = await pool.query(sql, params);
    return res.json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  })
);

clientRouter.get(
  '/tickets/:id',
  requireClientAuth,
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const auth = req.client!;
    const pool = getPool();
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: 'Chamado inválido' });

    const [rows] = await pool.query(
      `SELECT id, subject, priority, status, created_at, closed_at,
              defect_text, solution_text, technical_category, channel,
              ticket_type, assigned_to_name
       FROM tickets
       WHERE tenant_id = :tid AND customer_id = :cid AND id = :id
       LIMIT 1`,
      { tid: auth.tenantId, cid: auth.customerId, id }
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return res.status(404).json({ error: 'Chamado não encontrado' });
    return res.json({ ok: true, row: list[0] });
  })
);

clientRouter.post(
  '/tickets',
  requireClientAuth,
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const auth = req.client!;
    const body = req.body || {};
    const subject = String(body.subject || '').trim();
    const description = body.description ? String(body.description).trim() : null;
    const technicalCategory = body.technical_category ? String(body.technical_category).trim() : null;
    const channel = body.channel ? String(body.channel).trim().toUpperCase() : 'PORTAL_CLIENTE';
    const ticketType = body.ticket_type ? String(body.ticket_type).trim().toUpperCase() : 'SUPORTE';

    if (!subject) return res.status(400).json({ error: 'Assunto é obrigatório' });

    const pool = getPool();
    const [r] = await pool.query(
      `INSERT INTO tickets (
         tenant_id, customer_id, subject, priority, status,
         defect_text, technical_category, channel, ticket_type
       )
       VALUES (
         :tid, :cid, :subject, 'NORMAL', 'OPEN',
         :defectText, :technicalCategory, :channel, :ticketType
       ) RETURNING id`,
      {
        tid: auth.tenantId,
        cid: auth.customerId,
        subject,
        defectText: description,
        technicalCategory,
        channel,
        ticketType,
      }
    );
    const insertId = (r as { insertId?: number })?.insertId;

    if (description) {
      try {
        await pool.query(
          `INSERT INTO customer_history (tenant_id, customer_id, type, subject, content)
           VALUES (:tid, :cid, 'TICKET', :subj, :content)`,
          { tid: auth.tenantId, cid: auth.customerId, subj: subject, content: description }
        );
      } catch {
        /* ignore history failure */
      }
    }

    void enqueueNotification({
      tenantId: auth.tenantId,
      customerId: auth.customerId,
      channel: 'WHATSAPP',
      type: 'TICKET_OPENED',
      payload: { ticketId: insertId, subject },
    });

    return res.status(201).json({ ok: true, id: insertId });
  })
);
