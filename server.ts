import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

import { apiRouter } from './src/routes/api.js';
import { adminPageRouter } from './src/routes/adminPages.js';
import { portalPageRouter } from './src/routes/portalPages.js';
import { resolveTenant, getTenantOrDefault } from './src/tenant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname.endsWith('dist') ? path.join(__dirname, '..') : __dirname;
const webDir = path.join(rootDir, 'web');
const hotspotPath = path.join(webDir, 'hotspot', 'index.html');
const hotspotConnectedPath = path.join(webDir, 'hotspot', 'connected.html');
const hotspotSuccessPath = path.join(webDir, 'hotspot', 'success.html');
const hotspotExpiredPath = path.join(webDir, 'hotspot', 'expired.html');

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
    // Evita avisos no console em HTTP (COOP e Origin-Agent-Cluster exigem HTTPS para ter efeito)
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
  })
);
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Resolução de tenant (para site por cliente e APIs)
app.use(resolveTenant);

// Rotas de aplicação antes do static
app.use('/admin', adminPageRouter);
app.use('/portal', portalPageRouter);
app.use('/api', apiRouter);
app.get('/hotspot', (_req, res) => {
  res.sendFile(hotspotPath);
});
app.get('/hotspot/', (_req, res) => {
  res.sendFile(hotspotPath);
});
app.get('/hotspot/conectado', (_req, res) => {
  res.sendFile(hotspotConnectedPath);
});
app.get('/hotspot/sucesso', (_req, res) => {
  res.sendFile(hotspotSuccessPath);
});
app.get('/hotspot/expirado', (_req, res) => {
  res.sendFile(hotspotExpiredPath);
});
app.get('/hotspot/:tenantOrTemplate', (_req, res) => {
  res.sendFile(hotspotPath);
});
app.get('/hotspot/:tenantSlug/:templateSlug', (_req, res) => {
  res.sendFile(hotspotPath);
});

/** Modo tenant: app rodando no container (portal + site em um). Serve site static de site/static. */
const TENANT_MODE = !!process.env.TENANT_SLUG;
const siteStaticPath = path.join(rootDir, 'site', 'static');

/** Segmentos de path reservados (não são slug de tenant). */
const RESERVED_PATH_SEGMENTS = new Set(['assets', 'api', 'portal', 'admin', 'favicon.ico', 'uploads']);

/** Prefixo do path do tenant (ex: /cu) para remover ao fazer proxy. */
function getTenantPathPrefix(req: express.Request): string {
  const pathPart = (req.path || req.url || '/').split('?')[0];
  const m = pathPart.match(/^\/([a-z0-9_-]+)(?:\/|$)/i);
  if (!m) return '';
  const segment = m[1].toLowerCase();
  if (RESERVED_PATH_SEGMENTS.has(segment)) return '';
  return `/${m[1]}`;
}

/** Remove o prefixo do tenant do path (ex: /cu/planos.html -> /planos.html). */
function stripTenantPrefix(path: string, prefix: string): string {
  if (!prefix || !path.startsWith(prefix)) return path;
  const rest = path.slice(prefix.length) || '/';
  return rest.startsWith('/') ? rest : '/' + rest;
}

/** Host para proxy aos containers tenant. Em Docker use host.docker.internal ou IP do host. */
const PROXY_BACKEND_HOST = process.env.PROXY_BACKEND_HOST || '127.0.0.1';

/** pathPrefix: prefixo do tenant para remover do path (ex: /oty). forwardedPrefix: valor do header X-Forwarded-Prefix (ex: /oty/portal para o container injetar no HTML). */
function proxyToTenant(
  port: number,
  req: express.Request,
  res: express.Response,
  pathPrefix: string,
  forwardedPrefix?: string
): void {
  const pathPart = (req.url || '/').split('?')[0] || '/';
  const q = req.url?.includes('?') ? '?' + req.url.split('?')[1] : '';
  const backendPath = pathPrefix ? stripTenantPrefix(pathPart, pathPrefix) : pathPart;
  const opts: http.RequestOptions = {
    hostname: PROXY_BACKEND_HOST,
    port,
    path: backendPath + q,
    method: req.method,
    headers: {
      ...req.headers,
      host: req.headers.host || 'localhost',
      'x-forwarded-prefix': forwardedPrefix ?? pathPrefix ?? req.headers['x-forwarded-prefix'] ?? '',
      ...(req.tenant
        ? { 'x-tenant-id': String(req.tenant.id), 'x-tenant-slug': req.tenant.slug }
        : {}),
    },
  };
  const proxyReq = http.request(opts, (proxyRes) => {
    res.status(proxyRes.statusCode || 200);
    Object.keys(proxyRes.headers).forEach((k) => {
      const v = proxyRes.headers[k];
      if (v !== undefined && !['transfer-encoding'].includes(k.toLowerCase())) res.setHeader(k, v);
    });
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => res.status(502).send('Site do provedor temporariamente indisponível.'));
  req.pipe(proxyReq);
}

function sendRootOrLanding(_req: express.Request, res: express.Response, sendLanding: boolean): void {
  const landingPath = path.join(webDir, 'saas-landing.html');
  const indexPath = path.join(webDir, 'index.html');
  const send = (p: string) => {
    res.sendFile(p, (err) => {
      if (err) {
        console.error('[Root] sendFile failed:', p, err);
        if (sendLanding) res.status(500).send('<h1>Erro</h1><p>Arquivo não encontrado. Verifique se a pasta web/ está na instalação.</p>');
        else res.redirect(302, '/');
      }
    });
  };
  if (sendLanding) send(landingPath);
  else send(indexPath);
}

// Raiz: sempre que existir um provedor (tenant), mostrar o site do provedor; só sem tenant mostrar landing SaaS
app.get('/', async (req, res, _next) => {
  try {
    let tenant = req.tenant ?? (await getTenantOrDefault(req));
    if (tenant) req.tenant = tenant;
    if (!tenant) {
      sendRootOrLanding(req, res, true);
      return;
    }
    if (TENANT_MODE) {
      res.sendFile(path.join(siteStaticPath, 'index.html'), (err) => {
        if (err) {
          // site/static não existe (standalone): servir página do provedor (web/index.html)
          sendRootOrLanding(req, res, false);
        }
      });
      return;
    }
    const sitePort = tenant.config?.provisioning?.ports?.sitePort;
    const pathPrefix = getTenantPathPrefix(req);
    if (sitePort) {
      proxyToTenant(sitePort, req, res, pathPrefix);
    } else {
      sendRootOrLanding(req, res, false);
    }
  } catch (err) {
    console.error('[Root] GET /', err);
    sendRootOrLanding(req, res, true);
  }
});
app.get('/index.html', async (req, res, _next) => {
  try {
    let tenant = req.tenant ?? (await getTenantOrDefault(req));
    if (tenant) req.tenant = tenant;
    if (!tenant) {
      res.redirect(302, '/');
      return;
    }
    if (TENANT_MODE) {
      res.sendFile(path.join(siteStaticPath, 'index.html'), (err) => {
        if (err) {
          // site/static não existe (standalone): servir página do provedor (web/index.html)
          sendRootOrLanding(req, res, false);
        }
      });
      return;
    }
    const sitePort = tenant.config?.provisioning?.ports?.sitePort;
    const pathPrefix = getTenantPathPrefix(req);
    if (sitePort) {
      proxyToTenant(sitePort, req, res, pathPrefix);
    } else {
      sendRootOrLanding(req, res, false);
    }
  } catch (err) {
    console.error('[Root] GET /index.html', err);
    res.redirect(302, '/');
  }
});

// Demais requisições do tenant: assets do portal, proxy para site ou portal (sem Nginx externo)
app.all('*', (req, res, next) => {
  if (!req.tenant) return next();
  const ports = req.tenant.config?.provisioning?.ports;
  const sitePort = ports?.sitePort;
  const adminPort = ports?.adminPort;
  const pathPrefix = getTenantPathPrefix(req);
  const pathPart = (req.path || req.url || '/').split('?')[0];

  // Modo tenant (container): servir site static para paths que não são /portal ou /api
  if (TENANT_MODE) {
    if (pathPart.startsWith('/portal') || pathPart.startsWith('/api')) {
      return next();
    }
    const origUrl = req.url;
    req.url = pathPart || '/';
    express.static(siteStaticPath, { index: 'index.html' })(req, res, () => {
      req.url = origUrl;
      next();
    });
    return;
  }

  // /cu/assets/* → servir do web/assets (para portal em /cu/portal/ carregar JS/CSS com base path)
  if (pathPart.startsWith(pathPrefix + '/assets')) {
    const assetsPrefix = pathPrefix + '/assets';
    const rest = pathPart.slice(assetsPrefix.length) || '/';
    const restPath = rest.startsWith('/') ? rest : '/' + rest;
    req.url = restPath + (req.url?.includes('?') ? '?' + req.url.split('?')[1] : '');
    express.static(path.join(webDir, 'assets'))(req, res, next);
    return;
  }

  // /cu/portal/, /cu/api/* → proxy para portal (adminPort); enviar X-Forwarded-Prefix /cu/portal para o container injetar no HTML
  if (adminPort && (pathPart.startsWith(pathPrefix + '/portal') || pathPart.startsWith(pathPrefix + '/api'))) {
    proxyToTenant(adminPort, req, res, pathPrefix, pathPrefix + '/portal');
    return;
  }
  // /cu/* → proxy para site (sitePort) — HTML estático
  if (sitePort) {
    proxyToTenant(sitePort, req, res, pathPrefix);
    return;
  }
  next();
});

app.use(express.static(path.join(rootDir, 'web')));

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  console.error('[App]', err);
  res.status(500).send('<h1>Erro interno</h1><p>Tente novamente ou consulte os logs do servidor.</p>');
});

app.use((_req, res) => {
  const notFoundPath = path.join(rootDir, 'web', '404.html');
  res.status(404).sendFile(notFoundPath, (_err) => {
    if (_err) res.status(404).send('<h1>404</h1><p>Página não encontrada.</p>');
  });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`[Multi Portal] Online em http://localhost:${port}`);
});
