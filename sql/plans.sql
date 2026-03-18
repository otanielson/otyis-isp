-- Tabela de planos (admin gerencia, portal exibe)
CREATE TABLE IF NOT EXISTS plans (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL COMMENT 'Código do plano (ex: 100, 300, 1000)',
  speed_display VARCHAR(32) NOT NULL COMMENT 'Ex: 100, 300, 1',
  unit VARCHAR(16) NOT NULL DEFAULT 'Mega' COMMENT 'Mega ou Giga',
  tagline VARCHAR(190) NULL,
  features_json JSON NULL COMMENT 'Array de strings com benefícios',
  badge ENUM('','popular','top') NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plans_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dados iniciais
INSERT INTO plans (code, speed_display, unit, tagline, features_json, badge, sort_order, active) VALUES
('100', '100', 'Mega', 'Ideal para uso básico', '["Streaming HD","Home office","Clube Multi + pontos"]', '', 1, 1),
('300', '300', 'Mega', 'Para famílias', '["Streaming 4K","Vários dispositivos","Clube Multi + pontos"]', 'popular', 2, 1),
('500', '500', 'Mega', 'Alta performance', '["Upload melhor","Jogos online","Clube Multi + pontos"]', '', 3, 1),
('1000', '1', 'Giga', 'Máximo desempenho', '["Máximo desempenho","Conteúdo pesado","Clube Multi + pontos"]', 'top', 4, 1)
ON DUPLICATE KEY UPDATE tagline=VALUES(tagline), features_json=VALUES(features_json), badge=VALUES(badge), sort_order=VALUES(sort_order);
