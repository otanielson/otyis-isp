# Changelog — Portal do Provedor (10/03/2026)

Registro de todas as alterações feitas para corrigir o erro **"Cannot read properties of null (reading 'addEventListener')"** no portal do provedor e para atualizar o provedor em produção.

---

## 1. Problema

- **Erro:** `portal-dashboard.js:669 Uncaught TypeError: Cannot read properties of null (reading 'addEventListener')`
- **Causa:** O script `portal-dashboard.js` é carregado quando o usuário abre o dashboard no SPA. Nesse momento, os botões das abas **Planos** e **Pedidos** (ex.: `btnSavePlan`, `btnLoadLeads`, `btnSaveLeadStatus`) ainda não existem no DOM, pois o conteúdo das abas é carregado dinamicamente por `dashboard-tabs-loader.js`. Chamar `document.getElementById('btnSavePlan').addEventListener(...)` com elemento `null` gera o erro.

---

## 2. Arquivos alterados

### 2.1 `web/assets/js/portal-dashboard.js`

#### a) Novo helper (após `safeHideModal`)

```javascript
function safeOn(id, ev, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
}
```

- **Objetivo:** Só anexar listener se o elemento existir; evita erro quando a aba ainda não foi carregada.

#### b) Delegação de eventos para os 3 botões que quebravam

- **Removido:** Chamadas diretas a `document.getElementById('btnSavePlan').addEventListener(...)`, `document.getElementById('btnLoadLeads').addEventListener(...)` e `document.getElementById('btnSaveLeadStatus').addEventListener(...)`.
- **Incluído:** Um único `document.addEventListener('click', ...)` (em IIFE `setupDelegatedClick`) que:
  - Identifica o elemento clicado com `e.target.closest('[id]')`;
  - Se `id === 'btnSavePlan'`: executa a lógica de salvar plano (ler campos do formulário, montar body, chamar API, etc.);
  - Se `id === 'btnLoadLeads'`: chama `setLoading('outLeads')`, `api('/leads')`, preenche tabela e trata erros;
  - Se `id === 'btnSaveLeadStatus'`: lê status, chama `api('/leads/' + currentLeadId, PATCH)`, fecha modal e atualiza lista.

Assim, não se depende mais da existência desses botões no carregamento do script.

#### c) Uso de `safeOn` em todos os outros listeners sem proteção

Substituição de `document.getElementById('...').addEventListener(...)` por `safeOn('id', 'click', ...)` (ou evento adequado) nos seguintes elementos:

- **Clientes:** `btnLoadCustomers`, `btnEditCustomer`, `btnSalvarCadastroContrato`, `btnSaveCustomer`, `btnToggleCustomer`
- **Stand / Vencedores:** `btnLoadStand`, `btnLoadWinners`
- **Clube:** `btnLoadClubePage`, `btnSaveClubePage`
- **Grupos:** `btnLoadGrupos`, `btnNewGrupo`, `btnSaveGrupo`, `btnSaveGrupoPermissoes`
- **Usuários:** `btnLoadUsuarios`, `btnNewUsuario`, `btnSaveUsuario`, `btnSaveUsuarioGrupos`
- **Sorteio:** `btnDraw`

Em handlers que usam `document.getElementById('outStand')`, `document.getElementById('outWinners')`, etc., foi adicionada checagem `if (out) out.innerHTML = ...` para evitar acesso a `null`.

#### d) Listeners em conteúdo dinâmico (modais)

- **comodatoVendaAddRow:** Obter elemento com `getElementById`, só chamar `addEventListener` se existir; dentro do handler, checar `tbody` antes de usar.
- **estoqueMovAddRow:** Mesmo padrão (variável local + `if (el) el.addEventListener(...)`).
- **estoqueKitAddRow:** Mesmo padrão.

#### e) Handler `btnDraw`

- Uso de `safeOn('btnDraw', 'click', ...)` e, no início do callback, `if (!out) return;` antes de `out.innerHTML = ...`.

---

### 2.2 `web/portal/spa.html`

- **Inclusão do carregador de abas** para o conteúdo do dashboard carregar corretamente no SPA.
- **Alteração:** Inserir, antes de `portal-modals.js` e `portal-spa.js`, a tag:

```html
<script src="/assets/js/dashboard-tabs-loader.js"></script>
```

Trecho completo dos scripts ao final do `<body>`:

```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.js"></script>
<script src="/assets/js/dashboard-tabs-loader.js"></script>
<script src="/assets/js/portal-modals.js"></script>
<script src="/assets/js/portal-spa.js"></script>
```

---

## 3. Deploy em produção

Comando executado:

```bash
cd /var/www/otyis-isp && ./deploy.sh
```

O script:

1. Instala dependências (`npm ci` / `npm install`)
2. Executa `npm run build`, `npm run build:portal`, `npm run build:portal-spa`
3. Copia a pasta `web/` para `dist/web`
4. Reinicia o serviço `multi-portal` (systemctl)

Resultado: serviço ativo e alterações do portal em produção.

---

## 4. Resumo

| Item | Descrição |
|------|------------|
| **Erro corrigido** | `Cannot read properties of null (reading 'addEventListener')` em `portal-dashboard.js` |
| **Abordagem** | Helper `safeOn` + delegação de eventos em `document` para os 3 botões das abas dinâmicas + `safeOn` nos demais botões e proteção em handlers que usam elementos opcionais |
| **Arquivos** | `web/assets/js/portal-dashboard.js`, `web/portal/spa.html` |
| **Deploy** | `./deploy.sh` (build, cópia de `web` para `dist`, restart `multi-portal`) |

---

## 5. Se o erro voltar

Se o código em `web/` tiver sido revertido e o erro reaparecer:

1. Reaplicar em `portal-dashboard.js`: helper `safeOn`, IIFE `setupDelegatedClick` com o handler delegado para `btnSavePlan`, `btnLoadLeads` e `btnSaveLeadStatus`, e troca dos demais `getElementById(...).addEventListener` por `safeOn` ou checagem de elemento.
2. Garantir em `spa.html` a presença de `<script src="/assets/js/dashboard-tabs-loader.js"></script>` antes dos outros scripts do portal.
3. Rodar novamente `./deploy.sh` (ou o fluxo de deploy em uso) e testar com hard refresh (Ctrl+Shift+R) ou em aba anônima.
