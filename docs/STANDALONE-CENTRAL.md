# Instalação única — componentes e Painel do dono do sistema

## Componentes (por VPS)

Cada instalação (uma VPS por provedor) tem:

| Componente | Descrição |
|------------|-----------|
| **Painel do dono do sistema** | `/admin` — quem administra esta instalação (dono/técnico). Visão geral, esta instalação, RADIUS, concentradores. Login: chave (ADMIN_KEY). |
| **Portal admin do provedor** | `/portal` — painel do **provedor** (ISP): Master e equipe. Clientes, planos, instalações, PPPoE, RADIUS, financeiro. Login: e-mail e senha. |
| **Site do provedor** | `/` — site público do provedor: planos, assinar, notícias, clube, área do cliente. |
| **PostgreSQL** | Banco de dados (portal + RADIUS). |
| **FreeRADIUS** | Autenticação PPPoE / Hotspot (portas 1812/1813). |

## Visão

- **Antes (SaaS):** Uma instalação servia vários provedores. O painel em `/admin` era "Admin do SaaS" (criar/gerenciar tenants).
- **Agora:** Uma VPS = um provedor. O painel em `/admin` é o **Painel do dono do sistema** — configuração desta instalação, sem criar outros provedores.

## Modo standalone

- **Variável:** `STANDALONE=1` no `.env`.
- **Painel do dono do sistema** (/admin): título "Painel do dono do sistema", aba "Esta instalação", RADIUS, concentradores. Sem "Novo provedor".
- **Portal admin do provedor** (/portal): inalterado — login Master/equipe.
- **Site do provedor**: inalterado.

## API em modo standalone

- **GET /api/saas/tenants:** retorna só o tenant desta instalação (id=1).
- **POST /api/saas/tenants:** retorna **403** (modo instalador único).

## Resumo de rotas

| Rota | Componente |
|------|------------|
| `/admin` | Painel do dono do sistema |
| `/portal` | Portal admin do provedor |
| `/` (planos, assinar, etc.) | Site do provedor |
