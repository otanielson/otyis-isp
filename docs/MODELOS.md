# Modelos Multi-Portal

Guia para uso dos modelos ao criar novos provedores.

## Roteamento sem Nginx

O app faz proxy interno por path: `/{slug}/` → site, `/{slug}/portal/` e `/{slug}/api/` → portal.
Não é necessário Nginx externo; o app na porta 8080 (ou PORT) atende tudo.

## Estrutura

```
models/
├── site/          # Site institucional (HTML, partials, assets)
├── admin/         # Portal do provedor (README)
├── postgres/      # Schema PostgreSQL (README + referência sql/)
└── radius/        # FreeRADIUS (README — configs geradas)
```

## Fluxo de provisionamento (passo a passo)

Ver **`models/FLUXO-PROVISIONAMENTO.md`** para o fluxo detalhado.

1. **Criar provedor** via API SaaS (`POST /api/saas/tenants` + provision)
2. O orquestrador:
   - Cria diretório do tenant
   - Copia `models/site` com placeholders substituídos
   - Copia páginas extras de `web/` (planos, assinar, etc.)
   - Gera `.env`, `docker-compose.yml`, `radius/`, `postgres/init/`
   - Sobe containers **por etapa**:
     - **Etapa 1:** PostgreSQL (`up -d --wait postgres`) — porta, user, senha gravados
     - **Etapa 2:** FreeRADIUS (`up -d freeradius`) — usa Postgres
     - **Etapa 3:** Portal + Site (`up -d portal_admin`) — um container Node

## Placeholders

| Placeholder      | Exemplo   |
|------------------|------------|
| `{{PROVIDER_NAME}}` | Oty ISP   |
| `{{PROVIDER_SLUG}}` | otyisisp  |
| `{{PROVIDER_DOMAIN}}` | otyisisp.com.br |
| `{{BASE_PATH}}`  | /otyisisp/ |

## Export manual

Para exportar modelos sem provisionar (ex.: revisar antes de subir):

```bash
node scripts/export-provider.mjs --slug otyisisp --name "Oty ISP"
# Saída: ./export/otyisisp/
```

## Imagens modelo Docker

### Postgres

```bash
docker build -f docker/Dockerfile.postgres-model -t multi-portal-postgres:model .
```

### Portal Admin

```bash
docker build -t multi-portal-admin:model .
```

### Variáveis de ambiente (host)

```env
PROVISION_POSTGRES_IMAGE=multi-portal-postgres:model
PROVISION_POSTGRES_MODEL=1
PROVISION_PORTAL_ADMIN_IMAGE=multi-portal-admin:model
# Portal e site estão no mesmo container (PROVISION_SITE_IMAGE removido)
```

## Personalização

- **Site**: edite `models/site/` e adicione páginas em `web/` para o export incluir
- **Admin/Portal**: edite `web/portal/dashboard.html` e `config/routes.config.ts`
- **Postgres**: edite `sql/schema.pg.sql` e `sql/radius-schema.pg.sql`
- **Radius**: configs geradas em `composeGenerator.ts`; customize `generateRadius*` se necessário
