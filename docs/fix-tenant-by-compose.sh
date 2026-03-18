#!/bin/bash
# Corrige o docker-compose.yml do tenant by — usa network_mode: host no portal
# Execute no servidor: bash fix-tenant-by-compose.sh

set -e
cd /srv/tenants/by || { echo "Pasta /srv/tenants/by não existe"; exit 1; }

# Backup
cp docker-compose.yml docker-compose.yml.bak 2>/dev/null || true

# Gerar docker-compose corrigido (portal com network_mode: host = conecta via 127.0.0.1)
cat > docker-compose.yml << 'COMPOSE_EOF'
# Stack do tenant: by — portal usa network_mode: host (evita problemas de rede Docker)

services:
  postgres:
    image: postgres:16-alpine
    container_name: pg_by
    environment:
      POSTGRES_DB: ${PG_DB}
      POSTGRES_USER: ${PG_USER}
      POSTGRES_PASSWORD: ${PG_PASS}
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./postgres/init:/docker-entrypoint-initdb.d:ro
    networks:
      tenant_net:
        aliases:
          - pg_by
    restart: unless-stopped
    ports:
      - "127.0.0.1:${PG_HOST_PORT}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${PG_USER} -d ${PG_DB}"]
      interval: 5s
      timeout: 5s
      retries: 5

  portal_admin:
    image: multi-portal-admin:by
    container_name: portal_by
    env_file:
      - .env
    environment:
      TENANT_ID: "1"
      TENANT_SLUG: "${TENANT}"
    depends_on:
      postgres:
        condition: service_healthy
      freeradius:
        condition: service_started
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./site/static:/app/site/static:ro

  freeradius:
    image: freeradius/freeradius-server:latest
    container_name: radius_by
    depends_on:
      - postgres
    networks:
      tenant_net:
        aliases:
          - radius_by
    restart: unless-stopped
    ports:
      - "${RADIUS_AUTH_PORT}:1812/udp"
      - "${RADIUS_ACCT_PORT}:1813/udp"
    volumes:
      - ./radius/clients.conf:/etc/freeradius/3.0/clients.conf:ro
      - ./radius/mods-available/sql:/etc/freeradius/3.0/mods-available/sql:ro
      - ./radius/mods-enabled/sql:/etc/freeradius/3.0/mods-enabled/sql:ro
      - ./radius/sites-available/default:/etc/freeradius/3.0/sites-available/default:ro
      - ./radius/sites-enabled/default:/etc/freeradius/3.0/sites-enabled/default:ro
      - ./radius/users:/etc/freeradius/3.0/mods-config/files/authorize:ro

networks:
  tenant_net:
    name: tenant_by
    driver: bridge

volumes:
  pg_data:
    name: pgdata_by
COMPOSE_EOF

echo "docker-compose.yml corrigido. Verificando .env (portal usa 127.0.0.1 com network_mode: host)..."
PG_PORT=$(grep PG_HOST_PORT .env | cut -d= -f2)
APP_PORT=$(grep APP_PORT .env | cut -d= -f2)
RADIUS_PORT=$(grep RADIUS_AUTH_PORT .env | cut -d= -f2)
grep -q "DB_HOST=127.0.0.1" .env || {
  echo "Ajustando .env para 127.0.0.1 (PG_PORT=$PG_PORT APP_PORT=$APP_PORT)..."
  sed -i "s/DB_HOST=pg_by/DB_HOST=127.0.0.1/" .env
  sed -i "s/DB_PORT=5432/DB_PORT=$PG_PORT/" .env
  sed -i "s|@pg_by:5432/|@127.0.0.1:${PG_PORT}/|" .env
  sed -i "s/RADIUS_HOST=radius_by/RADIUS_HOST=127.0.0.1/" .env
  sed -i "s/RADIUS_PORT=1812/RADIUS_PORT=$RADIUS_PORT/" .env
  sed -i "s/PORT=3000/PORT=$APP_PORT/" .env
}

echo "Subindo containers..."
docker compose up -d

echo "Aguardando 20s..."
sleep 20

echo "Testando..."
curl -sI http://127.0.0.1:4001/ | head -5

echo ""
echo "Se HTTP 200 aparecer acima, acesse: http://SEU_IP/by/"
