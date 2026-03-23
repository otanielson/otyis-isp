-- Modelos pré-configurados de Hotspot / Wi-Fi
-- Execute no banco do tenant / portal.

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_hotspot_templates_tenant_slug
  ON hotspot_templates(tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_hotspot_templates_tenant
  ON hotspot_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hotspot_templates_default
  ON hotspot_templates(tenant_id, is_default);

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

CREATE INDEX IF NOT EXISTS idx_hotspot_template_pix_plans_tenant
  ON hotspot_template_pix_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hotspot_template_pix_plans_template
  ON hotspot_template_pix_plans(template_id, sort_order);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_hotspot_payment_sessions_session_key
  ON hotspot_payment_sessions(session_key);
CREATE INDEX IF NOT EXISTS idx_hotspot_payment_sessions_tenant
  ON hotspot_payment_sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_hotspot_payment_sessions_txid
  ON hotspot_payment_sessions(tenant_id, txid);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_hotspot_auth_sessions_session_key
  ON hotspot_auth_sessions(session_key);
CREATE INDEX IF NOT EXISTS idx_hotspot_auth_sessions_tenant
  ON hotspot_auth_sessions(tenant_id, status);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_hotspot_login_otps_session_key
  ON hotspot_login_otps(session_key);
CREATE INDEX IF NOT EXISTS idx_hotspot_login_otps_phone
  ON hotspot_login_otps(tenant_id, phone, used_at);
