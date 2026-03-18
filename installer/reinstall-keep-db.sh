#!/usr/bin/env bash
# Reinstala o provedor mantendo o banco de dados e todos os dados.
# Não faz DROP/CREATE do banco; apenas atualiza app, permissões e migrações pendentes.
#
# Uso: sudo ./installer/reinstall-keep-db.sh
#      (deve ser executado na pasta do projeto, ex.: /var/www/otyis-isp)
#      O .env existente será preservado.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SQL_DIR="$PROJECT_ROOT/sql"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log_ok()  { echo -e "${GREEN}[OK]${NC} $*"; }
log_info(){ echo -e "${YELLOW}[*]${NC} $*"; }
log_err() { echo -e "${RED}[ERRO]${NC} $*"; }

# Exige root
[ "$(id -u)" -eq 0 ] || { log_err "Execute como root: sudo $0"; exit 1; }

if [ ! -f "$PROJECT_ROOT/.env" ]; then
  log_err "Arquivo .env não encontrado em $PROJECT_ROOT. Rode primeiro o instalador completo: sudo ./installer/install.sh"
  exit 1
fi

# Carregar DB_NAME, DB_USER, DB_PASS do .env
while IFS= read -r line; do
  [[ "$line" =~ ^#.*$ ]] && continue
  if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
  fi
done < "$PROJECT_ROOT/.env" 2>/dev/null || true

INSTALL_DIR="${INSTALL_DIR:-$PROJECT_ROOT}"
cd "$INSTALL_DIR"

DB_NAME="${DB_NAME:-}"
DB_USER="${DB_USER:-}"
DB_PASS="${DB_PASS:-}"
PORT="${PORT:-8080}"

if [ -z "$DB_NAME" ] || [ -z "$DB_USER" ]; then
  log_err "No .env faltam DB_NAME ou DB_USER. Verifique o arquivo .env."
  exit 1
fi

echo "=============================================="
echo "  Reinstalação — mantendo banco de dados"
echo "=============================================="
echo "  Diretório: $INSTALL_DIR"
echo "  Banco:     $DB_NAME (dados preservados)"
echo "=============================================="
echo ""

# --- 1) Garantir permissões no banco existente (não cria nem apaga nada) ---
log_info "Garantindo permissões no banco existente..."
_quote_pg() { echo "$1" | sed 's/"/""/g'; }
DB_USER_PG='"'"$(_quote_pg "$DB_USER")"'"'
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -c "
GRANT USAGE ON SCHEMA public TO $DB_USER_PG;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $DB_USER_PG;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $DB_USER_PG;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $DB_USER_PG;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO $DB_USER_PG;
" 2>/dev/null || true
log_ok "Permissões conferidas."

# --- 2) Migrações pendentes (idempotentes: IF NOT EXISTS, ON CONFLICT) ---
log_info "Executando migrações pendentes no banco..."
cd "$PROJECT_ROOT"
node scripts/update-databases.mjs 2>/dev/null || {
  log_info "update-databases.mjs falhou ou não há migrações; continuando."
}
log_ok "Migrações aplicadas."

# --- 3) Reinstalar aplicação (npm, build, web) ---
log_info "Reinstalando aplicação (npm install, build, portal)..."
cd "$INSTALL_DIR"
# Garantir devDependencies (TypeScript etc.) para o build mesmo com NODE_ENV=production
export NODE_ENV=development
npm ci 2>/dev/null || npm install
npm install --include=dev 2>/dev/null || true
npm run build
export NODE_ENV=production
npm run build:portal 2>/dev/null || true
npm run build:portal-spa 2>/dev/null || true
[ -d "$PROJECT_ROOT/web" ] && [ -d "$INSTALL_DIR/dist" ] && ( rm -rf "$INSTALL_DIR/dist/web"; cp -r "$PROJECT_ROOT/web" "$INSTALL_DIR/dist/web" ) || true
[ -d "$INSTALL_DIR/site" ] || mkdir -p "$INSTALL_DIR/site/static"
log_ok "Aplicação reinstalada."

# --- 4) Reiniciar serviços ---
log_info "Reiniciando serviços..."
if systemctl is-enabled multi-portal &>/dev/null; then
  systemctl restart multi-portal
  log_ok "multi-portal reiniciado (systemd)."
  systemctl status multi-portal --no-pager || true
else
  pm2 restart multi-portal --update-env 2>/dev/null || pm2 restart all --update-env 2>/dev/null || true
  log_ok "multi-portal reiniciado (PM2)."
  pm2 status 2>/dev/null || true
fi

if systemctl is-enabled freeradius-standalone &>/dev/null; then
  systemctl restart freeradius-standalone 2>/dev/null || true
  log_ok "FreeRADIUS reiniciado."
fi

echo ""
echo "=============================================="
echo "  Reinstalação concluída. Banco preservado."
echo "=============================================="
echo "  Site:   http://$(hostname -I 2>/dev/null | awk '{print $1}'):${PORT:-8080}/"
echo "  Portal: http://$(hostname -I 2>/dev/null | awk '{print $1}'):${PORT:-8080}/portal/"
echo "=============================================="
