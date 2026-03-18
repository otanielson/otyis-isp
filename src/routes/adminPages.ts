import { Router, type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { isValidAdminSession } from '../utils/adminSession.js';

export const adminPageRouter = Router();

// Raiz do projeto: em produção __dirname = dist/src/routes → sobe 3 níveis para achar web/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.join(__dirname, '../../..', 'web');

function requireAdminSession(req: Request, res: Response, next: NextFunction): void | Response {
  const token = req.cookies?.admin_session;
  if (!isValidAdminSession(token)) {
    return res.redirect(302, '/admin');
  }
  next();
}

// /admin e /admin/ → página de login
adminPageRouter.get('/', (_req, res) => {
  res.sendFile(path.join(webDir, 'admin', 'login.html'));
});

adminPageRouter.get('', (_req, res) => {
  res.redirect(302, '/admin/');
});

// /admin/dashboard → dashboard (só com sessão válida)
adminPageRouter.get('/dashboard', requireAdminSession, (_req, res) => {
  res.sendFile(path.join(webDir, 'admin', 'dashboard.html'));
});
