-- Configuração editável da página /clube/index.html (admin)
-- MySQL 8+ / MariaDB

CREATE TABLE IF NOT EXISTS clube_page_config (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  config_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Valor inicial (conteúdo atual da página)
INSERT INTO clube_page_config (id, config_json) VALUES (1, '{
  "hero": {
    "badge": "Benefícios exclusivos",
    "title": "Clube Multi",
    "description": "Pontos, sorteios e vantagens para quem é cliente. Assine um plano e ganhe streaming, descontos e muito mais.",
    "ctaText": "Assinar e entrar no clube",
    "ctaHref": "/assinar.html"
  },
  "benefits": {
    "sectionTitle": "Vantagens do Clube Multi",
    "sectionSubtitle": "Assinando um plano Multi você tem acesso a benefícios exclusivos. Confira as ofertas disponíveis.",
    "note": "Ofertas sujeitas à disponibilidade e alteração. Consulte condições na contratação.",
    "items": [
      { "name": "Netflix", "description": "1 mês grátis de Netflix ao assinar seu plano. Aproveite séries e filmes à vontade.", "iconColor": "red" },
      { "name": "Telecine", "description": "Acesso ao Telecine pelo Clube Multi. Filmes, séries e canais ao vivo.", "iconColor": "purple" },
      { "name": "Disney+", "description": "Disney+ incluso em planos selecionados. Marvel, Star Wars, Pixar e mais.", "iconColor": "blue" },
      { "name": "Spotify", "description": "Músicas e podcasts com benefício Spotify para clientes do Clube Multi.", "iconColor": "green" }
    ]
  },
  "points": {
    "sectionTitle": "Como ganhar pontos",
    "items": [
      { "label": "Cadastro no stand", "value": "+200 pontos", "text": "Visite nosso stand, escaneie o QR Code e ganhe pontos na hora.", "icon": "bi-qr-code-scan" },
      { "label": "Assinar plano", "value": "Bônus de pontos", "text": "Ao fechar seu plano de internet você recebe pontos de boas-vindas.", "icon": "bi-telephone-plus" },
      { "label": "Pagamento em dia", "value": "Bônus recorrente", "text": "Mantenha as contas em dia e acumule pontos todo mês.", "icon": "bi-calendar-check" },
      { "label": "Indique amigos", "value": "Pontos por indicação", "text": "Indique alguém para a Multi e ganhe pontos quando fecharem plano.", "icon": "bi-people" }
    ]
  },
  "actions": {
    "consultTitle": "Consultar meu saldo",
    "consultDesc": "Digite seu WhatsApp para ver seus pontos e números do sorteio.",
    "standBadge": "Eventos",
    "standTitle": "Cadastro rápido no stand",
    "standDesc": "Está em um evento? Escaneie o QR Code do stand, cadastre-se em segundos e ganhe 200 pontos na hora + número no sorteio.",
    "standLinkText": "Ir para cadastro do stand",
    "standHref": "/clube/stand.html"
  },
  "cta": {
    "title": "Quer entrar no Clube Multi?",
    "text": "Assine um plano e comece a acumular pontos e benefícios hoje.",
    "buttonText": "Ver planos",
    "buttonHref": "/planos.html"
  }
}')
ON DUPLICATE KEY UPDATE config_json = config_json;
