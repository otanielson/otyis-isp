import type { Request, Response, NextFunction } from 'express';
import { verifyClientToken, type ClientJwtPayload } from '../utils/clientJwt.js';

declare global {
  namespace Express {
    interface Request {
      client?: ClientJwtPayload;
    }
  }
}

export function requireClientAuth(req: Request, res: Response, next: NextFunction): void | Response {
  const auth = (req.headers.authorization || '').trim();
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Token do cliente ausente' });
  }

  try {
    req.client = verifyClientToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Token do cliente inválido ou expirado' });
  }
}

