/**
 * Configuração central de páginas e rotas do Multi Portal.
 * Fonte única para documentação e possível uso no front/back.
 */

/** Rotas de páginas HTML (servidas pelo Express) */
export const PAGE_ROUTES = {
  /** Raiz: site do tenant ou landing do SaaS */
  home: '/',
  index: '/index.html',

  /** Site público (tenant) */
  planos: '/planos.html',
  assinar: '/assinar.html',
  noticias: {
    index: '/noticias/index.html',
    post1: '/noticias/post-1.html',
    post2: '/noticias/post-2.html',
    post3: '/noticias/post-3.html',
  },
  clube: {
    index: '/clube/index.html',
    stand: '/clube/stand.html',
  },
  cliente: '/cliente/index.html',

  /** Landing do SaaS (sem tenant) */
  saasLanding: '/', // ou saas-landing.html quando sem tenant

  /** Painel do dono do sistema (configuração desta instalação; login ADMIN_KEY) */
  admin: {
    base: '/admin',
    login: '/admin/',
    dashboard: '/admin/dashboard',
  },

  /** Portal admin do provedor (Master e equipe; login e-mail/senha) */
  portal: {
    base: '/portal',
    login: '/portal/',
    dashboard: '/portal/dashboard',
  },

  /** Erro */
  notFound: '/404.html',
} as const;

/** Abas do dashboard do Portal (hash na URL: /portal/dashboard#planos) */
export const PORTAL_DASHBOARD_TABS = [
  { id: 'overview', label: 'Visão geral', icon: 'bi-grid' },
  { id: 'plans', label: 'Planos', icon: 'bi-speedometer2' },
  { id: 'leads', label: 'Pedidos', icon: 'bi-person-lines-fill' },
  { id: 'customers', label: 'Clientes', icon: 'bi-people' },
  { id: 'installations', label: 'Instalações', icon: 'bi-hdd-network' },
  { id: 'radius', label: 'Servidor RADIUS', icon: 'bi-router' },
  { id: 'campaigns', label: 'Campanhas', icon: 'bi-trophy' },
  { id: 'stand', label: 'Stand', icon: 'bi-qr-code-scan' },
  { id: 'winners', label: 'Vencedores', icon: 'bi-award' },
  { id: 'draw', label: 'Sortear', icon: 'bi-shuffle' },
  { id: 'finance', label: 'Financeiro', icon: 'bi-currency-dollar' },
  { id: 'estoque', label: 'Estoque', icon: 'bi-boxes' },
  { id: 'clube', label: 'Página Clube', icon: 'bi-stars' },
] as const;

export type PortalTabId = (typeof PORTAL_DASHBOARD_TABS)[number]['id'];

/** Prefixos das APIs REST */
export const API_ROUTES = {
  health: '/api/health',
  plans: '/api/plans',
  auth: '/api/auth',
  saas: '/api/saas',
  portal: '/api/portal',
  admin: '/api/admin',
  assinaturas: '/api/assinaturas',
  clube: '/api/clube',
} as const;
