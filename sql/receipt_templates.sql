-- Modelos de recibos / documentos por tenant (MySQL)
-- Execute: mysql -u user -p database < sql/receipt_templates.sql
-- Para PostgreSQL use: sql/receipt_templates.pg.sql ou sql/migrations/003_receipt_templates.pg.sql

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

