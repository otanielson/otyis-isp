# Modelo FreeRADIUS

Configurações FreeRADIUS são **geradas** pelo provisionamento em `src/provisioning/composeGenerator.ts`:

- **clients.conf** — Clientes NAS (IPs dos roteadores)
- **mods-available/sql** — Conexão PostgreSQL
- **sites-available/default** — authorize/authenticate/accounting
- **users** — Fallback authorize (opcional)

## Variáveis por provedor

| Variável | Descrição |
|----------|-----------|
| `RADIUS_SECRET` | Senha compartilhada com os NAS |
| `DB_NAME`, `DB_USER`, `DB_PASS` | Conexão com Postgres do stack |
| `NAS_IPS` | IPs dos roteadores (opcional) |

## Estrutura gerada no tenant

```
tenant/radius/
├── clients.conf
├── users
├── mods-available/sql
├── mods-enabled/sql -> (mesmo conteúdo)
├── sites-available/default
└── sites-enabled/default -> (mesmo conteúdo)
```
