# Checklist FreeRADIUS — 17 pontos de implantação

Este documento descreve como cada um dos 17 requisitos típicos de um servidor RADIUS para provedor de internet está coberto no multi-portal.

---

## 1. Autenticação

| Requisito | Implementação |
|-----------|----------------|
| Login e senha do cliente (PPPoE / Hotspot) | **radcheck** com `Cleartext-Password` (PAP). Provisionado ao cadastrar/editar instalação no portal. |
| Verificação de usuário no banco | FreeRADIUS usa **sql** (radcheck) para autorizar e autenticar. |
| Rejeição de acesso inválido | Access-Reject quando usuário/senha não conferem ou usuário não existe. |
| Autenticação PAP / CHAP / MSCHAP | **PAP** suportado (Cleartext-Password). CHAP/MSCHAP exigem User-Password (MD5) no radcheck; o portal hoje provisiona apenas PAP. |

---

## 2. Cadastro de usuários

| Campo | Onde fica |
|-------|------------|
| Usuário PPPoE | `installations.pppoe_user` + **radcheck** / **radusergroup** |
| Senha | `installations.pppoe_password` + **radcheck** (Cleartext-Password) |
| Plano de internet | `installations.plan_code` → grupo em **radusergroup** + **radgroupreply** (velocidade) |
| Status (ativo / bloqueado) | `installations.status` (ACTIVE/SUSPENDED/CANCELLED) → grupo **radusergroup** (plano ou `suspenso`). Bloqueio financeiro → grupo `bloqueado`. |
| Data de criação | `installations.created_at` |

Criação/edição de instalação no portal **sincroniza** automaticamente radcheck e radusergroup (provisionamento).

---

## 3. Perfis de planos (velocidade)

| Atributo | Uso |
|----------|-----|
| **Mikrotik-Rate-Limit** | Definido em **radgroupreply** por plano (ex.: `100M/50M`). Sincronizado ao criar/editar plano no portal. |
| **WISPr-Bandwidth** | Mesmo valor do Mikrotik-Rate-Limit em **radgroupreply** (Hotspot / WISPr). |
| **Simultaneous-Use** | Definido `= 1` por grupo (plano, bloqueado, suspenso) para evitar múltiplos logins. |

Tabelas: **radgroupreply** (por grupo/plano), **radusergroup** (usuário → grupo).

---

## 4. Controle de IP

| Recurso | Situação |
|---------|----------|
| Pool de IP dinâmico | Atributo **Framed-Pool** pode ser definido em radgroupreply (nome do pool no Mikrotik/BRAS). Hoje não é preenchido pelo portal; pode ser configurado manualmente por grupo no banco. |
| IP fixo por cliente | Atributo **Framed-IP-Address** em **radreply** por usuário. O portal não expõe campo “IP fixo” na instalação; pode ser adicionado em `installations` e replicado em radreply no sync. |
| IPv4 / IPv6 | Schema **radacct** tem `framedipaddress` e `framedipv6address`. Suporte a IPv6 é opcional no equipamento/NAS. |

---

## 5. Accounting (registro de uso)

| Dado | Tabela / Campo |
|------|-----------------|
| Login do cliente | **radacct.username** |
| Hora de conexão / desconexão | **radacct.acctstarttime**, **radacct.acctstoptime** |
| Tempo conectado | **radacct.acctsessiontime** |
| Upload / Download | **radacct.acctinputoctets**, **radacct.acctoutputoctets** |
| IP usado | **radacct.framedipaddress** |
| NAS | **radacct.nasipaddress** |

Tabela principal: **radacct**. O FreeRADIUS grava accounting; o portal lê para extrato por cliente e estatísticas.

---

## 6. Bloqueio de cliente

| Modo | Implementação |
|------|----------------|
| Bloqueado total | Grupo **bloqueado** em radusergroup (velocidade 64k/64k). Ação: **Executar bloqueio** (inadimplentes). |
| Velocidade reduzida | Grupo **bloqueado** com Mikrotik-Rate-Limit 64k/64k (ou valor configurável por plano em `block_radius_group`). |
| Redirecionamento para página de pagamento | Pode ser feito no NAS (ex.: Mikrotik Hotspot) com URL de redirect; não implementado no portal. |

Fluxo: **POST /api/portal/block-overdue** (bloqueia), **POST /api/portal/unblock-paid** (desbloqueia em dia).

---

## 7. CoA / Disconnect

| Função | Implementação |
|--------|----------------|
| Derrubar cliente remotamente | **POST /api/portal/radius/disconnect** (body: `{ "username": "..." }`). Envia Disconnect-Request via **radclient** ao servidor RADIUS (porta 3799). |
| Atualizar plano sem desconectar | Alterar plano no portal atualiza **radusergroup**; na próxima reconexão o novo plano vale. CoA para “atualizar em tempo real” exige CoA-Request com novos atributos (não implementado). |
| Liberar após pagamento | **Desbloquear quitados** no portal (unblock-paid) recoloca o usuário no grupo do plano. |

**Requisitos para disconnect:**  
- **radclient** instalado (pacote `freeradius-utils` no Linux).  
- Variáveis de ambiente: **RADIUS_COA_HOST** (ou RADIUS_HOST), **RADIUS_COA_PORT** (padrão 3799), **RADIUS_SECRET**.  
- FreeRADIUS do tenant com CoA habilitado (listen em 3799 e encaminhar para o NAS).

---

## 8. Controle de sessão (evitar múltiplos logins)

**Simultaneous-Use = 1** configurado em **radgroupreply** para cada grupo (plano, bloqueado, suspenso). O FreeRADIUS aplica o limite por usuário.

---

## 9. Cadastro de NAS

| Campo | Onde |
|-------|------|
| IP do equipamento | **nas.nasname** (FreeRADIUS) e/ou **tenant_nas.nas_ip** (portal). |
| Secret do RADIUS | **nas.secret** (tabela do FreeRADIUS). No portal, lista de NAS por tenant em **tenant_nas** (nome, IP, descrição). |
| Nome | **nas.shortname** / **tenant_nas.name** |

Tabela do FreeRADIUS: **nas**. O portal expõe **/api/portal/nas** (tenant_nas). A sincronização tenant_nas → nas (para o RADIUS usar) pode ser feita por script ou na provisionação do stack (clients.conf ou tabela nas).

---

## 10. Logs de autenticação

| Recurso | Implementação |
|---------|----------------|
| Erros (senha incorreta, usuário inexistente, NAS não autorizado) | **radpostauth** (tabela) e/ou arquivo do FreeRADIUS (ex.: `/var/log/freeradius/radius.log`). |
| No portal | Aba **Sistema** → **Carregar logs** (tail do container FreeRADIUS). **Falhas de autenticação** → lista das últimas linhas de **radpostauth** (GET /radius/auth-failures). |

---

## 11. Monitoramento de sessões

| Dado | Onde |
|------|------|
| Listar clientes online (usuário, IP, tempo, tráfego) | **GET /api/portal/radius/online** (radacct com `acctstoptime IS NULL`). |
| UI | Aba **Sistema** → painel **Clientes online** com tabela e botão **Desconectar** (CoA). |

---

## 12. Integração com ERP (portal)

O sistema do provedor (portal) já integra com o RADIUS por **banco SQL** (mesmo Postgres do tenant):

- Criar usuário no RADIUS ao criar/editar instalação (radcheck, radusergroup).
- Alterar plano → atualiza radgroupreply (plano) e radusergroup (usuário).
- Bloquear cliente → block-overdue (radusergroup = bloqueado).
- Liberar cliente → unblock-paid (radusergroup = plano).

Não há API HTTP externa para o RADIUS; a integração é via tabelas SQL.

---

## 13. Controle de grupos

Tabelas: **radusergroup** (usuário → grupo), **radgroupreply** (grupo → atributos: Mikrotik-Rate-Limit, WISPr-Bandwidth, Simultaneous-Use).  
Planos do portal viram grupos (código do plano = groupname); grupos especiais: **bloqueado**, **suspenso**.

---

## 14. Auditoria e segurança

| Recurso | Situação |
|---------|----------|
| Controle de tentativas de login | **radpostauth** registra tentativas; o portal expõe as últimas em **Falhas de autenticação** (aba Sistema). |
| Proteção contra brute force | Depende do FreeRADIUS (ex.: módulos de falha) ou do NAS; não implementado no portal. |
| Logs detalhados | Logs do container FreeRADIUS (aba Sistema) + radpostauth. |

---

## 15. Suporte a vários concentradores

Vários Mikrotik (POP 1, 2, 3, 4…) podem usar o **mesmo** servidor RADIUS. Cada um deve estar em **nas** (ou em clients.conf) com IP e secret. O portal lista NAS por tenant em **tenant_nas**; o FreeRADIUS usa a tabela **nas** (ou clients) para autorizar os NAS.

---

## 16. Banco de dados SQL

Estrutura usada (PostgreSQL):

- **radcheck** — checagem de autenticação (Cleartext-Password).
- **radreply** — atributos por usuário (opcional; ex.: IP fixo).
- **radacct** — accounting (sessões).
- **radgroupreply** — atributos por grupo (velocidade, Simultaneous-Use).
- **radusergroup** — usuário → grupo.
- **radgroupcheck** — checagem por grupo (se necessário).
- **nas** — clientes RADIUS (equipamentos).
- **radpostauth** — pós-autenticação (logs de falha/sucesso).

Schema em **sql/radius-schema.pg.sql** (e equivalente no init do tenant).

---

## 17. Estatísticas da rede

| Métrica | API | UI |
|---------|-----|-----|
| Clientes online | **GET /api/portal/radius/stats** (`online`) | Aba Sistema — card “Clientes online”. |
| Tráfego total (hoje) | **GET /api/portal/radius/stats** (`trafficToday`: input/output) | Card “Tráfego hoje”. |
| Pico (sessões iniciadas hoje) | **GET /api/portal/radius/stats** (`peakToday`) | Card “Pico de sessões hoje”. |

Fonte: agregações sobre a tabela **radacct**.

---

## Recursos avançados (franquia, MAC, voucher, CoA, CGNAT, VLAN)

### Franquia / limite de dados
- **Planos:** campos `quota_gb`, `quota_period` (daily/weekly/monthly), `quota_exceeded_group` (ex.: `reduzido_10m`).
- **Aplicar:** botão **Aplicar franquia** (aba Sistema) ou **POST /api/portal/radius/apply-quota**. Soma tráfego em **radacct** no período e coloca quem excedeu no grupo reduzido (ex.: 10M/10M).
- **Grupo:** `reduzido_10m` em **radgroupreply** (Mikrotik-Rate-Limit 10M/10M). Schema em `sql/radius-schema.pg.sql` e `sql/radius_advanced.pg.sql`.

### Controle por MAC (Calling-Station-Id)
- **Instalação:** campo `mac_authorized` (AA:BB:CC:DD:EE:FF). No RADIUS vira **radcheck** `Calling-Station-Id := MAC`.
- Se o cliente conectar com outro equipamento → Access-Reject.

### Vouchers (Hotspot / Portal Captive)
- **Tabela:** `vouchers` (tenant_id, code, duration_minutes, data_limit_mb, used_at).
- **POST /api/portal/vouchers:** gera N vouchers e cria no RADIUS usuário `voucher_<id>` com senha = código e **Session-Timeout** = duração (minutos × 60).
- No Hotspot: usuário `voucher_1`, senha = código do voucher.

### CGNAT / Framed-Pool e VLAN
- **Plano:** `framed_pool` (ex.: "cgnat") e `vlan_id` (ex.: 120). Sincronizados para **radgroupreply** (Framed-Pool, Tunnel-Private-Group-Id).

### Redirect por inadimplência
- **GET/PUT /api/portal/radius/config:** `block_redirect_url`. Grava em **tenant_radius_config** e em **radgroupreply** (grupo `bloqueado`, atributo WISPr-Redirect-URL) para o NAS redirecionar ao pagamento.

### CoA (atualizar sessão sem desconectar)
- **POST /api/portal/radius/coa:** body `{ "username": "...", "rate": "100M/50M" }`. Envia CoA-Request com Mikrotik-Rate-Limit (requer radclient e FreeRADIUS com CoA).

### Migração
- Execute **sql/radius_advanced.pg.sql** no banco do tenant para criar colunas (quota_gb, mac_authorized, etc.) e tabelas (tenant_radius_config, vouchers).

---

## Variáveis de ambiente (CoA / RADIUS)

Para o **Disconnect (CoA)** funcionar a partir do portal:

| Variável | Descrição |
|----------|-----------|
| **RADIUS_COA_HOST** ou **RADIUS_HOST** | Host do servidor RADIUS (ex.: `127.0.0.1` ou nome do container). |
| **RADIUS_COA_PORT** | Porta CoA (padrão **3799**). |
| **RADIUS_SECRET** | Secret compartilhado com o FreeRADIUS. |

No servidor onde roda o portal deve estar instalado **radclient** (pacote `freeradius-utils` no Linux). Em Windows, usar WSL ou um serviço que chame radclient em um host Linux.

---

## Resumo rápido

- **Autenticação:** radcheck (PAP), sql no FreeRADIUS.  
- **Cadastro:** instalações no portal → provisionamento em radcheck + radusergroup.  
- **Planos:** radgroupreply (Mikrotik-Rate-Limit, WISPr-Bandwidth, Simultaneous-Use).  
- **Accounting:** radacct; extrato por cliente e stats no portal.  
- **Bloqueio:** grupo bloqueado / unblock-paid.  
- **CoA:** POST /radius/disconnect (radclient).  
- **NAS:** tabela nas + tenant_nas no portal.  
- **Logs:** radius.log (container) + radpostauth (falhas).  
- **Monitoramento:** /radius/online e /radius/stats + UI na aba Sistema.  
- **Banco:** PostgreSQL com schema em sql/radius-schema.pg.sql.
