# Export: Oty ISP (otyisisp)
Gerado em 2026-03-02T03:29:02.441Z

## Estrutura

- site/static/ — Site institucional (HTML, assets)
- postgres/init/ — 02-tenant.sql (schema vem da imagem modelo)

## Próximos passos

1. Copie esta pasta para o host de provisionamento (ex: /srv/tenants/otyisisp)
2. Execute o provisionamento via API ou use docker-compose manualmente
3. O provisionamento gerará: .env, docker-compose.yml, radius/
