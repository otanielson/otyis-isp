-- Comodato/Venda — campos de equipamento, endereço, documentos e devolução (PostgreSQL)
-- Execute após customer_comodato.pg.sql

-- Novas colunas no movimento (comodato/venda)
ALTER TABLE customer_comodato ADD COLUMN IF NOT EXISTS endereco_instalacao TEXT;
ALTER TABLE customer_comodato ADD COLUMN IF NOT EXISTS data_entrega DATE;
ALTER TABLE customer_comodato ADD COLUMN IF NOT EXISTS tecnico_responsavel VARCHAR(190);
ALTER TABLE customer_comodato ADD COLUMN IF NOT EXISTS contrato_pdf_url VARCHAR(512);
ALTER TABLE customer_comodato ADD COLUMN IF NOT EXISTS assinatura_digital TEXT;
ALTER TABLE customer_comodato ADD COLUMN IF NOT EXISTS data_devolucao DATE;
ALTER TABLE customer_comodato ADD COLUMN IF NOT EXISTS condicao_devolucao VARCHAR(20) CHECK (condicao_devolucao IS NULL OR condicao_devolucao IN ('PERFEITO','DANIFICADO','NAO_DEVOLVIDO'));
ALTER TABLE customer_comodato ADD COLUMN IF NOT EXISTS multa_valor DECIMAL(12,2);
ALTER TABLE customer_comodato ADD COLUMN IF NOT EXISTS fatura_id BIGINT;

-- Permitir ALUGUEL no tipo
DO $$
BEGIN
  ALTER TABLE customer_comodato DROP CONSTRAINT IF EXISTS customer_comodato_movement_type_check;
  ALTER TABLE customer_comodato ADD CONSTRAINT customer_comodato_movement_type_check
    CHECK (movement_type IN ('COMODATO','VENDA','AVULSO','ALUGUEL'));
EXCEPTION
  WHEN duplicate_object THEN NULL; -- constraint já existe com novos valores
END $$;

-- Histórico do equipamento (por MAC/Serial) — para rastrear cada ONU/roteador
CREATE TABLE IF NOT EXISTS equipamento_historico (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  customer_comodato_id BIGINT NOT NULL REFERENCES customer_comodato(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  produto_id BIGINT,
  equipamento_nome VARCHAR(190),
  marca VARCHAR(120),
  modelo VARCHAR(120),
  mac VARCHAR(64),
  serial VARCHAR(120),
  patrimonio VARCHAR(64),
  valor DECIMAL(12,2),
  data_instalacao DATE NOT NULL,
  data_devolucao DATE,
  condicao_devolucao VARCHAR(20) CHECK (condicao_devolucao IS NULL OR condicao_devolucao IN ('PERFEITO','DANIFICADO','NAO_DEVOLVIDO')),
  multa_valor DECIMAL(12,2),
  fatura_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_equipamento_historico_tenant ON equipamento_historico(tenant_id);
CREATE INDEX IF NOT EXISTS idx_equipamento_historico_customer ON equipamento_historico(customer_id);
CREATE INDEX IF NOT EXISTS idx_equipamento_historico_mac ON equipamento_historico(mac);
CREATE INDEX IF NOT EXISTS idx_equipamento_historico_serial ON equipamento_historico(serial);
CREATE INDEX IF NOT EXISTS idx_equipamento_historico_comodato ON equipamento_historico(customer_comodato_id);
