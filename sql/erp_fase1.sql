-- ERP Fase 1: Propostas, Ordens de Serviço, Tickets
-- Execute: psql -U postgres -d SEU_BANCO -f sql/erp_fase1.sql
-- Ou: npm run update-databases (adicionar ao script)

-- ========== Propostas comerciais ==========
CREATE TABLE IF NOT EXISTS proposals (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name VARCHAR(190),
  customer_whatsapp VARCHAR(32),
  plan_code VARCHAR(32) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  valid_until DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','APPROVED','REJECTED','CONVERTED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_proposals_tenant ON proposals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_customer ON proposals(customer_id);

-- ========== Ordens de serviço ==========
CREATE TABLE IF NOT EXISTS service_orders (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'INSTALLATION' CHECK (type IN ('INSTALLATION','MAINTENANCE','SUPPORT','UPGRADE','OTHER')),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','PENDING','COMPLETED','CANCELLED')),
  assigned_to INT,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  description TEXT,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_service_orders_tenant ON service_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_status ON service_orders(status);
CREATE INDEX IF NOT EXISTS idx_service_orders_customer ON service_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_due ON service_orders(due_date);

-- ========== Tickets / Chamados (suporte) ==========
CREATE TABLE IF NOT EXISTS tickets (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  subject VARCHAR(255) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','PENDING','WAITING_CUSTOMER','EN_ROUTE','RESOLVED','CLOSED','CANCELLED')),
  channel VARCHAR(32),
  ticket_type VARCHAR(32),
  technical_category VARCHAR(64),
  assigned_to INT,
  assigned_to_name VARCHAR(120),
  sla_due_at TIMESTAMPTZ,
  defect_text TEXT,
  solution_text TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant ON tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS defect_text TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS solution_text TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS channel VARCHAR(32);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_type VARCHAR(32);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS technical_category VARCHAR(64);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_to_name VARCHAR(120);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('OPEN','IN_PROGRESS','PENDING','WAITING_CUSTOMER','EN_ROUTE','RESOLVED','CLOSED','CANCELLED'));
