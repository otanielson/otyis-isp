-- Migração 003: receipt_templates (modelos de recibos e faturas por tenant)
-- Execute no banco: psql -U user -d database -f sql/migrations/003_receipt_templates.pg.sql
-- Ou: psql $DATABASE_URL -f sql/migrations/003_receipt_templates.pg.sql

CREATE TABLE IF NOT EXISTS receipt_templates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_key VARCHAR(64) NOT NULL,
  name VARCHAR(190) NOT NULL,
  description VARCHAR(255),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE (tenant_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_receipt_templates_tenant ON receipt_templates(tenant_id);

-- Modelos padrão para tenant 1 (idempotente)
INSERT INTO receipt_templates (tenant_id, template_key, name, description, body) VALUES
(1, 'pagar', 'Recibo contas a pagar', 'Recibo padrão para pagamento de contas (fornecedores, despesas).', E'RECIBO DE PAGAMENTO\n\n{{empresa_nome}}\nDocumento: {{documento}}\nEndereço: {{endereco}}\n\nRecebemos de {{cliente_nome}} a quantia de {{valor}} (valor por extenso), referente ao pagamento abaixo descrito.\n\nData: {{data}}\n\n_________________________\nAssinatura'),
(1, 'receber_quitacao', 'Recibo a receber / quitação', 'Recibo de quitação de fatura ou valor recebido do cliente.', E'RECIBO DE QUITAÇÃO\n\n{{empresa_nome}}\n{{endereco}}\nDocumento: {{documento}}\n\nDeclaramos ter recebido de {{cliente_nome}} o valor de {{valor}}, referente à quitação em {{data}}.\n\nEste recibo serve como comprovante de pagamento.\n\n_________________________\n{{empresa_nome}}'),
(1, 'fatura_suporte', 'Fatura de suporte', 'Fatura para cobrança de suporte técnico ou visita.', E'FATURA – SERVIÇO DE SUPORTE\n\n{{empresa_nome}}\n{{endereco}}\nDocumento: {{documento}}\n\nCliente: {{cliente_nome}}\nEndereço do cliente: {{endereco}}\n\nValor dos serviços: {{valor}}\nData de emissão: {{data}}\n\nPagamento conforme condições acordadas.\n\n_________________________\n{{empresa_nome}}'),
(1, 'fatura_instalacao', 'Fatura instalação', 'Fatura para cobrança de instalação de serviço.', E'FATURA – INSTALAÇÃO\n\n{{empresa_nome}}\n{{endereco}}\nDocumento: {{documento}}\n\nCliente: {{cliente_nome}}\nDocumento do cliente: {{documento}}\nEndereço da instalação: {{endereco}}\n\nValor da instalação: {{valor}}\nData: {{data}}\n\n_________________________\n{{empresa_nome}}'),
(1, 'fatura_mudanca_endereco', 'Fatura mudança de endereço', 'Fatura para cobrança de mudança de endereço.', E'FATURA – MUDANÇA DE ENDEREÇO\n\n{{empresa_nome}}\n{{endereco}}\nDocumento: {{documento}}\n\nCliente: {{cliente_nome}}\nNovo endereço: {{endereco}}\n\nValor do serviço de mudança: {{valor}}\nData: {{data}}\n\n_________________________\n{{empresa_nome}}')
ON CONFLICT (tenant_id, template_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  body = EXCLUDED.body,
  updated_at = CURRENT_TIMESTAMP;
