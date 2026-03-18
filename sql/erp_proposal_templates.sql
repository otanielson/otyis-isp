-- ERP Propostas: modelos de propostas comerciais por tenant
-- Execute: npm run update-databases

CREATE TABLE IF NOT EXISTS proposal_templates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  plan_code VARCHAR(32),
  default_amount DECIMAL(10,2),
  valid_days INT NOT NULL DEFAULT 15,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_proposal_templates_tenant
  ON proposal_templates(tenant_id);

