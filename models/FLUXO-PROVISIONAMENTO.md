# Fluxo de provisionamento — passo a passo

Modelo do fluxo para criar o stack do provedor: **PostgreSQL → FreeRADIUS → Portal+Site (Node)**.

---

## Visão geral

Ao criar um provedor via `POST /api/saas/tenants`, o sistema monta o stack **por etapas**, na ordem abaixo. Cada etapa depende da anterior estar OK.

```
┌─────────────────────────────────────────────────────────────────┐
│  PREPARAÇÃO (1–4)                                               │
│  Pastas, portas, arquivos (.env, docker-compose, SQL, radius)   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ETAPA 1 — PostgreSQL                                            │
│  docker compose up -d --wait postgres                            │
│  → Porta, usuário e senha gravados no config                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ETAPA 2 — FreeRADIUS                                            │
│  docker compose up -d freeradius                                 │
│  → Usa Postgres (postgres:5432) e credenciais do .env           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ETAPA 3 — Portal + Site (Node)                                  │
│  docker compose up -d portal_admin                               │
│  → Um único container: site estático + portal admin             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Passos detalhados

### Passo 1 — Preparação da stack

1. Criar diretório `TENANTS_BASE_PATH/<slug>/`
2. Criar subpastas: `site/static/`, `postgres/init/`, `radius/` (mods, sites)
3. Alocar portas:
   - **TCP:** `APP_PORT` (portal+site), `PG_HOST_PORT` (Postgres no host)
   - **UDP:** `RADIUS_AUTH_PORT`, `RADIUS_ACCT_PORT`
4. Gerar arquivos:
   - `.env` — variáveis do tenant (PG_DB, PG_USER, PG_PASS, APP_PORT, etc.)
   - `docker-compose.yml` — serviços postgres, portal_admin, freeradius
   - `postgres/init/` — 01-schema.sql, 02-tenant.sql, 03-radius-schema.sql (ou só 02 se modelo)
   - `radius/` — clients.conf, users, mods sql, sites default
   - `site/static/` — copiar de `models/site/` com placeholders substituídos

---

### Passo 2 — Subir PostgreSQL

```bash
docker compose up -d --wait postgres
```

- **Container:** `pg_<slug>`
- **Imagem:** `postgres:16-alpine` ou `PROVISION_POSTGRES_IMAGE` (modelo)
- **Porta no host:** `PG_HOST_PORT` (127.0.0.1) — para acesso externo/debug
- **Credenciais:** `PG_DB`, `PG_USER`, `PG_PASS` no `.env` e em `config_json.provisioning`
- **Healthcheck:** espera `pg_isready` antes de continuar

**Resultado:** banco criado, porta/usuário/senha disponíveis para FreeRADIUS e portal.

---

### Passo 3 — Subir FreeRADIUS

```bash
docker compose up -d freeradius
```

- **Container:** `radius_<slug>`
- **Imagem:** `freeradius/freeradius-server:latest`
- **Portas UDP:** auth (1812), acct (1813) mapeadas no host
- **Conexão:** usa Postgres via `radius/mods-available/sql` (host=postgres, credenciais do .env)
- **Configs:** `radius/clients.conf`, `radius/users`, sites default

**Resultado:** RADIUS autenticando contra o banco do tenant.

---

### Passo 4 — Subir Portal + Site (Node)

```bash
docker compose up -d portal_admin
```

- **Container:** `portal_<slug>`
- **Imagem:** Node (Dockerfile) ou `PROVISION_PORTAL_ADMIN_IMAGE`
- **Porta:** `APP_PORT` (3000 no container)
- **Volume:** `./site/static:/app/site/static:ro`
- **Modo tenant:** `TENANT_SLUG` no env → serve site de `site/static` e portal em `/portal`, `/api`

**Resultado:** site institucional em `/` e portal admin em `/portal/` no mesmo processo Node.

---

## Ordem e dependências

| Etapa | Serviço      | Depende de   | Comando                          |
|-------|--------------|--------------|----------------------------------|
| 1     | postgres     | —            | `up -d --wait postgres`         |
| 2     | freeradius   | postgres     | `up -d freeradius`               |
| 3     | portal_admin | postgres, radius | `up -d portal_admin`      |

---

## Configuração salva

Após o sucesso, em `config_json.provisioning`:

- `stackPath` — caminho do stack
- `ports` — sitePort, adminPort (= APP_PORT), pgHostPort, radiusAuthPort, radiusAcctPort
- `dbName`, `dbUser`, `dbPass` — credenciais do Postgres
- `radiusSecret` — secret para NAS
- `status` — `running`

Arquivo `INSTALADO.txt` na pasta do tenant com resumo (data, portas, banco).
