-- Movimento de caixa (entrada ao quitar fatura, lançamentos manuais)
-- PostgreSQL.

-- Permitir status CANCELLED em faturas (desativar)
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('PENDING','PAID','OVERDUE','CANCELLED'));

-- Tabela movimento de caixa
CREATE TABLE IF NOT EXISTS caixa_movimentos (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'RECEITA' CHECK (tipo IN ('RECEITA','DESPESA')),
  description VARCHAR(500),
  amount DECIMAL(12,2) NOT NULL,
  invoice_id BIGINT REFERENCES invoices(id) ON DELETE SET NULL,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_caixa_movimentos_tenant ON caixa_movimentos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_caixa_movimentos_date ON caixa_movimentos(movement_date);
CREATE INDEX IF NOT EXISTS idx_caixa_movimentos_invoice ON caixa_movimentos(invoice_id);
