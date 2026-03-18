# SQL — Modelo PostgreSQL

## Arquivos principais (provisionamento)

| Arquivo | Uso |
|---------|-----|
| `schema.pg.sql` | Schema do portal (customers, plans, tenants, RBAC, etc.) |
| `radius-schema.pg.sql` | Tabelas FreeRADIUS (radcheck, radacct, nas, etc.) |

## Outros

| Arquivo | Uso |
|---------|-----|
| `saas_tenants.sql` | Tabela tenants (SaaS central) |
| `tenant_nas.sql` | NAS por tenant |
| `plans.sql` | Planos |
| `rbac_*.sql` | Permissões e roles |
| `isp_*.sql` | Extensões ISP (PPPoE, instalações) |
| `clube_page_config.sql` | Config da página Clube |
| `financeiro.sql` | Financeiro (MySQL) |
| `finance_suppliers_chart_payables.pg.sql` | **PostgreSQL:** Fornecedores, Plano de Contas, Contas a Pagar (execute se der "Tabela não disponível") |
