# Deploy — novas rotas da API (evitar 404)

Quando novas rotas são adicionadas (ex.: `/api/portal/contract-templates`), o **processo Node** precisa rodar com o código compilado atualizado. Em setups com **tenants em Docker**, cada container (portal_&lt;slug&gt;) tem sua própria cópia do app — é preciso **reconstruir a imagem e reiniciar os containers** além de rodar as **migrações nos bancos dos tenants**.

---

## Checklist rápido (tenants em Docker)

| Passo | Comando |
|-------|--------|
| 1. Migrações nos bancos dos tenants | `npm run update-databases -- --tenants` ou `--tenants tp` |
| 2. Rebuild + subir containers | `npm run update-tenant-stacks` ou `node scripts/update-tenant-stacks.mjs tp` |
| (Se usar imagem fixa) | `docker build -t multi-portal-admin:latest .` depois `... --skip-build` |

**Scripts:** `update-databases.mjs` (SQL nos tenants), `update-tenant-stacks.mjs` (build da imagem + `docker compose up` por tenant).

---

## Cenário 1: API no host (um processo Node, ex.: porta 8080)

Se a API é servida por um único processo no host (Nginx faz proxy `/tp/api/` → `http://127.0.0.1:8080/api/`):

1. **Atualize o código** (se usar git: `git pull`).
2. **Recompile:** `npm run build`
3. **Confirme a rota no dist:**  
   `grep -n "contract-templates" dist/src/routes/portalData.routes.js`
4. **Reinicie o processo:** `pm2 restart all` ou `systemctl restart …`
5. **Teste:**  
   `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/api/portal/contract-templates`  
   (200 ou 401 = OK; 404 = processo ainda com código antigo.)

---

## Cenário 2: Tenants em Docker (stack por provedor)

Cada tenant tem um stack com o container **portal_&lt;slug&gt;** (portal + site + API). O código do app está **dentro da imagem**; só reiniciar não carrega alterações. É preciso:

1. **Migrações nos bancos dos tenants** (ex.: tabela `contract_templates`):
   ```bash
   npm run update-databases -- --tenants
   # Só um tenant:
   npm run update-databases -- --tenants tp
   ```

2. **Atualizar os stacks (rebuild da imagem + subir o container)**:
   ```bash
   npm run update-tenant-stacks
   # Só o tenant tp:
   node scripts/update-tenant-stacks.mjs tp
   ```
   O script faz:
   - `npm run build` no host (em `PROVISION_APP_CONTEXT` ou raiz do projeto)
   - Em cada pasta do tenant: `docker compose build --no-cache portal_admin` e `docker compose up -d portal_admin`

3. **Se o tenant usa imagem fixa** (`PROVISION_PORTAL_ADMIN_IMAGE`), o compose não tem `build`. Nesse caso:
   - Reconstrua a imagem manualmente no host, por exemplo:  
     `docker build -t multi-portal-admin:latest /var/www/otyis-isp`
   - Depois rode só o reinício nos tenants:  
     `node scripts/update-tenant-stacks.mjs --skip-build`

4. **Teste** no container de um tenant (ex.: tp na porta do .env do tenant):
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:APP_PORT/api/portal/contract-templates
   ```
   Use o `APP_PORT` do `.env` da pasta do tenant (ex.: `/srv/tenants/tp/.env`).

---

## Nginx

O Nginx só repassa a requisição. Com `/tp/api/portal/...` ele deve reescrever para `/api/portal/...` e fazer `proxy_pass` para o processo/container correto. Se outras rotas de `/tp/api/portal/` funcionam, o problema é **código do Node** (host ou container) ou **falta de migração** no banco do tenant.
