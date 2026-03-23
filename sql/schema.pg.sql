-- Multi-Portal — Schema PostgreSQL
-- Execute: psql -U postgres -d multitelecom_portal -f sql/schema.pg.sql
-- Ou use: node scripts/run-saas-sql.mjs (com DB_* no .env para Postgres)

-- Extensão para UUID se precisar
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- customers (tenant_id adicionado depois na migração)
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(190),
  whatsapp VARCHAR(32) NOT NULL,
  email VARCHAR(190),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (whatsapp)
);

CREATE TABLE IF NOT EXISTS subscription_requests (
  id BIGSERIAL PRIMARY KEY,
  protocol VARCHAR(32) NOT NULL UNIQUE,
  plan_code VARCHAR(32) NOT NULL,
  customer_name VARCHAR(190) NOT NULL,
  cpf_cnpj VARCHAR(32) NOT NULL,
  whatsapp VARCHAR(32) NOT NULL,
  email VARCHAR(190),
  vencimento SMALLINT NOT NULL,
  address_json JSONB NOT NULL,
  preferred_json JSONB,
  extras_json JSONB,
  notes TEXT,
  raw_payload_json JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','CONTACTED','SCHEDULED','INSTALLED','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_subscription_created ON subscription_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_subscription_whatsapp ON subscription_requests(whatsapp);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  customer_id BIGINT NOT NULL PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  points_balance INT NOT NULL DEFAULT 0,
  tier VARCHAR(20) NOT NULL DEFAULT 'BRONZE' CHECK (tier IN ('BRONZE','SILVER','GOLD','PLATINUM')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  points INT NOT NULL,
  entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('EARN','REDEEM')),
  reason VARCHAR(255) NOT NULL,
  ref_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON loyalty_ledger(customer_id, created_at);

CREATE TABLE IF NOT EXISTS raffle_campaigns (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED')),
  rules_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_campaign_status ON raffle_campaigns(status, created_at);

CREATE TABLE IF NOT EXISTS raffle_entries (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES raffle_campaigns(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  entry_number VARCHAR(32) NOT NULL UNIQUE,
  source VARCHAR(20) NOT NULL DEFAULT 'STAND' CHECK (source IN ('STAND','PLAN','REFERRAL','OTHER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_entries_campaign ON raffle_entries(campaign_id, created_at);

CREATE TABLE IF NOT EXISTS raffle_winners (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES raffle_campaigns(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  prize VARCHAR(190) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (campaign_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_winners_campaign ON raffle_winners(campaign_id, created_at);

CREATE TABLE IF NOT EXISTS rewards (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  cost_points INT NOT NULL,
  reward_type VARCHAR(20) NOT NULL DEFAULT 'OTHER' CHECK (reward_type IN ('DISCOUNT','UPGRADE','PRODUCT','OTHER')),
  rules_json JSONB,
  active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  reward_id BIGINT NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','DELIVERED')),
  voucher_code VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_redemptions_customer ON reward_redemptions(customer_id, created_at);

-- ========== SaaS: tenants ==========
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(190) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','TRIAL','CANCELLED')),
  subdomain VARCHAR(64) UNIQUE,
  custom_domain VARCHAR(190) UNIQUE,
  config_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

INSERT INTO tenants (id, slug, name, status, subdomain) VALUES
(1, 'default', 'Tenant padrão (migração)', 'ACTIVE', NULL)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Ajustar sequence após insert manual
SELECT setval(pg_get_serial_sequence('tenants', 'id'), (SELECT COALESCE(MAX(id), 1) FROM tenants));

-- ========== tenant_id em customers e subscription_requests ==========
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE subscription_requests ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscription_tenant ON subscription_requests(tenant_id);

UPDATE customers SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE subscription_requests SET tenant_id = 1 WHERE tenant_id IS NULL;

-- ========== RBAC ==========
CREATE TABLE IF NOT EXISTS tenant_users (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_master BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_roles (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_tenant_roles_tenant ON tenant_roles(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_permissions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(190) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_permissions_active ON tenant_permissions(is_active);

CREATE TABLE IF NOT EXISTS tenant_role_permissions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES tenant_roles(id) ON DELETE CASCADE,
  permission_id INT NOT NULL REFERENCES tenant_permissions(id) ON DELETE CASCADE,
  UNIQUE (tenant_id, role_id, permission_id)
);
CREATE INDEX IF NOT EXISTS idx_trp_tenant ON tenant_role_permissions(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_user_roles (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES tenant_users(id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES tenant_roles(id) ON DELETE CASCADE,
  UNIQUE (tenant_id, user_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_tur_tenant ON tenant_user_roles(tenant_id);

-- ========== tenant_nas ==========
CREATE TABLE IF NOT EXISTS tenant_nas (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  nas_ip VARCHAR(45) NOT NULL,
  description VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tenant_nas_tenant ON tenant_nas(tenant_id);

-- ========== plans (se não existir) ==========
CREATE TABLE IF NOT EXISTS plans (
  id SERIAL PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  speed_display VARCHAR(32) NOT NULL,
  unit VARCHAR(16) NOT NULL DEFAULT 'Mega',
  tagline VARCHAR(190),
  features_json JSONB,
  badge VARCHAR(20) NOT NULL DEFAULT '' CHECK (badge IN ('','popular','top')),
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  price DECIMAL(10,2) DEFAULT 99.90,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
INSERT INTO plans (code, speed_display, unit, tagline, features_json, badge, sort_order, active) VALUES
('100', '100', 'Mega', 'Ideal para uso básico', '["Streaming HD","Home office","Clube Multi + pontos"]', '', 1, true),
('300', '300', 'Mega', 'Para famílias', '["Streaming 4K","Vários dispositivos","Clube Multi + pontos"]', 'popular', 2, true),
('500', '500', 'Mega', 'Alta performance', '["Upload melhor","Jogos online","Clube Multi + pontos"]', '', 3, true),
('1000', '1', 'Giga', 'Máximo desempenho', '["Máximo desempenho","Conteúdo pesado","Clube Multi + pontos"]', 'top', 4, true)
ON CONFLICT (code) DO UPDATE SET tagline = EXCLUDED.tagline, features_json = EXCLUDED.features_json, badge = EXCLUDED.badge, sort_order = EXCLUDED.sort_order;

ALTER TABLE plans ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_plans_tenant ON plans(tenant_id);
UPDATE plans SET tenant_id = 1 WHERE tenant_id IS NULL;

-- Planos ISP: velocidade Mbps, concentradores, bloqueio automático (sql/plans_isp_extras.sql)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS speed_download_mbps INT DEFAULT NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS speed_upload_mbps INT DEFAULT NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS nas_ids JSONB DEFAULT NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS block_auto BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS block_days_after_due INT NOT NULL DEFAULT 5;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS block_radius_group VARCHAR(64) NOT NULL DEFAULT 'bloqueado';

-- ========== installations ==========
CREATE TABLE IF NOT EXISTS installations (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  subscription_request_id BIGINT REFERENCES subscription_requests(id),
  plan_code VARCHAR(32) NOT NULL,
  due_day SMALLINT NOT NULL DEFAULT 10,
  address_json JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CANCELLED')),
  installed_at DATE,
  ont_serial VARCHAR(64),
  cto_code VARCHAR(64),
  notes TEXT,
  pppoe_user VARCHAR(64),
  pppoe_password VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_installations_status ON installations(status);
CREATE INDEX IF NOT EXISTS idx_installations_plan ON installations(plan_code);
CREATE INDEX IF NOT EXISTS idx_installation_lead ON installations(subscription_request_id);

-- ========== invoices ==========
CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  ref_month VARCHAR(7) NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  plan_code VARCHAR(32) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','OVERDUE','CANCELLED')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (customer_id, ref_month)
);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_ref_month ON invoices(ref_month);

-- ========== payment_gateways (EFI/GerenciaNet, Cora, etc.) ==========
CREATE TABLE IF NOT EXISTS payment_gateways (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
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

-- ========== caixa_movimentos (movimento de caixa) ==========
CREATE TABLE IF NOT EXISTS caixa_movimentos (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  tipo VARCHAR(20) NOT NULL DEFAULT 'RECEITA' CHECK (tipo IN ('RECEITA','DESPESA')),
  description VARCHAR(500),
  amount DECIMAL(12,2) NOT NULL,
  invoice_id BIGINT REFERENCES invoices(id) ON DELETE SET NULL,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_caixa_movimentos_tenant ON caixa_movimentos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_caixa_movimentos_date ON caixa_movimentos(movement_date);
CREATE INDEX IF NOT EXISTS idx_caixa_movimentos_invoice ON caixa_movimentos(invoice_id);

-- ========== carne_lots (lotes de carnê) ==========
CREATE TABLE IF NOT EXISTS carne_lots (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  ref_month VARCHAR(7) NOT NULL,
  name VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'GENERATED',
  total_customers INT NOT NULL DEFAULT 0,
  total_invoices INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_carne_lots_tenant ON carne_lots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_carne_lots_ref_month ON carne_lots(ref_month);
CREATE INDEX IF NOT EXISTS idx_carne_lots_status ON carne_lots(status);

CREATE TABLE IF NOT EXISTS carne_lot_items (
  id BIGSERIAL PRIMARY KEY,
  carne_lot_id BIGINT NOT NULL REFERENCES carne_lots(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  printed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  delivery_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (carne_lot_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_carne_lot_items_lot ON carne_lot_items(carne_lot_id);
CREATE INDEX IF NOT EXISTS idx_carne_lot_items_customer ON carne_lot_items(customer_id);

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

-- ========== clube_page_config ==========
CREATE TABLE IF NOT EXISTS clube_page_config (
  id SMALLINT NOT NULL DEFAULT 1 PRIMARY KEY,
  config_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO clube_page_config (id, config_json) VALUES (1, '{
  "hero": {"badge": "Benefícios exclusivos", "title": "Clube Multi", "description": "Pontos, sorteios e vantagens.", "ctaText": "Assinar e entrar no clube", "ctaHref": "/assinar.html"},
  "benefits": {"sectionTitle": "Vantagens do Clube Multi", "items": []},
  "points": {"sectionTitle": "Como ganhar pontos", "items": []},
  "actions": {"consultTitle": "Consultar meu saldo", "standTitle": "Cadastro rápido no stand"},
  "cta": {"title": "Quer entrar no Clube Multi?", "buttonText": "Ver planos", "buttonHref": "/planos.html"}
}')
ON CONFLICT (id) DO NOTHING;

-- Colunas extras em customers (cpf, active) se usadas
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cpf_cnpj VARCHAR(32);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);

-- raffle_campaigns tenant_id
ALTER TABLE raffle_campaigns ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS idx_raffle_campaigns_tenant ON raffle_campaigns(tenant_id);

-- ========== Seed: permissões RBAC ==========
INSERT INTO tenant_permissions (code, name, is_active) VALUES
('iam.permissions.read', 'Listar permissões', true),
('iam.roles.read', 'Listar roles', true),
('iam.roles.create', 'Criar roles', true),
('iam.roles.update', 'Alterar roles e permissões', true),
('iam.users.read', 'Listar usuários', true),
('iam.users.create', 'Criar usuários', true),
('iam.users.update', 'Alterar usuários e roles', true),
('nas.view', 'Ver NAS', true),
('nas.create', 'Criar NAS', true),
('nas.edit', 'Editar NAS', true),
('nas.delete', 'Excluir NAS', true),
('pppoe.view', 'Ver clientes PPPoE', true),
('pppoe.create', 'Criar clientes PPPoE', true),
('pppoe.edit', 'Editar clientes PPPoE', true),
('pppoe.block_unblock', 'Bloquear/desbloquear PPPoE', true),
('pppoe.reset_password', 'Redefinir senha PPPoE', true),
('plans.view', 'Ver planos', true),
('plans.create', 'Criar planos', true),
('plans.edit', 'Editar planos', true),
('plans.delete', 'Excluir planos', true),
('sessions.view', 'Ver sessões', true),
('sessions.disconnect', 'Desconectar sessão (CoA)', true),
('reports.view', 'Ver relatórios', true),
('reports.export', 'Exportar relatórios', true),
('users.view', 'Ver usuários do painel', true),
('users.create', 'Criar usuários', true),
('users.edit', 'Editar usuários', true),
('users.disable', 'Desativar usuários', true),
('users.permissions_manage', 'Gerenciar permissões (Master)', true),
('settings.view', 'Ver configurações', true),
('settings.edit', 'Editar configurações', true)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active;

-- ========== provider_settings (dados do provedor: identidade, contato, endereço, branding) ==========
CREATE TABLE IF NOT EXISTS provider_settings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fantasy_name VARCHAR(190),
  legal_name VARCHAR(190),
  document VARCHAR(32),
  ie VARCHAR(32),
  im VARCHAR(32),
  whatsapp VARCHAR(32),
  phone VARCHAR(32),
  email VARCHAR(190),
  website VARCHAR(190),
  street VARCHAR(190),
  number VARCHAR(32),
  complement VARCHAR(190),
  neighborhood VARCHAR(190),
  city VARCHAR(190),
  state VARCHAR(8),
  zip VARCHAR(16),
  logo_portal VARCHAR(255),
  logo_site VARCHAR(255),
  logo_receipt VARCHAR(255),
  color_primary VARCHAR(16),
  color_accent VARCHAR(16),
  short_name VARCHAR(64),
  timezone VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE (tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_provider_settings_tenant ON provider_settings(tenant_id);

-- ========== contract_templates (modelos de contrato por tenant) ==========
CREATE TABLE IF NOT EXISTS contract_templates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
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

INSERT INTO contract_templates (tenant_id, name, description, body_html, is_default, is_active)
SELECT
  1,
  'Contrato padrão de prestação de serviço',
  'Modelo padrão com variáveis do cliente, plano e comodato para o portal.',
  E'<h1 style="text-align:center;">CONTRATO DE PRESTA&Ccedil;&Atilde;O DE SERVI&Ccedil;OS DE TELECOMUNICA&Ccedil;&Otilde;ES</h1>\n<p><strong>Contrato n&ordm;:</strong> #{{contract_id}}</p>\n<h2>DADOS DO CLIENTE</h2>\n<p><strong>Nome:</strong> {{customer_name}}<br><strong>WhatsApp:</strong> {{customer_whatsapp}}<br><strong>Documento (CPF/CNPJ):</strong> {{customer_document}}<br><strong>Endere&ccedil;o:</strong> {{customer_address}}</p>\n<h2>DADOS DO SERVI&Ccedil;O</h2>\n<p><strong>Plano contratado:</strong> {{plan_code}}<br><strong>Valor mensal:</strong> R$ {{amount}}<br><strong>Dia de vencimento:</strong> {{due_day}}<br><strong>In&iacute;cio da vig&ecirc;ncia:</strong> {{starts_at}}</p>\n<p><strong>Equipamentos em comodato:</strong></p>\n<p>{{comodato_items}}</p>\n<p><strong>Observa&ccedil;&otilde;es:</strong></p>\n<p>{{observations}}</p>\n<h2>CL&Aacute;USULA 1 - OBJETO</h2>\n<p>O presente contrato tem por objeto a presta&ccedil;&atilde;o de servi&ccedil;os de telecomunica&ccedil;&otilde;es (acesso &agrave; internet), fornecidos pelo PROVEDOR ao CLIENTE, conforme plano contratado.</p>\n<h2>CL&Aacute;USULA 2 - CONDI&Ccedil;&Otilde;ES DO SERVI&Ccedil;O</h2>\n<p>2.1. O servi&ccedil;o ser&aacute; prestado de forma cont&iacute;nua, 24 (vinte e quatro) horas por dia, salvo interrup&ccedil;&otilde;es necess&aacute;rias para manuten&ccedil;&atilde;o t&eacute;cnica, casos fortuitos ou for&ccedil;a maior.</p>\n<p>2.2. A velocidade contratada &eacute; nominal, podendo sofrer varia&ccedil;&otilde;es conforme condi&ccedil;&otilde;es t&eacute;cnicas da rede, conforme regulamenta&ccedil;&atilde;o da ANATEL.</p>\n<h2>CL&Aacute;USULA 3 - PAGAMENTO</h2>\n<p>3.1. O CLIENTE pagar&aacute; mensalmente o valor de R$ {{amount}}, com vencimento no dia {{due_day}} de cada m&ecirc;s.</p>\n<p>3.2. O n&atilde;o pagamento poder&aacute; resultar em:</p>\n<ul><li>Suspens&atilde;o parcial do servi&ccedil;o ap&oacute;s atraso</li><li>Suspens&atilde;o total ap&oacute;s per&iacute;odo adicional</li><li>Cancelamento definitivo em caso de inadimpl&ecirc;ncia prolongada</li></ul>\n<p>3.3. Poder&atilde;o ser aplicados juros e multa por atraso conforme legisla&ccedil;&atilde;o vigente.</p>\n<h2>CL&Aacute;USULA 4 - COMODATO DE EQUIPAMENTOS</h2>\n<p>4.1. Os equipamentos fornecidos ao CLIENTE permanecem como propriedade do PROVEDOR.</p>\n<p>4.2. O CLIENTE se compromete a:</p>\n<ul><li>Zelar pelos equipamentos</li><li>N&atilde;o realizar modifica&ccedil;&otilde;es ou interven&ccedil;&otilde;es</li><li>Devolver os equipamentos em caso de cancelamento</li></ul>\n<p>4.3. Em caso de dano, perda ou n&atilde;o devolu&ccedil;&atilde;o, ser&aacute; cobrado o valor correspondente.</p>\n<h2>CL&Aacute;USULA 5 - OBRIGA&Ccedil;&Otilde;ES DO CLIENTE</h2>\n<p>O CLIENTE se compromete a:</p>\n<ul><li>Utilizar o servi&ccedil;o de forma legal</li><li>N&atilde;o compartilhar acesso indevidamente</li><li>N&atilde;o realizar atividades il&iacute;citas</li><li>Manter seus dados atualizados</li></ul>\n<h2>CL&Aacute;USULA 6 - OBRIGA&Ccedil;&Otilde;ES DO PROVEDOR</h2>\n<p>O PROVEDOR se compromete a:</p>\n<ul><li>Prestar o servi&ccedil;o com qualidade e estabilidade</li><li>Realizar suporte t&eacute;cnico</li><li>Manter atendimento ao cliente</li><li>Cumprir as normas da ANATEL</li></ul>\n<h2>CL&Aacute;USULA 7 - SUSPENS&Atilde;O E CANCELAMENTO</h2>\n<p>7.1. O contrato poder&aacute; ser suspenso em caso de inadimpl&ecirc;ncia.</p>\n<p>7.2. O CLIENTE pode solicitar cancelamento a qualquer momento.</p>\n<p>7.3. O cancelamento n&atilde;o isenta d&eacute;bitos pendentes.</p>\n<h2>CL&Aacute;USULA 8 - VIG&Ecirc;NCIA</h2>\n<p>Este contrato entra em vigor na data {{date}}, com prazo indeterminado, podendo ser rescindido por qualquer das partes.</p>\n<h2>CL&Aacute;USULA 9 - FORO</h2>\n<p>Fica eleito o foro da comarca do domic&iacute;lio do CLIENTE para dirimir quaisquer d&uacute;vidas oriundas deste contrato.</p>\n<h2>ASSINATURAS</h2>\n<br><br>\n<p>{{customer_name}}<br>CLIENTE</p>\n<br><br>\n<p>PROVEDOR RESPONS&Aacute;VEL</p>',
  TRUE,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM contract_templates WHERE tenant_id = 1
);

-- ========== receipt_templates (modelos de recibos e faturas por tenant) ==========
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

-- Modelos padrão de recibos/faturas para tenant 1 (idempotente)
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

-- ========== hotspot_templates / hotspot pix sessions ==========
CREATE TABLE IF NOT EXISTS hotspot_templates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(190) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  description TEXT,
  auth_type VARCHAR(40) NOT NULL DEFAULT 'local',
  portal_enabled BOOLEAN NOT NULL DEFAULT true,
  radius_enabled BOOLEAN NOT NULL DEFAULT false,
  free_minutes INT NOT NULL DEFAULT 0,
  otp_enabled BOOLEAN NOT NULL DEFAULT false,
  payment_required BOOLEAN NOT NULL DEFAULT false,
  payment_method VARCHAR(32),
  payment_amount NUMERIC(10,2),
  requires_phone BOOLEAN NOT NULL DEFAULT false,
  requires_name BOOLEAN NOT NULL DEFAULT false,
  auto_release_after_payment BOOLEAN NOT NULL DEFAULT false,
  bind_mac BOOLEAN NOT NULL DEFAULT true,
  session_timeout_minutes INT NOT NULL DEFAULT 60,
  redirect_url VARCHAR(255),
  config_json JSONB,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hotspot_templates_tenant_slug ON hotspot_templates(tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_hotspot_templates_tenant ON hotspot_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hotspot_templates_default ON hotspot_templates(tenant_id, is_default);

CREATE TABLE IF NOT EXISTS hotspot_template_pix_plans (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id BIGINT NOT NULL REFERENCES hotspot_templates(id) ON DELETE CASCADE,
  name VARCHAR(190) NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_minutes INT NOT NULL DEFAULT 60,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hotspot_template_pix_plans_tenant ON hotspot_template_pix_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hotspot_template_pix_plans_template ON hotspot_template_pix_plans(template_id, sort_order);

CREATE TABLE IF NOT EXISTS hotspot_payment_sessions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id BIGINT NOT NULL REFERENCES hotspot_templates(id) ON DELETE CASCADE,
  plan_id BIGINT NULL REFERENCES hotspot_template_pix_plans(id) ON DELETE SET NULL,
  plan_name VARCHAR(190),
  redirect_url VARCHAR(255),
  gateway_type VARCHAR(40) NOT NULL DEFAULT 'efi',
  charge_id VARCHAR(120),
  txid VARCHAR(64),
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_minutes INT NOT NULL DEFAULT 60,
  payer_name VARCHAR(190),
  payer_phone VARCHAR(32),
  payer_document VARCHAR(32),
  mac_address VARCHAR(32),
  ip_address VARCHAR(64),
  session_key VARCHAR(120) NOT NULL,
  pix_qrcode TEXT,
  pix_copia_cola TEXT,
  webhook_secret VARCHAR(190),
  released_username VARCHAR(120),
  released_password VARCHAR(120),
  metadata_json JSONB,
  gateway_response_json JSONB,
  webhook_payload_json JSONB,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hotspot_payment_sessions_session_key ON hotspot_payment_sessions(session_key);
CREATE INDEX IF NOT EXISTS idx_hotspot_payment_sessions_tenant ON hotspot_payment_sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_hotspot_payment_sessions_txid ON hotspot_payment_sessions(tenant_id, txid);

CREATE TABLE IF NOT EXISTS hotspot_auth_sessions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id BIGINT NOT NULL REFERENCES hotspot_templates(id) ON DELETE CASCADE,
  auth_mode VARCHAR(40) NOT NULL,
  session_key VARCHAR(120) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  username VARCHAR(120),
  password VARCHAR(120),
  phone VARCHAR(32),
  mac_address VARCHAR(32),
  ip_address VARCHAR(64),
  voucher_code VARCHAR(64),
  radius_username VARCHAR(120),
  radius_validated BOOLEAN NOT NULL DEFAULT false,
  redirect_url VARCHAR(255),
  metadata_json JSONB,
  expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hotspot_auth_sessions_session_key ON hotspot_auth_sessions(session_key);
CREATE INDEX IF NOT EXISTS idx_hotspot_auth_sessions_tenant ON hotspot_auth_sessions(tenant_id, status);

CREATE TABLE IF NOT EXISTS hotspot_login_otps (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id BIGINT NOT NULL REFERENCES hotspot_templates(id) ON DELETE CASCADE,
  session_key VARCHAR(120) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  code VARCHAR(12) NOT NULL,
  delivery_channel VARCHAR(20) NOT NULL DEFAULT 'demo',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hotspot_login_otps_session_key ON hotspot_login_otps(session_key);
CREATE INDEX IF NOT EXISTS idx_hotspot_login_otps_phone ON hotspot_login_otps(tenant_id, phone, used_at);
