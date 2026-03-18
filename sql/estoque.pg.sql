-- Estoque — Schema PostgreSQL (multi-tenant)
-- Execute após schema base. Todas as tabelas usam tenant_id.

-- ========== Cadastros ==========
CREATE TABLE IF NOT EXISTS estoque_categorias (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  nome VARCHAR(190) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_estoque_categorias_tenant ON estoque_categorias(tenant_id);

CREATE TABLE IF NOT EXISTS estoque_fabricantes (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  nome VARCHAR(190) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_estoque_fabricantes_tenant ON estoque_fabricantes(tenant_id);

CREATE TABLE IF NOT EXISTS estoque_ncm (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  codigo VARCHAR(32) NOT NULL,
  descricao VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_estoque_ncm_tenant ON estoque_ncm(tenant_id);

CREATE TABLE IF NOT EXISTS estoque_locais (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  nome VARCHAR(190) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_estoque_locais_tenant ON estoque_locais(tenant_id);

CREATE TABLE IF NOT EXISTS estoque_veiculos (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  placa VARCHAR(20) NOT NULL,
  modelo VARCHAR(190),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_estoque_veiculos_tenant ON estoque_veiculos(tenant_id);

-- Fornecedores (para vínculo produto-fornecedor)
CREATE TABLE IF NOT EXISTS estoque_fornecedores (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  nome VARCHAR(190) NOT NULL,
  documento VARCHAR(32),
  contato VARCHAR(190),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_estoque_fornecedores_tenant ON estoque_fornecedores(tenant_id);

-- ========== Produtos ==========
CREATE TABLE IF NOT EXISTS estoque_produtos (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  codigo VARCHAR(64),
  nome VARCHAR(190) NOT NULL,
  categoria_id BIGINT REFERENCES estoque_categorias(id) ON DELETE SET NULL,
  fabricante_id BIGINT REFERENCES estoque_fabricantes(id) ON DELETE SET NULL,
  ncm_id BIGINT REFERENCES estoque_ncm(id) ON DELETE SET NULL,
  unidade VARCHAR(20) NOT NULL DEFAULT 'UN',
  estoque_minimo DECIMAL(15,4) DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_estoque_produtos_tenant ON estoque_produtos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_estoque_produtos_categoria ON estoque_produtos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_estoque_produtos_fabricante ON estoque_produtos(fabricante_id);

-- Produtos - Fornecedores (vínculo produto x fornecedor com SKU e preço)
CREATE TABLE IF NOT EXISTS estoque_produto_fornecedores (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  produto_id BIGINT NOT NULL REFERENCES estoque_produtos(id) ON DELETE CASCADE,
  fornecedor_id BIGINT NOT NULL REFERENCES estoque_fornecedores(id) ON DELETE CASCADE,
  sku_fornecedor VARCHAR(64),
  preco_custo DECIMAL(15,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (produto_id, fornecedor_id)
);
CREATE INDEX IF NOT EXISTS idx_estoque_pf_tenant ON estoque_produto_fornecedores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_estoque_pf_produto ON estoque_produto_fornecedores(produto_id);

-- Kit de Instalação
CREATE TABLE IF NOT EXISTS estoque_kits (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  nome VARCHAR(190) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_estoque_kits_tenant ON estoque_kits(tenant_id);

CREATE TABLE IF NOT EXISTS estoque_kit_itens (
  id BIGSERIAL PRIMARY KEY,
  kit_id BIGINT NOT NULL REFERENCES estoque_kits(id) ON DELETE CASCADE,
  produto_id BIGINT NOT NULL REFERENCES estoque_produtos(id) ON DELETE CASCADE,
  quantidade DECIMAL(15,4) NOT NULL DEFAULT 1,
  UNIQUE (kit_id, produto_id)
);
CREATE INDEX IF NOT EXISTS idx_estoque_kit_itens_kit ON estoque_kit_itens(kit_id);

-- ========== Saldo por produto e local ==========
CREATE TABLE IF NOT EXISTS estoque_saldo (
  tenant_id INT NOT NULL,
  produto_id BIGINT NOT NULL REFERENCES estoque_produtos(id) ON DELETE CASCADE,
  local_id BIGINT NOT NULL REFERENCES estoque_locais(id) ON DELETE CASCADE,
  quantidade DECIMAL(15,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, produto_id, local_id)
);
CREATE INDEX IF NOT EXISTS idx_estoque_saldo_tenant ON estoque_saldo(tenant_id);
CREATE INDEX IF NOT EXISTS idx_estoque_saldo_produto ON estoque_saldo(produto_id);
CREATE INDEX IF NOT EXISTS idx_estoque_saldo_local ON estoque_saldo(local_id);

-- ========== Movimentações (Compra, Venda, Comodato, Correção, Transferência) ==========
CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('COMPRA','COMPRA_NFE','VENDA','COMODATO','CORRECAO','TRANSFERENCIA')),
  data_movimento DATE NOT NULL DEFAULT CURRENT_DATE,
  numero_documento VARCHAR(64),
  observacoes TEXT,
  fornecedor_id BIGINT REFERENCES estoque_fornecedores(id) ON DELETE SET NULL,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  veiculo_id BIGINT REFERENCES estoque_veiculos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_tenant ON estoque_movimentacoes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_tipo ON estoque_movimentacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_data ON estoque_movimentacoes(data_movimento);

CREATE TABLE IF NOT EXISTS estoque_movimentacao_itens (
  id BIGSERIAL PRIMARY KEY,
  movimentacao_id BIGINT NOT NULL REFERENCES estoque_movimentacoes(id) ON DELETE CASCADE,
  produto_id BIGINT NOT NULL REFERENCES estoque_produtos(id) ON DELETE RESTRICT,
  local_id BIGINT NOT NULL REFERENCES estoque_locais(id) ON DELETE RESTRICT,
  quantidade DECIMAL(15,4) NOT NULL,
  entrada_saida CHAR(1) NOT NULL DEFAULT 'E' CHECK (entrada_saida IN ('E','S')),
  custo_unitario DECIMAL(15,4),
  valor_unitario DECIMAL(15,4)
);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_itens_mov ON estoque_movimentacao_itens(movimentacao_id);

-- Para transferência: local_origem em item com S, local_destino em outro item com E (mesmo produto).

-- ========== Veículo Lançamento — Registro de Viagem ==========
CREATE TABLE IF NOT EXISTS estoque_viagens (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  veiculo_id BIGINT NOT NULL REFERENCES estoque_veiculos(id) ON DELETE CASCADE,
  data_saida TIMESTAMPTZ NOT NULL,
  data_retorno TIMESTAMPTZ,
  km_saida INT,
  km_retorno INT,
  motorista VARCHAR(190),
  destino VARCHAR(255),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_estoque_viagens_tenant ON estoque_viagens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_estoque_viagens_veiculo ON estoque_viagens(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_estoque_viagens_data ON estoque_viagens(data_saida);
