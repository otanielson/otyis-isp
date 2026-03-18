import type { Request, Response, NextFunction } from 'express';
import { isValidAdminSession } from '../utils/adminSession.js';

/**
 * Protege rotas do SaaS. Aceita:
 * - Sessão admin (cookie admin_session) — painel /admin logado
 * - Header x-saas-admin-key ou query saas_admin_key = SAAS_ADMIN_KEY (ou ADMIN_KEY se SAAS não definido)
 */
export function requireSaasAdmin(req: Request, res: Response, next: NextFunction): void | Response {
  const sessionToken = req.cookies?.admin_session;
  if (isValidAdminSession(sessionToken)) return next();

  const key = (req.headers['x-saas-admin-key'] as string) || (req.query.saas_admin_key as string);
  const expected = process.env.SAAS_ADMIN_KEY || process.env.ADMIN_KEY;
  if (!expected) {
    return res.status(500).json({ error: 'SAAS_ADMIN_KEY ou ADMIN_KEY não configurado no .env' });
  }
  if (!key || key !== expected) {
    return res.status(401).json({ error: 'Chave de administrador SaaS inválida' });
  }
  next();
}
