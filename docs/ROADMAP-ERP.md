# Roadmap ERP/ISP — Multi-Portal

Mapeamento do que existe, do que falta e ordem sugerida de implementação.

---

## Estado atual (já implementado)

| Módulo | Status | Detalhes |
|--------|--------|----------|
| **1. Cadastro de clientes** | Parcial | Nome, WhatsApp, email, CPF; ficha com instalação, PPPoE; histórico básico |
| **2. Propostas e vendas** | Parcial | Pedidos de assinatura (leads) com status; sem proposta formal, contrato ou OS |
| **3. Planos** | OK | Planos internet; velocidade Mbps; concentradores; bloqueio automático |
| **4. Financeiro** | Parcial | Faturas, geração mensal, pagamento; sem boletos, contas a pagar |
| **5. Rede/RADIUS** | Parcial | FreeRADIUS, Mikrotik-Rate-Limit; bloqueio por inadimplência |
| **6. Ordens de serviço** | Não | — |
| **7. Suporte/Tickets** | Não | — |
| **8. Relatórios** | Mínimo | Métricas no dashboard; sem relatórios exportáveis |
| **9. Extras** | Parcial | Portal do cliente (clube); sem SMS/WhatsApp; sem estoque |

---

## Fases de implementação

### Fase 1 — Fundação (prioridade alta)

1. **Clientes**
   - [ ] Endereço completo (logradouro, número, bairro, cidade, CEP)
   - [ ] Histórico de alterações
   - [ ] Observações gerais

2. **Propostas**
   - [ ] Tabela `proposals` (cliente, plano, valor, validade, status)
   - [ ] Tela de criação de proposta
   - [ ] Aprovação e conversão em contrato/instalação

3. **Ordens de serviço**
   - [ ] Tabela `service_orders` (cliente, tipo, status, técnico, prazo)
   - [ ] CRUD no portal
   - [ ] Atribuição de técnico

### Fase 2 — Financeiro e automação

4. **Financeiro**
   - [ ] Emissão de boleto (integração Asaas, Iugu ou similar)
   - [ ] Contas a pagar (fornecedores, despesas)
   - [ ] Dashboard financeiro

5. **Automação**
   - [ ] Bloqueio automático (já existe; melhorar desbloqueio ao pagar)
   - [ ] Envio de aviso de vencimento (WhatsApp/SMS)
   - [ ] Cron para bloqueio diário

### Fase 3 — Suporte e relatórios

6. **Suporte**
   - [ ] Tabela `tickets` (cliente, assunto, status, prioridade, SLA)
   - [ ] Central de atendimento
   - [ ] Histórico de resolução

7. **Relatórios**
   - [ ] Relatório financeiro (receita, inadimplência)
   - [ ] Relatório de OS (abertas, fechadas)
   - [ ] Export CSV/PDF

### Fase 4 — Extras

8. **Portal do cliente**
   - [ ] Consulta de faturas
   - [ ] Abertura de chamado
   - [ ] Histórico de pagamentos

9. **Integrações**
   - [ ] WhatsApp Business API
   - [ ] Gateway de SMS
   - [ ] Zabbix (monitoramento)

10. **Estoque**
    - [ ] Tabela `inventory` (antenas, ONUs, cabos)
    - [ ] Controle de entrada/saída

---

## Estrutura de tabelas sugerida

```sql
-- Propostas
CREATE TABLE proposals (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  customer_id BIGINT NOT NULL,
  plan_code VARCHAR(32) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  valid_until DATE,
  status VARCHAR(20) DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ordens de serviço
CREATE TABLE service_orders (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  customer_id BIGINT NOT NULL,
  type VARCHAR(32),  -- INSTALLATION, MAINTENANCE, SUPPORT
  status VARCHAR(20) DEFAULT 'OPEN',
  assigned_to INT,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tickets / Chamados
CREATE TABLE tickets (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  customer_id BIGINT NOT NULL,
  subject VARCHAR(255) NOT NULL,
  priority VARCHAR(20) DEFAULT 'NORMAL',
  status VARCHAR(20) DEFAULT 'OPEN',
  assigned_to INT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Próximos passos

1. Executar migrações da Fase 1 (tabelas + colunas)
2. Implementar APIs e telas de Propostas
3. Implementar APIs e telas de Ordens de Serviço
4. Seguir conforme prioridade do provedor
