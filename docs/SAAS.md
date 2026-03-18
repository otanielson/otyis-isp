# Multi-Portal como SaaS

O sistema está preparado para operar como **SaaS (Software as a Service)**: uma única instalação serve vários **tenants** (provedores/ISPs), com dados e configurações isolados por tenant.

## Portal do provedor: Master + RBAC

- **Usuário Master**: um por tenant, criado automaticamente ao criar o tenant. Pode tudo dentro do tenant (usuários, roles, permissões, NAS, PPPoE, planos, etc.).
- **Staff**: usuários criados pelo Master, com roles e permissões (RBAC). Só acessam o que o Master liberar.
- **Permissões**: catálogo global em `tenant_permissions` (ex.: `nas.create`, `pppoe.view`, `iam.users.create`). Roles recebem permissões; usuários recebem roles.

## Conceitos

- **Tenant** = um cliente do SaaS (ex.: uma ISP). Cada tenant tem:
  - `slug` único (ex.: `isp-alfa`)
  - `name` (nome comercial)
  - `subdomain` (ex.: `isp-alfa` → `isp-alfa.portal.saas.com`) ou `custom_domain` (ex.: `portal.isp.com.br`)
  - `config_json` com configurações por tenant (RADIUS, branding, etc.)

- **Isolamento**: tabelas principais possuem `tenant_id`. Todas as queries devem filtrar por `tenant_id` do tenant da requisição.

## Scripts SQL

1. **`sql/saas_tenants.sql`** — Cria a tabela `tenants` e insere o tenant padrão (`id = 1`, `slug = 'default'`).
2. **`sql/saas_migration_tenant_id.sql`** — Adiciona `tenant_id` em `customers`, `subscription_requests` e `plans`.
3. **`sql/rbac_tenant_users_roles.sql`** — Cria `tenant_users`, `tenant_roles`, `tenant_permissions`, `tenant_role_permissions`, `tenant_user_roles`.
4. **`sql/rbac_seed_permissions.sql`** — Insere o catálogo de permissões (iam.*, nas.*, pppoe.*, plans.*, sessions.*, reports.*, users.*, settings.*).

Rodar tudo: `node scripts/run-saas-sql.mjs` (usa .env para conexão).

## Identificação do tenant na requisição

O tenant pode ser definido por:

| Estratégia        | Exemplo                          | Uso típico                    |
|-------------------|-----------------------------------|--------------------------------|
| **Subdomínio**    | `isp-alfa.portal.saas.com`       | Produção com um domínio base   |
| **Domínio próprio** | `portal.cliente.com.br`        | White-label por tenant         |
| **Header**        | `X-Tenant-Id: 2` ou `X-Tenant-Slug: isp-alfa` | APIs / apps móveis |

No código, use o middleware **`resolveTenant`** em `src/tenant.ts`, que define `req.tenant` a partir do host ou do header. Para ativar em todas as rotas da API:

```ts
// server.ts ou src/routes/api.ts
import { resolveTenant } from './src/tenant.js';
// ...
app.use(resolveTenant);   // ou apiRouter.use(resolveTenant);
```

Assim, rotas podem usar `req.tenant` (id, slug, config com RADIUS/branding por tenant).

### Gerenciamento de domínio pelo admin do SaaS

O dono do SaaS (login em `/admin` com `ADMIN_KEY`) pode definir como cada provedor acessa o portal:

- **Subdomínio** (opcional): ex. `provedor-alfa` → o provedor acessa `provedor-alfa.BASE_DOMAIN`.
- **Domínio próprio** (opcional): ex. `portal.empresa.com.br` → o provedor usa o domínio da própria empresa (white-label).

No dashboard do admin (`/admin/dashboard`), na aba **Provedores (Tenants)**, use **Gerenciar domínio** em cada provedor para preencher subdomínio e/ou domínio próprio e status (Ativo, Suspenso, Trial, Cancelado).

**Para o domínio próprio funcionar:** o provedor deve apontar o DNS do domínio (registro CNAME ou A) para o servidor onde o SaaS está hospedado. O app usa o header `Host` da requisição (ou `X-Forwarded-Host` quando atrás de proxy) para identificar o tenant.

### Não consigo acessar o provedor por subdomínio (ex: otaota.otyisisp.otnsoft.com.br/portal)

1. **BASE_DOMAIN no .env**  
   Defina no servidor onde o app roda:  
   `BASE_DOMAIN=otyisisp.otnsoft.com.br`  
   (sem https://, sem barra, só o host). Reinicie o app.

2. **Proxy (Nginx, etc.)**  
   Se o app está atrás de proxy reverso, o proxy deve repassar o host original:
   ```nginx
   location / {
     proxy_pass http://localhost:8080;
     proxy_set_header Host $host;
     proxy_set_header X-Forwarded-Host $host;
     proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```
   O app usa `X-Forwarded-Host` quando existir (para resolver o tenant pelo subdomínio).

3. **DNS**  
   O subdomínio deve apontar para o servidor: registro **A** ou **CNAME** para `otaota.otyisisp.otnsoft.com.br` (ou wildcard `*.otyisisp.otnsoft.com.br`).

4. **Banco**  
   O tenant deve ter `subdomain = 'otaota'` e `status = 'ACTIVE'`. Ao criar o provedor pelo Admin, o subdomínio é preenchido com o slug; confira no Admin → Gerenciar domínio.

- **API:** `PATCH /api/saas/tenants/:id` com body `{ "custom_domain": "portal.empresa.com.br", "subdomain": "provedor-alfa", "status": "ACTIVE" }` (todos opcionais).

## Configuração por tenant (`config_json`)

Cada tenant pode ter em `config_json`:

```json
{
  "radius": {
    "host": "10.0.0.5",
    "port": 1812,
    "secret": "shared-secret",
    "nasIp": "10.0.0.1"
  },
  "branding": {
    "companyName": "ISP Alfa",
    "logoUrl": "/static/tenant/logo.png"
  },
  "adminKeyHash": "hash-da-senha-admin-deste-tenant"
}
```

- **RADIUS**: hoje o app usa variáveis de ambiente globais. Na versão SaaS, o módulo RADIUS deve usar `tenant.config_json.radius` quando `req.tenant` estiver definido.
- **Admin**: em vez de uma única `ADMIN_KEY`, cada tenant pode ter sua própria chave (ou hash) em `config_json.adminKeyHash`, validada no middleware de admin.

## Próximos passos no código

1. **Middleware de tenant**  
   Em toda requisição: resolver tenant por subdomínio/domínio ou header e definir `req.tenant` (id, slug, config_json). Retornar 404 ou 401 se o tenant não existir ou estiver inativo.

2. **Queries com `tenant_id`**  
   Em todas as consultas e inserções em tabelas que têm `tenant_id`, usar o `req.tenant.id` (ex.: `WHERE tenant_id = :tid`).

3. **RADIUS por tenant**  
   Em `radius.ts`: se houver `req.tenant` e `tenant.config_json.radius`, usar essa configuração; caso contrário, manter o comportamento atual com variáveis de ambiente (compatível com single-tenant).

4. **Admin por tenant**  
   Validar acesso ao admin usando a chave/hash do tenant (em `config_json`) em vez da `ADMIN_KEY` global.

5. **Onboarding**  
   Fluxo (admin super ou página de cadastro) para criar novo tenant: inserir em `tenants`, configurar subdomínio/domínio e `config_json` inicial.

6. **Provisionamento Docker (opcional)**  
   Com `PROVISION_DOCKER=1`, ao criar o tenant o sistema pode subir automaticamente um stack por provedor (portal+site + FreeRADIUS), com portas livres. Ver [PROVISIONING.md](PROVISIONING.md).

## Variáveis de ambiente (SaaS)

- **`BASE_DOMAIN`** — Domínio base para subdomínios (ex.: `portal.saas.com`). Requisições a `{slug}.portal.saas.com` mapeiam para o tenant com `subdomain = slug`.
- As variáveis atuais (`DB_*`, `RADIUS_*`, `ADMIN_KEY`) continuam válidas para o **tenant padrão** ou para modo single-tenant até a migração completa.

## APIs do portal do provedor (RBAC)

Todas sob `/api`. Autenticação: JWT no header `Authorization: Bearer <token>` (exceto login e rotas SaaS).

| Método | Rota | Quem | Descrição |
|--------|------|------|-----------|
| POST | `/api/auth/login` | — | Body: `email`, `password`. Retorna `token` e `user` (roles, permissions, isMaster). |
| GET | `/api/auth/me` | Autenticado | Retorna tenant, user, roles, permissions. |
| POST | `/api/saas/tenants` | **SAAS_ADMIN_KEY** (header `x-saas-admin-key`) | Body: `tenantName`, `slug`, `masterName`, `masterEmail`, `masterPassword`. Cria tenant + usuário Master + role Master com todas permissões. |
| GET | `/api/portal/permissions` | iam.permissions.read | Catálogo de permissões. |
| GET/POST | `/api/portal/roles` | iam.roles.read / iam.roles.create | Listar / criar roles. |
| GET | `/api/portal/roles/:roleId/permissions` | iam.roles.read | Permissões da role. |
| PUT | `/api/portal/roles/:roleId/permissions` | iam.roles.update | Body: `permissionCodes: string[]`. Atribui permissões à role (Master é protegida). |
| GET/POST | `/api/portal/users` | iam.users.read / iam.users.create | Listar / criar usuários (staff). |
| PUT | `/api/portal/users/:userId/roles` | iam.users.update | Body: `roleIds: number[]`. Atribui roles ao usuário (Master não pode ser alterado). |

**Variáveis .env**: `JWT_SECRET`, `JWT_EXPIRES_IN`, `SAAS_ADMIN_KEY`.

## Resumo

- **Banco**: `tenants`, `tenant_users`, `tenant_roles`, `tenant_permissions`, `tenant_role_permissions`, `tenant_user_roles`; `tenant_id` nas tabelas de negócio.
- **Auth**: login por email/senha → JWT (tenantId, userId, roles, permissions, isMaster). Middleware `requireAuth` + `requirePerm('code')`; Master sempre passa.
- **SaaS**: criar provedor via POST `/api/saas/tenants` com `SAAS_ADMIN_KEY`; cria tenant + Master com todas permissões.
- **Compatibilidade**: admin atual (`ADMIN_KEY`, cookie) continua para o painel admin legado; portal do provedor usa JWT e RBAC.
