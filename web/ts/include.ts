/**
 * Multi Telecom — Inclusão de partials (header/footer)
 * Detecta base path do tenant para manter URLs corretas.
 */

function getBasePath(): string {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  if (
    parts.length >= 1 &&
    !parts[0].includes('.') &&
    !['admin', 'api', 'portal', 'assets'].includes(parts[0].toLowerCase())
  ) {
    return '/' + parts[0] + '/';
  }
  return '/';
}

async function include(id: string, url: string): Promise<void> {
  const el = document.getElementById(id);
  if (!el) return;
  const base = getBasePath();
  const fullUrl = (base !== '/' ? base.replace(/\/$/, '') : '') + url;
  const res = await fetch(fullUrl);
  if (!res.ok) return;
  let content = await res.text();
  const baseTrimmed = base.replace(/\/$/, '');
  if (base !== '/') {
    content = content.replace(
      /href="\/([a-z0-9_-]+)\//gi,
      'href="' + baseTrimmed + '/'
    );
    content = content.replace(
      /src="\/([a-z0-9_-]+)\//gi,
      'src="' + baseTrimmed + '/'
    );
  } else {
    content = content.replace(/href="\/([a-z0-9_-]+)\//gi, 'href="/');
    content = content.replace(/src="\/([a-z0-9_-]+)\//gi, 'src="/');
  }
  el.innerHTML = content;
  // Atualiza ano no footer quando for o placeholder do footer
  if (id === 'inc-footer') {
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  }
}

function loadSiteConfig(): void {
  const base = getBasePath();
  const src = (base !== '/' ? base.replace(/\/$/, '') : '') + '/assets/js/site-config.js';
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  document.body.appendChild(script);
}

document.addEventListener('DOMContentLoaded', () => {
  include('inc-header', '/partials/header.html');
  include('inc-footer', '/partials/footer.html');
  loadSiteConfig();
});
