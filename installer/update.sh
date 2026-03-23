#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log_ok()  { echo -e "${GREEN}[OK]${NC} $*"; }
log_info(){ echo -e "${YELLOW}[*]${NC} $*"; }
log_err() { echo -e "${RED}[ERRO]${NC} $*"; }

[ "$(id -u)" -eq 0 ] || { log_err "Execute como root: sudo $0"; exit 1; }

cd "$PROJECT_ROOT"

DO_PULL=false
for arg in "$@"; do
  case "$arg" in
    --pull) DO_PULL=true ;;
  esac
done

if [ "$DO_PULL" = true ]; then
  if [ -d .git ]; then
    log_info "Atualizando codigo com git pull --ff-only..."
    git pull --ff-only
    log_ok "Codigo atualizado."
  else
    log_err "Este diretorio nao eh um repositorio git. Remova --pull ou atualize os arquivos manualmente."
    exit 1
  fi
else
  log_info "Atualizando com os arquivos locais atuais."
fi

exec "$SCRIPT_DIR/reinstall-keep-db.sh"
