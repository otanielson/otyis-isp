# Banco PostgreSQL

O projeto foi migrado de MySQL para **PostgreSQL**.

## Configuração

1. **Instale o PostgreSQL** (se ainda não tiver) e crie o banco:

   ```bash
   createdb -U postgres multitelecom_portal
   ```

2. **Configure o `.env`** (copie de `.env.example`):

   ```
   DB_HOST=127.0.0.1
   DB_PORT=5432
   DB_USER=postgres
   DB_PASS=sua-senha-aqui
   DB_NAME=multitelecom_portal
   ```

3. **Execute o schema** (cria tabelas, tenants, RBAC, seed de permissões):

   ```bash
   node scripts/run-saas-sql.mjs
   ```

   O script usa as variáveis `DB_*` do `.env` e executa `sql/schema.pg.sql`.

## Arquivos

- **`sql/schema.pg.sql`** — Schema completo em PostgreSQL (customers, subscription_requests, tenants, RBAC, tenant_nas, plans, installations, invoices, clube_page_config, seed de permissões).
- **`src/db.ts`** — Pool `pg` + wrapper que converte parâmetros nomeados (`:name`) e `?` para `$1, $2`, e devolve formato compatível com o que o código esperava (insertId, affectedRows).

## Observações

- Booleans: use `true`/`false` nas queries (não use 1/0).
- UPDATE com JOIN: em PostgreSQL use `UPDATE t SET ... FROM other WHERE ...`.
- INSERT com id gerado: use `RETURNING id` e o wrapper preenche `insertId`.
- JSON: colunas usam tipo `JSONB`; o driver aceita string e converte.
