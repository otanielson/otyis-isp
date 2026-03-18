# Instalador — Passo a passo

Guia para **criar um provedor** na VPS: Painel do dono do sistema, Portal admin do provedor, Site do provedor, PostgreSQL e FreeRADIUS (sem Docker).

**Atualizar instalação já existente:** altere o código no projeto de instalação e depois siga [Deploy — Atualizar instalação existente](../deploy/README.md#atualizar-instalação-existente).

---

## Passo 1 — Preparar a VPS

1. **Sistema:** Ubuntu 20.04/22.04 ou Debian 11/12.
2. **Acesso root:** você precisa poder rodar `sudo` ou entrar como root.
3. **Código do projeto na VPS:**
   - Se usar Git: `git clone <url-do-repositorio> /var/www/otyis-isp && cd /var/www/otyis-isp`
   - Ou copie a pasta do projeto (com `installer/`, `sql/`, `src/`, etc.) para a VPS, por exemplo em `/var/www/otyis-isp`.

---

## Passo 2 — Entrar na pasta do projeto

```bash
cd /var/www/otyis-isp
```

Confira se existem a pasta `installer/` e o script `installer/install.sh`.

---

## Passo 3 — Rodar o instalador

```bash
sudo ./installer/install.sh
```

Se pedir senha, use a senha do usuário com permissão de administrador.

Por padrão a instalação fica **na pasta do projeto** (ex.: `/var/www/otyis-isp`). Para instalar em outro diretório: `sudo ./installer/install.sh --dir=/opt/outro-provedor`

---

## Passo 4 — Responder às perguntas

O script pergunta o seguinte. Pode pressionar Enter para aceitar o valor entre colchetes quando houver.

| Pergunta | Exemplo | Obrigatório |
|----------|----------|--------------|
| **Nome do provedor** | Minha Net | Sim |
| **Slug (identificador, sem espaços)** | minhanet | Sim (gerado a partir do nome se deixar em branco) |
| **Nome do banco PostgreSQL** | portal_minhanet | Sim |
| **Usuário PostgreSQL** | portal_minhanet | Sim |
| **Senha do PostgreSQL** | ******** | Sim |
| **E-mail do usuário Master (login no portal)** | admin@minhanet.com.br | Sim |
| **Senha do usuário Master** | ******** | Sim |
| **Chave RADIUS (secret do NAS; vazio = gerar)** | (vazio = o script gera) | Não |

**Dicas:**

- **Slug:** só letras minúsculas, números e hífen (ex.: `provedor-alfa`).
- **Senha do PostgreSQL:** anote em local seguro.
- **E-mail e senha do Master:** são usados para entrar no **Portal admin do provedor** (`/portal`).
- **Chave RADIUS:** será mostrada no final; use no MikroTik (ou outro NAS) como secret do RADIUS.

---

## Passo 5 — O que o script faz (resumo)

1. **Dependências:** o script **verifica** se já existem na VPS:
   - **PostgreSQL** — se não estiver instalado, instala `postgresql` e `postgresql-client` e inicia o serviço.
   - **curl** — instala se faltar (usado pelo NodeSource).
   - **Node.js** — se não tiver, instala via NodeSource (20.x).
   - **FreeRADIUS** — se não estiver instalado, instala `freeradius` (os arquivos em `/etc/freeradius` são usados para copiar `mods-config/sql`).
2. **PostgreSQL:** cria usuário e banco, executa schema e migrações.
3. **Tenant e Master:** configura o provedor e o usuário Master com permissões.
4. **Aplicação:** instala dependências Node e gera o build na pasta do projeto (ex.: `/var/www/otyis-isp`) ou no diretório indicado com `--dir=`.
5. **Permissões no banco:** o instalador aplica GRANT ao usuário da aplicação para que o app consiga ler a tabela `tenants` e exibir a página do provedor em `/`.
6. **Arquivo .env:** gera o `.env` com banco, JWT, RADIUS e `STANDALONE=1` (uma VPS = um provedor).
7. **FreeRADIUS:** cria a pasta `radius/` com configuração (clientes, SQL, sites).
8. **systemd:** instala e inicia `multi-portal.service` e `freeradius-standalone.service`.

Ao terminar, o script mostra um **resumo** com URLs e a **chave RADIUS**.

---

## Passo 6 — Acessar após a instalação

Substitua `IP_DA_VPS` pelo IP ou domínio da sua VPS (ex.: `192.168.1.10` ou `vps.empresa.com.br`).

| O quê | URL | Login |
|-------|-----|--------|
| **Painel do dono do sistema** | `http://IP_DA_VPS:8080/admin` | Chave definida no `.env` (ADMIN_KEY). Veja no `.env` da pasta de instalação (ex.: `/var/www/otyis-isp/.env`) ou no resumo do instalador. Na **Visão geral**, use **Editar** no bloco "Informações do provedor criado" para alterar nome, slug e e-mail do Master. |
| **Portal admin do provedor** | `http://IP_DA_VPS:8080/portal/` | E-mail e senha do **Master** que você informou no passo 4. |
| **Site do provedor** | `http://IP_DA_VPS:8080/` | Público (planos, assinar, etc.). A raiz já abre a home do provedor criado. |

**FreeRADIUS:** portas **1812** (auth) e **1813** (acct). No NAS (ex.: MikroTik) use:

- Servidor RADIUS: `IP_DA_VPS`
- Porta: 1812 (auth) e 1813 (acct)
- Secret: a **chave RADIUS** exibida no final da instalação.

---

## Passo 7 — Comandos úteis

```bash
# Status dos serviços
sudo systemctl status multi-portal
sudo systemctl status freeradius-standalone

# Reiniciar
sudo systemctl restart multi-portal
sudo systemctl restart freeradius-standalone
# Ou use o botão **Reiniciar RADIUS** na aba RADIUS do painel /admin.

# Ver logs do portal
journalctl -u multi-portal -f

# Ver logs do RADIUS
journalctl -u freeradius-standalone -f
```

Onde está a aplicação (padrão): pasta do projeto, ex.: `/var/www/otyis-isp` (arquivo `.env`, pasta `radius/`, etc.).

---

## Criar outro provedor na mesma VPS

Para um **segundo** provedor na **mesma** máquina:

1. Rode o instalador de novo com **outro diretório** e **outro slug/banco**:
   ```bash
   sudo INSTALL_DIR=/opt/multi-portal-2 PROVIDER_NAME="Provedor 2" SLUG="provedor2" \
     DB_NAME=portal_provedor2 DB_USER=portal_provedor2 DB_PASS="senha2" \
     MASTER_EMAIL=admin2@provedor2.com MASTER_PASSWORD="senha2" \
     ./installer/install.sh --dir=/opt/multi-portal-2
   ```
2. O script vai criar outro banco e outra cópia em `/opt/multi-portal-2`. A **porta 8080** já estará em uso pelo primeiro provedor.
3. **Ajuste manual:** edite `/opt/multi-portal-2/.env` e coloque `PORT=8081` (ou outra porta livre). Crie e ative um novo unit systemd para o segundo provedor (copiando `multi-portal.service` e apontando para `/opt/multi-portal-2` e porta 8081). Para o RADIUS, é preciso uma segunda instância (outra pasta `radius` e outro serviço FreeRADIUS) ou uso do modelo por tenant já existente no projeto.

Recomendação: **um provedor por VPS** para evitar conflito de porta e de RADIUS.

---

## Problemas comuns

- **"Execute como root":** use `sudo ./installer/install.sh`.
- **Script não executa (bash):** corrija fim de linha com `sed -i 's/\r$//' installer/install.sh`.
- **Erro ao rodar SQL:** confira se a senha do PostgreSQL não tem caracteres que quebram no shell (ex.: `'`). Use uma senha simples para teste.
- **Portal não abre:** confira `systemctl status multi-portal` e se a porta 8080 está liberada no firewall (`ufw allow 8080` se usar UFW).
