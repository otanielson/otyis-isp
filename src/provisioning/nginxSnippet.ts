/**
 * Gera blocos Nginx para acesso por path (sem DNS): /slug/ = site, /slug/portal/ = portal admin.
 * Usado pela API e pelo script scripts/update-nginx-tenants.mjs.
 */

export interface TenantPorts {
  sitePort?: number;
  adminPort?: number;
}

/**
 * Gera o bloco Nginx pronto para um tenant.
 * Porta real, barras finais consistentes, Websocket e comentário para sub_filter se assets quebrarem.
 */
export function buildNginxSnippetForTenant(
  slug: string,
  sitePort: number,
  adminPort: number | null
): { snippet: string; needsAdminPort: boolean } {
  const needPort = adminPort == null;
  const adminPortStr = adminPort != null ? String(adminPort) : 'ADMIN_PORT';
  const lines = [
    `    # Tenant: ${slug} — acesso por path (sem DNS)`,
    `    location /${slug}/portal/ {`,
    `        proxy_pass http://127.0.0.1:${adminPortStr}/portal/;`,
    `        proxy_http_version 1.1;`,
    `        proxy_set_header Host $host;`,
    `        proxy_set_header X-Real-IP $remote_addr;`,
    `        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
    `        proxy_set_header X-Forwarded-Proto $scheme;`,
    `        proxy_set_header X-Forwarded-Prefix /${slug}/portal/;`,
    `        proxy_set_header Upgrade $http_upgrade;`,
    `        proxy_set_header Connection "upgrade";`,
    `    }`,
    `    location /${slug}/ {`,
    `        proxy_pass http://127.0.0.1:${sitePort}/;`,
    `        proxy_set_header Host $host;`,
    `        proxy_set_header X-Real-IP $remote_addr;`,
    `        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
    `        proxy_set_header X-Forwarded-Proto $scheme;`,
    `        proxy_set_header X-Forwarded-Prefix /${slug}/;`,
    `        # Se CSS/JS quebrarem em subpath, descomente e ajuste:`,
    `        # sub_filter_once off; sub_filter 'href="/' 'href="/${slug}/'; sub_filter 'src="/' 'src="/${slug}/';`,
    `    }`,
  ];
  return { snippet: lines.join('\n'), needsAdminPort: needPort };
}

/**
 * Gera o snippet completo para vários tenants (só inclui quem tem sitePort e adminPort).
 */
export function buildFullNginxSnippet(tenants: { slug: string; sitePort: number; adminPort: number }[]): string {
  if (tenants.length === 0) {
    return '';
  }
  const blocks = tenants.map((t) => buildNginxSnippetForTenant(t.slug, t.sitePort, t.adminPort).snippet);
  return [
    '    # Multi-Portal — tenants por path (gerado automaticamente)',
    '    # Ordem: location /slug/portal/ antes de location /slug/ para cada tenant.',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}
