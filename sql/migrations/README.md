# Migrações PostgreSQL

Scripts de migração para o banco do **tenant** (portal + RADIUS). O banco central usa as migrações listadas em `scripts/update-databases.mjs` (MIGRATIONS_CENTRAL).

## Como rodar

- **Todos os tenants provisionados**  
  `npm run update-databases -- --tenants`

- **Um tenant**  
  `npm run update-databases -- --tenants <slug>`

- **Só banco central**  
  `npm run update-databases`

- **Direto no banco do tenant**  
  `psql -U user -d tenant_db -f sql/migrations/001_radius_portal.pg.sql`

## Migrações

| Arquivo | Descrição |
|---------|-----------|
| `001_radius_portal.pg.sql` | Schema FreeRADIUS (radacct, nas, radcheck, radreply, radusergroup, radpostauth) + recursos do portal (tenant_radius_config, vouchers, franquia em planos, MAC em instalação, NAS secret). Idempotente (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS). |

Dependências: tabelas `tenants`, `tenant_nas`, `plans`, `installations` (criadas por `schema.pg.sql`).
