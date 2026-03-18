-- Gateways de pagamento (EFI/GerenciaNet, Cora, etc.) por tenant
-- PostgreSQL: execute no banco do tenant ou global conforme sua estrutura.
-- Se tenants usam mesmo DB: tenant_id em payment_gateways.
-- MySQL: troque SERIAL/BIGSERIAL por BIGINT AUTO_INCREMENT, JSONB por JSON.

CREATE TABLE IF NOT EXISTS payment_gateways (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  description VARCHAR(255) NOT NULL,
  gateway_type VARCHAR(64) NOT NULL DEFAULT 'gerencianet',
  portadores TEXT,
  pix BOOLEAN NOT NULL DEFAULT false,
  card BOOLEAN NOT NULL DEFAULT false,
  boleto BOOLEAN NOT NULL DEFAULT false,
  retorno BOOLEAN NOT NULL DEFAULT false,
  config JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_gateways_tenant ON payment_gateways(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_gateways_active ON payment_gateways(active);

-- Comentários: config para GerenciaNet/EFI pode ter:
-- { "client_id": "...", "client_secret": "...", "sandbox": true }
