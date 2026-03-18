# Modelos Multi-Portal

Modelos para provisionamento de novos provedores. Ao criar um provedor, os modelos são exportados para o stack Docker com as informações do cliente.

## Fluxo de provisionamento (passo a passo)

Ver **[FLUXO-PROVISIONAMENTO.md](./FLUXO-PROVISIONAMENTO.md)** para o fluxo completo:

1. **PostgreSQL** — `docker compose up -d --wait postgres` (porta, user, senha gravados)
2. **FreeRADIUS** — `docker compose up -d freeradius` (usa Postgres)
3. **Portal + Site (Node)** — `docker compose up -d portal_admin` (um container serve site e portal)

## Estrutura

```
models/
├── FLUXO-PROVISIONAMENTO.md   # Fluxo passo a passo (Postgres → RADIUS → Portal+Site)
├── site/                      # Site institucional (HTML estático → montado no container)
├── admin/                     # Portal do provedor (dashboard, login)
├── postgres/                  # Schema PostgreSQL + RADIUS
└── radius/                    # Configurações FreeRADIUS (templates)
```

## Placeholders

Ao exportar, substitua nos arquivos:

| Placeholder | Descrição |
|-------------|-----------|
| `{{PROVIDER_NAME}}` | Nome do provedor |
| `{{PROVIDER_SLUG}}` | Slug (ex: otyisisp) |
| `{{PROVIDER_DOMAIN}}` | Domínio (opcional) |
| `{{BASE_PATH}}` | Path base no nginx (ex: /otyisisp/) |

## Uso

```bash
# Exportar para novo provedor (sem subir Docker)
npm run export-provider -- --slug otyisisp --name "Oty ISP"

# Ou via provisionamento (API/UI) - usa automaticamente os modelos
```

Ver `docs/MODELOS.md` para detalhes.
