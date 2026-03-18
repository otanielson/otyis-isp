-- Recursos avançados RADIUS: franquia, MAC, voucher, Framed-Pool, VLAN, redirect
-- Execute no banco do tenant (portal + RADIUS).

-- Planos: franquia (limite mensal/diário/semanal), grupo ao exceder, pool CGNAT, VLAN, redirect
ALTER TABLE plans ADD COLUMN IF NOT EXISTS quota_gb NUMERIC(10,2) DEFAULT NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS quota_period VARCHAR(20) DEFAULT 'monthly' CHECK (quota_period IN ('daily','weekly','monthly'));
ALTER TABLE plans ADD COLUMN IF NOT EXISTS quota_exceeded_group VARCHAR(64) DEFAULT 'reduzido_10m';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS framed_pool VARCHAR(64) DEFAULT NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS vlan_id INT DEFAULT NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS block_redirect_url VARCHAR(512) DEFAULT NULL;

-- Instalação: MAC autorizado (Calling-Station-Id)
ALTER TABLE installations ADD COLUMN IF NOT EXISTS mac_authorized VARCHAR(32) DEFAULT NULL;

-- Config RADIUS do tenant (redirect por inadimplência, etc.)
CREATE TABLE IF NOT EXISTS tenant_radius_config (
  tenant_id INT PRIMARY KEY,
  block_redirect_url VARCHAR(512) DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Vouchers para Hotspot / Portal Captive
CREATE TABLE IF NOT EXISTS vouchers (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  code VARCHAR(64) NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 240,
  data_limit_mb INT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_vouchers_tenant ON vouchers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_used ON vouchers(used_at) WHERE used_at IS NULL;

-- Secret por NAS (portal → tabela nas do FreeRADIUS)
ALTER TABLE tenant_nas ADD COLUMN IF NOT EXISTS nas_secret VARCHAR(255) DEFAULT NULL;
ALTER TABLE tenant_radius_config ADD COLUMN IF NOT EXISTS nas_default_secret VARCHAR(255) DEFAULT NULL;
