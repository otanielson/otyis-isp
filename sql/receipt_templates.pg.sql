-- Modelos de recibos / documentos por tenant (PostgreSQL)
-- Execute: psql -U user -d database -f sql/receipt_templates.pg.sql
-- Ou: psql $DATABASE_URL -f sql/receipt_templates.pg.sql
-- Se der "permission denied for table tenants", execute como superusuário ou use a versão sem REFERENCES em schema.pg.sql.

CREATE TABLE IF NOT EXISTS receipt_templates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_key VARCHAR(64) NOT NULL,
  name VARCHAR(190) NOT NULL,
  description VARCHAR(255),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE (tenant_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_receipt_templates_tenant ON receipt_templates(tenant_id);
