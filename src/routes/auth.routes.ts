import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getPool } from '../db.js';
import { verifyPassword } from '../utils/crypto.js';
import { signToken } from '../utils/jwt.js';
import { requireAuth } from '../middlewares/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const msg = typeof parsed.error.flatten === 'function'
        ? 'E-mail inválido ou senha com menos de 6 caracteres.'
        : 'Dados inválidos.';
      return res.status(400).json({ error: msg });
    }
    const { email, password } = parsed.data;
    const emailNorm = email.toLowerCase().trim();

    const pool = getPool();
    const [users] = await pool.query(
      'SELECT id, tenant_id, name, email, password_hash, is_master FROM tenant_users WHERE email = :email AND is_active = true LIMIT 1',
      { email: emailNorm }
    );
    const user = Array.isArray(users) ? (users as { id: number; tenant_id: number; name: string; email: string; password_hash: string; is_master: number }[])[0] : undefined;
    if (!user) {
      return res.status(401).json({ error: 'E-mail não encontrado ou usuário inativo. Crie um provedor no Admin do SaaS (/admin) e use o e-mail do Master.' });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

  const [rolesRows] = await pool.query(
    `SELECT tr.id, tr.name FROM tenant_user_roles tur
     INNER JOIN tenant_roles tr ON tr.id = tur.role_id AND tr.tenant_id = tur.tenant_id
     WHERE tur.user_id = :userId AND tur.tenant_id = :tenantId`,
    { userId: user.id, tenantId: user.tenant_id }
  );
  const roles = Array.isArray(rolesRows) ? (rolesRows as { id: number; name: string }[]).map((r) => r.name) : [];

  const [permsRows] = await pool.query(
    `SELECT tp.code FROM tenant_user_roles tur
     INNER JOIN tenant_role_permissions trp ON trp.role_id = tur.role_id AND trp.tenant_id = tur.tenant_id
     INNER JOIN tenant_permissions tp ON tp.id = trp.permission_id AND tp.is_active = true
     WHERE tur.user_id = :userId`,
    { userId: user.id }
  );
  const permissions = [...new Set((Array.isArray(permsRows) ? (permsRows as { code: string }[]) : []).map((p) => p.code))];

  const token = signToken({
    tenantId: user.tenant_id,
    userId: user.id,
    roles,
    permissions,
    isMaster: !!user.is_master,
  });

  return res.json({
    token,
    user: {
      id: user.id,
      tenantId: user.tenant_id,
      name: user.name,
      email: user.email,
      isMaster: !!user.is_master,
      roles,
      permissions,
    },
  });
  } catch (err) {
    console.error('[Auth login]', err);
    return res.status(500).json({ error: 'Erro ao processar login. Tente novamente.' });
  }
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response): Promise<Response | void> => {
  const u = req.user!;
  const pool = getPool();

  const [tenants] = await pool.query(
    'SELECT id, name, slug, created_at FROM tenants WHERE id = :id LIMIT 1',
    { id: u.tenantId }
  );
  const tenant = Array.isArray(tenants) ? (tenants as { id: number; name: string; slug: string; created_at: Date }[])[0] : undefined;

  const [users] = await pool.query(
    'SELECT id, name, email, is_master, created_at FROM tenant_users WHERE id = :id AND tenant_id = :tenantId LIMIT 1',
    { id: u.userId, tenantId: u.tenantId }
  );
  const user = Array.isArray(users) ? (users as { id: number; name: string; email: string; is_master: number; created_at: Date }[])[0] : undefined;

  if (!tenant || !user) {
    return res.status(404).json({ error: 'Usuário ou tenant não encontrado' });
  }

  return res.json({
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, created_at: tenant.created_at },
    user: { id: user.id, name: user.name, email: user.email, isMaster: !!user.is_master, created_at: user.created_at },
    roles: u.roles,
    permissions: u.permissions,
    isMaster: u.isMaster,
  });
});
