-- Lotes de carnê (carnês por competência para impressão e entrega)
-- Cada lote agrupa um carnê por cliente para uma competência (ref_month).

CREATE TABLE IF NOT EXISTS carne_lots (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  ref_month VARCHAR(7) NOT NULL,
  name VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'GENERATED',
  total_customers INT NOT NULL DEFAULT 0,
  total_invoices INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_carne_lots_tenant ON carne_lots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_carne_lots_ref_month ON carne_lots(ref_month);
CREATE INDEX IF NOT EXISTS idx_carne_lots_status ON carne_lots(status);

CREATE TABLE IF NOT EXISTS carne_lot_items (
  id BIGSERIAL PRIMARY KEY,
  carne_lot_id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  printed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  delivery_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (carne_lot_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_carne_lot_items_lot ON carne_lot_items(carne_lot_id);
CREATE INDEX IF NOT EXISTS idx_carne_lot_items_customer ON carne_lot_items(customer_id);
