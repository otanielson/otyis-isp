-- SaaS Multi-Portal — Tenants (uma instância = vários ISPs)
-- Execute após schema.sql. Cada tenant = um cliente do SaaS (ISP).

CREATE TABLE IF NOT EXISTS tenants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(64) NOT NULL COMMENT 'Identificador único: subdomínio ou código (ex: isp-alfa)',
  name VARCHAR(190) NOT NULL COMMENT 'Nome comercial do tenant',
  status ENUM('ACTIVE','SUSPENDED','TRIAL','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  -- Identificação na requisição: subdomínio (isp-alfa.portal.com) ou domínio próprio
  subdomain VARCHAR(64) NULL COMMENT 'Subdomínio no BASE_DOMAIN (ex: isp-alfa.portal.com)',
  custom_domain VARCHAR(190) NULL COMMENT 'Domínio próprio (ex: portal.isp.com.br)',
  -- Configurações por tenant (evitar muitas colunas; JSON para RADIUS, branding, etc.)
  config_json JSON NULL COMMENT 'RADIUS (host,port,secret,nasIp), branding, ADMIN_KEY hash, etc.',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_slug (slug),
  UNIQUE KEY uq_tenants_subdomain (subdomain),
  UNIQUE KEY uq_tenants_custom_domain (custom_domain),
  KEY idx_tenants_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comentário: subdomain usa BASE_DOMAIN do .env (ex: portal.saas.com). custom_domain é o domínio do cliente.

-- Tenant padrão para migração (dados atuais ficam neste tenant)
INSERT INTO tenants (id, slug, name, status, subdomain) VALUES
(1, 'default', 'Tenant padrão (migração)', 'ACTIVE', NULL)
ON DUPLICATE KEY UPDATE name = VALUES(name);
