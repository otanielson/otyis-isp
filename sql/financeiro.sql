-- Módulo Financeiro — Faturas e preços
-- Execute: mysql -u user -p database < sql/financeiro.sql

-- Preço por plano (adiciona coluna se não existir)
ALTER TABLE plans ADD COLUMN price DECIMAL(10,2) NULL DEFAULT 99.90;

-- Tabela de faturas
CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  ref_month VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  due_date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  plan_code VARCHAR(32) NOT NULL,
  status ENUM('PENDING','PAID','OVERDUE') NOT NULL DEFAULT 'PENDING',
  paid_at DATETIME NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invoice_customer_month (customer_id, ref_month),
  KEY idx_invoices_status (status),
  KEY idx_invoices_due (due_date),
  KEY idx_invoices_ref_month (ref_month),
  CONSTRAINT fk_invoice_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fornecedores
CREATE TABLE IF NOT EXISTS suppliers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo_pessoa ENUM('FISICA','JURIDICA') NOT NULL DEFAULT 'JURIDICA',
  situacao_fiscal VARCHAR(32) NULL,
  nome_razao VARCHAR(190) NOT NULL,
  nome_fantasia VARCHAR(190) NULL,
  responsavel VARCHAR(190) NULL,
  contato VARCHAR(190) NULL,
  cpf_cnpj VARCHAR(32) NULL,
  rg VARCHAR(32) NULL,
  rg_emissor VARCHAR(32) NULL,
  ie VARCHAR(32) NULL,
  im VARCHAR(32) NULL,
  contribuinte_icms TINYINT(1) NOT NULL DEFAULT 0,
  endereco VARCHAR(190) NULL,
  numero VARCHAR(32) NULL,
  bairro VARCHAR(120) NULL,
  cidade VARCHAR(120) NULL,
  cep VARCHAR(16) NULL,
  uf VARCHAR(8) NULL,
  pais VARCHAR(64) NULL DEFAULT 'BR',
  complemento VARCHAR(190) NULL,
  referencia VARCHAR(190) NULL,
  latitude VARCHAR(32) NULL,
  longitude VARCHAR(32) NULL,
  cpais VARCHAR(16) NULL,
  cod_municipio_ibge VARCHAR(16) NULL,
  email VARCHAR(190) NULL,
  telefones VARCHAR(190) NULL,
  celulares VARCHAR(190) NULL,
  fax VARCHAR(64) NULL,
  observacao TEXT NULL,
  json_extra JSON NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_suppliers_nome (nome_razao),
  KEY idx_suppliers_cnpj (cpf_cnpj)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Plano de Contas
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo ENUM('RECEITA','DESPESA') NOT NULL,
  codigo_financeiro VARCHAR(32) NOT NULL,
  descricao VARCHAR(190) NOT NULL,
  dre VARCHAR(64) NULL,
  dre_tipo VARCHAR(64) NULL,
  sici_conta VARCHAR(64) NULL,
  visivel TINYINT(1) NOT NULL DEFAULT 1,
  conta_plano ENUM('NORMAL','MENSALIDADE','ADESAO') NOT NULL DEFAULT 'NORMAL',
  suspender_servico TINYINT(1) NOT NULL DEFAULT 0,
  cobranca_automatica TINYINT(1) NOT NULL DEFAULT 0,
  incluir_lucro_ajustado TINYINT(1) NOT NULL DEFAULT 0,
  incluir_sped_1601 TINYINT(1) NOT NULL DEFAULT 0,
  incluir_nfse_lote TINYINT(1) NOT NULL DEFAULT 0,
  demonstrativo_boleto TEXT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_chart_codigo (codigo_financeiro),
  KEY idx_chart_tipo (tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contas a pagar
CREATE TABLE IF NOT EXISTS payables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa VARCHAR(190) NULL,
  cidade VARCHAR(120) NULL,
  fornecedor_id BIGINT UNSIGNED NULL,
  funcionario VARCHAR(190) NULL,
  tipo_documento VARCHAR(64) NULL,
  plano_contas_id BIGINT UNSIGNED NULL,
  descricao VARCHAR(255) NULL,
  observacao TEXT NULL,
  tipo_nota_fiscal VARCHAR(32) NULL,
  nota_fiscal VARCHAR(64) NULL,
  emissao DATE NULL,
  valor DECIMAL(12,2) NOT NULL DEFAULT 0,
  valor_fixo TINYINT(1) NOT NULL DEFAULT 0,
  forma_pagamento VARCHAR(64) NULL,
  pix_qrcode TEXT NULL,
  pix_copia_cola TEXT NULL,
  linha_digitavel_boleto VARCHAR(255) NULL,
  vencimento DATE NOT NULL,
  competencia DATE NULL,
  tipo_parcelamento VARCHAR(64) NULL,
  parcelas INT UNSIGNED NULL,
  status ENUM('ABERTO','PAGO','CANCELADO') NOT NULL DEFAULT 'ABERTO',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payables_vencimento (vencimento),
  KEY idx_payables_status (status),
  CONSTRAINT fk_payables_fornecedor FOREIGN KEY (fornecedor_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  CONSTRAINT fk_payables_plano FOREIGN KEY (plano_contas_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

