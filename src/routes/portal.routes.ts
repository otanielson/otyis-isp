import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getPool } from '../db.js';
import { requireAuth } from '../middlewares/auth.js';
import { requirePerm } from '../middlewares/perms.js';
import { hashPassword } from '../utils/crypto.js';

export const portalRouter = Router();
portalRouter.use(requireAuth);

function tenantScope(req: Request): number {
  return req.user!.tenantId;
}

/** GET /api/portal/me — usuário atual com permissões (para UI) */
portalRouter.get('/me', async (req: Request, res: Response): Promise<Response | void> => {
  const u = req.user!;
  return res.json({
    userId: u.userId,
    tenantId: u.tenantId,
    isMaster: u.isMaster,
    permissions: Array.isArray(u.permissions) ? u.permissions : [],
  });
});

/** GET /api/portal/permissions — catálogo de permissões */
portalRouter.get('/permissions', requirePerm('iam.permissions.read'), async (req: Request, res: Response): Promise<Response | void> => {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, code, name, is_active FROM tenant_permissions ORDER BY code'
  );
  const permissions = Array.isArray(rows) ? rows : [];
  return res.json({ tenantId: tenantScope(req), permissions });
});

/** GET /api/portal/roles */
portalRouter.get('/roles', requirePerm('iam.roles.read'), async (req: Request, res: Response): Promise<Response | void> => {
  const tenantId = tenantScope(req);
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, name, is_system, created_at FROM tenant_roles WHERE tenant_id = :tenantId ORDER BY name',
    { tenantId }
  );
  const roles = Array.isArray(rows) ? rows : [];
  return res.json({ roles });
});

/** POST /api/portal/roles */
portalRouter.post('/roles', requirePerm('iam.roles.create'), async (req: Request, res: Response): Promise<Response | void> => {
  const tenantId = tenantScope(req);
  const schema = z.object({ name: z.string().min(2) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const pool = getPool();
  const [result] = await pool.query(
    'INSERT INTO tenant_roles (tenant_id, name, is_system) VALUES (:tenantId, :name, false) RETURNING id',
    { tenantId, name: parsed.data.name }
  );
  const roleId = (result as { insertId: number }).insertId;
  return res.status(201).json({ role: { id: roleId, name: parsed.data.name, is_system: false } });
});

/** GET /api/portal/roles/:roleId/permissions */
portalRouter.get('/roles/:roleId/permissions', requirePerm('iam.roles.read'), async (req: Request, res: Response): Promise<Response | void> => {
  const tenantId = tenantScope(req);
  const roleId = Number(req.params.roleId);
  const pool = getPool();
  const [roles] = await pool.query(
    'SELECT id FROM tenant_roles WHERE id = :roleId AND tenant_id = :tenantId LIMIT 1',
    { roleId, tenantId }
  );
  if (!Array.isArray(roles) || roles.length === 0) return res.status(404).json({ error: 'Role não encontrada' });

  const [rows] = await pool.query(
    `SELECT tp.code, tp.name FROM tenant_role_permissions trp
     INNER JOIN tenant_permissions tp ON tp.id = trp.permission_id
     WHERE trp.tenant_id = :tenantId AND trp.role_id = :roleId`,
    { tenantId, roleId }
  );
  const permissions = Array.isArray(rows) ? rows : [];
  return res.json({ roleId, permissions });
});

/** PUT /api/portal/roles/:roleId/permissions — body: { permissionCodes: string[] } */
portalRouter.put('/roles/:roleId/permissions', requirePerm('iam.roles.update'), async (req: Request, res: Response): Promise<Response | void> => {
  const tenantId = tenantScope(req);
  const roleId = Number(req.params.roleId);
  const schema = z.object({ permissionCodes: z.array(z.string().min(2)).default([]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const pool = getPool();
  const [roles] = await pool.query(
    'SELECT id, name, is_system FROM tenant_roles WHERE id = :roleId AND tenant_id = :tenantId LIMIT 1',
    { roleId, tenantId }
  );
  const role = Array.isArray(roles) ? (roles as { id: number; name: string; is_system: number }[])[0] : undefined;
  if (!role) return res.status(404).json({ error: 'Role não encontrada' });
  if (role.is_system && role.name === 'Master') {
    return res.status(403).json({ error: 'Role Master é protegida' });
  }

  const codes = parsed.data.permissionCodes;
  const placeholders = codes.length ? codes.map(() => '?').join(',') : '';
  const [permRows] = await pool.query(
    `SELECT id, code FROM tenant_permissions WHERE code IN (${placeholders})`,
    codes
  );
  const permIds = Array.isArray(permRows) ? (permRows as { id: number }[]).map((p) => p.id) : [];

  await pool.query('DELETE FROM tenant_role_permissions WHERE tenant_id = ? AND role_id = ?', [tenantId, roleId]);
  if (permIds.length > 0) {
    const values = permIds.map((pid) => `(${tenantId}, ${roleId}, ${pid})`).join(', ');
    await pool.query(`INSERT INTO tenant_role_permissions (tenant_id, role_id, permission_id) VALUES ${values}`);
  }
  return res.json({ ok: true, roleId, permissionCodes: Array.isArray(permRows) ? (permRows as { code: string }[]).map((p) => p.code) : [] });
});

/** GET /api/portal/users */
portalRouter.get('/users', requirePerm('iam.users.read'), async (req: Request, res: Response): Promise<Response | void> => {
  const tenantId = tenantScope(req);
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, name, email, is_master, is_active, created_at FROM tenant_users WHERE tenant_id = :tenantId ORDER BY created_at DESC',
    { tenantId }
  );
  const users = Array.isArray(rows) ? rows : [];
  return res.json({ users });
});

/** POST /api/portal/users */
portalRouter.post('/users', requirePerm('iam.users.create'), async (req: Request, res: Response): Promise<Response | void> => {
  const tenantId = tenantScope(req);
  const schema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    isActive: z.boolean().optional().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const emailNorm = parsed.data.email.toLowerCase().trim();
  const pool = getPool();
  const [ex] = await pool.query(
    'SELECT id FROM tenant_users WHERE tenant_id = :tenantId AND email = :email LIMIT 1',
    { tenantId, email: emailNorm }
  );
  if (Array.isArray(ex) && ex.length > 0) {
    return res.status(409).json({ error: 'Email já existe no tenant' });
  }

  const passHash = await hashPassword(parsed.data.password);
  const [result] = await pool.query(
    `INSERT INTO tenant_users (tenant_id, name, email, password_hash, is_master, is_active)
     VALUES (:tenantId, :name, :email, :passwordHash, false, :isActive) RETURNING id`,
    {
      tenantId,
      name: parsed.data.name,
      email: emailNorm,
      passwordHash: passHash,
      isActive: parsed.data.isActive,
    }
  );
  const userId = (result as { insertId: number }).insertId;
  return res.status(201).json({
    user: {
      id: userId,
      name: parsed.data.name,
      email: emailNorm,
      is_master: false,
      is_active: parsed.data.isActive,
    },
  });
});

/** GET /api/portal/users/:userId/roles */
portalRouter.get('/users/:userId/roles', requirePerm('iam.users.read'), async (req: Request, res: Response): Promise<Response | void> => {
  const tenantId = tenantScope(req);
  const userId = Number(req.params.userId);
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT r.id, r.name FROM tenant_user_roles tur
     INNER JOIN tenant_roles r ON r.id = tur.role_id
     WHERE tur.tenant_id = :tenantId AND tur.user_id = :userId`,
    { tenantId, userId }
  );
  const roles = Array.isArray(rows) ? rows : [];
  return res.json({ userId, roles });
});

/** PUT /api/portal/users/:userId/roles — body: { roleIds: number[] } */
portalRouter.put('/users/:userId/roles', requirePerm('iam.users.update'), async (req: Request, res: Response): Promise<Response | void> => {
  const tenantId = tenantScope(req);
  const userId = Number(req.params.userId);
  const schema = z.object({ roleIds: z.array(z.number().int().positive()).default([]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const pool = getPool();
  const [users] = await pool.query(
    'SELECT id, is_master FROM tenant_users WHERE id = :userId AND tenant_id = :tenantId LIMIT 1',
    { userId, tenantId }
  );
  const user = Array.isArray(users) ? (users as { id: number; is_master: number }[])[0] : undefined;
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (user.is_master) return res.status(403).json({ error: 'Master não deve ter roles alteradas por aqui' });

  const roleIds = parsed.data.roleIds;
  const [roles] = await pool.query(
    `SELECT id FROM tenant_roles WHERE tenant_id = ? AND id IN (${roleIds.length ? roleIds.map(() => '?').join(',') : '0'})`,
    [tenantId, ...roleIds]
  );
  const validRoleIds = Array.isArray(roles) ? (roles as { id: number }[]).map((r) => r.id) : [];

  await pool.query('DELETE FROM tenant_user_roles WHERE tenant_id = ? AND user_id = ?', [tenantId, userId]);
  if (validRoleIds.length > 0) {
    const values = validRoleIds.map((rid) => `(${tenantId}, ${userId}, ${rid})`).join(', ');
    await pool.query(`INSERT INTO tenant_user_roles (tenant_id, user_id, role_id) VALUES ${values}`);
  }
  return res.json({ ok: true, userId, roleIds: validRoleIds });
});
