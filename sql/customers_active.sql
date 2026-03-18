-- Adiciona coluna active em customers (para desativar cliente)
-- Execute: mysql -u user -p database < sql/customers_active.sql

ALTER TABLE customers ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1;
