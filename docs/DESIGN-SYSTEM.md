# Design System — Multi Portal

Qual estilo (CSS) usar em cada parte do projeto.

---

## 1. Dois sistemas

| Sistema | Arquivo | Uso |
|--------|---------|-----|
| **Site (Multi Portal)** | `/assets/css/styles.css` | Site público, páginas do provedor (home, planos, notícias, clube, assinar, 404, área do cliente, landing SaaS). |
| **Painel (Ant Design)** | `/assets/css/dashboard.css` | Portal do provedor, Admin do SaaS: login, dashboard, abas, modelos de proposta. |

---

## 2. Onde usar cada um

### 2.1 Estilo **Site** — `styles.css`

- Variáveis: `--mt-blue`, `--mt-dark`, `--mt-accent`, `--mt-bg`, `--mt-card-bg`, `--mt-radius`, `--mt-shadow`, etc.
- Fonte: Plus Jakarta Sans.
- Use em:
  - `index.html`, `planos.html`, `assinar.html`
  - `noticias/*.html`, `clube/*.html`
  - `cliente/index.html`
  - `404.html`
  - `saas-landing.html` (landing “provedor não configurado”)
  - `admin/index.html` (tela de acesso com chave)

Páginas **dentro** do site (qualquer nova página acessada pelo menu do site) devem incluir `styles.css` e reutilizar classes/estruturas já usadas (navbar, container, cards, tipografia).

### 2.2 Estilo **Painel** — `dashboard.css`

- Variáveis: `--ant-primary`, `--ant-sidebar`, `--ant-bg`, `--ant-radius`, `--ant-text`, etc.
- Layout: sidebar, topbar, `.admin-dash`, `.admin-panel`, `.admin-table`, etc.
- Use em:
  - `portal/login.html`, `portal/spa.html`, `portal/dashboard.html`
  - `portal/modelos-proposta.html`
  - `admin/login.html`, `admin/dashboard.html`
  - Todas as abas do dashboard (já carregadas no mesmo documento).

Páginas **dentro** do portal ou do admin (novas telas de painel) devem usar `dashboard.css` e as classes existentes (`.admin-panel`, `.admin-table`, botões Ant, etc.).

---

## 3. Resumo por contexto

| Contexto | CSS |
|----------|-----|
| Site público (/, planos, notícias, clube, assinar, 404, cliente) | `styles.css` |
| Landing SaaS (sem tenant) | `styles.css` |
| Admin index (chave) | `styles.css` |
| Portal (login, dashboard, modelos) | `dashboard.css` |
| Admin (login, dashboard) | `dashboard.css` |

---

## 4. Boas práticas

- **Novas páginas do site:** incluir `styles.css`, usar variáveis `--mt-*` e componentes já definidos (navbar, footer, cards, hero).
- **Novas telas de painel:** incluir `dashboard.css`, usar `.admin-panel`, `.admin-table`, variáveis `--ant-*` e botões/inputs já estilizados.
- **Evitar:** CSS inline duplicando layout de sidebar/topbar/panel; preferir o arquivo do design system e só adicionar estilos específicos da página em `<style>` mínimo quando necessário.
