-- Dados iniciais (opcional)

INSERT INTO rewards (name, cost_points, reward_type, rules_json, active)
VALUES
('Upgrade de velocidade por 7 dias', 200, 'UPGRADE', JSON_OBJECT('days', 7), 1),
('50% de desconto na próxima fatura (condicionado)', 500, 'DISCOUNT', JSON_OBJECT('condition', 'Após 3 meses pagos'), 1),
('Roteador Wi‑Fi 6 (com fidelidade 12 meses)', 1200, 'PRODUCT', JSON_OBJECT('condition', 'Fidelidade 12 meses'), 1)
ON DUPLICATE KEY UPDATE name=VALUES(name);
