-- Schema FreeRADIUS para PostgreSQL (radcheck, radreply, radacct, nas, etc.)
-- Usado no init do Postgres por tenant. Fonte: FreeRADIUS raddb/mods-config/sql/main/postgresql/schema.sql

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

-- Grupo "bloqueado" para inadimplentes (64k/64k — Mikrotik-Rate-Limit)
INSERT INTO radgroupreply (groupname, attribute, op, value)
SELECT 'bloqueado', 'Mikrotik-Rate-Limit', '=', '64k/64k'
WHERE NOT EXISTS (SELECT 1 FROM radgroupreply WHERE groupname = 'bloqueado' AND attribute = 'Mikrotik-Rate-Limit');

-- Grupo "suspenso" para instalações suspensas/canceladas (1k/1k — sem uso real)
INSERT INTO radgroupreply (groupname, attribute, op, value)
SELECT 'suspenso', 'Mikrotik-Rate-Limit', '=', '1k/1k'
WHERE NOT EXISTS (SELECT 1 FROM radgroupreply WHERE groupname = 'suspenso' AND attribute = 'Mikrotik-Rate-Limit');

-- Grupo "reduzido_10m" para franquia excedida (10M/10M)
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

-- Simultaneous-Use = 1 (evitar múltiplos logins por usuário)
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
