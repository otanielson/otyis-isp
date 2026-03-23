#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

show_help() {
  cat <<'EOF'
OTYIS ISP - instalador unificado

Uso:
  sudo ./installer/manage.sh install [opcoes-do-install]
  sudo ./installer/manage.sh update [--pull]
  sudo ./installer/manage.sh doctor
  sudo ./installer/manage.sh reinstall

Comandos:
  install    Instalacao nova e completa da VPS
  update     Atualiza app e migracoes mantendo banco e dados
  doctor     Diagnostico rapido de servicos, banco, portas e .env
  reinstall  Alias para reinstall-keep-db.sh

Exemplos:
  sudo ./installer/manage.sh install
  sudo ./installer/manage.sh install --dir=/opt/otyis
  sudo ./installer/manage.sh update --pull
  sudo ./installer/manage.sh doctor
EOF
}

MODE="${1:-}"
[ -n "$MODE" ] || {
  show_help
  exit 1
}
shift || true

case "$MODE" in
  install)
    exec "$SCRIPT_DIR/install.sh" "$@"
    ;;
  update)
    exec "$SCRIPT_DIR/update.sh" "$@"
    ;;
  doctor)
    exec "$SCRIPT_DIR/doctor.sh" "$@"
    ;;
  reinstall)
    exec "$SCRIPT_DIR/reinstall-keep-db.sh" "$@"
    ;;
  help|-h|--help)
    show_help
    ;;
  *)
    echo "Modo invalido: $MODE"
    echo ""
    show_help
    exit 1
    ;;
esac
