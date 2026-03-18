-- Adiciona CPF/CNPJ em customers (edição no formulário do cliente)
-- Execute: mysql -u user -p database < sql/customers_cpf.sql

ALTER TABLE customers ADD COLUMN cpf_cnpj VARCHAR(32) NULL AFTER email;
