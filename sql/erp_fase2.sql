-- ERP Fase 2: Clientes (endereço, histórico), Contratos, vínculos Proposta→Contrato→OS
-- Execute: npm run update-databases

-- ========== Clientes: endereço e observações ==========
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_json JSONB;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;

-- ========== Histórico do cliente (observações, contatos, eventos) ==========
CREATE TABLE IF NOT EXISTS customer_history (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL DEFAULT 'NOTE' CHECK (type IN ('NOTE','CONTACT','CONTRACT','INSTALLATION','PAYMENT','TICKET','OS','OTHER')),
  subject VARCHAR(255),
  content TEXT,
  created_by INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_history_tenant ON customer_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_history_customer ON customer_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_history_created ON customer_history(created_at);

-- ========== Contratos ==========
CREATE TABLE IF NOT EXISTS contracts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  proposal_id BIGINT REFERENCES proposals(id) ON DELETE SET NULL,
  plan_code VARCHAR(32) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  due_day SMALLINT NOT NULL DEFAULT 10,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','SUSPENDED','CANCELLED','EXPIRED')),
  signed_at DATE,
  starts_at DATE,
  ends_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_customer ON contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_proposal ON contracts(proposal_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);

-- ========== Proposta → OS (vínculo) ==========
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS proposal_id BIGINT REFERENCES proposals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_service_orders_proposal ON service_orders(proposal_id);
