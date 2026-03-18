import type { Request, Response, NextFunction } from 'express';
import { isValidAdminSession } from './adminSession.js';

export function requireAdminKey(req: Request, res: Response, next: NextFunction): void | Response {
  const sessionToken = req.cookies?.admin_session;
  if (isValidAdminSession(sessionToken)) return next();

  const key = (req.query.key as string | undefined) || (req.headers['x-admin-key'] as string | undefined);
  if (!process.env.ADMIN_KEY) {
    return res.status(500).json({ message: 'ADMIN_KEY não configurado no .env' });
  }
  if (key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ message: 'Admin key inválida' });
  }
  next();
}
