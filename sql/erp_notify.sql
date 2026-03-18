-- ERP Notificações: fila de mensagens (WhatsApp/SMS/E-mail) por tenant/cliente
-- Execute: npm run update-databases

CREATE TABLE IF NOT EXISTS message_queue (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT,
  customer_id BIGINT,
  channel VARCHAR(20) NOT NULL DEFAULT 'WHATSAPP' CHECK (channel IN ('WHATSAPP','SMS','EMAIL')),
  type VARCHAR(40) NOT NULL,
  to_address VARCHAR(190),
  payload_json JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','ERROR')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_message_queue_tenant ON message_queue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_message_queue_customer ON message_queue(customer_id);
CREATE INDEX IF NOT EXISTS idx_message_queue_status ON message_queue(status);

