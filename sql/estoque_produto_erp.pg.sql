-- Estoque Produto ERP — Campos adicionais para cadastro completo (produto nível ERP)
-- Execute após estoque.pg.sql. Usa ADD COLUMN IF NOT EXISTS (PostgreSQL 9.5+).

-- 1) Informações básicas
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS descricao TEXT;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS tipo_produto VARCHAR(20) DEFAULT 'EQUIPAMENTO';
-- EQUIPAMENTO | SERVICO | COMBO | TAXA | INSTALACAO

-- 2) Informações financeiras
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS preco_venda DECIMAL(15,4);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS custo DECIMAL(15,4);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS margem_lucro DECIMAL(8,2);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS permitir_desconto BOOLEAN DEFAULT TRUE;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS preco_minimo DECIMAL(15,4);

-- 3) Controle de estoque
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS controlar_estoque BOOLEAN DEFAULT TRUE;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS local_estoque_id BIGINT REFERENCES estoque_locais(id) ON DELETE SET NULL;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS fornecedor_principal_id BIGINT REFERENCES estoque_fornecedores(id) ON DELETE SET NULL;

-- 4) Informações fiscais
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS cfop VARCHAR(10);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS cst VARCHAR(10);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS origem_mercadoria VARCHAR(2);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS codigo_anatel VARCHAR(32);

-- 5) Identificação
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(64);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS modelo VARCHAR(190);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS marca VARCHAR(190);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS permitir_numero_serie BOOLEAN DEFAULT FALSE;

-- 6) Informações provedor (ISP)
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS tipo_equipamento VARCHAR(20);
-- ONU | ROTEADOR | SWITCH | CABO
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS compatibilidade VARCHAR(200);
-- ex: Fiberhome,Huawei,ZTE,Mikrotik
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS usado_comodato BOOLEAN DEFAULT FALSE;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS permitir_venda BOOLEAN DEFAULT TRUE;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS vincular_mac BOOLEAN DEFAULT FALSE;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS vincular_serial_onu BOOLEAN DEFAULT FALSE;

-- 7) Logística
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS peso_kg DECIMAL(10,4);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS altura_cm DECIMAL(10,2);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS largura_cm DECIMAL(10,2);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS comprimento_cm DECIMAL(10,2);

-- 8) Mídia
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS imagem_url VARCHAR(500);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS manual_url VARCHAR(500);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS documentos_url TEXT;

-- 9) Informações comerciais
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS produto_padrao_instalacao BOOLEAN DEFAULT FALSE;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS uso_ordem_servico BOOLEAN DEFAULT TRUE;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS uso_venda BOOLEAN DEFAULT TRUE;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS uso_contrato BOOLEAN DEFAULT FALSE;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS uso_comodato BOOLEAN DEFAULT FALSE;

-- 10) Controle comodato
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS permitir_comodato BOOLEAN DEFAULT FALSE;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS tempo_comodato_meses INT;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS valor_equipamento_comodato DECIMAL(15,4);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS termo_devolucao_obrigatorio BOOLEAN DEFAULT FALSE;

-- 11) Extras
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS garantia_meses INT;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS produto_substituto_id BIGINT REFERENCES estoque_produtos(id) ON DELETE SET NULL;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS produto_equivalente_id BIGINT REFERENCES estoque_produtos(id) ON DELETE SET NULL;
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS tags VARCHAR(500);
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS observacoes_internas TEXT;

CREATE INDEX IF NOT EXISTS idx_estoque_produtos_local ON estoque_produtos(local_estoque_id);
CREATE INDEX IF NOT EXISTS idx_estoque_produtos_forn_principal ON estoque_produtos(fornecedor_principal_id);
CREATE INDEX IF NOT EXISTS idx_estoque_produtos_tipo ON estoque_produtos(tipo_produto);
