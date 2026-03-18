# FreeRADIUS no host (fora do Docker)

O FreeRADIUS passou a rodar **no host** via systemd, não mais em container Docker.

## Requisitos no host

1. **Instalar FreeRADIUS** (Debian/Ubuntu):
   ```bash
   sudo apt update && sudo apt install -y freeradius
   ```

2. **Unit systemd**  
   O provisionamento copia `deploy/freeradius-tenant@.service` para `/etc/systemd/system/`.  
   Para instalar manualmente:
   ```bash
   sudo cp /var/www/otyis-isp/deploy/freeradius-tenant@.service /etc/systemd/system/
   sudo systemctl daemon-reload
   ```

## Por tenant

- Config do RADIUS: `/srv/tenants/<slug>/radius/` (clients.conf, mods, sites, radiusd.conf, log/, run/).
- Serviço: `freeradius-tenant@<slug>` (ex.: `freeradius-tenant@tp`).
- Postgres: RADIUS no host conecta em `127.0.0.1:<PG_HOST_PORT>` (ex.: 4002 para o tenant tp).

## Comandos úteis

```bash
# Status
sudo systemctl status freeradius-tenant@tp

# Iniciar / reiniciar / parar
sudo systemctl start freeradius-tenant@tp
sudo systemctl restart freeradius-tenant@tp
sudo systemctl stop freeradius-tenant@tp

# Logs
journalctl -u freeradius-tenant@tp -f
# ou
tail -f /srv/tenants/tp/radius/log/radius.log
```

## Migrar tenant que estava com RADIUS em Docker

1. Parar o container (se ainda existir):
   ```bash
   cd /srv/tenants/tp && docker compose stop freeradius
   ```
2. Atualizar a config do RADIUS (SQL com 127.0.0.1 e porta do Postgres) e gerar radiusd.conf:
   ```bash
   cd /var/www/otyis-isp && node scripts/update-tenant-radius.mjs tp
   ```
   (Se o script não gerar radiusd.conf, criar manualmente em `/srv/tenants/tp/radius/radiusd.conf` — ver `generateRadiusdConf` em `src/provisioning/composeGenerator.ts`.)
3. Instalar o unit e iniciar:
   ```bash
   sudo cp /var/www/otyis-isp/deploy/freeradius-tenant@.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable freeradius-tenant@tp
   sudo systemctl start freeradius-tenant@tp
   ```
4. Remover o serviço `freeradius` do `docker-compose.yml` do tenant (opcional; o compose já não o inclui em novos provisionamentos).
