-- Corrige o usuario evanildo@redemultitelecom.com.br no radcheck para MS-CHAP.
--
-- Executar (troque multi0987 pela senha real se for outra):
--   cd /var/www/otyis-isp && sudo -u postgres psql tico -v u="'evanildo@redemultitelecom.com.br'" -v p="'multi0987'" -f scripts/fix-radius-user-evanildo.sql
--
-- Ou em uma linha (PostgreSQL):
--   sudo -u postgres psql tico -c "UPDATE radcheck SET op = ':=' WHERE username = 'evanildo@redemultitelecom.com.br' AND attribute = 'Cleartext-Password'; INSERT INTO radcheck (username, attribute, op, value) SELECT 'evanildo@redemultitelecom.com.br', 'Cleartext-Password', ':=', 'multi0987' WHERE NOT EXISTS (SELECT 1 FROM radcheck WHERE username = 'evanildo@redemultitelecom.com.br' AND attribute = 'Cleartext-Password');"

-- Estado atual
SELECT id, username, attribute, op, value FROM radcheck WHERE username = :u;

-- Atualizar op para ':=' se for '==' (necessario para MS-CHAP usar a senha em control)
UPDATE radcheck SET op = ':=' WHERE username = :u AND attribute = 'Cleartext-Password' AND op != ':=';

-- Inserir senha se nao existir (senha padrao do log anterior: multi0987)
INSERT INTO radcheck (username, attribute, op, value)
SELECT :u, 'Cleartext-Password', ':=', :p
WHERE NOT EXISTS (SELECT 1 FROM radcheck WHERE username = :u AND attribute = 'Cleartext-Password');

-- Estado apos correcao
SELECT id, username, attribute, op, value FROM radcheck WHERE username = :u;
