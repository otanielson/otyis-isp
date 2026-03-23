#!/usr/bin/env bash
# Instalador Multi-Portal â€” Um provedor por VPS (PostgreSQL + Node + FreeRADIUS, sem Docker)
#
# O que o instalador faz:
# - Instala na pasta do projeto (padrÃ£o) ou em --dir=...
# - Cria banco e usuÃ¡rio PostgreSQL; roda schema e migraÃ§Ãµes como esse usuÃ¡rio (tabelas com permissÃ£o correta)
# - Aplica GRANT para o usuÃ¡rio da aplicaÃ§Ã£o (evita "permission denied" ao subir o app)
# - Cria .env com STANDALONE=1 e TENANT_ID=1; ao acessar / a pÃ¡gina do provedor jÃ¡ aparece
#
# Uso: sudo ./installer/install.sh
#      (por padrÃ£o instala na pasta do projeto, ex.: /var/www/otyis-isp)
#      sudo ./installer/install.sh --dir=/opt/meu  # instala em /opt/meu
#      sudo ./installer/install.sh --pm2          # nÃ£o usa systemd para o app; vocÃª continua com PM2
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SQL_DIR="$PROJECT_ROOT/sql"
INSTALL_IN_PLACE=false
INSTALL_DIR=""
USE_PM2=false

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log_ok()  { echo -e "${GREEN}[OK]${NC} $*"; }
log_info(){ echo -e "${YELLOW}[*]${NC} $*"; }
log_err() { echo -e "${RED}[ERRO]${NC} $*"; }

# --- ParÃ¢metros ---
# Por padrÃ£o: instala na pasta do projeto (tudo fica em otyis-isp). Use --dir= para instalar em outro lugar.
for arg in "$@"; do
  case "$arg" in
    --here)      INSTALL_IN_PLACE=true; INSTALL_DIR="$PROJECT_ROOT";;
    --dir=*)     INSTALL_IN_PLACE=false; INSTALL_DIR="${arg#*=}";;
    --pm2)       USE_PM2=true;;
  esac
done
if [ -z "$INSTALL_DIR" ]; then
  INSTALL_IN_PLACE=true
  INSTALL_DIR="$PROJECT_ROOT"
fi
[ "$INSTALL_IN_PLACE" = true ] && INSTALL_DIR="$PROJECT_ROOT"

prompt_val() {
  local var="$1" msg="$2" default="${3:-}"
  if [ -n "${!var}" ]; then return; fi
  if [ -n "$default" ]; then
    read -rp "$msg [$default]: " val
    eval "$var=\${val:-$default}"
  else
    read -rp "$msg: " val
    eval "$var=\$val"
  fi
}

# Exige root
[ "$(id -u)" -eq 0 ] || { log_err "Execute como root: sudo $0"; exit 1; }

echo "=== Instalador Multi-Portal (standalone) ==="
echo "Projeto: $PROJECT_ROOT"
echo "InstalaÃ§Ã£o: $INSTALL_DIR"
echo ""

prompt_val PROVIDER_NAME "Nome do provedor" "Meu Provedor"
prompt_val SLUG "Slug (identificador, sem espaÃ§os)" "$(echo "$PROVIDER_NAME" | tr 'A-Z aÃ§Ã£Ãµ' 'a-z-acao' | tr -cd 'a-z0-9_-' | cut -c1-32)"
prompt_val DB_NAME "Nome do banco PostgreSQL" "portal_${SLUG}"
prompt_val DB_USER "UsuÃ¡rio PostgreSQL" "$DB_NAME"
prompt_val DB_PASS "Senha do PostgreSQL" ""
prompt_val MASTER_EMAIL "E-mail do usuÃ¡rio Master (login no portal)" ""
prompt_val MASTER_PASSWORD "Senha do usuÃ¡rio Master" ""
prompt_val RADIUS_SECRET "Chave RADIUS (secret do NAS; vazio = gerar)" ""
# IP que o MikroTik/NAS usarÃ¡ para conectar ao RADIUS (deve ser o IP deste servidor acessÃ­vel pelo concentrador)
RADIUS_HOST_DEFAULT="127.0.0.1"
if command -v hostname &>/dev/null; then
  _ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  [ -n "$_ip" ] && RADIUS_HOST_DEFAULT="$_ip"
fi
prompt_val RADIUS_HOST "IP deste servidor para o MikroTik/NAS conectar (vazio = $RADIUS_HOST_DEFAULT)" "$RADIUS_HOST_DEFAULT"
[ -z "$RADIUS_HOST" ] && RADIUS_HOST="$RADIUS_HOST_DEFAULT"

[ -n "$DB_PASS" ] || { log_err "Senha do PostgreSQL Ã© obrigatÃ³ria."; exit 1; }
[ -n "$MASTER_EMAIL" ] || { log_err "E-mail do Master Ã© obrigatÃ³rio."; exit 1; }
[ -n "$MASTER_PASSWORD" ] || { log_err "Senha do Master Ã© obrigatÃ³ria."; exit 1; }

# Gerar secrets se nÃ£o informados
[ -n "$RADIUS_SECRET" ] || RADIUS_SECRET=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
ADMIN_KEY="${ADMIN_KEY:-$(openssl rand -hex 16)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"

# Escape para uso em connection string (URL)
DB_PASS_ESCAPED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$DB_PASS'''))" 2>/dev/null) || DB_PASS_ESCAPED="$DB_PASS"

log_info "Slug: $SLUG | DB: $DB_NAME | Master: $MASTER_EMAIL"

# --- 1) DependÃªncias (verifica se jÃ¡ estÃ£o instalados) ---
export DEBIAN_FRONTEND=noninteractive
log_info "Verificando dependÃªncias..."
apt-get update -qq

# PostgreSQL: verifica se o pacote postgresql estÃ¡ instalado
if dpkg -l postgresql 2>/dev/null | grep -q '^ii'; then
  log_ok "PostgreSQL jÃ¡ instalado."
else
  log_info "PostgreSQL nÃ£o encontrado. Instalando postgresql e postgresql-client..."
  apt-get install -y -qq postgresql postgresql-client
  systemctl start postgresql 2>/dev/null || true
  systemctl enable postgresql 2>/dev/null || true
  log_ok "PostgreSQL instalado e serviÃ§o iniciado."
fi

# curl (necessÃ¡rio para NodeSource)
if ! command -v curl &>/dev/null; then
  log_info "Instalando curl..."
  apt-get install -y -qq curl
  log_ok "curl instalado."
fi

# Node.js
if command -v node &>/dev/null; then
  log_ok "Node.js jÃ¡ instalado ($(node -v))."
else
  log_info "Node.js nÃ£o encontrado. Instalando via NodeSource (20.x)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
  log_ok "Node.js instalado ($(node -v))."
fi

# FreeRADIUS: verifica se o pacote estÃ¡ instalado (precisa dos arquivos mods-config para queries.conf)
if dpkg -l freeradius 2>/dev/null | grep -q '^ii' || [ -x /usr/sbin/radiusd ]; then
  log_ok "FreeRADIUS jÃ¡ instalado."
else
  log_info "FreeRADIUS nÃ£o encontrado. Instalando freeradius..."
  apt-get install -y -qq freeradius
  log_ok "FreeRADIUS instalado (arquivos de config em /etc/freeradius)."
fi

log_ok "DependÃªncias prontas."

# --- 2) PostgreSQL: criar usuÃ¡rio e banco (aspas para nomes numÃ©ricos ou especiais) ---
log_info "Criando banco e usuÃ¡rio PostgreSQL..."
_quote_pg() { echo "$1" | sed 's/"/""/g'; }
DB_USER_PG='"'"$(_quote_pg "$DB_USER")"'"'
DB_NAME_PG='"'"$(_quote_pg "$DB_NAME")"'"'
sudo -u postgres psql -v ON_ERROR_STOP=1 <<EOF
DROP DATABASE IF EXISTS $DB_NAME_PG;
DROP USER IF EXISTS $DB_USER_PG;
CREATE USER $DB_USER_PG WITH PASSWORD '$DB_PASS';
CREATE DATABASE $DB_NAME_PG OWNER $DB_USER_PG ENCODING 'UTF8';
\c $DB_NAME_PG
ALTER SCHEMA public OWNER TO $DB_USER_PG;
EOF
log_ok "Banco $DB_NAME criado."

# --- 3) Rodar SQL: schema + migraÃ§Ãµes (como usuÃ¡rio do banco para tabelas ficarem com permissÃ£o correta) ---
log_info "Executando schema e migraÃ§Ãµes SQL..."
export PGPASSWORD="$DB_PASS"
run_psql() { psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" -f "$1"; }

run_psql "$SQL_DIR/schema.pg.sql"
run_psql "$SQL_DIR/migrations/001_radius_portal.pg.sql"
[ -f "$SQL_DIR/migrations/002_provider_settings.pg.sql" ] && run_psql "$SQL_DIR/migrations/002_provider_settings.pg.sql" || true

# MigraÃ§Ãµes do tenant (ordem de scripts/update-databases.mjs MIGRATIONS_TENANT; 001 jÃ¡ rodado)
for f in plans_isp_extras.sql erp_fase1.sql erp_fase2.sql contract_templates.sql support_status_lock_triggers.sql \
  erp_proposal_templates.sql erp_notify.sql installations_pppoe_password.pg.sql \
  radius_group_bloqueado.sql radius_advanced.pg.sql payment_gateways.sql carne_lots.sql caixa_movimentos.sql \
  finance_suppliers_chart_payables.pg.sql estoque.pg.sql estoque_produto_erp.pg.sql \
  customer_comodato.pg.sql customer_comodato_equipamento.pg.sql; do
  [ -f "$SQL_DIR/$f" ] && run_psql "$SQL_DIR/$f" || true
done
unset PGPASSWORD

# Garantir permissÃµes ao usuÃ¡rio da aplicaÃ§Ã£o (evita "permission denied for table" ao subir o app)
log_info "Garantindo permissÃµes ao usuÃ¡rio do banco..."
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "
GRANT USAGE ON SCHEMA public TO $DB_USER_PG;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $DB_USER_PG;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $DB_USER_PG;
"

# Atualizar tenant e criar Master (hash serÃ¡ gerado apÃ³s npm ci em INSTALL_DIR)
MASTER_NAME="${PROVIDER_NAME%% *}"
MASTER_NAME_SQL="${MASTER_NAME//\'/\'\'}"
MASTER_EMAIL_SQL="${MASTER_EMAIL//\'/\'\'}"
PROVIDER_NAME_SQL="${PROVIDER_NAME//\'/\'\'}"
log_ok "Schema e migraÃ§Ãµes aplicados."

# --- 4) App em INSTALL_DIR (copiar ou usar pasta atual com --here) ---
if [ "$INSTALL_IN_PLACE" = true ]; then
  log_info "Instalando na pasta atual ($INSTALL_DIR)..."
  cd "$INSTALL_DIR"
  npm ci 2>/dev/null || npm install
  npm run build
  npm run build:portal 2>/dev/null || true
  npm run build:portal-spa 2>/dev/null || true
  npm prune --production
  [ -d "$INSTALL_DIR/site" ] || mkdir -p "$INSTALL_DIR/site/static"
  log_ok "AplicaÃ§Ã£o pronta na pasta atual."
else
  log_info "Copiando aplicaÃ§Ã£o para $INSTALL_DIR..."
  mkdir -p "$INSTALL_DIR"
  rsync -a --exclude node_modules --exclude .git --exclude '*.log' \
    "$PROJECT_ROOT/" "$INSTALL_DIR/" 2>/dev/null || cp -a "$PROJECT_ROOT"/* "$INSTALL_DIR/"
  cd "$INSTALL_DIR"
  npm ci 2>/dev/null || npm install
  npm run build
  [ -d "$PROJECT_ROOT/web" ] && cp -r "$PROJECT_ROOT/web" "$INSTALL_DIR/" || true
  [ -d "$INSTALL_DIR/web/ts" ] && (cd "$INSTALL_DIR" && npm run build:portal) 2>/dev/null || true
  (cd "$INSTALL_DIR" && npm run build:portal-spa) 2>/dev/null || true
  npm prune --production
  [ -d "$PROJECT_ROOT/site" ] && cp -r "$PROJECT_ROOT/site" "$INSTALL_DIR/" || mkdir -p "$INSTALL_DIR/site/static"
  log_ok "AplicaÃ§Ã£o instalada."
fi

# Hash do Master (bcrypt) usando node_modules jÃ¡ instalados
MASTER_HASH=$(cd "$INSTALL_DIR" && node -e "
const bcrypt = require('bcryptjs');
console.log(bcrypt.hashSync(process.argv[1], 10));
" "$MASTER_PASSWORD")
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" <<EOSQL
UPDATE tenants SET slug = '$SLUG', name = '$PROVIDER_NAME_SQL' WHERE id = 1;
INSERT INTO tenant_roles (tenant_id, name, is_system) VALUES (1, 'Master', true) ON CONFLICT (tenant_id, name) DO NOTHING;
INSERT INTO tenant_users (tenant_id, name, email, password_hash, is_master, is_active)
VALUES (1, '$MASTER_NAME_SQL', '$MASTER_EMAIL_SQL', '$MASTER_HASH', true, true)
ON CONFLICT (tenant_id, email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, is_master = true;
INSERT INTO tenant_user_roles (tenant_id, user_id, role_id)
SELECT 1, u.id, r.id FROM tenant_users u, tenant_roles r
WHERE u.tenant_id = 1 AND u.email = '$MASTER_EMAIL_SQL' AND r.tenant_id = 1 AND r.name = 'Master'
ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING;
INSERT INTO tenant_role_permissions (tenant_id, role_id, permission_id)
SELECT 1, r.id, p.id FROM tenant_roles r CROSS JOIN tenant_permissions p
WHERE r.tenant_id = 1 AND r.name = 'Master' AND p.is_active = true
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
EOSQL
log_ok "Tenant e usuÃ¡rio Master configurados."

# --- 5) .env ---
log_info "Criando .env..."
# Escapar RADIUS_HOST se tiver caracteres especiais para sed
RADIUS_HOST_ESC=$(echo "$RADIUS_HOST" | sed 's/[\/&]/\\&/g')
sed -e "s/__SLUG__/$SLUG/g" \
    -e "s/__DB_USER__/$DB_USER/g" \
    -e "s|__DB_PASS__|$DB_PASS|g" \
    -e "s|__DB_PASS_ESCAPED__|$DB_PASS_ESCAPED|g" \
    -e "s/__DB_NAME__/$DB_NAME/g" \
    -e "s/__ADMIN_KEY__/$ADMIN_KEY/g" \
    -e "s/__JWT_SECRET__/$JWT_SECRET/g" \
    -e "s/__RADIUS_SECRET__/$RADIUS_SECRET/g" \
    -e "s/__RADIUS_HOST__/$RADIUS_HOST_ESC/g" \
    "$SCRIPT_DIR/templates/env.standalone" > "$INSTALL_DIR/.env"
log_ok ".env criado."

# Garantir leitura dos assets estÃ¡ticos para Nginx/HTTP externo
[ -d "$INSTALL_DIR/web" ] && chmod -R a+rX "$INSTALL_DIR/web" || true
[ -d "$INSTALL_DIR/site" ] && chmod -R a+rX "$INSTALL_DIR/site" || true

# --- 6) FreeRADIUS config (em INSTALL_DIR/radius) ---
log_info "Configurando FreeRADIUS..."
RADIUS_DIR="$INSTALL_DIR/radius"
mkdir -p "$RADIUS_DIR"/{mods-available,mods-enabled,sites-available,sites-enabled,mods-config/sql/driver,log,run}

# clients.conf
cat > "$RADIUS_DIR/clients.conf" <<EOCLIENTS
client mikrotik_$SLUG {
  ipaddr = 0.0.0.0
  netmask = 0
  secret = $RADIUS_SECRET
  shortname = $SLUG
  require_message_authenticator = no
  limit_proxy_state = false
}
EOCLIENTS

# mods-available/sql (conexÃ£o 127.0.0.1:5432)
PG_ESC=$(echo "$DB_PASS" | sed 's/\\/\\\\/g; s/"/\\"/g')
cat > "$RADIUS_DIR/mods-available/sql" <<EOSQL
sql {
  dialect = "postgresql"
  driver = "rlm_sql_postgresql"
  radius_db = "dbname=$DB_NAME host=127.0.0.1 port=5432 user=$DB_USER password=$PG_ESC"
  client_table = "nas"
  acct_table1 = "radacct"
  acct_table2 = "radacct"
  postauth_table = "radpostauth"
  authcheck_table = "radcheck"
  groupcheck_table = "radgroupcheck"
  authreply_table = "radreply"
  groupreply_table = "radgroupreply"
  usergroup_table = "radusergroup"
  group_attribute = "SQL-Group"
  \$INCLUDE \${modconfdir}/sql/driver/postgresql
  \$INCLUDE \${modconfdir}/sql/main/postgresql/queries.conf
  pool { start = 0, min = 1, max = 32 }
}
EOSQL
cp "$RADIUS_DIR/mods-available/sql" "$RADIUS_DIR/mods-enabled/sql"
echo 'postgresql { send_application_name = no }' > "$RADIUS_DIR/mods-config/sql/driver/postgresql"

# sites-available/default (MS-CHAP para MikroTik PPPoE; fallback Acct-Unique-Session-Id para accounting)
cat > "$RADIUS_DIR/sites-available/default" <<'EOSITE'
server default {
  namespace = radius
  listen {
    type = auth
    ipaddr = *
    port = 0
  }
  listen {
    type = acct
    ipaddr = *
    port = 0
  }
  authorize {
    preprocess
    sql
    if (&request:MS-CHAP2-Response) {
      update control {
        Auth-Type := MS-CHAP
      }
    }
    mschap
    pap
  }
  authenticate {
    Auth-Type MS-CHAP {
      mschap
    }
    Auth-Type PAP {
      pap
    }
  }
  post-auth {
    sql
  }
  accounting {
    if (!&request:Acct-Unique-Session-Id) {
      update request {
        &Acct-Unique-Session-Id := "%{request:Acct-Session-Id}"
      }
    }
    sql
  }
}
EOSITE
cp "$RADIUS_DIR/sites-available/default" "$RADIUS_DIR/sites-enabled/default"

# Copiar mods-config/sql: preferir do projeto (queries.conf com fallback AcctUniqueId para interim-update/stop)
PROJECT_RADIUS_SQL_DIR="$PROJECT_ROOT/radius/mods-config/sql"
TARGET_RADIUS_SQL_DIR="$RADIUS_DIR/mods-config/sql"
PROJECT_RADIUS_SQL_REAL="$(realpath "$PROJECT_RADIUS_SQL_DIR" 2>/dev/null || echo "$PROJECT_RADIUS_SQL_DIR")"
TARGET_RADIUS_SQL_REAL="$(realpath "$TARGET_RADIUS_SQL_DIR" 2>/dev/null || echo "$TARGET_RADIUS_SQL_DIR")"
if [ -d "$PROJECT_RADIUS_SQL_DIR" ] && [ -f "$PROJECT_RADIUS_SQL_DIR/main/postgresql/queries.conf" ] && [ "$PROJECT_RADIUS_SQL_REAL" != "$TARGET_RADIUS_SQL_REAL" ]; then
  mkdir -p "$RADIUS_DIR/mods-config"
  cp -r "$PROJECT_RADIUS_SQL_DIR" "$RADIUS_DIR/mods-config/"
  log_ok "Copiado mods-config/sql do projeto (queries com fallback para sessÃµes antigas)"
elif [ -f "$TARGET_RADIUS_SQL_DIR/main/postgresql/queries.conf" ]; then
  log_ok "Reutilizando mods-config/sql jÃ¡ presente na instalaÃ§Ã£o"
else
  for fr_base in /etc/freeradius/3.0 /etc/freeradius; do
    if [ -d "$fr_base/mods-config/sql" ]; then
      mkdir -p "$RADIUS_DIR/mods-config"
      cp -r "$fr_base/mods-config/sql" "$RADIUS_DIR/mods-config/"
      log_ok "Copiado mods-config/sql de $fr_base"
      break
    fi
  done
fi
[ -f "$RADIUS_DIR/mods-config/sql/main/postgresql/queries.conf" ] || log_err "queries.conf nÃ£o encontrado; instale freeradius e rode o instalador novamente."

# MÃ³dulos pap, preprocess e mschap (MS-CHAP para MikroTik PPPoE)
for fr_base in /etc/freeradius/3.0 /etc/freeradius; do
  if [ -f "$fr_base/mods-available/pap" ]; then
    cp "$fr_base/mods-available/pap" "$RADIUS_DIR/mods-enabled/"
    cp "$fr_base/mods-available/preprocess" "$RADIUS_DIR/mods-enabled/" 2>/dev/null || true
    mkdir -p "$RADIUS_DIR/mods-config/preprocess"
    touch "$RADIUS_DIR/mods-config/preprocess/huntgroups" "$RADIUS_DIR/mods-config/preprocess/hints"
    # mschap: usar cÃ³pia do projeto (pool jÃ¡ corrigido) ou copiar do sistema e corrigir pool
    if [ -f "$PROJECT_ROOT/radius/mods-enabled/mschap" ]; then
      cp "$PROJECT_ROOT/radius/mods-enabled/mschap" "$RADIUS_DIR/mods-enabled/"
      log_ok "Copiados mods pap, preprocess e mschap (do projeto) de $PROJECT_ROOT/radius"
    elif [ -f "$fr_base/mods-available/mschap" ]; then
      cp "$fr_base/mods-available/mschap" "$RADIUS_DIR/mods-enabled/"
      sed -i 's/start = \${thread\[pool\]\.start_servers}/start = 0/' "$RADIUS_DIR/mods-enabled/mschap"
      sed -i 's/min = \${thread\[pool\]\.min_spare_servers}/min = 0/' "$RADIUS_DIR/mods-enabled/mschap"
      sed -i 's/max = \${thread\[pool\]\.max_servers}/max = 1/' "$RADIUS_DIR/mods-enabled/mschap"
      sed -i 's/spare = \${thread\[pool\]\.max_spare_servers}/spare = 0/' "$RADIUS_DIR/mods-enabled/mschap"
      log_ok "Copiados mods pap, preprocess e mschap (do sistema, pool corrigido) de $fr_base"
    else
      log_ok "Copiados mods pap e preprocess de $fr_base (mschap nÃ£o encontrado; PAP apenas)"
    fi
    break
  fi
done
# Driver PostgreSQL para o mÃ³dulo sql (pacote separado em Debian/Ubuntu)
if [ ! -f /usr/lib/freeradius/rlm_sql_postgresql.so ] 2>/dev/null; then
  log_info "Instalando freeradius-postgresql para o driver SQL..."
  apt-get install -y -qq freeradius-postgresql 2>/dev/null || true
fi

# radiusd.conf (seÃ§Ã£o modules obrigatÃ³ria no FreeRADIUS 3.0; libdir = mÃ³dulos do sistema)
cat > "$RADIUS_DIR/radiusd.conf" <<EOCONF
prefix = $RADIUS_DIR
logdir = \${prefix}/log
run_dir = \${prefix}/run
modconfdir = \${prefix}/mods-config
libdir = /usr/lib/freeradius
\$INCLUDE clients.conf
modules {
  \$INCLUDE mods-enabled/
}
\$INCLUDE sites-enabled/
EOCONF
touch "$RADIUS_DIR/users"
log_ok "FreeRADIUS configurado em $RADIUS_DIR."

# Desabilitar o serviÃ§o padrÃ£o do pacote (usa /etc/freeradius); usamos freeradius-standalone com radius/
systemctl stop freeradius 2>/dev/null || true
systemctl disable freeradius 2>/dev/null || true

# --- 7) systemd (ou sÃ³ FreeRADIUS se --pm2) ---
RADIUSD_BIN="/usr/sbin/freeradius"
[ -x "$RADIUSD_BIN" ] || RADIUSD_BIN="/usr/sbin/radiusd"
[ -x "$RADIUSD_BIN" ] || RADIUSD_BIN="$(which freeradius radiusd 2>/dev/null | head -1)"
[ -x "$RADIUSD_BIN" ] || { log_err "BinÃ¡rio do FreeRADIUS nÃ£o encontrado (procure freeradius ou radiusd)."; exit 1; }
sed -e "s|__RADIUS_DIR__|$RADIUS_DIR|g" -e "s|__RADIUSD_BIN__|$RADIUSD_BIN|g" \
  "$SCRIPT_DIR/templates/freeradius-standalone.service" > /etc/systemd/system/freeradius-standalone.service
systemctl daemon-reload
systemctl enable freeradius-standalone
systemctl start freeradius-standalone
if [ "$USE_PM2" = true ]; then
  log_info "Modo PM2: app nÃ£o serÃ¡ gerenciado pelo systemd. Use: pm2 restart <seu-app>"
  log_ok "FreeRADIUS (systemd) iniciado. App: use seu PM2."
else
  log_info "Configurando systemd (multi-portal)..."
  sed "s|__INSTALL_DIR__|$INSTALL_DIR|g" "$SCRIPT_DIR/templates/multi-portal.service" > /etc/systemd/system/multi-portal.service
  systemctl daemon-reload
  systemctl enable multi-portal
  systemctl start multi-portal
  log_ok "ServiÃ§os iniciados."
fi

# --- Resumo ---
echo ""
echo "=============================================="
echo "  InstalaÃ§Ã£o concluÃ­da."
echo "=============================================="
echo ""
echo "  Site do provedor: http://$(hostname -I | awk '{print $1}'):8080/  (home jÃ¡ do provedor criado)"
echo "  Portal (admin):  http://$(hostname -I | awk '{print $1}'):8080/portal/"
echo "  Login Master:    $MASTER_EMAIL (senha que vocÃª definiu)"
echo ""
echo "  RADIUS:          porta 1812 (auth) e 1813 (acct)"
echo "  IP para o NAS:   $RADIUS_HOST  (no MikroTik use este como servidor RADIUS)"
echo "  Chave RADIUS:    $RADIUS_SECRET"
echo "  (Abra UDP 1812 e 1813 no firewall se o MikroTik estiver em outra rede.)"
echo ""
if [ "$USE_PM2" = true ]; then
  echo "  App:             use PM2 (ex.: pm2 restart all)"
  echo "  FreeRADIUS:      systemctl status freeradius-standalone"
else
  echo "  App:             roda pelo systemd (nÃ£o use PM2 para este app)"
  echo "  Comandos:        systemctl status multi-portal"
  echo "                  systemctl status freeradius-standalone"
  echo "                  journalctl -u multi-portal -f"
fi
echo ""

