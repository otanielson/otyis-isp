-- RBAC: usuários do portal do provedor (por tenant) + roles + permissões
-- Execute após saas_tenants.sql. Requer tabela tenants.

-- Usuários do tenant (Master + Staff)
CREATE TABLE IF NOT EXISTS tenant_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id INT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_master TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_user_email (tenant_id, email),
  KEY idx_tenant_users_tenant (tenant_id),
  KEY idx_tenant_users_active (is_active),
  CONSTRAINT fk_tenant_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Roles por tenant (Master é role de sistema)
CREATE TABLE IF NOT EXISTS tenant_roles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_role_name (tenant_id, name),
  KEY idx_tenant_roles_tenant (tenant_id),
  CONSTRAINT fk_tenant_roles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catálogo global de permissões (sem tenant_id)
CREATE TABLE IF NOT EXISTS tenant_permissions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(120) NOT NULL COMMENT 'ex: nas.create, iam.users.create',
  name VARCHAR(190) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permission_code (code),
  KEY idx_permissions_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Role -> Permissões (quais permissões cada role tem)
CREATE TABLE IF NOT EXISTS tenant_role_permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id INT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_perm (tenant_id, role_id, permission_id),
  KEY idx_trp_tenant (tenant_id),
  CONSTRAINT fk_trp_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_trp_role FOREIGN KEY (role_id) REFERENCES tenant_roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_trp_permission FOREIGN KEY (permission_id) REFERENCES tenant_permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User -> Roles (quais roles cada usuário tem)
CREATE TABLE IF NOT EXISTS tenant_user_roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id INT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_role (tenant_id, user_id, role_id),
  KEY idx_tur_tenant (tenant_id),
  CONSTRAINT fk_tur_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tur_user FOREIGN KEY (user_id) REFERENCES tenant_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tur_role FOREIGN KEY (role_id) REFERENCES tenant_roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
