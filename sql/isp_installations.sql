-- Sistema ISP — Instalações (um por cliente ativo)
-- Execute após schema.sql e financeiro.sql

CREATE TABLE IF NOT EXISTS installations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  subscription_request_id BIGINT UNSIGNED NULL COMMENT 'Pedido que originou a instalação',
  plan_code VARCHAR(32) NOT NULL,
  due_day TINYINT UNSIGNED NOT NULL DEFAULT 10 COMMENT 'Dia do vencimento (1-28)',
  address_json JSON NULL COMMENT 'Endereço completo da instalação',
  status ENUM('ACTIVE','SUSPENDED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  installed_at DATE NULL,
  ont_serial VARCHAR(64) NULL,
  cto_code VARCHAR(64) NULL COMMENT 'CTO/Ponto de rede',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_installation_customer (customer_id),
  KEY idx_installations_status (status),
  KEY idx_installations_plan (plan_code),
  CONSTRAINT fk_installation_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índice para buscar por subscription_request
ALTER TABLE installations ADD KEY idx_installation_lead (subscription_request_id);
