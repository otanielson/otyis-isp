-- Migração 001: RADIUS + Portal do Provedor (PostgreSQL)
-- Agrupa schema FreeRADIUS e recursos avançados (vouchers, franquia, config, NAS).
-- Execute no banco do tenant (portal + RADIUS): psql -U user -d tenant_db -f sql/migrations/001_radius_portal.pg.sql
-- Ou via script: node scripts/run-migration.mjs 001_radius_portal

-- =============================================================================
-- PARTE 1: Schema FreeRADIUS (radacct, radcheck, radreply, radusergroup, nas, etc.)
-- =============================================================================

CREATE TABLE IF NOT EXISTS radacct (
  radacctid bigserial PRIMARY KEY,
  acctsessionid text NOT NULL,
  acctuniqueid text NOT NULL UNIQUE,
  username text,
  groupname text,
  realm text,
  nasipaddress inet NOT NULL,
  nasportid text,
  nasporttype text,
  acctstarttime timestamp with time zone,
  acctupdatetime timestamp with time zone,
  acctstoptime timestamp with time zone,
  acctinterval bigint,
  acctsessiontime bigint,
  acctauthentic text,
  connectinfo_start text,
  connectinfo_stop text,
  acctinputoctets bigint,
  acctoutputoctets bigint,
  calledstationid text,
  callingstationid text,
  acctterminatecause text,
  servicetype text,
  framedprotocol text,
  framedipaddress inet,
  framedipv6address inet,
  framedipv6prefix inet,
  framedinterfaceid text,
  delegatedipv6prefix inet,
  class text
);
CREATE INDEX IF NOT EXISTS radacct_active_session_idx ON radacct (acctuniqueid) WHERE acctstoptime IS NULL;
CREATE INDEX IF NOT EXISTS radacct_bulk_close ON radacct (nasipaddress, acctstarttime) WHERE acctstoptime IS NULL;
CREATE INDEX IF NOT EXISTS radacct_bulk_timeout ON radacct (acctstoptime NULLS FIRST, acctupdatetime);
CREATE INDEX IF NOT EXISTS radacct_start_user_idx ON radacct (acctstarttime, username);

CREATE TABLE IF NOT EXISTS radcheck (
  id serial PRIMARY KEY,
  username text NOT NULL DEFAULT '',
  attribute text NOT NULL DEFAULT '',
  op VARCHAR(2) NOT NULL DEFAULT '==',
  value text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS radcheck_username ON radcheck (username, attribute);

CREATE TABLE IF NOT EXISTS radgroupcheck (
  id serial PRIMARY KEY,
  groupname text NOT NULL DEFAULT '',
  attribute text NOT NULL DEFAULT '',
  op VARCHAR(2) NOT NULL DEFAULT '==',
  value text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS radgroupcheck_groupname ON radgroupcheck (groupname, attribute);

CREATE TABLE IF NOT EXISTS radgroupreply (
  id serial PRIMARY KEY,
  groupname text NOT NULL DEFAULT '',
  attribute text NOT NULL DEFAULT '',
  op VARCHAR(2) NOT NULL DEFAULT '=',
  value text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS radgroupreply_groupname ON radgroupreply (groupname, attribute);

INSERT INTO radgroupreply (groupname, attribute, op, value)
SELECT 'bloqueado', 'Mikrotik-Rate-Limit', '=', '64k/64k'
WHERE NOT EXISTS (SELECT 1 FROM radgroupreply WHERE groupname = 'bloqueado' AND attribute = 'Mikrotik-Rate-Limit');

INSERT INTO radgroupreply (groupname, attribute, op, value)
SELECT 'suspenso', 'Mikrotik-Rate-Limit', '=', '1k/1k'
WHERE NOT EXISTS (SELECT 1 FROM radgroupreply WHERE groupname = 'suspenso' AND attribute = 'Mikrotik-Rate-Limit');

INSERT INTO radgroupreply (groupname, attribute, op, value)
SELECT 'reduzido_10m', 'Mikrotik-Rate-Limit', '=', '10M/10M'
WHERE NOT EXISTS (SELECT 1 FROM radgroupreply WHERE groupname = 'reduzido_10m' AND attribute = 'Mikrotik-Rate-Limit');
INSERT INTO radgroupreply (groupname, attribute, op, value)
SELECT 'reduzido_10m', 'WISPr-Bandwidth', '=', '10M/10M'
WHERE NOT EXISTS (SELECT 1 FROM radgroupreply WHERE groupname = 'reduzido_10m' AND attribute = 'WISPr-Bandwidth');
INSERT INTO radgroupreply (groupname, attribute, op, value)
SELECT 'reduzido_10m', 'Simultaneous-Use', '=', '1'
WHERE NOT EXISTS (SELECT 1 FROM radgroupreply WHERE groupname = 'reduzido_10m' AND attribute = 'Simultaneous-Use');

CREATE TABLE IF NOT EXISTS radreply (
  id serial PRIMARY KEY,
  username text NOT NULL DEFAULT '',
  attribute text NOT NULL DEFAULT '',
  op VARCHAR(2) NOT NULL DEFAULT '=',
  value text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS radreply_username ON radreply (username, attribute);

CREATE TABLE IF NOT EXISTS radusergroup (
  id serial PRIMARY KEY,
  username text NOT NULL DEFAULT '',
  groupname text NOT NULL DEFAULT '',
  priority integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS radusergroup_username ON radusergroup (username);

CREATE TABLE IF NOT EXISTS radpostauth (
  id bigserial PRIMARY KEY,
  username text NOT NULL,
  pass text,
  reply text,
  calledstationid text,
  callingstationid text,
  authdate timestamp with time zone NOT NULL default now(),
  class text
);
CREATE INDEX IF NOT EXISTS radpostauth_authdate ON radpostauth (authdate DESC);
CREATE INDEX IF NOT EXISTS radpostauth_username ON radpostauth (username);

INSERT INTO radgroupreply (groupname, attribute, op, value)
SELECT 'bloqueado', 'Simultaneous-Use', '=', '1'
WHERE NOT EXISTS (SELECT 1 FROM radgroupreply WHERE groupname = 'bloqueado' AND attribute = 'Simultaneous-Use');
INSERT INTO radgroupreply (groupname, attribute, op, value)
SELECT 'suspenso', 'Simultaneous-Use', '=', '1'
WHERE NOT EXISTS (SELECT 1 FROM radgroupreply WHERE groupname = 'suspenso' AND attribute = 'Simultaneous-Use');

CREATE TABLE IF NOT EXISTS nas (
  id serial PRIMARY KEY,
  nasname text NOT NULL,
  shortname text NOT NULL,
  type text NOT NULL DEFAULT 'other',
  ports integer,
  secret text NOT NULL,
  server text,
  community text,
  description text,
  require_ma text NOT NULL DEFAULT 'auto',
  limit_proxy_state text NOT NULL DEFAULT 'auto'
);
CREATE INDEX IF NOT EXISTS nas_nasname ON nas (nasname);

CREATE TABLE IF NOT EXISTS nasreload (
  nasipaddress inet PRIMARY KEY,
  reloadtime timestamp with time zone NOT NULL
);

-- =============================================================================
-- PARTE 2: Recursos avançados RADIUS (portal): planos, instalação, config, vouchers
-- Depende de: tenants, tenant_nas, plans, installations (schema.pg.sql)
-- =============================================================================

-- Planos: franquia, grupo ao exceder, pool CGNAT, VLAN, redirect
ALTER TABLE plans ADD COLUMN IF NOT EXISTS quota_gb NUMERIC(10,2) DEFAULT NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS quota_period VARCHAR(20) DEFAULT 'monthly';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS quota_exceeded_group VARCHAR(64) DEFAULT 'reduzido_10m';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS framed_pool VARCHAR(64) DEFAULT NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS vlan_id INT DEFAULT NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS block_redirect_url VARCHAR(512) DEFAULT NULL;

-- Instalação: MAC autorizado (Calling-Station-Id)
ALTER TABLE installations ADD COLUMN IF NOT EXISTS mac_authorized VARCHAR(32) DEFAULT NULL;

-- Config RADIUS do tenant (redirect por inadimplência)
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

-- Índices úteis para consultas do portal (status de NAS, sessões por usuário)
CREATE INDEX IF NOT EXISTS idx_radacct_username_start ON radacct (username, acctstarttime DESC);
CREATE INDEX IF NOT EXISTS idx_radacct_nas_active ON radacct (nasipaddress) WHERE acctstoptime IS NULL;
