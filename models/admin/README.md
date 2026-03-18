# Modelo Admin / Portal do Provedor

O portal do provedor é a aplicação Node.js (multi-portal) que serve:
- `/portal/` — Login
- `/portal/dashboard` — Painel (clientes, planos, RADIUS, etc.)

## Imagem Docker

A mesma imagem `multi-portal` é usada para todos os provedores. O tenant é identificado por `TENANT_SLUG` e `TENANT_ID` no ambiente.

## Personalização

Para branding por provedor, edite:
- `web/portal/dashboard.html` — Título e estilos
- `config/routes.config.ts` — Abas do dashboard

## Build da imagem modelo

```bash
docker build -t multi-portal-admin:model .
```

Defina no `.env`:
```
PROVISION_PORTAL_ADMIN_IMAGE=multi-portal-admin:model
```
