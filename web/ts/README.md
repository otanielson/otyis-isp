# Frontend — 100% TypeScript

Todo o frontend do portal e painéis é escrito em **TypeScript**. Os arquivos `.ts` nesta pasta são compilados para `web/assets/js/*.js` pelo build.

## Estrutura

- **portal-dashboard.ts** — Dashboard do provedor (portal), abas e modais
- **portal-spa.ts** — SPA do portal (login + dashboard em uma página)
- **portal-modals.ts** — Utilitários de modais
- **portal-modelos-proposta.ts** — Página de modelos de proposta
- **admin-dashboard.ts** — Painel admin (standalone / SaaS)
- **client-portal.ts** — Portal do cliente (login, faturas, chamados)
- **dashboard-tabs-loader.ts** — Carregamento de fragmentos de abas
- **dashboard-panels.ts** — Painéis e modais SPA
- **site.ts**, **site-config.ts**, **home.ts**, **include.ts**, **finance-dashboard.ts** — Site e demais scripts

## Build

```bash
npm run build:portal
```

Gera os arquivos em `web/assets/js/`. O deploy (`./deploy.sh`) já executa esse passo.

## Edição

Sempre edite os arquivos `.ts` — não edite os `.js` em `assets/js`, pois são sobrescritos no build.
