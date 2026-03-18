#!/usr/bin/env node
/**
 * Build portal SPA: merge login + dashboard into single HTML
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.join(__dirname, '..');
const loginPath = path.join(root, 'web/portal/login.html');
const dashboardPath = path.join(root, 'web/portal/dashboard.html');
const outPath = path.join(root, 'web/portal/spa.html');

const loginHtml = fs.readFileSync(loginPath, 'utf8');
const dashboardHtml = fs.readFileSync(dashboardPath, 'utf8');

// Extract login body content (between <body> and </body>)
const loginBodyMatch = loginHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
const loginBody = loginBodyMatch ? loginBodyMatch[1].trim() : '';

// Extract login styles
const loginStyleMatch = loginHtml.match(/<style>([\s\S]*?)<\/style>/);
const loginStyle = loginStyleMatch ? loginStyleMatch[1] : '';

// Dashboard: head content only (inside <head>...</head>)
const dashHeadMatch = dashboardHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
const dashHeadContent = dashHeadMatch ? dashHeadMatch[1] : '';

const dashBodyMatch = dashboardHtml.match(/<body[^>]*>([\s\S]*?)<script src="https:\/\/cdn\.jsdelivr\.net/);
const dashBody = dashBodyMatch ? dashBodyMatch[1].trim() : '';

const spa = `<!doctype html>
<html lang="pt-br">
<head>
${dashHeadContent}
  <style>
    /* Login view — Ant Design */
    .spa-view-login-wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-height: 100vh; background: #f5f5f5; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .spa-view-login-wrap .login-card { max-width: 420px; width: 100%; background: #fff; border-radius: 6px; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.03), 0 1px 6px -1px rgba(0,0,0,0.02); border: 1px solid #f0f0f0; overflow: hidden; }
    .spa-view-login-wrap .login-card__header { background: #fafafa; padding: 2rem; text-align: center; border-bottom: 1px solid #f0f0f0; }
    .spa-view-login-wrap .login-card__header i { font-size: 2.75rem; color: #1677ff; }
    .spa-view-login-wrap .login-card__title { font-size: 1.5rem; font-weight: 600; color: rgba(0,0,0,0.88); margin-top: 0.5rem; }
    .spa-view-login-wrap .login-card__header .text-muted { color: rgba(0,0,0,0.45) !important; }
    .spa-view-login-wrap .login-card__header .text-muted a { color: #1677ff; }
    .spa-view-login-wrap .login-card__body { padding: 2rem; }
    .spa-view-login-wrap .login-card__body .btn-primary { background: #1677ff !important; border-color: #1677ff !important; color: #fff; }
    .spa-view-login-wrap .login-card__body .btn-primary:hover { background: #4096ff !important; border-color: #4096ff !important; color: #fff; }
    .spa-view-login-wrap .login-card__back { display: inline-flex; align-items: center; gap: 0.35rem; color: rgba(0,0,0,0.45); text-decoration: none; font-size: 0.9rem; margin-top: 1rem; font-weight: 500; }
    .spa-view-login-wrap .login-card__back:hover { color: #1677ff; }
    #spa-view-login, #spa-view-dashboard { display: none; }
  </style>
</head>
<body>
  <div id="spa-view-login" class="spa-view-login-wrap">
${loginBody}
  </div>
  <div id="spa-view-dashboard" class="admin-dash" style="display:none;">
${dashBody}
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.js"></script>
  <script src="/assets/js/portal-modals.js"></script>
  <script src="/assets/js/portal-spa.js"></script>
</body>
</html>
`;

fs.writeFileSync(outPath, spa, 'utf8');
console.log('Built:', outPath);
