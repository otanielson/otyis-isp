-- Concentradores (NAS) por tenant — servidores de autenticação do provedor
-- Execute após saas_tenants.sql e tabelas RBAC.

CREATE TABLE IF NOT EXISTS tenant_nas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL COMMENT 'Nome do concentrador (ex: NAS-BR-01)',
  nas_ip VARCHAR(45) NOT NULL COMMENT 'IP do NAS (IPv4 ou IPv6)',
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tenant_nas_tenant (tenant_id),
  CONSTRAINT fk_tenant_nas_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
