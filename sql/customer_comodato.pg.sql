-- Comodato / Venda por cliente (PostgreSQL)
-- Execute: psql -U user -d database -f sql/customer_comodato.pg.sql
-- Ou use o mesmo banco e usuário do schema.pg.sql

CREATE TABLE IF NOT EXISTS customer_comodato (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  contract_id BIGINT NULL,
  os_id BIGINT NULL,
  nf_number VARCHAR(64) NULL,
  movement_type VARCHAR(20) NOT NULL DEFAULT 'COMODATO' CHECK (movement_type IN ('COMODATO','VENDA','AVULSO')),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RETURNED','CLOSED','CANCELLED')),
  notes TEXT NULL,
  total_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  items_json JSONB NULL,
  created_by VARCHAR(128) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_comodato_customer ON customer_comodato(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_comodato_tenant ON customer_comodato(tenant_id);
