# Páginas e Rotas — Multi Portal

Documentação das páginas (HTML) e rotas (API) do projeto.

**Design system:** qual CSS usar em cada página → [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

---

## 1. Páginas (front-end)

### 1.1 Raiz e site público

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `GET /` | `index.html` ou `saas-landing.html` | Com tenant: home do site. Sem tenant: landing do SaaS. |
| `GET /index.html` | idem | Redireciona para `/` ou serve index. |
| `GET /planos.html` | `web/planos.html` | Página de planos de internet. |
| `GET /assinar.html` | `web/assinar.html` | Assinatura / cadastro de pedido. |
| `GET /noticias/index.html` | `web/noticias/index.html` | Listagem de notícias. |
| `GET /noticias/post-1.html` | `web/noticias/post-1.html` | Post 1. |
| `GET /noticias/post-2.html` | `web/noticias/post-2.html` | Post 2. |
| `GET /noticias/post-3.html` | `web/noticias/post-3.html` | Post 3. |
| `GET /clube/index.html` | `web/clube/index.html` | Página do Clube Multi. |
| `GET /clube/stand.html` | `web/clube/stand.html` | Cadastro do stand. |
| `GET /cliente/index.html` | `web/cliente/index.html` | Área do cliente. |
| (qualquer outra) | `web/404.html` | Página não encontrada. |

Arquivos estáticos em `web/` (CSS, JS, imagens) são servidos pelo Express em `/`.

### 1.2 Admin do SaaS

Montagem: `server.ts` → `adminPageRouter` (`src/routes/adminPages.ts`).

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `GET /admin` | `web/admin/login.html` | Login do admin SaaS. |
| `GET /admin/` | idem | Login. |
| `GET /admin/dashboard` | `web/admin/dashboard.html` | Dashboard (requer sessão). |

### 1.3 Portal do Provedor

Montagem: `server.ts` → `portalPageRouter` (`src/routes/portalPages.ts`).

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `GET /portal` | `web/portal/login.html` | Login do provedor. |
| `GET /portal/` | idem | Login. |
| `GET /portal/dashboard` | `web/portal/dashboard.html` | Dashboard do provedor (token no front). |

**Abas do dashboard (hash):** a mesma página usa `#<tab>` para “subpáginas”:

| Hash | Aba |
|------|-----|
| `#overview` | Visão geral |
| `#plans` | Planos |
| `#leads` | Pedidos |
| `#customers` | Clientes |
| `#installations` | Instalações |
| `#radius` | Servidor RADIUS |
| `#campaigns` | Campanhas |
| `#stand` | Stand |
| `#winners` | Vencedores |
| `#draw` | Sortear |
| `#finance` | Financeiro |
| `#clube` | Página Clube |

Exemplo: `/portal/dashboard#customers` abre o dashboard na aba Clientes.

---

## 2. Rotas de API

Montagem: `server.ts` → `apiRouter` (`src/routes/api.ts`).

### 2.1 Saúde e planos públicos

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Health check + DB. |
| GET | `/api/plans` | Lista planos (público). |

### 2.2 Auth (portal)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/login` | Login. |
| GET | `/api/auth/me` | Usuário autenticado (requer auth). |

### 2.3 SaaS (admin multi-tenant)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/saas/installation-info` | Dados do provedor desta instalação (nome, slug, e-mail Master, RADIUS, link do portal). Painel /admin. |
| PUT | `/api/saas/installation` | Atualizar dados do provedor (name, slug, masterEmail). Body: `{ "name"?, "slug"?, "masterEmail"? }`. |
| GET | `/api/saas/installation-provider` | Dados do provedor (provider_settings): nome fantasia, contato, endereço, branding. Mesmos do Portal → Administração. |
| PUT | `/api/saas/installation-provider` | Atualizar provider_settings (identidade, contato, endereço, logos, cores). Mesmo body do PUT /api/portal/provider. |
| GET | `/api/saas/tenants` | Lista tenants. |
| GET | `/api/saas/tenants/:id` | Detalhe do tenant. |
| POST | `/api/saas/tenants` | Criar tenant. |
| GET | `/api/saas/radius-status` | Status RADIUS. |
| POST | `/api/saas/radius-test` | Testar RADIUS. |
| GET | `/api/saas/tenants/:id/nas` | NAS do tenant. |
| POST | `/api/saas/tenants/:id/nas` | Criar NAS. |

### 2.4 Portal do Provedor (dados + IAM)

Prefixo: `/api/portal`. Autenticação: Bearer JWT.

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/portal/stats` | Estatísticas do dashboard. |
| GET | `/api/portal/radius-status` | Status RADIUS. |
| POST | `/api/portal/radius-test` | Testar RADIUS. |
| GET | `/api/portal/leads` | Pedidos. |
| GET | `/api/portal/leads/:id` | Detalhe do pedido. |
| GET | `/api/portal/plans` | Planos. |
| POST | `/api/portal/plans` | Criar plano. |
| GET | `/api/portal/customers` | Clientes. |
| GET | `/api/portal/customers/:id` | Ficha do cliente. |
| GET | `/api/portal/installations` | Instalações. |
| GET | `/api/portal/finance/stats` | Stats financeiro. |
| GET | `/api/portal/finance/invoices` | Faturas. |
| POST | `/api/portal/finance/invoices/generate` | Gerar faturas. |
| GET | `/api/portal/campaigns` | Campanhas. |
| POST | `/api/portal/campaigns` | Criar campanha. |
| GET | `/api/portal/stand` | Cadastros stand. |
| GET | `/api/portal/winners` | Vencedores. |
| GET | `/api/portal/raffles/active` | Campanha ativa. |
| POST | `/api/portal/raffles/:campaignId/draw` | Sortear. |
| GET | `/api/portal/clube-page` | Config da página Clube. |
| POST | (salvar clube) | Salvar config Clube. |
| GET | `/api/portal/permissions` | Permissões (IAM). |
| GET | `/api/portal/roles` | Roles. |
| POST | `/api/portal/roles` | Criar role. |
| GET | `/api/portal/roles/:roleId/permissions` | Permissões da role. |
| GET | `/api/portal/users` | Usuários. |
| POST | `/api/portal/users` | Criar usuário. |

### 2.5 Admin (API com sessão cookie)

Prefixo: `/api/admin`.

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/admin/login` | Login admin. |
| POST | `/api/admin/logout` | Logout. |
| GET | `/api/admin/stats` | Estatísticas. |
| GET | `/api/admin/radius-status` | RADIUS. |
| POST | `/api/admin/radius-test` | Testar RADIUS. |
| GET | `/api/admin/leads` | Pedidos. |
| GET | `/api/admin/leads/:id` | Detalhe pedido. |
| GET | `/api/admin/stand` | Stand. |
| GET | `/api/admin/raffles/active` | Campanha ativa. |
| POST | `/api/admin/raffles/:campaignId/draw` | Sortear. |
| GET | `/api/admin/plans` | Planos. |
| POST | `/api/admin/plans` | Criar plano. |
| GET | `/api/admin/customers` | Clientes. |
| GET | `/api/admin/customers/:id` | Ficha cliente. |
| GET | `/api/admin/finance/stats` | Stats financeiro. |
| GET | `/api/admin/finance/invoices` | Faturas. |
| POST | `/api/admin/finance/invoices/generate` | Gerar faturas. |
| GET | `/api/admin/installations` | Instalações. |
| GET | `/api/admin/campaigns` | Campanhas. |
| POST | `/api/admin/campaigns` | Criar campanha. |
| GET | `/api/admin/winners` | Vencedores. |
| GET | `/api/admin/clube-page` | Config página Clube. |

### 2.6 Assinaturas e Clube (público/contexto tenant)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/assinaturas/...` | Criar assinatura (leads). |
| POST | `/api/clube/stand/signup` | Cadastro stand. |
| GET | `/api/clube/page` | Conteúdo página Clube. |
| GET | `/api/clube/me` | Dados do usuário clube. |

---

## 3. Resumo por contexto

- **Site público (tenant):** `/`, `/planos.html`, `/assinar.html`, `/noticias/`, `/clube/`, `/cliente/`.
- **SaaS (sem tenant):** `/` → landing; `/admin` e `/admin/dashboard`; APIs em `/api/saas` e `/api/admin`.
- **Portal do Provedor:** `/portal`, `/portal/dashboard` (+ hash das abas); APIs em `/api/portal`.
- **Config central:** `config/routes.config.ts` (páginas e abas do portal).
