# Instalação do sistema por provedor (SaaS)

Ao criar um provedor (tenant) via `POST /api/saas/tenants`, o sistema faz uma **instalação completa** para aquele provedor: stack Docker com banco de dados, painel, site e RADIUS. Para desativar, defina **PROVISION_DOCKER=0** no .env.

1. Valida slug (e opcionalmente domínio).
2. Cria o tenant e o usuário Master no banco central.
3. **Instala o sistema** para o provedor **por etapas** (no log):
   - **[1/6]** Estrutura de pastas em `/srv/tenants/<slug>/`.
   - **[2/6]** Alocação de portas (TCP: app portal+site, **Postgres no host**; UDP: RADIUS auth + acct).
   - **[3/6]** Geração de arquivos: `.env`, `docker-compose.yml`, schema do banco (PostgreSQL), FreeRADIUS, site estático.
   - **[4/6]** Scripts SQL em `postgres/init/` (schema do portal + RADIUS).
   - **[5/6]** Containers sobem **passo a passo** (para não dar problema):
     - **Etapa 1/3:** só **postgres** (`docker compose up -d --wait postgres`). Porta, usuário e senha do banco ficam definidos e gravados no `config_json.provisioning` (e no `.env` do tenant) para as próximas etapas.
     - **Etapa 2/3:** **FreeRADIUS** (`docker compose up -d freeradius`), já usando o Postgres e credenciais da etapa 1.
     - **Etapa 3/3:** **portal_admin** (portal + site em um container Node) (`docker compose up -d portal_admin`).
   - **[6/6]** Configuração salva no banco central; arquivo `INSTALADO.txt` na pasta do tenant (com porta do Postgres, user e banco).
4. Grava no banco: portas, paths e status em `config_json.provisioning` e `config_json.radius`.

## Variáveis de ambiente

| Variável | Descrição | Padrão |
|----------|------------|--------|
| `PROVISION_DOCKER` | `0` ou `false` = não provisiona; qualquer outro valor ou vazio = provisiona stack ao criar tenant | ativado (cria stack) |
| `TENANTS_BASE_PATH` | Diretório onde ficam os stacks (ex.: `/srv/tenants`) | `/srv/tenants` (Linux) ou `C:\srv\tenants` (Windows) |
| `PROVISION_APP_CONTEXT` | Caminho do código (para `docker build` do portal_admin quando não usa image) | `process.cwd()` |
| **Modelos (build uma vez, use em todos os tenants)** | | |
| `PROVISION_POSTGRES_IMAGE` | Imagem do Postgres (ex.: `multi-portal-postgres:model`). Com modelo, use junto `PROVISION_POSTGRES_MODEL=1`. | `postgres:16-alpine` |
| `PROVISION_POSTGRES_MODEL` | `1` = usa Postgres modelo: só 02-tenant.sql no init (a imagem já tem schema + RADIUS). | — |
| `PROVISION_PORTAL_ADMIN_IMAGE` | Imagem do portal-admin (ex.: `multi-portal-admin:latest`). Se definida, não faz build por tenant. | — |
| ~~`PROVISION_SITE_IMAGE`~~ | (Removido) Portal e site estão no mesmo container. | — |
| `PROVISION_TCP_PORT_START` / `PROVISION_TCP_PORT_END` | Range para portas TCP (site e portal admin). Uso automático acima de 4000. | 4001–49999 |
| `PROVISION_UDP_PORT_START` / `PROVISION_UDP_PORT_END` | Range para portas RADIUS (auth + acct). Uso automático acima de 4000. | 4001–49999 |
| **Acesso só por IP** | | |
| `PUBLIC_IP` | IP público do servidor. Quando definido, o link do provedor será `http://IP/slug/portal/` (prioridade sobre subdomínio). | — |
| `PUBLIC_HTTPS` | `1` = usa `https://` no link (quando tiver SSL no IP). | `http://` |

## Estrutura gerada por tenant

```
TENANTS_BASE_PATH/<slug>/
  docker-compose.yml
  .env                    # variáveis do stack (PG_*, RADIUS_*, BASE_URL, etc.)
  INSTALADO.txt           # resumo da instalação (data, portas, banco)
  postgres/
    init/
      01-schema.sql       # schema do portal (tenants, customers, plans, RBAC, etc.)
      02-tenant.sql       # atualiza tenant id=1 com slug/nome
      03-radius-schema.sql # tabelas FreeRADIUS (radacct, radcheck, ...)
      05-seed-master.sql   # usuário Master para login no portal (e-mail e senha criados no Admin)
  radius/
    clients.conf
    users                 # authorize (FreeRADIUS 3.0)
  site/
    static/
      index.html          # página inicial (montado no container portal)
```

- **portal_admin** (portal + site): um único container Node que serve o site estático e o portal. Usa `network_mode: host` para evitar problemas de rede Docker — conecta ao Postgres e RADIUS via `127.0.0.1` nas portas mapeadas do host. O Nginx faz proxy de `/slug/` (site) e `/slug/portal/` (portal) para `http://127.0.0.1:APP_PORT`.
- **freeradius**: publica duas portas UDP no host (auth e acct), escolhidas no range.
- FreeRADIUS 3.0: `/etc/freeradius/3.0/clients.conf` e `mods-config/files/authorize`.

## Imagens modelo (build uma vez, use em todos os tenants)

Para não construir do zero a cada novo provedor, use **imagens modelo**:

1. **Postgres modelo** — Na **raiz do projeto** (onde está `package.json`, pasta `sql/`):  
   `cd /var/www/otyis-isp` (ou o caminho do projeto) e depois  
   `docker build -f docker/Dockerfile.postgres-model -t multi-portal-postgres:model .`  
   Defina `PROVISION_POSTGRES_IMAGE=multi-portal-postgres:model` e `PROVISION_POSTGRES_MODEL=1`.  
   O init do tenant terá só `02-tenant.sql`; a imagem já aplica schema e RADIUS.

2. **Portal admin modelo** — Build uma vez: `docker build -t multi-portal-admin:latest .`  
   Defina `PROVISION_PORTAL_ADMIN_IMAGE=multi-portal-admin:latest`. Nenhum build por tenant.

3. **Site** — O site estático fica em `site/static/` e é montado no container do portal (volume `./site/static:/app/site/static`). Portal e site rodam no mesmo processo Node.

## Provisionamento passo a passo (por demanda)

Ao criar um novo provedor, o Docker é montado **por etapas** para evitar falhas em cascata:

1. **Stack criada** — Pastas, `.env`, `docker-compose.yml`, schema SQL, configs FreeRADIUS e site são gerados. Portas são alocadas (incluindo uma TCP para o Postgres no host).
2. **Sobe só o Postgres** — `docker compose up -d --wait postgres`. A porta no host (`PG_HOST_PORT`), usuário (`PG_USER`) e senha (`PG_PASS`) ficam no `.env` do tenant e em `config_json.provisioning` (e em `INSTALADO.txt`), para uso nas próximas etapas.
3. **Sobe o FreeRADIUS** — Usa o mesmo Postgres (host `postgres:5432` na rede Docker; credenciais já no `.env`).
4. **Sobe portal + site** — Um único container Node (portal_admin) serve o site estático e o portal.

Assim, se o Postgres falhar, o restante não sobe; e você sempre tem a porta/usuário/senha do banco gravados antes de configurar RADIUS e portal.

## Fluxo da API

### Criar tenant com provisionamento

```http
POST /api/saas/tenants
x-saas-admin-key: <SAAS_ADMIN_KEY>
Content-Type: application/json

{
  "tenantName": "Provedor Alfa",
  "slug": "provedor-alfa",
  "domain": "mta.multitelecom.com.br",
  "masterName": "Admin",
  "masterEmail": "admin@provedor-alfa.com",
  "masterPassword": "senha123"
}
```

- **domain** (opcional): domínio; vira `BASE_URL=https://<domain>` em `portal-admin/.env` e `site/.env`.

Resposta (com `PROVISION_DOCKER=1`):

```json
{
  "tenant": { "id": 2, "name": "Provedor Alfa", "slug": "provedor-alfa", "created_at": "..." },
  "master": { "id": 1, "tenant_id": 2, "name": "Admin", "email": "admin@...", "is_master": true },
  "role": { "id": 1, "name": "Master" },
  "provisioning": {
    "success": true,
    "message": "Stack provisionado com sucesso.",
    "config": {
      "stackPath": "/srv/tenants/provedor-alfa",
      "ports": { "radiusAuthPort": 30112, "radiusAcctPort": 30113 },
      "radiusSecret": "...",
      "status": "running"
    },
    "log": ["[Provision] Iniciando...", ...]
  }
}
```

### Consultar status do provisionamento

```http
GET /api/saas/tenants/:id/provisioning
x-saas-admin-key: <SAAS_ADMIN_KEY>
```

```http
GET /api/saas/tenants/:id/status
x-saas-admin-key: <SAAS_ADMIN_KEY>
```
Retorna `tenant` + `provisioning` (status do stack).

### Desprovisionar e remover tenant (DELETE)

```http
DELETE /api/saas/tenants/:id
x-saas-admin-key: <SAAS_ADMIN_KEY>
```

- Executa **docker compose down** no diretório do stack.
- Remove a pasta do tenant em `TENANTS_BASE_PATH/<slug>/`.
- Limpa `config_json.provisioning` e `config_json.radius`.
- Marca o tenant como **CANCELLED** (mantém registro no banco).

Para **remover o registro do banco** (hard delete): `DELETE /api/saas/tenants/:id?hard=1`. Remove também usuários, roles e NAS do tenant.

### Corrigir login (tenant provisionado antes da correção do Master)

Se o portal abre mas o login não funciona ("E-mail não encontrado"), o usuário Master pode não estar no banco do tenant (provisionamentos antigos). Execute:

```bash
node scripts/fix-tenant-master.mjs <slug>
# Ex.: node scripts/fix-tenant-master.mjs git
```

O script copia o Master do banco central para o banco do tenant. Requer `.env` do projeto (DB_*) e que o Postgres do tenant esteja em `127.0.0.1:PG_HOST_PORT` (leia o `.env` do tenant em `TENANTS_BASE_PATH/<slug>/.env`).

### Atualizar site dos tenants já provisionados

Após alterar páginas em `web/` ou `models/site/` (planos, assinar, clube, etc.), atualize os tenants existentes:

```bash
npm run update-tenant-sites
# ou para um tenant específico:
npm run update-tenant-sites -- tk
```

O script lê do banco central os tenants com `config_json.provisioning.stackPath` e copia o site atualizado (HTML + assets) para cada stack. Requer `.env` com DB_*.

## Pré-requisitos

- **Docker** e **Docker Compose** (plugin `docker compose`) instalados e acessíveis pelo usuário que roda o Node.
- Diretório `TENANTS_BASE_PATH` criado e gravável (ex.: `sudo mkdir -p /srv/tenants && sudo chown $USER /srv/tenants`).
- **Dockerfile** na raiz do projeto (já incluído); o build usa `PROVISION_APP_CONTEXT` como context.

## VPS / Produção — checklist (stack não sobe)

1. **Ativar provisionamento** no `.env`:
   ```env
   PROVISION_DOCKER=1
   TENANTS_BASE_PATH=/srv/tenants
   PROVISION_APP_CONTEXT=/var/www/otyis-isp
   ```
   Use o caminho real do projeto na VPS em `PROVISION_APP_CONTEXT` (onde estão `sql/`, `Dockerfile`, etc.).

2. **Criar diretório dos tenants e permissão** (no servidor):
   ```bash
   sudo mkdir -p /srv/tenants
   sudo chown $(whoami) /srv/tenants
   ```
   Se o app rodar com outro usuário (ex.: `www-data`), use: `sudo chown www-data /srv/tenants`.

3. **Docker acessível** pelo usuário que roda o Node (PM2/systemd):
   ```bash
   sudo usermod -aG docker www-data
   # ou o usuário que inicia o app; depois fazer logout/login ou reiniciar o serviço
   docker compose version
   ```

4. **Diagnóstico**: depois de subir o app, chame (com a chave do admin SaaS):
   ```http
   GET /api/saas/provisioning-check
   x-saas-admin-key: <SAAS_ADMIN_KEY>
   ```
   A resposta indica se `PROVISION_DOCKER` está ativo, se o Docker está disponível, se `TENANTS_BASE_PATH` é gravável e se `sql/schema.pg.sql` existe em `PROVISION_APP_CONTEXT`. O campo `hints` traz sugestões de correção.

5. **Criar o tenant** (é isso que dispara o stack): depois de tudo OK, crie um provedor pelo painel admin ou via `POST /api/saas/tenants`. O stack e os containers só são criados **na hora de criar o tenant**, não ao subir o app.

## Roteamento por domínio (recomendado)

Use um **reverse proxy** (Traefik ou Nginx) por hostname, sem portas para portal/site:

- **admin-&lt;tenant&gt;.seudominio.com** → container `portal_admin_<slug>` (painel do provedor).
- **&lt;tenant&gt;.seudominio.com** (ou domínio próprio) → container `site_<slug>` (site institucional).

Assim todos usam 80/443; só o FreeRADIUS expõe portas UDP no host.

## Portas (uso automático acima de 4000)

Ao criar um provedor, o sistema aloca automaticamente portas **acima de 4000** (TCP e UDP):

- **TCP**: site (ex.: 4001), portal admin (ex.: 4002) e **Postgres no host** (ex.: 4003) — a porta do Postgres fica em `config_json.provisioning.ports.pgHostPort` e no `.env` do tenant como `PG_HOST_PORT`, para configurar FreeRADIUS/portal e acesso externo ao banco.
- **UDP**: RADIUS auth (ex.: 4004) e acct (ex.: 4005).

Configure `PROVISION_TCP_PORT_START/END` e `PROVISION_UDP_PORT_START/END` no `.env` para customizar o range.

## RADIUS: porta por tenant

Cada tenant tem um par de portas UDP (auth + acct). Nos **NAS** (MikroTik, etc.) do provedor, configurar:

- **Servidor RADIUS**: IP do host onde roda o SaaS.
- **Porta de autenticação**: valor de `provisioning.ports.radiusAuthPort` (ex.: 4003).
- **Secret**: o mesmo gravado em `config_json.radius.secret` (ou o que foi gerado e mostrado no log).

Alternativa futura: um único RADIUS nas portas 1812/1813 e rotear por realm ou NAS-IP (multi-tenant em um só processo).

## Segurança

- Cada stack usa **rede Docker isolada** por tenant.
- Secret RADIUS é gerado automaticamente (ou pode ser passado no body do POST, se implementado).
- Não exponha o socket do Docker sem controle; em produção considere um agente com permissões limitadas.

## Logs de provisionamento

Os logs do `docker compose up -d` e mensagens do orquestrador vêm em `provisioning.log` na resposta do POST e em `provisioning.lastLog` no `config_json`. Em caso de falha, `provisioning.status` fica `error` e `lastLog` traz a mensagem.
