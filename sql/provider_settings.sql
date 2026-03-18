-- Configurações do provedor por tenant (dados de exibição e contato)
-- Execute: mysql -u user -p database < sql/provider_settings.sql

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

