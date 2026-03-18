-- Modelos de contrato (texto/HTML com variáveis para preenchimento)
-- Execute após erp_fase2 (contracts existem)
-- Variáveis sugeridas no texto: {{nome_cliente}}, {{plano}}, {{valor}}, {{vencimento}}, {{data}}, {{endereco}}

CREATE TABLE IF NOT EXISTS contract_templates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(190) NOT NULL,
  description TEXT,
  body_html TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_contract_templates_tenant ON contract_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contract_templates_active ON contract_templates(tenant_id, is_active);
