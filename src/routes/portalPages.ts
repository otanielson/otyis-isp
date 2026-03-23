import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

export const portalPageRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.join(__dirname, '../../..', 'web');
const portalDir = path.join(webDir, 'portal');
const dashboardPath = path.join(portalDir, 'dashboard.html');
const loginPath = path.join(portalDir, 'login.html');

function sendDashboard(res: Parameters<typeof portalPageRouter.get>[1] extends (...args: infer P) => any ? P[1] : never): void {
  res.sendFile(dashboardPath);
}

portalPageRouter.get('/', (_req, res) => {
  res.sendFile(loginPath);
});

portalPageRouter.get('', (_req, res) => {
  res.redirect(302, '/portal/');
});

portalPageRouter.get('/dashboard', (_req, res) => {
  sendDashboard(res);
});

portalPageRouter.get('/financeiro/:pane', (_req, res) => {
  sendDashboard(res);
});

portalPageRouter.get('/financeiro/:pane/:item', (_req, res) => {
  sendDashboard(res);
});

for (const route of ['planos', 'pedidos', 'clientes', 'propostas', 'contratos', 'suporte', 'clube', 'wifi', 'financeiro', 'fiscal', 'estoque', 'sistema', 'administracao', 'grupos', 'usuarios']) {
  portalPageRouter.get(`/${route}`, (_req, res) => {
    sendDashboard(res);
  });
}
