-- Tabelas do módulo financeiro: Fornecedores, Plano de Contas, Contas a Pagar
-- Execute no PostgreSQL se aparecer "Tabela não disponível" ao usar essas funções.
-- Pré-requisito: tabela tenants(id) deve existir.
--
-- Exemplo: psql -U seu_usuario -d sua_base -f sql/finance_suppliers_chart_payables.pg.sql

-- ========== suppliers (fornecedores) ==========
CREATE TABLE IF NOT EXISTS suppliers (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo_pessoa VARCHAR(16) NOT NULL DEFAULT 'JURIDICA' CHECK (tipo_pessoa IN ('FISICA','JURIDICA')),
  situacao_fiscal VARCHAR(32),
  nome_razao VARCHAR(190) NOT NULL,
  nome_fantasia VARCHAR(190),
  responsavel VARCHAR(190),
  contato VARCHAR(190),
  cpf_cnpj VARCHAR(32),
  rg VARCHAR(32),
  rg_emissor VARCHAR(32),
  ie VARCHAR(32),
  im VARCHAR(32),
  contribuinte_icms BOOLEAN NOT NULL DEFAULT false,
  endereco VARCHAR(190),
  numero VARCHAR(32),
  bairro VARCHAR(120),
  cidade VARCHAR(120),
  cep VARCHAR(16),
  uf VARCHAR(8),
  pais VARCHAR(64) DEFAULT 'BR',
  complemento VARCHAR(190),
  referencia VARCHAR(190),
  latitude VARCHAR(32),
  longitude VARCHAR(32),
  cpais VARCHAR(16),
  cod_municipio_ibge VARCHAR(16),
  email VARCHAR(190),
  telefones VARCHAR(190),
  celulares VARCHAR(190),
  fax VARCHAR(64),
  observacao TEXT,
  json_extra JSONB,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_nome ON suppliers(nome_razao);
CREATE INDEX IF NOT EXISTS idx_suppliers_cnpj ON suppliers(cpf_cnpj);

-- ========== chart_of_accounts (plano de contas) ==========
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo VARCHAR(16) NOT NULL CHECK (tipo IN ('RECEITA','DESPESA')),
  codigo_financeiro VARCHAR(32) NOT NULL,
  descricao VARCHAR(190) NOT NULL,
  dre VARCHAR(64),
  dre_tipo VARCHAR(64),
  sici_conta VARCHAR(64),
  visivel BOOLEAN NOT NULL DEFAULT true,
  conta_plano VARCHAR(32) NOT NULL DEFAULT 'NORMAL' CHECK (conta_plano IN ('NORMAL','MENSALIDADE','ADESAO')),
  suspender_servico BOOLEAN NOT NULL DEFAULT false,
  cobranca_automatica BOOLEAN NOT NULL DEFAULT false,
  incluir_lucro_ajustado BOOLEAN NOT NULL DEFAULT false,
  incluir_sped_1601 BOOLEAN NOT NULL DEFAULT false,
  incluir_nfse_lote BOOLEAN NOT NULL DEFAULT false,
  demonstrativo_boleto TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, codigo_financeiro)
);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_tenant ON chart_of_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_tipo ON chart_of_accounts(tipo);

-- ========== payables (contas a pagar) ==========
CREATE TABLE IF NOT EXISTS payables (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  empresa VARCHAR(190),
  cidade VARCHAR(120),
  fornecedor_id BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
  funcionario VARCHAR(190),
  tipo_documento VARCHAR(64),
  plano_contas_id BIGINT REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  descricao VARCHAR(255),
  observacao TEXT,
  tipo_nota_fiscal VARCHAR(32),
  nota_fiscal VARCHAR(64),
  emissao DATE,
  valor DECIMAL(12,2) NOT NULL DEFAULT 0,
  valor_fixo BOOLEAN NOT NULL DEFAULT false,
  forma_pagamento VARCHAR(64),
  pix_qrcode TEXT,
  pix_copia_cola TEXT,
  linha_digitavel_boleto VARCHAR(255),
  vencimento DATE NOT NULL,
  competencia DATE,
  tipo_parcelamento VARCHAR(64),
  parcelas INT,
  status VARCHAR(16) NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO','PAGO','CANCELADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payables_tenant ON payables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payables_vencimento ON payables(vencimento);
CREATE INDEX IF NOT EXISTS idx_payables_status ON payables(status);
CREATE INDEX IF NOT EXISTS idx_payables_fornecedor ON payables(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_payables_plano ON payables(plano_contas_id);
