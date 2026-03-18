import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware que exige uma permissão. Master sempre passa.
 */
export function requirePerm(perm: string) {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    const u = req.user;
    if (!u) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    if (u.isMaster) {
      return next();
    }
    const perms = Array.isArray(u.permissions) ? u.permissions : [];
    if (!perms.includes(perm)) {
      return res.status(403).json({ error: `Sem permissão: ${perm}` });
    }
    next();
  };
}
