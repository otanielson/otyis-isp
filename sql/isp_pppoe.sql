-- Dados de acesso PPPoE (usuário e senha do serviço)
-- Execute após isp_installations.sql

ALTER TABLE installations
  ADD COLUMN pppoe_user VARCHAR(64) NULL COMMENT 'Usuário PPPoE',
  ADD COLUMN pppoe_password VARCHAR(128) NULL COMMENT 'Senha PPPoE';
