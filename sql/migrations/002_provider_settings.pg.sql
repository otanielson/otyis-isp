-- Migração 002: provider_settings (dados do provedor: identidade, contato, endereço, branding)
-- Execute no banco: psql -U user -d database -f sql/migrations/002_provider_settings.pg.sql
-- Ou via script de migrações do projeto.

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
