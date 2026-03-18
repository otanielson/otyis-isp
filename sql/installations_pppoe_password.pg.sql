-- Adiciona coluna pppoe_password em installations (PostgreSQL)
-- Execute se a coluna ainda não existir: psql -U user -d database -f sql/installations_pppoe_password.pg.sql

ALTER TABLE installations ADD COLUMN IF NOT EXISTS pppoe_password VARCHAR(64);
