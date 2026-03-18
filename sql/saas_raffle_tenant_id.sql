-- tenant_id em campanhas de sorteio (opcional para multi-tenant)
ALTER TABLE raffle_campaigns ADD COLUMN tenant_id INT UNSIGNED NULL AFTER id, ADD KEY idx_tenant (tenant_id);
UPDATE raffle_campaigns SET tenant_id = 1 WHERE tenant_id IS NULL;
