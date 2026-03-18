-- Documentos anexados ao contrato (PDF/HTML gerado a partir do modelo)
-- Status: GERADO (gerado), ENVIADO (enviado ao cliente), ASSINADO, PENDENTE_ASSINATURA
-- Execute após contract_templates e contracts

CREATE TABLE IF NOT EXISTS contract_documents (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  contract_id BIGINT NOT NULL,
  template_id BIGINT,
  status VARCHAR(32) NOT NULL DEFAULT 'GERADO'
    CHECK (status IN ('GERADO', 'ENVIADO', 'PENDENTE_ASSINATURA', 'ASSINADO')),
  content_html TEXT,
  file_path VARCHAR(500),
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contract_documents_tenant ON contract_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contract_documents_contract ON contract_documents(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_documents_template ON contract_documents(template_id);
