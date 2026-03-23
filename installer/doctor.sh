#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERRO]${NC} $*"; }
info() { echo -e "${BLUE}[*]${NC} $*"; }

FAILED=0
WARNINGS=0

check_cmd() {
  local cmd="$1" label="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "$label encontrado: $(command -v "$cmd")"
  else
    err "$label nao encontrado"
    FAILED=$((FAILED + 1))
  fi
}

check_any_cmd() {
  local label="$1"
  shift
  for cmd in "$@"; do
    if command -v "$cmd" >/dev/null 2>&1; then
      ok "$label encontrado: $(command -v "$cmd")"
      return
    fi
  done
  err "$label nao encontrado"
  FAILED=$((FAILED + 1))
}

check_service() {
  local name="$1" label="$2"
  if ! command -v systemctl >/dev/null 2>&1; then
    warn "systemctl nao disponivel; ignorando checagem de $label"
    WARNINGS=$((WARNINGS + 1))
    return
  fi
  if systemctl list-unit-files "$name" >/dev/null 2>&1; then
    local active enabled
    active="$(systemctl is-active "$name" 2>/dev/null || true)"
    enabled="$(systemctl is-enabled "$name" 2>/dev/null || true)"
    if [ "$active" = "active" ]; then
      ok "$label ativo ($enabled)"
    else
      warn "$label nao esta ativo (status: ${active:-desconhecido}, enabled: ${enabled:-desconhecido})"
      WARNINGS=$((WARNINGS + 1))
    fi
  else
    warn "$label nao esta instalado como servico"
    WARNINGS=$((WARNINGS + 1))
  fi
}

load_env() {
  if [ ! -f "$ENV_FILE" ]; then
    warn ".env nao encontrado em $ENV_FILE"
    WARNINGS=$((WARNINGS + 1))
    return
  fi
  while IFS= read -r line; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^#.*$ ]] && continue
    [[ -z "$line" ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local value="${BASH_REMATCH[2]}"
      value="${value%$'\r'}"
      export "$key=$value"
    fi
  done < "$ENV_FILE"
  ok ".env carregado"
}

check_env_key() {
  local key="$1"
  if [ -n "${!key:-}" ]; then
    ok "Variavel $key presente"
  else
    warn "Variavel $key nao encontrada no .env"
    WARNINGS=$((WARNINGS + 1))
  fi
}

check_db() {
  if ! command -v psql >/dev/null 2>&1; then
    warn "psql nao disponivel; pulando checagens do banco"
    WARNINGS=$((WARNINGS + 1))
    return
  fi
  if [ -z "${DB_NAME:-}" ] || [ -z "${DB_USER:-}" ]; then
    warn "DB_NAME/DB_USER ausentes; pulando checagens do banco"
    WARNINGS=$((WARNINGS + 1))
    return
  fi

  export PGPASSWORD="${DB_PASS:-}"
  local sql="SELECT current_database() AS db,
                    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants') AS has_tenants,
                    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='radcheck') AS has_radcheck,
                    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='hotspot_templates') AS has_hotspot_templates,
                    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='hotspot_payment_sessions') AS has_hotspot_sessions,
                    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vouchers') AS has_vouchers;"
  local result
  if result="$(psql -h "${DB_HOST:-127.0.0.1}" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" -At -F '|' -c "$sql" 2>/dev/null)"; then
    ok "Conexao com PostgreSQL ok"
    IFS='|' read -r db has_tenants has_radcheck has_hotspot_templates has_hotspot_sessions has_vouchers <<< "$result"
    [ "$has_tenants" = "t" ] && ok "Tabela tenants presente" || { err "Tabela tenants ausente"; FAILED=$((FAILED + 1)); }
    [ "$has_radcheck" = "t" ] && ok "Tabela radcheck presente" || { warn "Tabela radcheck ausente"; WARNINGS=$((WARNINGS + 1)); }
    [ "$has_hotspot_templates" = "t" ] && ok "Tabela hotspot_templates presente" || { warn "Tabela hotspot_templates ausente"; WARNINGS=$((WARNINGS + 1)); }
    [ "$has_hotspot_sessions" = "t" ] && ok "Tabela hotspot_payment_sessions presente" || { warn "Tabela hotspot_payment_sessions ausente"; WARNINGS=$((WARNINGS + 1)); }
    [ "$has_vouchers" = "t" ] && ok "Tabela vouchers presente" || { warn "Tabela vouchers ausente"; WARNINGS=$((WARNINGS + 1)); }
  else
    err "Nao foi possivel conectar no PostgreSQL com as credenciais do .env"
    FAILED=$((FAILED + 1))
  fi
  unset PGPASSWORD
}

check_ports() {
  if ! command -v ss >/dev/null 2>&1; then
    warn "ss nao disponivel; pulando portas"
    WARNINGS=$((WARNINGS + 1))
    return
  fi
  local app_port="${PORT:-8080}"
  local radius_auth="${RADIUS_PORT:-1812}"
  local radius_acct="${RADIUS_ACCT_PORT:-1813}"
  if ss -ltnp 2>/dev/null | grep -q ":$app_port "; then
    ok "Porta da aplicacao ouvindo em $app_port/tcp"
  else
    warn "Porta da aplicacao nao esta ouvindo em $app_port/tcp"
    WARNINGS=$((WARNINGS + 1))
  fi
  if ss -lunp 2>/dev/null | grep -q ":$radius_auth "; then
    ok "RADIUS auth ouvindo em $radius_auth/udp"
  else
    warn "RADIUS auth nao esta ouvindo em $radius_auth/udp"
    WARNINGS=$((WARNINGS + 1))
  fi
  if ss -lunp 2>/dev/null | grep -q ":$radius_acct "; then
    ok "RADIUS acct ouvindo em $radius_acct/udp"
  else
    warn "RADIUS acct nao esta ouvindo em $radius_acct/udp"
    WARNINGS=$((WARNINGS + 1))
  fi
}

echo "=============================================="
echo "  OTYIS ISP - Diagnostico da instalacao"
echo "=============================================="
echo "Projeto: $PROJECT_ROOT"
echo "Data:    $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

if [ "$(id -u)" -ne 0 ]; then
  warn "Recomendado executar como root para diagnostico completo"
  WARNINGS=$((WARNINGS + 1))
fi

if [ -f /etc/os-release ]; then
  . /etc/os-release
  ok "Sistema operacional: ${PRETTY_NAME:-desconhecido}"
fi

check_cmd node "Node.js"
check_cmd npm "npm"
check_cmd psql "PostgreSQL client"
check_cmd systemctl "systemd"
check_any_cmd "FreeRADIUS" freeradius radiusd

load_env
check_env_key PORT
check_env_key DB_HOST
check_env_key DB_NAME
check_env_key DB_USER
check_env_key ADMIN_KEY
check_env_key JWT_SECRET
check_env_key RADIUS_HOST
check_env_key RADIUS_SECRET

check_service multi-portal.service "App multi-portal"
check_service freeradius-standalone.service "FreeRADIUS standalone"
check_db
check_ports

echo ""
echo "=============================================="
if [ "$FAILED" -gt 0 ]; then
  err "Diagnostico concluido com $FAILED erro(s) e $WARNINGS aviso(s)."
  exit 1
fi

if [ "$WARNINGS" -gt 0 ]; then
  warn "Diagnostico concluido com $WARNINGS aviso(s)."
else
  ok "Diagnostico concluido sem problemas."
fi
echo "=============================================="
