# Acesso por path (sem DNS)

Permite acessar site e portal do tenant por path no mesmo IP, **sem depender de DNS**:

- **`http://SEU_IP/SLUG/`** → site do tenant (nginx)
- **`http://SEU_IP/SLUG/portal/`** → portal admin

Tudo passa pelo Nginx do host (80/443).

**Acesso só por IP:** defina `PUBLIC_IP=SEU_IP` no `.env` e use o exemplo `docs/nginx-ip-only.conf`. O link do provedor será exibido como `http://IP/slug/portal/`.

---

## 1. Expor o portal_admin apenas em 127.0.0.1

O provisionamento **novo** já expõe o portal admin em uma porta TCP só em localhost, por exemplo:

```yaml
# docker-compose.yml do tenant (gerado)
portal_admin:
  ...
  ports:
    - "127.0.0.1:${ADMIN_PORT}:3000"
```

Para **stacks antigos** (criados antes dessa mudança), edite manualmente:

```bash
cd /srv/tenants/SEU_SLUG
nano docker-compose.yml
```

No serviço `portal_admin`, adicione:

```yaml
    ports:
      - "127.0.0.1:21002:3000"
```

Use uma porta livre (ex.: 21002). Depois:

```bash
docker compose up -d
curl -I http://127.0.0.1:21002
# Deve retornar 200
```

---

## 2. Configurar Nginx do host

Edite o vhost que atende 80/443, por exemplo:

```bash
nano /etc/nginx/sites-available/default
```

**Importante:** as `location` do **portal** devem vir **antes** das do **site** (para que `/ka/portal/` não seja atendido por `/ka/`).

Dentro do `server { ... }`, adicione (substitua `ka` e as portas pelo seu tenant). **Portal antes do site** (location `/ka/portal/` antes de `/ka/`):

```nginx
    # Tenant: ka — acesso por path (sem DNS)
    location /ka/portal/ {
        proxy_pass http://127.0.0.1:21002/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /ka/portal/;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    location /ka/ {
        proxy_pass http://127.0.0.1:21001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /ka/;
        # Se CSS/JS quebrarem em subpath, descomente e ajuste:
        # sub_filter_once off; sub_filter 'href="/' 'href="/ka/'; sub_filter 'src="/' 'src="/ka/';
    }
```

- **21002** = porta do portal admin (ADMIN_PORT no .env do tenant)
- **21001** = porta do site (SITE_PORT no .env do tenant)
- Barras finais em `location` e em `X-Forwarded-Prefix` mantêm consistência.
- Se o site abrir “pelado” (CSS/JS quebrados), descomente a linha `sub_filter` na location do site e ajuste o prefixo se necessário.

---

## 3. Aplicar e testar

```bash
nginx -t
systemctl reload nginx
```

Teste:

- `https://SEU_IP/ka/` → site
- `https://SEU_IP/ka/portal/` → portal admin

Se o certificado SSL reclamar do IP, teste primeiro em HTTP: `http://SEU_IP/ka/`.

---

## Snippet pela API (pronto para colar)

O snippet já sai com **porta real**, **barras finais** (`/ka/portal/`, `/ka/`), **Websocket** e comentário para **sub_filter** se os assets quebrarem.

- **Um tenant:** `GET /api/saas/tenants/:id/nginx-snippet` — retorna o bloco daquele provedor.
- **Todos os tenants:** `GET /api/saas/nginx-snippet` — retorna o bloco completo de todos os provisionados (com sitePort e adminPort). Cole uma vez no `server { }`.

No Admin, use o botão **Nginx** (ícone código) na linha do provedor para abrir o snippet do tenant, ou o botão **Snippet Nginx (todos)** para gerar o bloco de todos.

---

## Script automático (escrever arquivo e recarregar Nginx)

Na VPS, você pode gerar o arquivo Nginx e opcionalmente recarregar o serviço com um script (usa o mesmo `.env` do app):

```bash
# Gera nginx-tenants.conf na raiz do projeto (ou NGINX_TENANTS_CONF no .env)
npm run nginx-tenants

# Gera e recarrega o Nginx (nginx -t && systemctl reload nginx)
npm run nginx-tenants:reload

# Arquivo em outro caminho (ex.: vhost incluído pelo Nginx)
node scripts/update-nginx-tenants.mjs --out /etc/nginx/sites-available/multi-portal-tenants.conf --reload
```

**Uma vez no Nginx**, inclua o arquivo dentro do `server { }` do seu vhost (80/443):

```nginx
server {
    listen 80;
    # ...
    include /etc/nginx/sites-available/multi-portal-tenants.conf;
}
```

Depois, ao criar novos provedores, rode de novo `npm run nginx-tenants:reload` (ou agende com cron) para atualizar a lista.

---

## Base path e assets quebrando

Se o site ou o portal abrem “pelados” (CSS/JS não carregam) em subpath, é porque usam URLs absolutas (`/assets/...`). O snippet já inclui uma linha comentada com `sub_filter` na location do site; descomente e recarregue o Nginx:

```nginx
sub_filter_once off; sub_filter 'href="/' 'href="/ka/'; sub_filter 'src="/' 'src="/ka/';
```

Ou configure `basePath` / `BASE_URL` no build do frontend. O header `X-Forwarded-Prefix` é enviado para o backend montar links corretos quando suportado.
