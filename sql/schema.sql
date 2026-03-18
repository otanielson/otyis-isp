-- Multi Telecom Portal schema
-- MySQL 8+ / MariaDB compatível (utf8mb4)

CREATE TABLE IF NOT EXISTS customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(190) NULL,
  whatsapp VARCHAR(32) NOT NULL,
  email VARCHAR(190) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_whatsapp (whatsapp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscription_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  protocol VARCHAR(32) NOT NULL,
  plan_code VARCHAR(32) NOT NULL,
  customer_name VARCHAR(190) NOT NULL,
  cpf_cnpj VARCHAR(32) NOT NULL,
  whatsapp VARCHAR(32) NOT NULL,
  email VARCHAR(190) NULL,
  vencimento TINYINT UNSIGNED NOT NULL,
  address_json JSON NOT NULL,
  preferred_json JSON NULL,
  extras_json JSON NULL,
  notes TEXT NULL,
  raw_payload_json JSON NOT NULL,
  status ENUM('NEW','CONTACTED','SCHEDULED','INSTALLED','CANCELLED') NOT NULL DEFAULT 'NEW',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subscription_protocol (protocol),
  KEY idx_subscription_created (created_at),
  KEY idx_subscription_whatsapp (whatsapp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Clube Multi (fidelidade)
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  customer_id BIGINT UNSIGNED NOT NULL,
  points_balance INT NOT NULL DEFAULT 0,
  tier ENUM('BRONZE','SILVER','GOLD','PLATINUM') NOT NULL DEFAULT 'BRONZE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id),
  CONSTRAINT fk_loyalty_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  points INT NOT NULL,
  entry_type ENUM('EARN','REDEEM') NOT NULL,
  reason VARCHAR(255) NOT NULL,
  ref_id VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ledger_customer (customer_id, created_at),
  CONSTRAINT fk_ledger_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sorteios
CREATE TABLE IF NOT EXISTS raffle_campaigns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(190) NOT NULL,
  status ENUM('ACTIVE','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  rules_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_campaign_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS raffle_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  entry_number VARCHAR(32) NOT NULL,
  source ENUM('STAND','PLAN','REFERRAL','OTHER') NOT NULL DEFAULT 'STAND',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_entry_number (entry_number),
  KEY idx_entries_campaign (campaign_id, created_at),
  CONSTRAINT fk_entry_campaign FOREIGN KEY (campaign_id) REFERENCES raffle_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_entry_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS raffle_winners (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  prize VARCHAR(190) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_winners_campaign (campaign_id, created_at),
  UNIQUE KEY uq_winner_once (campaign_id, customer_id),
  CONSTRAINT fk_winner_campaign FOREIGN KEY (campaign_id) REFERENCES raffle_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_winner_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catálogo de recompensas (para evoluir depois)
CREATE TABLE IF NOT EXISTS rewards (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(190) NOT NULL,
  cost_points INT NOT NULL,
  reward_type ENUM('DISCOUNT','UPGRADE','PRODUCT','OTHER') NOT NULL DEFAULT 'OTHER',
  rules_json JSON NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  reward_id BIGINT UNSIGNED NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED','DELIVERED') NOT NULL DEFAULT 'PENDING',
  voucher_code VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_redemptions_customer (customer_id, created_at),
  CONSTRAINT fk_redemption_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_redemption_reward FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Configurações do provedor por tenant (dados de exibição e contato)
CREATE TABLE IF NOT EXISTS provider_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  fantasy_name VARCHAR(190) NULL,
  legal_name VARCHAR(190) NULL,
  document VARCHAR(32) NULL,
  ie VARCHAR(32) NULL,
  im VARCHAR(32) NULL,
  whatsapp VARCHAR(32) NULL,
  phone VARCHAR(32) NULL,
  email VARCHAR(190) NULL,
  website VARCHAR(190) NULL,
  street VARCHAR(190) NULL,
  number VARCHAR(32) NULL,
  complement VARCHAR(190) NULL,
  neighborhood VARCHAR(190) NULL,
  city VARCHAR(190) NULL,
  state VARCHAR(8) NULL,
  zip VARCHAR(16) NULL,
  logo_portal VARCHAR(255) NULL,
  logo_site VARCHAR(255) NULL,
  logo_receipt VARCHAR(255) NULL,
  color_primary VARCHAR(16) NULL,
  color_accent VARCHAR(16) NULL,
  short_name VARCHAR(64) NULL,
  timezone VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_provider_settings_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comodato / Venda por cliente
CREATE TABLE IF NOT EXISTS customer_comodato (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  contract_id BIGINT UNSIGNED NULL,
  os_id BIGINT UNSIGNED NULL,
  nf_number VARCHAR(64) NULL,
  movement_type ENUM('COMODATO','VENDA','AVULSO') NOT NULL DEFAULT 'COMODATO',
  status ENUM('OPEN','RETURNED','CLOSED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  notes TEXT NULL,
  total_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  items_json JSON NULL,
  created_by VARCHAR(128) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_customer_comodato_customer (customer_id),
  KEY idx_customer_comodato_tenant (tenant_id),
  CONSTRAINT fk_customer_comodato_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Modelos de recibos / documentos por tenant
CREATE TABLE IF NOT EXISTS receipt_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  template_key VARCHAR(64) NOT NULL,
  name VARCHAR(190) NOT NULL,
  description VARCHAR(255) NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_receipt_template_tenant_key (tenant_id, template_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
