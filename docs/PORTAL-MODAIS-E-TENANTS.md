# Portal — Modais e Tenants

## Resumo

O portal do provedor (`/portal/dashboard`) usa modais Bootstrap. O comportamento difere conforme o modo de acesso:

- **Com tenant (path-based):** `/oty/portal/dashboard` — modais funcionam
- **Standalone (sem prefixo):** `/portal/dashboard` — depende da configuração do Nginx/proxy

## Fluxo de carregamento

### 1. Com prefixo (tenant path-based)

Ex.: `https://host/oty/portal/dashboard`

1. O Nginx envia `X-Forwarded-Prefix: /oty/portal` (ou similar)
2. `portalPages.ts` recebe `prefix` não vazio
3. O HTML é lido, modificado e enviado:
   - Scripts: `src="/oty/assets/js/portal-modals.js"` (em vez de `/assets/...`)
   - Injeção de `__PORTAL_BASE__`, `__ASSETS_BASE__`, `__API_BASE__`
4. O navegador pede `/oty/assets/js/portal-modals.js`
5. O `server.ts` trata `pathPart.startsWith('/oty/assets')` e serve de `web/assets`
6. Os scripts carregam e os modais funcionam

### 2. Sem prefixo (standalone)

Ex.: `https://host/portal/dashboard`

1. `getForwardedPrefix(req)` retorna vazio
2. `portalPages.ts` envia o HTML original com `res.sendFile`
3. Scripts permanecem como `src="/assets/js/portal-modals.js"`
4. O navegador pede `/assets/js/portal-modals.js`
5. O `express.static(web)` ou o handler em `app.all('*')` deve servir `web/assets`

**Possível problema:** Se o Nginx/proxy não encaminha `/assets` para o app (por exemplo, em subdomínio), os scripts podem dar 404 e os modais não funcionam.

## Solução para standalone

Para que funcione sem prefixo, o proxy precisa encaminhar `/assets` para o app:

```nginx
location /assets/ {
    proxy_pass http://portal_backend;
    proxy_set_header Host $host;
}
```

Ou, se o portal estiver em subdomínio:

```nginx
server_name oty.otnsoft.com.br;
location / {
    proxy_pass http://portal_backend;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Prefix "";  # ou / se necessário
}
```

## Componentes dos modais

| Arquivo | Função |
|---------|--------|
| `web/assets/js/portal-modals.js` | Abre/fecha modais, fallback manual se Bootstrap falhar |
| `web/portal/dashboard.html` | CSS dos modais (z-index, animações) |
| `web/assets/js/portal-dashboard.js` | Lógica do painel, `fillPlanForm`, etc. |

## Ajustes feitos

1. **portal-modals.js**
   - `capture: true` e `stopPropagation`/`preventDefault` para garantir abertura
   - `safeShowModal` usa Bootstrap `getOrCreateInstance` ou fallback manual
   - Handler para `data-bs-dismiss` e backdrop customizado

2. **dashboard.html**
   - `.modal.show { z-index: 1060 }` e `.modal-backdrop { z-index: 1050 }` para evitar tela preta
   - Remoção de `opacity: 0` no `.modal-dialog` que podia esconder o conteúdo

3. **portal-dashboard.js**
   - `fillPlanForm(id)` chamado logo no clique para preencher corretamente o modal de planos

## Verificação

1. Abrir o console (F12) e checar erros de JavaScript
2. Na aba Network, ver se `portal-modals.js`, `portal-dashboard.js` e `finance-dashboard.js` retornam 200
3. Se houver 404 em `/assets/...`, revisar a configuração do proxy/Nginx
