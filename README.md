# Multi Telecom Portal (Portal + Clube Multi) — Node.js + MySQL

Projeto completo (sem React) com:
- Site público (Home, Planos, Notícias)
- Formulário de assinatura com escolha de vencimento (05, 10, 15, 20, 25)
- Módulo **Clube Multi** (cadastro rápido do stand + pontos + número de sorteio)
- Admin simples (listar cadastros e sortear) protegido por `ADMIN_KEY`

## 1) Requisitos
- Node.js 18+
- MySQL 8+ (ou MariaDB compatível)

## 2) Configurar banco
Crie o banco e rode o SQL:

```sql
CREATE DATABASE multitelecom_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Depois execute:
- `sql/schema.sql`
- (opcional) `sql/seed.sql`

## 3) Configurar .env
Copie `.env.example` para `.env` e ajuste.

## 4) Instalar e rodar
```bash
npm install
npm run dev
```

Acesse:
- http://localhost:8080 (site)
- http://localhost:8080/admin (admin — exige `ADMIN_KEY`)

## 5) Deploy (PM2 + Nginx)
Veja:
- `deploy/ecosystem.config.cjs`
- `deploy/nginx.site.conf`

---

### Rotas principais
- `POST /api/assinaturas` (form “Assinar Plano”)
- `POST /api/clube/stand/signup` (cadastro rápido do stand)
- `GET  /api/admin/leads?key=ADMIN_KEY`
- `POST /api/admin/raffles/:campaignId/draw?key=ADMIN_KEY`

