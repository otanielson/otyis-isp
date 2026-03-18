# Modelo PostgreSQL

Schema do banco de dados para cada provedor. Inclui:
- **01-schema.sql** — Tabelas do portal (customers, plans, tenants, etc.)
- **02-tenant.sql** — Gerado por provisionamento (UPDATE tenants com slug/nome)
- **03-radius-schema.sql** — Tabelas FreeRADIUS (radcheck, radacct, etc.)

## Build da imagem modelo

```bash
# Na raiz do projeto
docker build -f docker/Dockerfile.postgres-model -t multi-portal-postgres:model .
```

## Uso

Defina no `.env` do host:
```
PROVISION_POSTGRES_IMAGE=multi-portal-postgres:model
PROVISION_POSTGRES_MODEL=1
```

O provisionamento usará a imagem modelo e apenas o `02-tenant.sql` no volume init.
