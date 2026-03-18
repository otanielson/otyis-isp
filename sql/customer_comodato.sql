-- Comodato / Venda por cliente
-- Execute: mysql -u user -p database < sql/customer_comodato.sql

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
  updated_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_customer_comodato_customer (customer_id),
  KEY idx_customer_comodato_tenant (tenant_id),
  CONSTRAINT fk_customer_comodato_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

