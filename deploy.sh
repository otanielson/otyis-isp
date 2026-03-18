#!/usr/bin/env bash
# Atualiza código, build e reinicia o app.
# Uso: ./deploy.sh   (ou npm run deploy)
set -e
cd /var/www/otyis-isp

echo "==> Atualizando código (se tiver git)..."
if [ -d .git ]; then
  git pull
fi

echo "==> Instalando deps e build..."
npm ci || npm install
npm run build
npm run build:portal
npm run build:portal-spa 2>/dev/null || true

echo "==> Copiando web para dist (se existir)..."
[ -d web ] && ( rm -rf dist/web; cp -r web dist/web ) || true

echo "==> Reiniciando..."
if systemctl is-enabled multi-portal &>/dev/null; then
  sudo systemctl restart multi-portal
  echo "==> OK (systemctl restart multi-portal)"
  sudo systemctl status multi-portal --no-pager || true
else
  pm2 restart otyis-isp --update-env 2>/dev/null || true
  echo "==> OK (pm2 restart)"
  pm2 status | grep -E "otyis-isp|multi" || true
fi
