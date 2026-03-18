-- Migração SaaS: adicionar tenant_id às tabelas existentes
-- Execute após saas_tenants.sql. Dados atuais recebem tenant_id = 1.

ALTER TABLE customers          ADD COLUMN tenant_id INT UNSIGNED NULL AFTER id, ADD KEY idx_tenant (tenant_id);
ALTER TABLE subscription_requests ADD COLUMN tenant_id INT UNSIGNED NULL AFTER id, ADD KEY idx_tenant (tenant_id);
ALTER TABLE plans             ADD COLUMN tenant_id INT UNSIGNED NULL AFTER id, ADD KEY idx_tenant (tenant_id);

-- Atualizar dados existentes para o tenant padrão
UPDATE customers          SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE subscription_requests SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE plans             SET tenant_id = 1 WHERE tenant_id IS NULL;

-- Chave estrangeira (opcional; descomente após conferir dados)
-- ALTER TABLE customers          ADD CONSTRAINT fk_customers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
-- ALTER TABLE subscription_requests ADD CONSTRAINT fk_subscription_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
-- ALTER TABLE plans             ADD CONSTRAINT fk_plans_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- Opcional: tornar NOT NULL após migração (descomente quando estiver tudo preenchido)
-- ALTER TABLE customers          MODIFY tenant_id INT UNSIGNED NOT NULL;
-- ALTER TABLE subscription_requests MODIFY tenant_id INT UNSIGNED NOT NULL;
-- ALTER TABLE plans             MODIFY tenant_id INT UNSIGNED NOT NULL;

-- Tabelas que dependem de customers (tenant_id pode ser derivado ou adicionado depois)
-- loyalty_accounts, loyalty_ledger, raffle_*, reward_redemptions: tenant via customer_id
-- installations: tenant via customer_id. Se quiser filtro direto:
-- ALTER TABLE installations ADD COLUMN tenant_id INT UNSIGNED NULL AFTER id, ADD KEY idx_tenant (tenant_id);
-- UPDATE installations i INNER JOIN customers c ON i.customer_id = c.id SET i.tenant_id = c.tenant_id;
