-- Grupo RADIUS "bloqueado" — velocidade mínima para inadimplentes (64k/64k)
-- Execute no banco do tenant (usado pelo FreeRADIUS)
-- Formato Mikrotik-Rate-Limit: download/upload (k=kbps, M=Mbps)

INSERT INTO radgroupreply (groupname, attribute, op, value)
SELECT 'bloqueado', 'Mikrotik-Rate-Limit', '=', '64k/64k'
WHERE NOT EXISTS (SELECT 1 FROM radgroupreply WHERE groupname = 'bloqueado' AND attribute = 'Mikrotik-Rate-Limit');
