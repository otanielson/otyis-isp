import { Router, type Request, type Response } from 'express';
import { nanoid } from 'nanoid';
import { getPool } from '../db.js';
import { normalizeWhatsapp, requireFields, allowedVencimento } from '../utils/validation.js';

export const leadsRouter = Router();

interface SubscriptionBody extends Record<string, unknown> {
  plano?: string;
  tipo?: string;
  nome?: string;
  cpfCnpj?: string;
  whatsapp?: string;
  email?: string;
  endereco?: Record<string, unknown>;
  disponibilidade?: Record<string, unknown>;
  extras?: Record<string, unknown>;
  vencimento?: string | number;
  obs?: string;
}

leadsRouter.post('/', async (req: Request, res: Response): Promise<Response | void> => {
  const body = (req.body || {}) as SubscriptionBody;
  const err = requireFields(body, ['plano', 'tipo', 'nome', 'cpfCnpj', 'whatsapp', 'endereco', 'vencimento']);
  if (err) return res.status(400).json({ message: err });

  if (!allowedVencimento(body.vencimento)) {
    return res.status(400).json({ message: 'Vencimento inválido. Use 05, 10, 15, 20 ou 25.' });
  }

  const whatsapp = normalizeWhatsapp(body.whatsapp ?? '');
  const protocol = 'MLT-' + nanoid(10).toUpperCase();

  const pool = getPool();
  const payloadJson = JSON.stringify(body);
  const tenantId = req.tenant?.id ?? null;

  try {
    await pool.query(
      `INSERT INTO subscription_requests
        (protocol, plan_code, customer_name, cpf_cnpj, whatsapp, email, vencimento, address_json, preferred_json, extras_json, notes, raw_payload_json, tenant_id)
       VALUES
        (:protocol, :plan_code, :customer_name, :cpf_cnpj, :whatsapp, :email, :vencimento, :address_json, :preferred_json, :extras_json, :notes, :raw_payload_json, :tenant_id)`,
      {
        protocol,
        plan_code: String(body.plano),
        customer_name: body.nome,
        cpf_cnpj: body.cpfCnpj,
        whatsapp,
        email: body.email ?? null,
        vencimento: Number(body.vencimento),
        address_json: JSON.stringify(body.endereco || {}),
        preferred_json: JSON.stringify(body.disponibilidade || {}),
        extras_json: JSON.stringify(body.extras || {}),
        notes: body.obs ?? null,
        raw_payload_json: payloadJson,
        tenant_id: tenantId,
      }
    );
  } catch {
    await pool.query(
      `INSERT INTO subscription_requests
        (protocol, plan_code, customer_name, cpf_cnpj, whatsapp, email, vencimento, address_json, preferred_json, extras_json, notes, raw_payload_json)
       VALUES
        (:protocol, :plan_code, :customer_name, :cpf_cnpj, :whatsapp, :email, :vencimento, :address_json, :preferred_json, :extras_json, :notes, :raw_payload_json)`,
      {
        protocol,
        plan_code: String(body.plano),
        customer_name: body.nome,
        cpf_cnpj: body.cpfCnpj,
        whatsapp,
        email: body.email ?? null,
        vencimento: Number(body.vencimento),
        address_json: JSON.stringify(body.endereco || {}),
        preferred_json: JSON.stringify(body.disponibilidade || {}),
        extras_json: JSON.stringify(body.extras || {}),
        notes: body.obs ?? null,
        raw_payload_json: payloadJson,
      }
    );
  }

  const waText = encodeURIComponent(`Olá! Quero assinar o plano ${body.plano} Mega. Protocolo: ${protocol}`);
  const whatsappLink = `https://wa.me/?text=${waText}`;

  return res.json({ ok: true, protocol, whatsappLink });
});
