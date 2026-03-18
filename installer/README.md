# Instalador — Um provedor por VPS (sem Docker)

**Fluxo de alterações:** Todas as alterações (novas funcionalidades, correções) devem ser feitas **neste projeto** (projeto de instalação / código-fonte). Depois, a **instalação já existente** deve ser atualizada conforme [Deploy — Atualizar após instalação](../deploy/README.md#atualizar-após-instalação).

Instala em **uma única VPS** tudo que o provedor precisa, **sem Docker**:

| Componente | Descrição |
|------------|-----------|
| **Painel do dono do sistema** | `/admin` — configuração da instalação, RADIUS, concentradores (login: ADMIN_KEY) |
| **Portal admin do provedor** | `/portal` — painel do provedor: Master e equipe (clientes, planos, PPPoE; login: e-mail/senha) |
| **Site do provedor** | `/` — site público (planos, assinar, área do cliente) |
| **PostgreSQL** | Banco de dados (portal + RADIUS) |
| **FreeRADIUS** | Autenticação PPPoE / Hotspot (portas 1812/1813) |

Cada provedor roda o instalador na **própria VPS**. Uma instalação = um provedor.

**Guia detalhado:** [Instalador — Passo a passo](PASSO-A-PASSO.md)

## Requisitos

- Ubuntu 20.04/22.04 ou Debian 11/12
- Acesso root (ou sudo)
- Node.js 18+ (o script pode instalar via NodeSource)
- Repositório do projeto (código-fonte) na VPS ou tarball

## Uso rápido

```bash
# Na VPS do provedor (com o código do projeto, ex.: /var/www/otyis-isp)
cd /var/www/otyis-isp
sudo ./installer/install.sh
```

Por padrão **tudo é instalado na pasta do projeto** (ex.: `/var/www/otyis-isp`). Arquivos, `.env`, `radius/` e o serviço ficam aí.

- **Instalar em outra pasta:** `sudo ./installer/install.sh --dir=/opt/meu-provedor`
- **Já usa PM2:** `sudo ./installer/install.sh --pm2` — o instalador não cria/inicia o systemd do app; o FreeRADIUS continua em systemd. Depois: `pm2 restart all` (ou o nome do seu processo).

O script pergunta interativamente (ou use variáveis de ambiente):

- **Nome do provedor** (ex.: Minha Net)
- **Slug** (ex.: minhanet) — usado em URLs, sem espaços
- **Banco de dados** — nome, usuário e senha do PostgreSQL
- **Usuário Master** — e-mail e senha para primeiro login no portal
- **Chave RADIUS** — secret para o NAS (ou gera automaticamente)

## O que é instalado

| Componente    | Como                          |
|---------------|--------------------------------|
| PostgreSQL    | `apt install postgresql`      |
| Node.js 20.x  | NodeSource (se não existir)   |
| FreeRADIUS    | `apt install freeradius`      |
| App (portal)  | Pasta do projeto (ex.: `/var/www/otyis-isp`) ou `--dir=...` |
| Site (web)    | `web/` copiada do projeto; TypeScript do site (`web/ts/`) é compilado para `web/assets/js/` durante a instalação |
| RADIUS config | `radius/` dentro da pasta de instalação |
| systemd       | `multi-portal.service`, `freeradius-standalone.service` |

## Reinstalar mantendo o banco de dados

Para **reinstalar a aplicação** (código, build, serviços) **sem apagar o banco** (todos os dados são preservados):

```bash
cd /var/www/otyis-isp
sudo ./installer/reinstall-keep-db.sh
```

O script:

- Usa o `.env` já existente (não o sobrescreve).
- **Não** faz `DROP` nem `CREATE` do banco; apenas confere permissões (GRANT) no banco atual.
- Roda migrações pendentes (scripts idempotentes).
- Reinstala a app: `npm install`, `npm run build`, `build:portal`, `build:portal-spa`, cópia de `web/` para `dist/web`.
- Reinicia `multi-portal` e, se existir, `freeradius-standalone`.

Recomendado quando você atualizou o código (git pull ou cópia de arquivos) e quer apenas “reinstalar” o provedor mantendo clientes, planos, contratos e demais dados.

## Instalação existente (atualização)

Se você já instalou antes e não tem a tabela `provider_settings` (dados do provedor: nome fantasia, contato, endereço), rode a migração:

```bash
cd /var/www/otyis-isp
sudo -u postgres psql -d SEU_BANCO -f sql/migrations/002_provider_settings.pg.sql
# Depois conceda ao usuário do app (substitua SEU_USER pelo usuário PostgreSQL do .env):
sudo -u postgres psql -d SEU_BANCO -c "GRANT SELECT, INSERT, UPDATE, DELETE ON provider_settings TO SEU_USER; GRANT USAGE, SELECT ON SEQUENCE provider_settings_id_seq TO SEU_USER;"
```

Assim o painel `/admin` e o Portal → Administração passam a usar os mesmos dados do provedor.

## Diretórios

- **Pasta de instalação** (padrão = pasta do projeto, ex.: `/var/www/otyis-isp`): app Node, `dist/`, `web/`, `.env`, `radius/`, e (após uso do painel) `web/uploads/` para logos enviadas pelo painel
- **PostgreSQL**: banco e usuário criados pelo script
- **Logs**: `journalctl -u multi-portal` e `journalctl -u freeradius-standalone` (ou arquivos em `INSTALL_DIR/radius/log/`)

## Após a instalação

- **Site do provedor:** `http://IP_DA_VPS:8080/` — a raiz já abre a home do provedor criado (planos, assinar, etc.)
- **Portal admin do provedor:** `http://IP_DA_VPS:8080/portal/` — login com e-mail e senha do Master
- **Painel do dono do sistema:** `http://IP_DA_VPS:8080/admin` — login com ADMIN_KEY (definido no .env da pasta de instalação). Na **Visão geral**, use **Editar** para alterar nome do provedor, slug e e-mail do Master. Em **Dados do provedor** é possível configurar identidade, contato, endereço, **logos** (Logo painel e Logo site por URL ou upload; as enviadas ficam em `web/uploads/`), **cor primária** e **cor destaque**. Na aba **RADIUS** há o botão **Reiniciar RADIUS** para reiniciar o serviço `freeradius-standalone` sem precisar acessar o servidor via SSH.
- **FreeRADIUS:** portas **1812** (auth) e **1813** (acct) — configure o NAS com o IP da VPS e a chave RADIUS exibida no final

## Nginx (opcional)

Para usar na porta 80/443 e HTTPS, configure o Nginx manualmente após a instalação. Exemplo em `installer/templates/nginx-standalone.conf`.
