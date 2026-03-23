-- Modelos de contrato (texto/HTML com variáveis para preenchimento)
-- Execute após erp_fase2 (contracts existem)
-- Variáveis sugeridas no texto: {{nome_cliente}}, {{plano}}, {{valor}}, {{vencimento}}, {{data}}, {{endereco}}

CREATE TABLE IF NOT EXISTS contract_templates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  name VARCHAR(190) NOT NULL,
  description TEXT,
  body_html TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_contract_templates_tenant ON contract_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contract_templates_active ON contract_templates(tenant_id, is_active);

INSERT INTO contract_templates (tenant_id, name, description, body_html, is_default, is_active)
SELECT
  1,
  'Contrato padrão de prestação de serviço',
  'Modelo padrão com variáveis do cliente, plano e comodato para o portal.',
  E'<h1 style="text-align:center;">CONTRATO DE PRESTA&Ccedil;&Atilde;O DE SERVI&Ccedil;OS DE TELECOMUNICA&Ccedil;&Otilde;ES</h1>\n<p><strong>Contrato n&ordm;:</strong> #{{contract_id}}</p>\n<h2>DADOS DO CLIENTE</h2>\n<p><strong>Nome:</strong> {{customer_name}}<br><strong>WhatsApp:</strong> {{customer_whatsapp}}<br><strong>Documento (CPF/CNPJ):</strong> {{customer_document}}<br><strong>Endere&ccedil;o:</strong> {{customer_address}}</p>\n<h2>DADOS DO SERVI&Ccedil;O</h2>\n<p><strong>Plano contratado:</strong> {{plan_code}}<br><strong>Valor mensal:</strong> R$ {{amount}}<br><strong>Dia de vencimento:</strong> {{due_day}}<br><strong>In&iacute;cio da vig&ecirc;ncia:</strong> {{starts_at}}</p>\n<p><strong>Equipamentos em comodato:</strong></p>\n<p>{{comodato_items}}</p>\n<p><strong>Observa&ccedil;&otilde;es:</strong></p>\n<p>{{observations}}</p>\n<h2>CL&Aacute;USULA 1 - OBJETO</h2>\n<p>O presente contrato tem por objeto a presta&ccedil;&atilde;o de servi&ccedil;os de telecomunica&ccedil;&otilde;es (acesso &agrave; internet), fornecidos pelo PROVEDOR ao CLIENTE, conforme plano contratado.</p>\n<h2>CL&Aacute;USULA 2 - CONDI&Ccedil;&Otilde;ES DO SERVI&Ccedil;O</h2>\n<p>2.1. O servi&ccedil;o ser&aacute; prestado de forma cont&iacute;nua, 24 (vinte e quatro) horas por dia, salvo interrup&ccedil;&otilde;es necess&aacute;rias para manuten&ccedil;&atilde;o t&eacute;cnica, casos fortuitos ou for&ccedil;a maior.</p>\n<p>2.2. A velocidade contratada &eacute; nominal, podendo sofrer varia&ccedil;&otilde;es conforme condi&ccedil;&otilde;es t&eacute;cnicas da rede, conforme regulamenta&ccedil;&atilde;o da ANATEL.</p>\n<h2>CL&Aacute;USULA 3 - PAGAMENTO</h2>\n<p>3.1. O CLIENTE pagar&aacute; mensalmente o valor de R$ {{amount}}, com vencimento no dia {{due_day}} de cada m&ecirc;s.</p>\n<p>3.2. O n&atilde;o pagamento poder&aacute; resultar em:</p>\n<ul><li>Suspens&atilde;o parcial do servi&ccedil;o ap&oacute;s atraso</li><li>Suspens&atilde;o total ap&oacute;s per&iacute;odo adicional</li><li>Cancelamento definitivo em caso de inadimpl&ecirc;ncia prolongada</li></ul>\n<p>3.3. Poder&atilde;o ser aplicados juros e multa por atraso conforme legisla&ccedil;&atilde;o vigente.</p>\n<h2>CL&Aacute;USULA 4 - COMODATO DE EQUIPAMENTOS</h2>\n<p>4.1. Os equipamentos fornecidos ao CLIENTE permanecem como propriedade do PROVEDOR.</p>\n<p>4.2. O CLIENTE se compromete a:</p>\n<ul><li>Zelar pelos equipamentos</li><li>N&atilde;o realizar modifica&ccedil;&otilde;es ou interven&ccedil;&otilde;es</li><li>Devolver os equipamentos em caso de cancelamento</li></ul>\n<p>4.3. Em caso de dano, perda ou n&atilde;o devolu&ccedil;&atilde;o, ser&aacute; cobrado o valor correspondente.</p>\n<h2>CL&Aacute;USULA 5 - OBRIGA&Ccedil;&Otilde;ES DO CLIENTE</h2>\n<p>O CLIENTE se compromete a:</p>\n<ul><li>Utilizar o servi&ccedil;o de forma legal</li><li>N&atilde;o compartilhar acesso indevidamente</li><li>N&atilde;o realizar atividades il&iacute;citas</li><li>Manter seus dados atualizados</li></ul>\n<h2>CL&Aacute;USULA 6 - OBRIGA&Ccedil;&Otilde;ES DO PROVEDOR</h2>\n<p>O PROVEDOR se compromete a:</p>\n<ul><li>Prestar o servi&ccedil;o com qualidade e estabilidade</li><li>Realizar suporte t&eacute;cnico</li><li>Manter atendimento ao cliente</li><li>Cumprir as normas da ANATEL</li></ul>\n<h2>CL&Aacute;USULA 7 - SUSPENS&Atilde;O E CANCELAMENTO</h2>\n<p>7.1. O contrato poder&aacute; ser suspenso em caso de inadimpl&ecirc;ncia.</p>\n<p>7.2. O CLIENTE pode solicitar cancelamento a qualquer momento.</p>\n<p>7.3. O cancelamento n&atilde;o isenta d&eacute;bitos pendentes.</p>\n<h2>CL&Aacute;USULA 8 - VIG&Ecirc;NCIA</h2>\n<p>Este contrato entra em vigor na data {{date}}, com prazo indeterminado, podendo ser rescindido por qualquer das partes.</p>\n<h2>CL&Aacute;USULA 9 - FORO</h2>\n<p>Fica eleito o foro da comarca do domic&iacute;lio do CLIENTE para dirimir quaisquer d&uacute;vidas oriundas deste contrato.</p>\n<h2>ASSINATURAS</h2>\n<br><br>\n<p>{{customer_name}}<br>CLIENTE</p>\n<br><br>\n<p>PROVEDOR RESPONS&Aacute;VEL</p>',
  TRUE,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM contract_templates WHERE tenant_id = 1
);
