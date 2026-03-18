-- Planos ISP: velocidade real (Mbps), concentradores, bloqueio automático
-- Execute após schema.pg.sql e tenant_nas

-- Velocidade em Mbps (download/upload) para RADIUS
ALTER TABLE plans ADD COLUMN IF NOT EXISTS speed_download_mbps INT DEFAULT NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS speed_upload_mbps INT DEFAULT NULL;

-- Concentradores onde o plano pode ser usado (array de tenant_nas.id; NULL = todos)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS nas_ids JSONB DEFAULT NULL;

-- Bloqueio automático por inadimplência
ALTER TABLE plans ADD COLUMN IF NOT EXISTS block_auto BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS block_days_after_due INT NOT NULL DEFAULT 5;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS block_radius_group VARCHAR(64) NOT NULL DEFAULT 'bloqueado';

COMMENT ON COLUMN plans.speed_download_mbps IS 'Velocidade download em Mbps (para RADIUS/Mikrotik-Rate-Limit)';
COMMENT ON COLUMN plans.speed_upload_mbps IS 'Velocidade upload em Mbps';
COMMENT ON COLUMN plans.nas_ids IS 'IDs de tenant_nas onde o plano é válido; NULL = todos';
COMMENT ON COLUMN plans.block_auto IS 'Habilitar bloqueio automático por inadimplência';
COMMENT ON COLUMN plans.block_days_after_due IS 'Dias após vencimento para bloquear acesso';
COMMENT ON COLUMN plans.block_radius_group IS 'Grupo RADIUS ao bloquear (ex: bloqueado com 64k/64k)';
