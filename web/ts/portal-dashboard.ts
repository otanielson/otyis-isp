/* eslint-disable */
// @ts-nocheck

/* eslint-disable */
// @ts-nocheck
// Fonte Ãºnica: gerado a partir de portal-dashboard.js com correÃ§Ãµes de null-safety.
"use strict";
/* eslint-disable */
// @ts-nocheck
/**
 * Portal do Provedor â€” Dashboard (mesmo conteÃºdo do admin, API com JWT)
 */
(function () {
    var TOKEN_KEY = 'portal_provedor_token';
    function getToken() {
        try {
            return localStorage.getItem(TOKEN_KEY) || '';
        }
        catch (e) {
            return '';
        }
    }
    function redirectLogin() {
        try {
            localStorage.removeItem(TOKEN_KEY);
        }
        catch (e) { }
        if (window.portalSPA && typeof window.portalSPA.showLogin === 'function') {
            window.portalSPA.showLogin();
        }
        else {
            window.location.href = (window.__PORTAL_BASE__ || '/portal');
        }
    }
    if (!getToken()) {
        redirectLogin();
        return;
    }
    var userPerms = [];
    var userIsMaster = false;
    function esc(s) {
        return String(s || '').replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }
  const sharedWindow = window as Window & { __portalPageSectionStack?: string[] };
  const pageSectionStack = sharedWindow.__portalPageSectionStack || (sharedWindow.__portalPageSectionStack = []);
  function getActivePageSectionId(): string | null {
    const active = document.querySelector('[data-page-section="true"].show') as HTMLElement | null;
    return active ? active.id : null;
  }
  function showPageSection(el: HTMLElement): void {
    const isPageSection = el.getAttribute('data-page-section') === 'true';
    if (isPageSection) {
      document.querySelectorAll('[data-page-section="true"]').forEach((section) => {
        if (section === el) return;
        const sectionEl = section as HTMLElement;
        sectionEl.classList.remove('show');
        sectionEl.style.display = 'none';
        sectionEl.style.visibility = 'hidden';
        sectionEl.classList.add('d-none');
        sectionEl.setAttribute('aria-hidden', 'true');
      });
    }
    el.classList.add('show');
    el.style.display = isPageSection ? 'block' : 'flex';
    el.style.visibility = 'visible';
    el.style.zIndex = isPageSection ? '1' : '1055';
    el.classList.remove('d-none');
    el.setAttribute('aria-hidden', 'false');
    if (isPageSection && typeof el.scrollIntoView === 'function') {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }
  function hidePageSection(el: HTMLElement): void {
    el.classList.remove('show');
    el.style.display = 'none';
    el.style.visibility = 'hidden';
    el.classList.add('d-none');
    el.setAttribute('aria-hidden', 'true');
  }
    function safeShowModal(modalId) {
        var fn = window.safeShowModal;
        if (fn)
            return fn(modalId);
        var el = document.getElementById(modalId);
        if (!el)
            return null;
        var isPageSection = el.getAttribute('data-page-section') === 'true';
    if (isPageSection) {
      const activeId = getActivePageSectionId();
      if (activeId && activeId !== modalId) {
        pageSectionStack.push(activeId);
      }
        }
    showPageSection(el);
        return el;
    }
    function safeHideModal(modalId) {
        var fn = window.safeHideModal;
        if (fn) {
            fn(modalId);
            return;
        }
        var el = document.getElementById(modalId);
        if (!el)
            return;
    if (el.getAttribute('data-page-section') === 'true') {
      hidePageSection(el as HTMLElement);
      const previousId = pageSectionStack.pop();
      if (previousId) {
        const previous = document.getElementById(previousId) as HTMLElement | null;
        if (previous) {
          showPageSection(previous);
          return;
        }
      }
      return;
    }
        el.classList.remove('show');
        el.style.display = 'none';
        el.style.visibility = 'hidden';
    }
    function safeOn(id, eventName, handler) {
        var el = document.getElementById(id);
        if (el)
            el.addEventListener(eventName, handler);
    }
    function api(path, opts) {
        opts = opts || {};
        var token = getToken();
        var url = (window.__API_BASE__ != null ? window.__API_BASE__ : '/api/portal') + path;
        var headers = opts.headers || {};
        headers['Authorization'] = 'Bearer ' + token;
        if (opts.body && typeof opts.body === 'string')
            headers['Content-Type'] = 'application/json';
        return fetch(url, { method: opts.method || 'GET', headers: headers, body: opts.body, credentials: 'same-origin' }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (res.status === 401) {
                    redirectLogin();
                    throw new Error('SessÃ£o expirada.');
                }
                var msg = data.message || data.error;
                if (!res.ok)
                    throw new Error(msg || 'Erro (HTTP ' + res.status + ')');
                return data;
            });
        });
    }
    function renderTable(rows, cols, extra, extraHeader) {
        if (!rows || !rows.length)
            return '<p class="mb-0 text-muted">Nenhum registro.</p>';
        var thead = cols.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('');
        if (extraHeader)
            thead += '<th>' + esc(extraHeader) + '</th>';
        var tbody = rows.map(function (r) {
            var cells = cols.map(function (c) {
                var val = r[c.key];
                if (c.render)
                    val = c.render(val, r);
                var safe = (c.raw || (typeof val === 'string' && val.startsWith('<'))) ? val : esc(String(val));
                return '<td>' + safe + '</td>';
            });
            var extraCell = extra ? '<td>' + extra(r) + '</td>' : '';
            return '<tr>' + cells.join('') + extraCell + '</tr>';
        }).join('');
        return '<div class="table-responsive"><table class="table table-sm table-hover admin-table"><thead><tr>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div>';
    }
    var activeCampaign = null;
    var currentLeadId = null;
    var plansCache = [];
    var proposalTemplatesCache = [];
    var contractModelsCache = [];
    var wifiTemplatesCache = [];
    var wifiLastGeneratedFileName = 'mikrotik-hotspot.rsc';
    var contractModelEditor = null;
    function loadStats() {
        api('/stats').then(function (data) {
            document.getElementById('metricLeads').textContent = data.leadCount ?? 'â€”';
            document.getElementById('metricStand').textContent = data.standCount ?? 'â€”';
            document.getElementById('metricWinners').textContent = data.winnerCount ?? 'â€”';
            document.getElementById('metricCustomers').textContent = data.customerCount ?? 'â€”';
            document.getElementById('metricPlans').textContent = data.plansCount ?? 'â€”';
            document.getElementById('metricCampaign').textContent = data.activeCampaign ? data.activeCampaign.name : 'â€”';
            activeCampaign = data.activeCampaign;
        }).catch(function () {
            ['metricLeads', 'metricStand', 'metricWinners', 'metricCustomers', 'metricPlans', 'metricCampaign'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el)
                    el.textContent = 'â€”';
            });
        });
        api('/finance/stats').then(function (data) {
            var el = document.getElementById('metricFinancePending');
            if (el)
                el.textContent = (data.pending || 0) + (data.overdue || 0);
        }).catch(function () {
            var el = document.getElementById('metricFinancePending');
            if (el)
                el.textContent = 'â€”';
        });
        api('/reports/summary').then(function (data) {
            var el;
            if (el = document.getElementById('metricProposals'))
                el.textContent = data.proposals ?? 'â€”';
            if (el = document.getElementById('metricContracts'))
                el.textContent = data.contractsActive ?? 'â€”';
            if (el = document.getElementById('metricOSOpen'))
                el.textContent = data.serviceOrdersOpen ?? 'â€”';
            if (el = document.getElementById('metricTicketsOpen'))
                el.textContent = data.ticketsOpen ?? 'â€”';
        }).catch(function () {
            ['metricProposals', 'metricContracts', 'metricOSOpen', 'metricTicketsOpen'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el)
                    el.textContent = 'â€”';
            });
        });
    }
    function setLoading(elId) {
        var el = document.getElementById(elId);
        if (el)
            el.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
    }
    var btnLogout = document.getElementById('btnLogout');
    if (btnLogout)
        btnLogout.addEventListener('click', function (e) {
            e.preventDefault();
            redirectLogin();
        });
    /** Carrega permissÃµes do usuÃ¡rio (para uso futuro). Grupos e UsuÃ¡rios sempre visÃ­veis; API retorna 403 se sem permissÃ£o. */
    function applySidebarPermissions() {
        api('/me').then(function (data) {
            userPerms = data.permissions || [];
            userIsMaster = !!data.isMaster;
            /* Grupos e UsuÃ¡rios sempre visÃ­veis; sem permissÃ£o a API retorna 403 ao carregar */
        }).catch(function () { });
    }
    /** Ativa a aba pelo id e atualiza a URL (hash). Carrega o fragmento da aba se ainda nÃ£o existir (evita F5). */
    function routeSegmentToTab(segment) {
        var routeMap = {
            dashboard: 'overview',
            planos: 'plans',
            pedidos: 'leads',
            clientes: 'customers',
            propostas: 'proposals',
            contratos: 'contracts',
            suporte: 'tickets',
            clube: 'clube',
            wifi: 'wifi',
            financeiro: 'finance',
            fiscal: 'fiscal',
            estoque: 'estoque',
            sistema: 'system',
            administracao: 'provider',
            'administraÃ§Ã£o': 'provider',
            grupos: 'grupos',
            usuarios: 'usuarios',
            'usuÃ¡rios': 'usuarios'
        };
        return routeMap[(segment || '').toLowerCase()] || 'overview';
    }
    function tabToRoute(tab) {
        var tabMap = {
            overview: '/portal/dashboard',
            plans: '/portal/planos',
            leads: '/portal/pedidos',
            customers: '/portal/clientes',
            proposals: '/portal/propostas',
            contracts: '/portal/contratos',
            tickets: '/portal/suporte',
            clube: '/portal/clube',
            wifi: '/portal/wifi',
            finance: '/portal/financeiro',
            fiscal: '/portal/fiscal',
            estoque: '/portal/estoque',
            system: '/portal/sistema',
            provider: '/portal/administracao',
            grupos: '/portal/grupos',
            usuarios: '/portal/usuarios'
        };
        return tabMap[tab || ''] || '/portal/dashboard';
    }
    function navigateToTab(tab) {
        var nextPath = tabToRoute(tab);
        if ((window.location.pathname || '') !== nextPath) {
            window.history.pushState({}, '', nextPath);
        }
        applyCurrentRoute();
    }
    function navigateToCustomersPath(path) {
        if (!path)
            path = '/portal/clientes';
        if ((window.location.pathname || '') !== path) {
            window.history.pushState({}, '', path);
        }
        applyCurrentRoute();
    }
    function applyFinanceRoute(rest, attempts) {
        if (attempts === void 0) { attempts = 0; }
        var financeTab = document.getElementById('tab-finance');
        if (!financeTab) {
            if (attempts < 8) {
                setTimeout(function () { applyFinanceRoute(rest, attempts + 1); }, 60);
            }
            return;
        }
        var pane = (rest[0] || 'titulos').toLowerCase();
        var actionSlug = (rest[1] || '').toLowerCase();
        var openPane = (window.__portalOpenFinancePane || null);
        if (typeof openPane === 'function') {
            openPane(pane);
        }
        if (pane === 'titulos' && !actionSlug) {
            setTimeout(function () { safeShowModal('finance-page-titulos'); }, 0);
            return;
        }
        var actionMap = {
            'fornecedores': 'fornecedor',
            'plano-de-contas': 'planocontas',
            'ofx-filtros': 'ofxfiltro',
            'pontos-de-recebimento': 'pontorecebimento',
            'empresas': 'empresas',
            'funcionarios': 'funcionarios',
            'portadores': 'portador',
            'gateway-de-pagamento': 'gateway',
            'contador': 'contador',
            'vencimentos': 'vencimento',
            'feriados': 'feriado',
            'contratos': 'contrato',
            'conta-digital': 'contadigital',
            'gerar-lote': 'carne-gerar',
            'imprimir-lotes': 'carne-imprimir',
            'confirmacao-de-entrega': 'carne-entrega',
            'consultar': 'protocolo-list',
            'gerar': 'protocolo-add',
            'cadastrar': pane === 'receber' ? 'receber-add' : (pane === 'pagar' ? 'pagar-add' : ''),
            'cadastrar-nfe': 'pagar-nfe',
            'historico': pane === 'receber' ? 'receber-list' : (pane === 'pagar' ? 'pagar-list' : ''),
            'quitacao': 'declaracao-quitacao',
            'titulos-a-gerar': 'ad-lote',
            'atraso': 'cobranca-atraso',
            'lembrador': 'cobranca-lembrador',
            'spc-serasa': 'cobranca-spc',
            'sms': 'cobranca-sms',
            'email': 'cobranca-email',
            'cartas': 'cobranca-cartas',
            'recorrente': 'cobranca-recorrente',
            'consulta-id': 'pix-e2id',
            'consulta-emv': 'pix-emv'
        };
        var action = actionMap[actionSlug];
        if (!action)
            return;
        setTimeout(function () { handleFinanceAction(action); }, 0);
    }
    function handleFinanceAction(action) {
        if (!action)
            return;
        if (action === 'gateway') {
            openGatewayListModal();
            return;
        }
        if (action === 'carne-gerar') {
            openCarneGerarModal();
            return;
        }
        if (action === 'carne-imprimir') {
            openCarneImprimirModal();
            return;
        }
        if (action === 'carne-entrega') {
            openCarneEntregaModal();
            return;
        }
        if (action === 'fornecedor') {
            openSupplierListModal();
            return;
        }
        if (action === 'planocontas') {
            openChartListModal();
            return;
        }
        if (action === 'pagar-add') {
            openPayableFormModal(null);
            return;
        }
        if (action === 'pagar-nfe') {
            safeShowModal('finance-page-pagar-nfe');
            return;
        }
        if (action === 'pagar-list') {
            openPayableListModal();
            return;
        }
        var extraFinanceMap = {
            ofxfiltro: 'finance-page-ofxfiltro',
            pontorecebimento: 'finance-page-pontorecebimento',
            empresas: 'finance-page-empresas',
            funcionarios: 'finance-page-funcionarios',
            portador: 'finance-page-portador',
            contador: 'finance-page-contador',
            vencimento: 'finance-page-vencimento',
            feriado: 'finance-page-feriado',
            contrato: 'finance-page-contrato',
            contadigital: 'finance-page-contadigital',
            'receber-add': 'finance-page-receber-add',
            'receber-list': 'finance-page-receber-list',
            'protocolo-list': 'finance-page-protocolo-list',
            'protocolo-add': 'finance-page-protocolo-add',
            'declaracao-quitacao': 'finance-page-declaracao-quitacao',
            'ad-lote': 'finance-page-ad-lote',
            'cobranca-atraso': 'finance-page-cobranca-atraso',
            'cobranca-lembrador': 'finance-page-cobranca-lembrador',
            'cobranca-spc': 'finance-page-cobranca-spc',
            'cobranca-sms': 'finance-page-cobranca-sms',
            'cobranca-email': 'finance-page-cobranca-email',
            'cobranca-cartas': 'finance-page-cobranca-cartas',
            'cobranca-recorrente': 'finance-page-cobranca-recorrente',
            'pix-e2id': 'finance-page-pix-e2id',
            'pix-emv': 'finance-page-pix-emv'
        };
        if (extraFinanceMap[action]) {
            safeShowModal(extraFinanceMap[action]);
            return;
        }
    }
    function switchToTab(tab) {
        if (!tab) tab = 'overview';
        function run() {
            var target = document.getElementById('tab-' + tab);
            if (!target) return;
            document.querySelectorAll('[data-page-section="true"]').forEach(function (section) {
                var sectionEl = section as HTMLElement;
                sectionEl.classList.remove('show');
                sectionEl.classList.add('d-none');
                sectionEl.style.display = 'none';
                sectionEl.style.visibility = 'hidden';
                sectionEl.setAttribute('aria-hidden', 'true');
            });
            pageSectionStack.length = 0;
            document.querySelectorAll('.admin-sidebar__nav a').forEach(function (n) { n.classList.remove('active'); });
            var navLink = document.querySelector('.admin-sidebar__nav a[data-tab="' + tab + '"]');
            if (navLink) navLink.classList.add('active');
            document.querySelectorAll('.admin-tab').forEach(function (t) { t.classList.remove('active'); });
            target.classList.add('active');
            var metricsEl = document.querySelector('.admin-metrics');
            if (metricsEl) metricsEl.classList.toggle('d-none', tab !== 'overview');
            runTabLoaders(tab);
        }
        var target = document.getElementById('tab-' + tab);
        if (!target && typeof (window as unknown as { loadTabFragment?: (id: string) => Promise<void> }).loadTabFragment === 'function') {
            (window as unknown as { loadTabFragment: (id: string) => Promise<void> }).loadTabFragment(tab).then(run);
            return;
        }
        run();
    }
    function runTabLoaders(tab) {
        if (tab === 'leads') {
            var _el = document.getElementById('btnLoadLeads');
            if (_el) _el.click();
        }
        else if (tab === 'stand') {
            var _el = document.getElementById('btnLoadStand');
            if (_el) _el.click();
        }
        else if (tab === 'winners') {
            var _el = document.getElementById('btnLoadWinners');
            if (_el) _el.click();
        }
        else if (tab === 'plans')
            loadPlans();
        else if (tab === 'customers') {
            hideCustomerFicha();
            loadCustomersList();
        }
        else if (tab === 'proposals')
            loadProposals();
        else if (tab === 'contracts') {
            loadContracts();
            loadContractModels();
        }
        else if (tab === 'tickets')
            loadSupport();
        else if (tab === 'wifi')
            loadWifi();
        else if (tab === 'campaigns')
            loadCampaigns();
        else if (tab === 'finance') {
            if (typeof loadFinance === 'function') loadFinance();
        }
        else if (tab === 'fiscal')
            loadFiscal();
        else if (tab === 'estoque')
            loadEstoque();
        else if (tab === 'system') {
            loadNas();
            loadRadiusOnlineAndStats();
            if (typeof loadRadiusConfig === 'function')
                loadRadiusConfig();
        }
        else if (tab === 'provider') {
            loadProviderSettings();
            loadReceiptTemplate('pagar');
            var provTab = document.getElementById('tab-provider');
            if (provTab) {
                provTab.scrollIntoView({ behavior: 'instant', block: 'start' });
                var content = document.querySelector('.admin-content');
                if (content) content.scrollTop = 0;
            }
        }
        else if (tab === 'clube')
            loadClubePage();
        else if (tab === 'grupos')
            loadGrupos();
        else if (tab === 'usuarios')
            loadUsuarios();
    }
    /** LÃª o hash (#overview, #plans, #customers/123, etc.) e ativa a aba correspondente. */
    function applyCurrentRoute() {
        var parts = (location.pathname || '').toLowerCase().split('/').filter(Boolean);
        var segment = parts[1] || 'dashboard';
        var rest = parts.slice(2);
        var validTabs = ['overview', 'plans', 'leads', 'customers', 'proposals', 'contracts', 'tickets', 'campaigns', 'stand', 'winners', 'draw', 'wifi', 'finance', 'estoque', 'system', 'provider', 'clube', 'grupos', 'usuarios'];
        var activeTab = routeSegmentToTab(segment);
        if (validTabs.indexOf(activeTab) < 0)
            activeTab = 'overview';
        switchToTab(activeTab);
        // LÃ³gica SPA adicional para rotas internas, hoje focada em Clientes
        if (activeTab === 'customers' && rest.length) {
            // #customers/new  â†’ abre formulÃ¡rio de cadastro de cliente
            if (rest[0] === 'new') {
                if (typeof openNewCustomer === 'function')
                    openNewCustomer();
                return;
            }
            // #customers/123  â†’ abre ficha do cliente 123
            var id = parseInt(rest[0], 10);
            if (!isNaN(id)) {
                if (rest[1] === 'editar') {
                    if (typeof openEditCustomer === 'function')
                        openEditCustomer(id);
                    return;
                }
                if (typeof viewCustomer === 'function')
                    viewCustomer(id);
                // #customers/123/contracts/new  â†’ abre wizard de novo contrato como painel SPA
                if (rest[1] === 'contracts' && rest[2] === 'new') {
                    if (typeof openCadastrarContratoModal === 'function') {
                        openCadastrarContratoModal(id, 'Cliente #' + id);
                    }
                }
            }
        }
        if (activeTab === 'finance') {
            applyFinanceRoute(rest);
        }
    }
    var applyHash = applyCurrentRoute;
    window.addEventListener('popstate', applyCurrentRoute);
    applyHash(); // ao carregar a pÃ¡gina, abrir a aba do hash (ou overview)
    document.querySelectorAll('[data-tab]').forEach(function (a) {
        a.addEventListener('click', function (e) {
            e.preventDefault();
            var tab = this.getAttribute('data-tab');
            navigateToTab(tab);
        });
    });
    function setFiscalMessage(html) {
        var out = document.getElementById('outFiscal');
        if (out)
            out.innerHTML = html;
    }
    function wireFiscalActions() {
        [
            {
                id: 'btnNovaNfcon',
                html: '<div class="alert alert-info mb-0"><strong>NFC-e</strong><br/>Fluxo de emissao rapida em preparacao para o portal do provedor.</div>'
            },
            {
                id: 'btnNovaNfe',
                html: '<div class="alert alert-info mb-0"><strong>NF-e</strong><br/>Fluxo de venda de produtos em preparacao para o portal do provedor.</div>'
            },
            {
                id: 'btnListarNotas',
                html: '<div class="alert alert-info mb-0"><strong>Notas emitidas</strong><br/>A listagem fiscal sera conectada aqui nesta mesma aba.</div>'
            }
        ].forEach(function (action) {
            var btn = document.getElementById(action.id);
            if (!btn || btn.getAttribute('data-wired') === '1')
                return;
            btn.setAttribute('data-wired', '1');
            btn.addEventListener('click', function () {
                setFiscalMessage(action.html);
            });
        });
    }
    function loadFiscal() {
        wireFiscalActions();
        setFiscalMessage('Selecione uma acao acima para comecar a emitir ou consultar notas fiscais.');
    }
    function loadNas() {
        var out = document.getElementById('outNasList');
        if (!out)
            return;
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
        api('/nas').then(function (data) {
            var list = data.nas || [];
            if (!list.length) {
                out.innerHTML = '<p class="text-muted mb-0">Nenhum concentrador cadastrado. Clique em <strong>Cadastrar concentrador</strong> para adicionar.</p>';
                return;
            }
            var onlineCount = list.filter(function (n) { return n.online === true; }).length;
            var summaryEl = document.getElementById('outNasOnlineSummary');
            var countEl = document.getElementById('nasOnlineCount');
            var totalEl = document.getElementById('nasOnlineTotal');
            if (summaryEl && countEl && totalEl) {
                countEl.textContent = onlineCount;
                totalEl.textContent = list.length;
                summaryEl.style.display = list.length ? 'block' : 'none';
            }
            var thead = '<tr><th>Nome</th><th>IP</th><th>DescriÃ§Ã£o</th><th>Ativo</th><th>Status</th><th class="text-end">AÃ§Ãµes</th></tr>';
            var tbody = list.map(function (n) {
                var desc = (n.description || 'â€”').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                var sessions = n.active_sessions != null ? Number(n.active_sessions) : 0;
                var lastAct = n.last_activity ? (String(n.last_activity).replace('T', ' ').slice(0, 16)) : '';
                var online = n.online === true;
                var status = online
                    ? (sessions > 0
                        ? '<span class="badge bg-success" title="' + (lastAct ? 'Ãšltima atividade: ' + lastAct : '') + '">Online (' + sessions + ' sessÃ£o' + (sessions !== 1 ? 'Ãµes' : '') + ')</span>'
                        : '<span class="badge bg-success" title="' + (lastAct ? 'Ãšltima atividade: ' + lastAct : '') + '">Online (atividade recente)</span>')
                    : '<span class="badge bg-secondary" title="Sem sessÃµes nem atividade no RADIUS nos Ãºltimos 15 min">Offline</span>';
                return '<tr><td>' + esc(n.name) + '</td><td><code>' + esc(n.nas_ip) + '</code></td><td class="small">' + desc + '</td><td>' + (n.is_active ? '<span class="badge bg-success">Sim</span>' : '<span class="badge bg-secondary">NÃ£o</span>') + '</td><td>' + status + '</td><td class="text-end"><button type="button" class="btn btn-sm btn-outline-secondary me-1" data-nas-edit data-nas-id="' + esc(n.id) + '" data-nas-name="' + esc(String(n.name || '')).replace(/"/g, '&quot;') + '" data-nas-ip="' + esc(String(n.nas_ip || '')).replace(/"/g, '&quot;') + '" data-nas-desc="' + desc + '" data-nas-active="' + (n.is_active ? '1' : '0') + '">Editar</button><button type="button" class="btn btn-sm btn-outline-danger" data-nas-delete data-nas-id="' + esc(n.id) + '">Excluir</button></td></tr>';
            }).join('');
            out.innerHTML = '<div class="table-responsive"><table class="table table-sm table-hover admin-table"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div>';
            document.querySelectorAll('[data-nas-edit]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    document.getElementById('nasId').value = this.getAttribute('data-nas-id') || '';
                    var nasNameEl = document.getElementById('nasName');
                    var nasIpEl = document.getElementById('nasIp');
                    var nasDescEl = document.getElementById('nasDescription');
                    var nasActiveEl = document.getElementById('nasActive');
                    var nasTitleEl = document.getElementById('modalNasTitle');
                    var nasErrEl = document.getElementById('nasFormError');
                    if (nasNameEl)
                        nasNameEl.value = (this.getAttribute('data-nas-name') || '').replace(/&quot;/g, '"');
                    if (nasIpEl)
                        nasIpEl.value = (this.getAttribute('data-nas-ip') || '').replace(/&quot;/g, '"');
                    if (nasDescEl)
                        nasDescEl.value = (this.getAttribute('data-nas-desc') || '').replace(/&quot;/g, '"');
                    if (nasActiveEl)
                        nasActiveEl.checked = this.getAttribute('data-nas-active') === '1';
                    if (nasTitleEl)
                        nasTitleEl.textContent = 'Editar concentrador';
                    if (nasErrEl)
                        nasErrEl.classList.add('d-none');
                    showNasForm();
                });
            });
            document.querySelectorAll('[data-nas-delete]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = this.getAttribute('data-nas-id');
                    if (!id || !confirm('Excluir este concentrador?'))
                        return;
                    api('/nas/' + id, { method: 'DELETE' }).then(function () { loadNas(); }).catch(function (err) { alert(err.message); });
                });
            });
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    var btnLoadNas = document.getElementById('btnLoadNas');
    if (btnLoadNas)
        btnLoadNas.addEventListener('click', function () { loadNas(); });
    var btnSyncNas = document.getElementById('btnSyncNas');
    if (btnSyncNas)
        btnSyncNas.addEventListener('click', function () {
            btnSyncNas.disabled = true;
            api('/nas/sync', { method: 'POST' }).then(function (data) {
                alert('Sincronizados ' + (data.synced || 0) + ' concentrador(es) com a tabela nas do FreeRADIUS.');
                loadNas();
            }).catch(function (err) { alert(err.message || 'Erro ao sincronizar.'); }).finally(function () { btnSyncNas.disabled = false; });
        });
    function showNasForm() {
        var list = document.getElementById('outNasList');
        var form = document.getElementById('nasFormSection');
        if (list)
            list.style.display = 'none';
        if (form)
            form.style.display = 'block';
    }
    function hideNasForm() {
        var list = document.getElementById('outNasList');
        var form = document.getElementById('nasFormSection');
        if (list)
            list.style.display = '';
        if (form)
            form.style.display = 'none';
    }
    var btnNasVoltar = document.getElementById('btnNasFormVoltar');
    if (btnNasVoltar)
        btnNasVoltar.addEventListener('click', hideNasForm);
    var btnNewNas = document.getElementById('btnNewNas');
    if (btnNewNas)
        btnNewNas.addEventListener('click', function () {
            var nasIdEl = document.getElementById('nasId');
            var nasNameEl = document.getElementById('nasName');
            var nasIpEl = document.getElementById('nasIp');
            var nasDescEl = document.getElementById('nasDescription');
            var nasActiveEl = document.getElementById('nasActive');
            var nasTitleEl = document.getElementById('modalNasTitle');
            var nasErrEl = document.getElementById('nasFormError');
            if (nasIdEl)
                nasIdEl.value = '';
            if (nasNameEl)
                nasNameEl.value = '';
            if (nasIpEl)
                nasIpEl.value = '';
            if (nasDescEl)
                nasDescEl.value = '';
            if (nasActiveEl)
                nasActiveEl.checked = true;
            if (nasTitleEl)
                nasTitleEl.textContent = 'Novo concentrador';
            if (nasErrEl)
                nasErrEl.classList.add('d-none');
            showNasForm();
        });
    var btnSaveNasEl = document.getElementById('btnSaveNas');
    if (btnSaveNasEl)
        btnSaveNasEl.addEventListener('click', function () {
            var id = document.getElementById('nasId').value;
            var name = (document.getElementById('nasName').value || '').trim();
            var nasIp = (document.getElementById('nasIp').value || '').trim();
            var description = (document.getElementById('nasDescription').value || '').trim();
            var isActive = document.getElementById('nasActive').checked;
            var errEl = document.getElementById('nasFormError');
            if (!name) {
                errEl.textContent = 'Informe o nome.';
                errEl.classList.remove('d-none');
                return;
            }
            if (!nasIp) {
                errEl.textContent = 'Informe o IP do NAS.';
                errEl.classList.remove('d-none');
                return;
            }
            errEl.classList.add('d-none');
            var btn = document.getElementById('btnSaveNas');
            var origHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvando...';
            var done = function () {
                btn.disabled = false;
                btn.innerHTML = origHtml;
                hideNasForm();
                loadNas();
            };
            if (id) {
                api('/nas/' + id, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name, nas_ip: nasIp, description: description || null, is_active: isActive })
                }).then(done).catch(function (err) {
                    btn.disabled = false;
                    btn.innerHTML = origHtml;
                    errEl.textContent = err.message || 'Erro ao salvar.';
                    errEl.classList.remove('d-none');
                });
            }
            else {
                api('/nas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name, nas_ip: nasIp, description: description || null, is_active: isActive })
                }).then(done).catch(function (err) {
                    btn.disabled = false;
                    btn.innerHTML = origHtml;
                    errEl.textContent = err.message || 'Erro ao salvar.';
                    errEl.classList.remove('d-none');
                });
            }
        });
    function loadPlans() {
        var outPlansEl = document.getElementById('outPlans');
        if (!outPlansEl)
            return;
        setLoading('outPlans');
        api('/plans').then(function (data) {
            var out = document.getElementById('outPlans');
            if (!out)
                return;
            var plans = data.plans || [];
            plansCache = plans;
            updatePlansSummary(plans);
            var filteredPlans = getFilteredPlans(plans);
            if (!filteredPlans.length) {
                out.innerHTML = '<p class="text-muted mb-0">Nenhum plano encontrado para os filtros atuais.</p>';
                return;
            }
            var html = renderTable(filteredPlans, [
                { key: 'code', label: 'Codigo' },
                {
                    key: 'speed_display',
                    label: 'Velocidade',
                    render: function (_v, r) {
                        return '<strong>' + esc(getPlanSpeedLabel(r)) + '</strong>';
                    },
                    raw: true
                },
                { key: 'price', label: 'Preco (R$/mes)', render: function (v, r) { var n = v != null ? Number(v) : (r.price != null ? Number(r.price) : null); return n != null && !isNaN(n) ? 'R$ ' + n.toFixed(2).replace('.', ',') : '?'; } },
                { key: 'tagline', label: 'Posicionamento', render: function (v, r) { return renderPlanInfo(v, r); }, raw: true },
                { key: 'badge', label: 'Status', render: function (_v, r) { return renderPlanStatusCell(r); }, raw: true },
                { key: 'quota_gb', label: 'RADIUS', render: function (_v, r) { return renderPlanRadiusCell(r); }, raw: true }
            ], function (r) {
                var id = r.id;
                var active = r.active !== false && r.active !== 0 && r.active !== '0';
                return ''
                    + '<div class="d-flex gap-1 flex-wrap justify-content-end">'
                    + '<button type="button" class="btn btn-sm btn-outline-secondary btn-edit-plan" data-plan-id="' + id + '">Editar</button>'
                    + '<button type="button" class="btn btn-sm btn-outline-primary btn-duplicate-plan" data-plan-id="' + id + '">Duplicar</button>'
                    + '<button type="button" class="btn btn-sm ' + (active ? 'btn-outline-danger' : 'btn-outline-success') + ' btn-toggle-plan" data-plan-id="' + id + '" data-plan-active="' + (active ? '1' : '0') + '">' + (active ? 'Inativar' : 'Ativar') + '</button>'
                    + '</div>';
            }, 'Acoes');
            out.innerHTML = html;
        }).catch(function (err) {
            var out = document.getElementById('outPlans');
            if (out)
                out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    function getPlanBadgeLabel(v) {
        return v ? (v === 'popular' ? 'Mais escolhido' : 'Top') : 'Sem destaque';
    }
    function getPlanSpeedLabel(r) {
        var d = r.speed_download_mbps;
        var u = r.speed_upload_mbps;
        if (d != null || u != null)
            return (d || '?') + '/' + (u || '?') + ' Mbps';
        return r.speed_display ? r.speed_display + ' ' + (r.unit || '') : '?';
    }
    function renderPlanInfo(v, r) {
        var tagline = v || 'Sem tagline';
        var badge = getPlanBadgeLabel(r.badge || '');
        return '<div><div class="fw-semibold">' + esc(tagline) + '</div><div class="small text-muted">' + esc(badge) + ' ? ' + esc(getPlanSpeedLabel(r)) + '</div></div>';
    }
    function renderPlanStatusCell(r) {
        var active = r.active !== false && r.active !== 0 && r.active !== '0';
        var parts = ['<span class="badge ' + (active ? 'bg-success' : 'bg-secondary') + '">' + (active ? 'Ativo' : 'Inativo') + '</span>'];
        if (r.badge) parts.push('<span class="badge bg-primary-subtle text-primary border border-primary-subtle">' + esc(getPlanBadgeLabel(r.badge)) + '</span>');
        if (r.block_auto) parts.push('<span class="badge bg-warning text-dark">Bloqueio automatico</span>');
        return parts.join(' ');
    }
    function renderPlanRadiusCell(r) {
        var bits = [];
        if (r.quota_gb != null && r.quota_gb !== '') bits.push('Franquia: ' + esc(String(r.quota_gb)) + ' GB/' + esc(r.quota_period || 'monthly'));
        if (r.framed_pool) bits.push('Pool: ' + esc(r.framed_pool));
        if (r.vlan_id != null && r.vlan_id !== '') bits.push('VLAN: ' + esc(String(r.vlan_id)));
        if (!bits.length) return '<span class="text-muted">Padrao</span>';
        return '<div class="small">' + bits.join('<br>') + '</div>';
    }
    function updatePlansSummary(plans) {
        var totalEl = document.getElementById('plansStatTotal');
        var activeEl = document.getElementById('plansStatActive');
        var blockEl = document.getElementById('plansStatBlocked');
        var total = plans.length;
        var active = plans.filter(function (p) { return p.active !== false && p.active !== 0 && p.active !== '0'; }).length;
        var blocked = plans.filter(function (p) { return !!p.block_auto; }).length;
        if (totalEl) totalEl.textContent = total + ' plano' + (total === 1 ? '' : 's');
        if (activeEl) activeEl.textContent = active + ' ativo' + (active === 1 ? '' : 's');
        if (blockEl) blockEl.textContent = blocked + ' com bloqueio';
    }
    function getFilteredPlans(plans) {
        var search = (((document.getElementById('plansSearch') || {}).value) || '').toString().trim().toLowerCase();
        var status = (((document.getElementById('plansStatusFilter') || {}).value) || 'all').toString();
        var badge = (((document.getElementById('plansBadgeFilter') || {}).value) || '').toString();
        return plans.filter(function (plan) {
            var active = plan.active !== false && plan.active !== 0 && plan.active !== '0';
            if (status === 'active' && !active) return false;
            if (status === 'inactive' && active) return false;
            if (badge === 'none' && plan.badge) return false;
            if (badge && badge !== 'none' && String(plan.badge || '') !== badge) return false;
            if (!search) return true;
            var haystack = [plan.code, plan.speed_display, plan.unit, plan.tagline, plan.badge, plan.block_radius_group, Array.isArray(plan.features_json) ? plan.features_json.join(' ') : plan.features_json].join(' ').toLowerCase();
            return haystack.indexOf(search) >= 0;
        });
    }
    var nasCache = [];
    function setPlanField(id, value) {
        var el = document.getElementById(id);
        if (el)
            el.value = value != null && value !== '' ? value : '';
    }
    function setPlanFieldChecked(id, checked) {
        var el = document.getElementById(id);
        if (el)
            el.checked = !!checked;
    }
    function fillPlanForm(id) {
        var titleEl = document.getElementById('modalPlanTitle');
        if (titleEl)
            titleEl.textContent = id ? 'Editar plano' : 'Novo plano';
        var planIdEl = document.getElementById('planId');
        if (planIdEl)
            planIdEl.value = id || '';
        var p = id ? plansCache.find(function (x) { return x.id == id; }) : null;
        setPlanField('planCode', p ? p.code : '');
        setPlanField('planSpeedDisplay', p ? p.speed_display : '');
        setPlanField('planUnit', p ? p.unit : 'Mega');
        setPlanField('planTagline', p ? p.tagline : '');
        var fs = p ? p.features_json : [];
        var featuresVal = Array.isArray(fs) ? fs.join('\n') : (typeof fs === 'string' ? (function () {
            try {
                return JSON.parse(fs).join('\n');
            }
            catch (e) {
                return fs;
            }
        })() : '');
        setPlanField('planFeatures', featuresVal);
        setPlanField('planBadge', p ? p.badge : '');
        setPlanField('planSortOrder', p && p.sort_order != null ? p.sort_order : 0);
        setPlanFieldChecked('planActive', p ? (p.active !== false && p.active !== 0 && p.active !== '0') : true);
        setPlanField('planPrice', p && p.price != null ? p.price : '');
        setPlanField('planSpeedDownload', p && p.speed_download_mbps != null ? p.speed_download_mbps : '');
        setPlanField('planSpeedUpload', p && p.speed_upload_mbps != null ? p.speed_upload_mbps : '');
        setPlanFieldChecked('planBlockAuto', p ? p.block_auto : false);
        setPlanField('planBlockDays', p && p.block_days_after_due != null ? p.block_days_after_due : 5);
        setPlanField('planBlockRadiusGroup', p ? p.block_radius_group : 'bloqueado');
        setPlanField('planQuotaGb', p && p.quota_gb != null ? p.quota_gb : '');
        setPlanField('planQuotaPeriod', p ? p.quota_period : 'monthly');
        setPlanField('planQuotaExceededGroup', p ? p.quota_exceeded_group : '');
        setPlanField('planFramedPool', p ? p.framed_pool : '');
        setPlanField('planVlanId', p && p.vlan_id != null ? p.vlan_id : '');
        setPlanField('planBlockRedirectUrl', p ? p.block_redirect_url : '');
        var deleteBtn = document.getElementById('btnDeletePlan');
        if (deleteBtn)
            deleteBtn.classList.toggle('d-none', !p);
        api('/nas').then(function (data) {
            nasCache = data.nas || [];
            var out = document.getElementById('planNasCheckboxes');
            if (!out)
                return;
            var nasIds = p && p.nas_ids ? (Array.isArray(p.nas_ids) ? p.nas_ids : []) : [];
            out.innerHTML = nasCache.length ? nasCache.map(function (n) {
                var checked = nasIds.indexOf(n.id) >= 0 ? ' checked' : '';
                return '<div class="form-check form-check-inline"><input type="checkbox" class="form-check-input plan-nas-cb" id="plan_nas_' + n.id + '" value="' + esc(n.id) + '"' + checked + '><label class="form-check-label small" for="plan_nas_' + n.id + '">' + esc(n.name || n.nas_ip) + '</label></div>';
            }).join('') : '<span class="text-muted small">Nenhum concentrador cadastrado.</span>';
        }).catch(function () {
            var nasOut = document.getElementById('planNasCheckboxes');
            if (nasOut)
                nasOut.innerHTML = '<span class="text-muted small">Erro ao carregar concentradores.</span>';
        });
    }
    function showPlanForm() {
        var list = document.getElementById('outPlans');
        var form = document.getElementById('planFormSection');
        if (list)
            list.style.display = 'none';
        if (form)
            form.style.display = 'block';
    }
    function hidePlanForm() {
        var list = document.getElementById('outPlans');
        var form = document.getElementById('planFormSection');
        if (list)
            list.style.display = '';
        if (form)
            form.style.display = 'none';
    }
    function openPlanModal(id) {
        var form = document.getElementById('planFormSection');
        if (!form)
            return;
        showPlanForm();
        fillPlanForm(id);
    }
    window.openPlanModal = openPlanModal;
    function runPlanAction(button, path, loadingHtml, idleHtml, successMessage, resultKey) {
        button.disabled = true;
        button.innerHTML = loadingHtml;
        api(path, { method: 'POST' }).then(function (data) {
            button.disabled = false;
            button.innerHTML = idleHtml;
            alert(successMessage + ' ' + (data[resultKey] || 0) + ' item(ns).');
            loadStats();
            loadPlans();
        }).catch(function (err) {
            button.disabled = false;
            button.innerHTML = idleHtml;
            alert(err.message);
        });
    }
    function savePlan() {
        var id = document.getElementById('planId').value;
        var code = document.getElementById('planCode').value.trim();
        var speedDisplay = document.getElementById('planSpeedDisplay').value.trim() || code;
        var unit = document.getElementById('planUnit').value;
        var tagline = document.getElementById('planTagline').value.trim();
        var featuresText = document.getElementById('planFeatures').value.trim();
        var features = featuresText ? featuresText.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) : [];
        var badge = document.getElementById('planBadge').value;
        var nasIds = [];
        document.querySelectorAll('.plan-nas-cb:checked').forEach(function (cb) {
            var v = parseInt(cb.value, 10);
            if (!isNaN(v)) nasIds.push(v);
        });
        if (!code) {
            alert('Codigo obrigatorio');
            return;
        }
        var priceVal = document.getElementById('planPrice').value.trim();
        var body = { code: code, speed_display: speedDisplay, unit: unit, tagline: tagline, features_json: features, badge: badge };
        body.sort_order = parseInt((((document.getElementById('planSortOrder') || {}).value) || '0').toString(), 10) || 0;
        body.active = !!((document.getElementById('planActive') || {}).checked);
        if (priceVal) body.price = parseFloat(priceVal);
        var d = document.getElementById('planSpeedDownload').value.trim();
        var u = document.getElementById('planSpeedUpload').value.trim();
        if (d) body.speed_download_mbps = parseInt(d, 10);
        if (u) body.speed_upload_mbps = parseInt(u, 10);
        body.nas_ids = nasIds.length ? nasIds : null;
        body.block_auto = document.getElementById('planBlockAuto').checked;
        body.block_days_after_due = parseInt(document.getElementById('planBlockDays').value, 10) || 5;
        body.block_radius_group = (document.getElementById('planBlockRadiusGroup').value || 'bloqueado').trim();
        var qGb = (document.getElementById('planQuotaGb') || {}).value;
        if (qGb !== undefined) body.quota_gb = qGb === '' ? null : parseFloat(qGb);
        body.quota_period = (document.getElementById('planQuotaPeriod') || {}).value || 'monthly';
        body.quota_exceeded_group = ((document.getElementById('planQuotaExceededGroup') || {}).value || 'reduzido_10m').trim();
        var fp = (document.getElementById('planFramedPool') || {}).value;
        if (fp !== undefined) body.framed_pool = fp ? fp.trim() : null;
        var vlan = (document.getElementById('planVlanId') || {}).value;
        if (vlan !== undefined) body.vlan_id = vlan === '' ? null : parseInt(vlan, 10);
        var redirectUrl = (document.getElementById('planBlockRedirectUrl') || {}).value;
        if (redirectUrl !== undefined) body.block_redirect_url = redirectUrl ? redirectUrl.trim() : null;
        var p = id ? api('/plans/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) : api('/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        p.then(function () {
            hidePlanForm();
            loadPlans();
            loadStats();
        }).catch(function (err) { alert(err.message); });
    }
    function duplicatePlan(id) {
        var plan = plansCache.find(function (x) { return x.id == id; });
        if (!plan) return;
        openPlanModal(null);
        setPlanField('planCode', (plan.code || '') + '_copy');
        setPlanField('planSpeedDisplay', plan.speed_display || '');
        setPlanField('planUnit', plan.unit || 'Mega');
        setPlanField('planTagline', plan.tagline || '');
        setPlanField('planFeatures', Array.isArray(plan.features_json) ? plan.features_json.join('\n') : '');
        setPlanField('planBadge', plan.badge || '');
        setPlanField('planSortOrder', plan.sort_order != null ? plan.sort_order + 1 : 0);
        setPlanFieldChecked('planActive', true);
        setPlanField('planPrice', plan.price != null ? plan.price : '');
        setPlanField('planSpeedDownload', plan.speed_download_mbps != null ? plan.speed_download_mbps : '');
        setPlanField('planSpeedUpload', plan.speed_upload_mbps != null ? plan.speed_upload_mbps : '');
        setPlanFieldChecked('planBlockAuto', !!plan.block_auto);
        setPlanField('planBlockDays', plan.block_days_after_due != null ? plan.block_days_after_due : 5);
        setPlanField('planBlockRadiusGroup', plan.block_radius_group || 'bloqueado');
        setPlanField('planQuotaGb', plan.quota_gb != null ? plan.quota_gb : '');
        setPlanField('planQuotaPeriod', plan.quota_period || 'monthly');
        setPlanField('planQuotaExceededGroup', plan.quota_exceeded_group || '');
        setPlanField('planFramedPool', plan.framed_pool || '');
        setPlanField('planVlanId', plan.vlan_id != null ? plan.vlan_id : '');
        setPlanField('planBlockRedirectUrl', plan.block_redirect_url || '');
    }
    function togglePlanActive(id, activeNow) {
        if (!id) return;
        var nextActive = !activeNow;
        api('/plans/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: nextActive }) }).then(function () {
            loadPlans();
            loadStats();
        }).catch(function (err) { alert(err.message); });
    }
    function deletePlan(id) {
        if (!id || !confirm('Inativar este plano?')) return;
        api('/plans/' + id, { method: 'DELETE' }).then(function () {
            hidePlanForm();
            loadPlans();
            loadStats();
        }).catch(function (err) { alert(err.message); });
    }
    document.addEventListener('click', function (e) {
        var target = e.target;
        if (!target || typeof target.closest !== 'function') return;
        var btnAdd = target.closest('#btnAddPlan');
        if (btnAdd) {
            e.preventDefault();
            openPlanModal(null);
            return;
        }
        var btnReload = target.closest('#btnReloadPlans');
        if (btnReload) {
            e.preventDefault();
            loadPlans();
            return;
        }
        var btnCancel = target.closest('#btnPlanFormVoltar, #btnCancelPlan');
        if (btnCancel) {
            e.preventDefault();
            hidePlanForm();
            return;
        }
        var btnEdit = target.closest('.btn-edit-plan');
        if (btnEdit) {
            e.preventDefault();
            var idEdit = Number(btnEdit.getAttribute('data-plan-id'));
            if (idEdit) openPlanModal(idEdit);
            return;
        }
        var btnDuplicate = target.closest('.btn-duplicate-plan');
        if (btnDuplicate) {
            e.preventDefault();
            duplicatePlan(Number(btnDuplicate.getAttribute('data-plan-id')));
            return;
        }
        var btnToggle = target.closest('.btn-toggle-plan');
        if (btnToggle) {
            e.preventDefault();
            togglePlanActive(Number(btnToggle.getAttribute('data-plan-id')), btnToggle.getAttribute('data-plan-active') === '1');
            return;
        }
        var btnDelete = target.closest('#btnDeletePlan');
        if (btnDelete) {
            e.preventDefault();
            deletePlan(Number((document.getElementById('planId') || {}).value || 0));
            return;
        }
        var btnSave = target.closest('#btnSavePlan');
        if (btnSave) {
            e.preventDefault();
            savePlan();
            return;
        }
        var btnBlock = target.closest('#btnBlockOverdue');
        if (btnBlock) {
            e.preventDefault();
            runPlanAction(btnBlock, '/block-overdue', '<span class="spinner-border spinner-border-sm me-1"></span>Executando...', '<i class="bi bi-shield-lock"></i> Executar bloqueio', 'Bloqueio executado.', 'blocked');
            return;
        }
        var btnUnblock = target.closest('#btnUnblockPaid');
        if (btnUnblock) {
            e.preventDefault();
            runPlanAction(btnUnblock, '/unblock-paid', '<span class="spinner-border spinner-border-sm me-1"></span>Executando...', '<i class="bi bi-shield-check"></i> Desbloquear quitados', 'Desbloqueio executado.', 'unblocked');
        }
    });
    document.addEventListener('input', function (e) {
        var target = e.target;
        if (!target || !target.id) return;
        if (target.id === 'plansSearch') loadPlans();
    });
    document.addEventListener('change', function (e) {
        var target = e.target;
        if (!target || !target.id) return;
        if (target.id === 'plansStatusFilter' || target.id === 'plansBadgeFilter') loadPlans();
    });
    safeOn('btnLoadLeads', 'click', function () {
        setLoading('outLeads');
        api('/leads').then(function (data) {
            var statusBadge = function (v) {
                var c = { NEW: 'secondary', CONTACTED: 'info', SCHEDULED: 'primary', INSTALLED: 'success', CANCELLED: 'danger' }[v] || 'secondary';
                return '<span class="badge bg-' + c + '">' + esc(v) + '</span>';
            };
            document.getElementById('outLeads').innerHTML = renderTable(data.rows, [
                { key: 'created_at', label: 'Data' },
                { key: 'protocol', label: 'Protocolo' },
                { key: 'plan_code', label: 'Plano' },
                { key: 'customer_name', label: 'Cliente' },
                { key: 'whatsapp', label: 'WhatsApp' },
                { key: 'vencimento', label: 'Venc.' },
                { key: 'status', label: 'Status', render: statusBadge, raw: true },
            ], function (r) {
                return '<button type="button" class="btn btn-sm btn-outline-secondary" data-view-lead="' + r.id + '">Ver</button>';
            }, 'AÃ§Ãµes');
            document.querySelectorAll('[data-view-lead]').forEach(function (btn) {
                btn.addEventListener('click', function () { viewLead(Number(this.getAttribute('data-view-lead'))); });
            });
        }).catch(function (err) {
            document.getElementById('outLeads').innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    });
    function viewLead(id) {
        currentLeadId = id;
        api('/leads/' + id).then(function (data) {
            var l = data.lead;
            var raw = l.raw_payload_json;
            try {
                raw = typeof raw === 'string' ? JSON.parse(raw) : raw;
            }
            catch (e) { }
            var addr = l.address_json;
            try {
                addr = typeof addr === 'string' ? JSON.parse(addr) : addr;
            }
            catch (e) { }
            var html = '<dl class="row small mb-0">' +
                '<dt class="col-sm-3">Protocolo</dt><dd class="col-sm-9">' + esc(l.protocol) + '</dd>' +
                '<dt class="col-sm-3">Plano</dt><dd class="col-sm-9">' + esc(l.plan_code) + '</dd>' +
                '<dt class="col-sm-3">Cliente</dt><dd class="col-sm-9">' + esc(l.customer_name) + '</dd>' +
                '<dt class="col-sm-3">CPF/CNPJ</dt><dd class="col-sm-9">' + esc(l.cpf_cnpj) + '</dd>' +
                '<dt class="col-sm-3">WhatsApp</dt><dd class="col-sm-9">' + esc(l.whatsapp) + '</dd>' +
                '<dt class="col-sm-3">Email</dt><dd class="col-sm-9">' + esc(l.email || 'â€”') + '</dd>' +
                '<dt class="col-sm-3">Vencimento</dt><dd class="col-sm-9">' + esc(l.vencimento) + '</dd>' +
                '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' + esc(l.status) + '</dd>' +
                '<dt class="col-sm-3">Data</dt><dd class="col-sm-9">' + esc(l.created_at) + '</dd>';
            if (addr && typeof addr === 'object') {
                html += '<dt class="col-sm-3">EndereÃ§o</dt><dd class="col-sm-9">' + esc(JSON.stringify(addr, null, 2)) + '</dd>';
            }
            html += '</dl>';
            if (l.notes)
                html += '<p class="mt-2"><strong>ObservaÃ§Ãµes:</strong> ' + esc(l.notes) + '</p>';
            var bodyEl = document.getElementById('modalLeadBody');
            var leadSelect = document.getElementById('leadStatusSelect');
            if (bodyEl)
                bodyEl.innerHTML = html;
            if (leadSelect)
                leadSelect.value = l.status || 'NEW';
            safeShowModal('modalLead');
        }).catch(function (err) { alert(err.message); });
    }
    safeOn('btnSaveLeadStatus', 'click', function () {
        if (!currentLeadId)
            return;
        var statusEl = document.getElementById('leadStatusSelect');
        var status = statusEl ? statusEl.value : '';
        api('/leads/' + currentLeadId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: status }) }).then(function () {
            safeHideModal('modalLead');
            document.getElementById('btnLoadLeads').click();
            loadStats();
        }).catch(function (err) { alert(err.message); });
    });
    function loadProposals() {
        var out = document.getElementById('outProposals');
        if (!out)
            return;
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
        api('/proposals').then(function (data) {
            var rows = data.rows || [];
            var statusBadge = function (v) {
                var c = { DRAFT: 'secondary', SENT: 'info', APPROVED: 'success', REJECTED: 'danger', CONVERTED: 'primary' }[v] || 'secondary';
                return '<span class="badge bg-' + c + '">' + esc(v || 'DRAFT') + '</span>';
            };
            if (!rows.length) {
                out.innerHTML = '<p class="text-muted mb-0">Nenhuma proposta. Clique em <strong>Nova proposta</strong> para criar.</p>';
                return;
            }
            out.innerHTML = renderTable(rows, [
                { key: 'id', label: '#' },
                { key: 'customer_name', label: 'Cliente', render: function (v) { return v || 'â€”'; } },
                { key: 'plan_code', label: 'Plano' },
                { key: 'amount', label: 'Valor', render: function (v) { return v != null ? 'R$ ' + Number(v).toFixed(2) : 'â€”'; } },
                { key: 'valid_until', label: 'VÃ¡lida atÃ©' },
                { key: 'status', label: 'Status', render: statusBadge, raw: true },
                { key: 'created_at', label: 'Criada em' },
            ], function (r) {
                var btns = '<button type="button" class="btn btn-sm btn-outline-secondary me-1" data-proposal-status="' + r.id + '">Alterar status</button>';
                if (r.status === 'APPROVED') {
                    btns += '<button type="button" class="btn btn-sm btn-success" data-proposal-emit="' + r.id + '"><i class="bi bi-file-earmark-check me-1"></i>Emitir contrato</button>';
                }
                if (r.status === 'APPROVED') {
                    btns += ' <button type="button" class="btn btn-sm btn-primary" data-proposal-convert="' + r.id + '"><i class="bi bi-tools me-1"></i>Converter em OS</button>';
                }
                return btns;
            }, 'AÃ§Ãµes');
            document.querySelectorAll('[data-proposal-status]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = Number(this.getAttribute('data-proposal-status'));
                    var status = prompt('Novo status (DRAFT, SENT, APPROVED, REJECTED, CONVERTED):', 'APPROVED');
                    if (!status)
                        return;
                    api('/proposals/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: status.trim().toUpperCase() }) }).then(function (res) {
                        loadProposals();
                        if (res.serviceOrderId)
                            alert('Ordem de serviÃ§o #' + res.serviceOrderId + ' criada.');
                    }).catch(function (err) { alert(err.message); });
                });
            });
            document.querySelectorAll('[data-proposal-emit]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = Number(this.getAttribute('data-proposal-emit'));
                    api('/proposals/' + id + '/emit-contract', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).then(function (res) {
                        loadProposals();
                        loadContracts();
                        alert('Contrato #' + res.id + ' emitido.');
                    }).catch(function (err) { alert(err.message); });
                });
            });
            document.querySelectorAll('[data-proposal-convert]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = Number(this.getAttribute('data-proposal-convert'));
                    if (!confirm('Converter proposta em Ordem de ServiÃ§o? O status serÃ¡ alterado para CONVERTED.'))
                        return;
                    api('/proposals/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'CONVERTED' }) }).then(function (res) {
                        loadProposals();
                        loadSupport();
                        if (res.serviceOrderId)
                            alert('Proposta convertida. OS #' + res.serviceOrderId + ' criada.');
                    }).catch(function (err) { alert(err.message); });
                });
            });
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    function loadContracts() {
        var out = document.getElementById('outContracts');
        if (!out)
            return;
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
        api('/contracts').then(function (data) {
            var rows = data.rows || [];
            var statusBadge = function (v) {
                var c = { DRAFT: 'secondary', ACTIVE: 'success', SUSPENDED: 'warning', CANCELLED: 'danger', EXPIRED: 'dark' }[v] || 'secondary';
                return '<span class="badge bg-' + c + '">' + esc(v || 'DRAFT') + '</span>';
            };
            if (!rows.length) {
                out.innerHTML = '<p class="text-muted mb-0">Nenhum contrato emitido ainda.</p>';
                return;
            }
            out.innerHTML = renderTable(rows, [
                { key: 'id', label: '#' },
                { key: 'customer_name', label: 'Cliente', render: function (v) { return v || 'Ã¢â‚¬â€'; } },
                { key: 'plan_code', label: 'Plano', render: function (v) { return v || 'Ã¢â‚¬â€'; } },
                { key: 'amount', label: 'Valor', render: function (v) { return v != null ? 'R$ ' + Number(v).toFixed(2) : 'Ã¢â‚¬â€'; } },
                { key: 'due_day', label: 'Vencimento', render: function (v) { return v ? 'Dia ' + v : 'Ã¢â‚¬â€'; } },
                { key: 'status', label: 'Status', render: statusBadge, raw: true },
                { key: 'starts_at', label: 'InÃ­cio', render: function (v) { return v || 'Ã¢â‚¬â€'; } },
                { key: 'created_at', label: 'Criado em', render: function (v) { return v || 'Ã¢â‚¬â€'; } },
            ]);
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    function getContractModelEditor() {
        var el = document.getElementById('contractModelEditor');
        if (!el)
            return null;
        if (window.Quill) {
            if (!contractModelEditor || contractModelEditor.root !== el.querySelector('.ql-editor')) {
                el.innerHTML = '';
                contractModelEditor = new window.Quill(el, {
                    theme: 'snow',
                    placeholder: 'Escreva o modelo de contrato aqui...',
                    modules: {
                        toolbar: [
                            [{ header: [1, 2, 3, false] }],
                            ['bold', 'italic', 'underline'],
                            [{ list: 'ordered' }, { list: 'bullet' }],
                            ['blockquote', 'link'],
                            ['clean']
                        ]
                    }
                });
            }
            return contractModelEditor;
        }
        if (!el.getAttribute('contenteditable')) {
            el.setAttribute('contenteditable', 'true');
            el.classList.add('form-control');
            el.style.minHeight = '320px';
            el.style.background = '#fff';
        }
        return {
            root: el,
            clipboard: {
                dangerouslyPasteHTML: function (html) {
                    el.innerHTML = html || '';
                }
            },
            getSelection: function () {
                return { index: (el.textContent || '').length };
            },
            insertText: function (_index, text) {
                el.innerHTML += esc(text);
            }
        };
    }
    function getContractModelHtml() {
        var editor = getContractModelEditor();
        if (!editor)
            return '';
        var root = editor.root || document.getElementById('contractModelEditor');
        return root ? String(root.innerHTML || '').trim() : '';
    }
    function setContractModelHtml(html) {
        var editor = getContractModelEditor();
        if (!editor)
            return;
        if (editor.clipboard && typeof editor.clipboard.dangerouslyPasteHTML === 'function') {
            editor.clipboard.dangerouslyPasteHTML(html || '');
            return;
        }
        var root = editor.root || document.getElementById('contractModelEditor');
        if (root)
            root.innerHTML = html || '';
    }
    function openContractModelModal(model) {
        var idEl = document.getElementById('contractModelId');
        var titleEl = document.getElementById('contractModelModalTitle');
        var nameEl = document.getElementById('contractModelName');
        var descEl = document.getElementById('contractModelDescription');
        var defaultEl = document.getElementById('contractModelIsDefault');
        if (idEl)
            idEl.value = model && model.id ? String(model.id) : '';
        if (titleEl)
            titleEl.textContent = model && model.id ? 'Editar modelo de contrato' : 'Novo modelo de contrato';
        if (nameEl)
            nameEl.value = model && model.name ? model.name : '';
        if (descEl)
            descEl.value = model && model.description ? model.description : '';
        if (defaultEl)
            defaultEl.checked = !!(model && model.is_default);
        setContractModelHtml(model && model.body_html ? model.body_html : '');
        safeShowModal('modalContractModel');
    }
    function loadContractModels() {
        var out = document.getElementById('outContractModels');
        if (!out)
            return;
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando modelos...';
        api('/contract-templates').then(function (data) {
            var rows = Array.isArray(data.rows) ? data.rows : [];
            contractModelsCache = rows.slice();
            if (!rows.length) {
                out.innerHTML = '<div class="text-muted">Nenhum modelo de contrato cadastrado ainda.</div>';
                return;
            }
            var html = rows.map(function (row) {
                var status = row.is_active === false
                    ? '<span class="badge bg-secondary">Inativo</span>'
                    : (row.is_default
                        ? '<span class="badge bg-success">PadrÃ£o</span>'
                        : '<span class="badge bg-primary-subtle text-primary">Ativo</span>');
                return '<div class="admin-panel mb-2">'
                    + '<div class="admin-panel__body d-flex justify-content-between align-items-start flex-wrap gap-3">'
                    + '<div class="flex-grow-1">'
                    + '<div class="d-flex align-items-center gap-2 flex-wrap mb-1"><strong>' + esc(row.name || ('Modelo ' + row.id)) + '</strong>' + status + '</div>'
                    + '<div class="small text-muted mb-2">' + esc(row.description || 'Sem descriÃ§Ã£o cadastrada.') + '</div>'
                    + '<div class="small text-muted">ID #' + esc(row.id) + '</div>'
                    + '</div>'
                    + '<div class="d-flex gap-2 flex-wrap">'
                    + '<button type="button" class="btn btn-sm btn-outline-primary" data-contract-model-edit="' + esc(row.id) + '">Editar</button>'
                    + '<button type="button" class="btn btn-sm btn-outline-danger" data-contract-model-deactivate="' + esc(row.id) + '">Desativar</button>'
                    + '</div>'
                    + '</div>'
                    + '</div>';
            }).join('');
            out.innerHTML = html;
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    function saveContractModel() {
        var id = ((document.getElementById('contractModelId') || {}).value || '').trim();
        var name = ((document.getElementById('contractModelName') || {}).value || '').trim();
        var description = ((document.getElementById('contractModelDescription') || {}).value || '').trim();
        var isDefault = !!((document.getElementById('contractModelIsDefault') || {}).checked);
        var bodyHtml = getContractModelHtml();
        if (!name) {
            alert('Informe o nome do modelo.');
            return;
        }
        var payload = JSON.stringify({
            name: name,
            description: description || null,
            body_html: bodyHtml || null,
            is_default: isDefault
        });
        var req = id
            ? api('/contract-templates/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload })
            : api('/contract-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
        req.then(function () {
            safeHideModal('modalContractModel');
            loadContractModels();
            loadCadContratoTemplates();
        }).catch(function (err) {
            alert(err.message || 'Erro ao salvar modelo.');
        });
    }
    function deactivateContractModel(id) {
        if (!id)
            return;
        if (!confirm('Desativar este modelo de contrato?'))
            return;
        api('/contract-templates/' + id, { method: 'DELETE' }).then(function () {
            loadContractModels();
            loadCadContratoTemplates();
        }).catch(function (err) {
            alert(err.message || 'Erro ao desativar modelo.');
        });
    }
    function loadModelos() {
        var out = document.getElementById('outModelos');
        if (!out)
            return;
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
        api('/proposal-templates').then(function (data) {
            var list = data.templates || data.rows || [];
            if (!list.length) {
                out.innerHTML = '<p class="text-muted mb-0">Nenhum modelo cadastrado. Use o formulÃ¡rio acima para criar o primeiro.</p>';
                return;
            }
            var html = '<div class="table-responsive"><table class="table table-sm table-hover admin-table"><thead><tr>';
            html += '<th>#</th><th>Nome</th><th>Plano</th><th>Valor</th><th>Validade (dias)</th><th>AÃ§Ãµes</th></tr></thead><tbody>';
            list.forEach(function (t) {
                var amt = t.default_amount != null ? 'R$ ' + Number(t.default_amount).toFixed(2) : 'â€”';
                html += '<tr><td>' + esc(t.id) + '</td><td>' + esc(t.name || '') + '</td><td>' + esc(t.plan_code || 'â€”') + '</td><td>' + amt + '</td><td>' + esc(t.valid_days != null ? t.valid_days : '15') + '</td>';
                html += '<td><button type="button" class="btn btn-sm btn-outline-primary me-1" data-modelo-edit="' + t.id + '">Editar</button>';
                html += '<button type="button" class="btn btn-sm btn-outline-danger" data-modelo-del="' + t.id + '">Excluir</button></td></tr>';
            });
            html += '</tbody></table></div>';
            out.innerHTML = html;
            out.querySelectorAll('[data-modelo-edit]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = Number(this.getAttribute('data-modelo-edit'));
                    api('/proposal-templates').then(function (d) {
                        var arr = d.templates || d.rows || [];
                        var t = arr.find(function (x) { return x.id === id; });
                        if (!t) {
                            alert('Modelo nÃ£o encontrado.');
                            return;
                        }
                        document.getElementById('modeloId').value = t.id;
                        document.getElementById('modeloName').value = t.name || '';
                        document.getElementById('modeloPlanCode').value = t.plan_code || '';
                        document.getElementById('modeloAmount').value = t.default_amount != null ? t.default_amount : '';
                        document.getElementById('modeloValidDays').value = t.valid_days != null ? t.valid_days : 15;
                        document.getElementById('modeloDescription').value = t.description || '';
                    }).catch(function (err) { alert(err.message); });
                });
            });
            out.querySelectorAll('[data-modelo-del]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = Number(this.getAttribute('data-modelo-del'));
                    if (!confirm('Excluir este modelo? Ele ficarÃ¡ inativo.'))
                        return;
                    api('/proposal-templates/' + id, { method: 'DELETE' }).then(function () {
                        loadModelos();
                        proposalTemplatesCache = [];
                        ensurePlansAndTemplatesForProposal(function () { });
                    }).catch(function (err) { alert(err.message); });
                });
            });
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    function clearModeloForm() {
        document.getElementById('modeloId').value = '';
        document.getElementById('modeloName').value = '';
        document.getElementById('modeloPlanCode').value = '';
        document.getElementById('modeloAmount').value = '';
        document.getElementById('modeloValidDays').value = '15';
        document.getElementById('modeloDescription').value = '';
    }
    function ensurePlansAndTemplatesForProposal(cb) {
        var pending = 0;
        var error = null;
        function doneOnce() {
            if (--pending === 0 && cb && !error)
                cb();
        }
        if (!plansCache || !plansCache.length) {
            pending++;
            api('/plans').then(function (data) {
                plansCache = data.plans || data.rows || [];
                doneOnce();
            }).catch(function (err) {
                error = err;
                alert(err.message);
            });
        }
        if (!proposalTemplatesCache || !proposalTemplatesCache.length) {
            pending++;
            api('/proposal-templates').then(function (data) {
                proposalTemplatesCache = data.templates || data.rows || [];
                doneOnce();
            }).catch(function (err) {
                error = err;
                alert(err.message);
            });
        }
        if (pending === 0 && cb && !error)
            cb();
    }
    function openProposalModal() {
        ensurePlansAndTemplatesForProposal(function () {
            if (!proposalTemplatesCache || !proposalTemplatesCache.length) {
                if (confirm('Nenhum modelo cadastrado ainda. Deseja abrir a tela de Modelos para criar um?')) {
                    showModelosSectionInline();
                }
                return;
            }
            var selTpl = document.getElementById('proposalTemplateSelect');
            var selPlan = document.getElementById('proposalPlanSelect');
            var nameInput = document.getElementById('proposalCustomerName');
            var waInput = document.getElementById('proposalCustomerWhatsapp');
            var idInput = document.getElementById('proposalCustomerId');
            var amountInput = document.getElementById('proposalAmount');
            var validInput = document.getElementById('proposalValidUntil');
            var notesInput = document.getElementById('proposalNotes');
            var validHint = document.getElementById('proposalValidHint');
            if (selTpl) {
                selTpl.innerHTML = '<option value="">â€” Selecionar modelo â€”</option>';
                proposalTemplatesCache.forEach(function (t) {
                    var opt = document.createElement('option');
                    opt.value = t.id;
                    opt.textContent = t.name + (t.plan_code ? ' â€” plano ' + t.plan_code : '');
                    opt.setAttribute('data-plan', t.plan_code || '');
                    opt.setAttribute('data-amount', t.default_amount != null ? String(t.default_amount) : '');
                    opt.setAttribute('data-valid-days', t.valid_days != null ? String(t.valid_days) : '');
                    selTpl.appendChild(opt);
                });
            }
            if (selPlan) {
                selPlan.innerHTML = '<option value="">â€” Selecione o plano â€”</option>';
                plansCache.forEach(function (p) {
                    var code = p.code != null ? p.code : p.id;
                    var label = (p.speed_display || code) + (p.unit ? ' ' + p.unit : '') + (p.tagline ? ' â€” ' + p.tagline : '');
                    selPlan.appendChild(new Option(label, code, false, false));
                });
            }
            if (nameInput)
                nameInput.value = '';
            if (waInput)
                waInput.value = '';
            if (idInput)
                idInput.value = '';
            if (amountInput)
                amountInput.value = '';
            if (validInput)
                validInput.value = '';
            if (notesInput)
                notesInput.value = '';
            if (validHint)
                validHint.textContent = '';
            if (selTpl) {
                selTpl.onchange = function () {
                    var opt = selTpl.options[selTpl.selectedIndex];
                    if (!opt || !opt.value) {
                        if (validHint)
                            validHint.textContent = '';
                        return;
                    }
                    var plan = opt.getAttribute('data-plan') || '';
                    var amt = opt.getAttribute('data-amount') || '';
                    var daysStr = opt.getAttribute('data-valid-days') || '15';
                    var days = parseInt(daysStr, 10) || 15;
                    if (selPlan && plan) {
                        for (var i = 0; i < selPlan.options.length; i++) {
                            if (selPlan.options[i].value === plan) {
                                selPlan.selectedIndex = i;
                                break;
                            }
                        }
                    }
                    if (amountInput && amt)
                        amountInput.value = amt;
                    if (validInput) {
                        var today = new Date();
                        var due = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
                        validInput.value = due.toISOString().slice(0, 10);
                    }
                    if (validHint)
                        validHint.textContent = 'Validade sugerida pelo modelo: ' + days + ' dia(s)';
                    var tpl = proposalTemplatesCache.find(function (t) { return String(t.id) === opt.value; });
                    if (tpl && tpl.description && notesInput && !notesInput.value) {
                        notesInput.value = tpl.description;
                    }
                };
            }
            showProposalFormInline();
        });
    }
    function showProposalFormInline() {
        var listWrap = document.getElementById('proposalsListWrap');
        var formSec = document.getElementById('proposalFormSection');
        var modelosSec = document.getElementById('modelosSection');
        if (listWrap)
            listWrap.classList.add('d-none');
        if (formSec) {
            formSec.classList.remove('d-none');
        }
        if (modelosSec)
            modelosSec.classList.add('d-none');
    }
    function showModelosSectionInline() {
        var listWrap = document.getElementById('proposalsListWrap');
        var formSec = document.getElementById('proposalFormSection');
        var modelosSec = document.getElementById('modelosSection');
        if (listWrap)
            listWrap.classList.add('d-none');
        if (formSec)
            formSec.classList.add('d-none');
        if (modelosSec) {
            modelosSec.classList.remove('d-none');
            loadModelos();
        }
    }
    function showProposalsListInline() {
        var listWrap = document.getElementById('proposalsListWrap');
        var formSec = document.getElementById('proposalFormSection');
        var modelosSec = document.getElementById('modelosSection');
        if (listWrap)
            listWrap.classList.remove('d-none');
        if (formSec)
            formSec.classList.add('d-none');
        if (modelosSec)
            modelosSec.classList.add('d-none');
    }
    function saveProposalFromForm() {
        var name = document.getElementById('proposalCustomerName').value.trim();
        var wa = document.getElementById('proposalCustomerWhatsapp').value.trim();
        var custIdVal = document.getElementById('proposalCustomerId').value.trim();
        var planSel = document.getElementById('proposalPlanSelect');
        var plan = planSel && planSel.value ? planSel.value.trim() : '';
        var amountVal = document.getElementById('proposalAmount').value.trim();
        var validUntil = document.getElementById('proposalValidUntil').value.trim();
        var notes = document.getElementById('proposalNotes').value.trim();
        if (!name) {
            alert('Informe o nome do cliente.');
            return;
        }
        if (!plan) {
            alert('Selecione o plano da proposta.');
            return;
        }
        var body = {
            customer_name: name,
            customer_whatsapp: wa || null,
            plan_code: plan,
            amount: amountVal ? parseFloat(amountVal) || 0 : 0
        };
        if (custIdVal)
            body.customer_id = parseInt(custIdVal, 10) || null;
        if (validUntil)
            body.valid_until = validUntil;
        if (notes)
            body.notes = notes;
        api('/proposals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function () {
            showProposalsListInline();
            loadProposals();
        }).catch(function (err) { alert(err.message); });
    }
    var serviceOrdersCache = [];
    function osStatusBadge(v) {
        var c = { OPEN: 'warning', IN_PROGRESS: 'info', PENDING: 'secondary', COMPLETED: 'success', CANCELLED: 'danger' }[v] || 'secondary';
        var labels = { OPEN: 'Aberta', IN_PROGRESS: 'Em and.', PENDING: 'Pendente', COMPLETED: 'ConcluÃ­da', CANCELLED: 'Cancelada' };
        return '<span class="badge bg-' + c + '">' + esc(labels[v] || v || 'â€”') + '</span>';
    }
    function osTypeLabel(v) {
        var m = { INSTALLATION: 'InstalaÃ§Ã£o', MAINTENANCE: 'ManutenÃ§Ã£o', SUPPORT: 'Suporte', UPGRADE: 'Upgrade', OTHER: 'Outro' };
        return m[v] || v || 'â€”';
    }
    function formatDateOnly(str) {
        if (!str)
            return 'â€”';
        var s = String(str);
        return s.indexOf('T') >= 0 ? s.slice(0, s.indexOf('T')) : s.slice(0, 10);
    }
    function loadServiceOrders() {
        var out = document.getElementById('outServiceOrders');
        if (!out)
            return;
        var statusFilter = document.getElementById('osFilterStatus');
        var typeFilter = document.getElementById('osFilterType');
        var status = statusFilter ? statusFilter.value : '';
        var type = typeFilter ? typeFilter.value : '';
        var qs = [];
        if (status)
            qs.push('status=' + encodeURIComponent(status));
        if (type)
            qs.push('type=' + encodeURIComponent(type));
        var path = '/service-orders' + (qs.length ? '?' + qs.join('&') : '');
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
        api(path).then(function (data) {
            var rows = data.rows || [];
            serviceOrdersCache = rows;
            var total = rows.length;
            var openCount = rows.filter(function (r) { return r.status === 'OPEN'; }).length;
            var progressCount = rows.filter(function (r) { return r.status === 'IN_PROGRESS'; }).length;
            var completedCount = rows.filter(function (r) { return r.status === 'COMPLETED'; }).length;
            var kpiTotal = document.getElementById('osKpiTotal');
            var kpiOpen = document.getElementById('osKpiOpen');
            var kpiProgress = document.getElementById('osKpiProgress');
            var kpiCompleted = document.getElementById('osKpiCompleted');
            if (kpiTotal)
                kpiTotal.textContent = total;
            if (kpiOpen)
                kpiOpen.textContent = openCount;
            if (kpiProgress)
                kpiProgress.textContent = progressCount;
            if (kpiCompleted)
                kpiCompleted.textContent = completedCount;
            var infoEl = document.getElementById('osFilterInfo');
            if (infoEl)
                infoEl.textContent = total === 0 ? 'Nenhuma ordem encontrada com os filtros selecionados.' : 'Exibindo ' + total + ' ordem(ns) de serviÃ§o.';
            if (!rows.length) {
                out.innerHTML = '<div class="os-empty"><i class="bi bi-tools d-block"></i><p class="mb-0">Nenhuma ordem de serviÃ§o.</p><p class="small mt-1">Ajuste os filtros ou clique em <strong>Nova OS</strong> para criar.</p></div>';
                return;
            }
            var thead = '<tr><th>#</th><th>Cliente</th><th>WhatsApp</th><th>Tipo</th><th>Status</th><th>Prazo</th><th>ConcluÃ­da</th><th>DescriÃ§Ã£o</th><th class="text-end">AÃ§Ãµes</th></tr>';
            var tbody = rows.map(function (r) {
                var desc = (r.description || '').slice(0, 50);
                if ((r.description || '').length > 50)
                    desc += 'â€¦';
                return '<tr>' +
                    '<td class="cell-id">#' + esc(r.id) + '</td>' +
                    '<td>' + esc(r.customer_name || 'â€”') + '</td>' +
                    '<td>' + esc(formatPhone(r.customer_whatsapp)) + '</td>' +
                    '<td>' + esc(osTypeLabel(r.type)) + '</td>' +
                    '<td>' + osStatusBadge(r.status) + '</td>' +
                    '<td>' + esc(formatDateOnly(r.due_date)) + '</td>' +
                    '<td>' + esc(formatDateOnly(r.completed_at)) + '</td>' +
                    '<td class="cell-desc" title="' + esc(r.description || '') + '">' + esc(desc || 'â€”') + '</td>' +
                    '<td class="text-end"><div class="btn-group btn-group-sm"><button type="button" class="btn btn-outline-primary" data-os-view="' + r.id + '"><i class="bi bi-eye me-1"></i>Detalhes</button><button type="button" class="btn btn-outline-secondary" data-os-status="' + r.id + '">Status</button></div></td>' +
                    '</tr>';
            }).join('');
            out.innerHTML = '<table class="table table-hover mb-0"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
            document.querySelectorAll('[data-os-view]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    openServiceOrderDetail(Number(this.getAttribute('data-os-view')));
                });
            });
            document.querySelectorAll('[data-os-status]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = Number(this.getAttribute('data-os-status'));
                    var status = prompt('Novo status (OPEN, IN_PROGRESS, PENDING, COMPLETED, CANCELLED):', 'IN_PROGRESS');
                    if (!status)
                        return;
                    api('/service-orders/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: status.trim().toUpperCase() }) }).then(function () { loadServiceOrders(); }).catch(function (err) { alert(err.message); });
                });
            });
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    function openServiceOrderDetail(id) {
        var os = serviceOrdersCache.find(function (r) { return r.id == id; });
        if (!os) {
            alert('Ordem de serviÃ§o nÃ£o encontrada na lista. Atualize a lista.');
            return;
        }
        document.getElementById('osDetailId').textContent = '#' + id;
        document.getElementById('osDetailOsId').value = id;
        var statusSelect = document.getElementById('osDetailStatus');
        statusSelect.value = os.status || 'OPEN';
        var osStatusLocked = isSupportStatusLocked('os', os.status);
        statusSelect.disabled = osStatusLocked;
        if (statusSelect.parentElement) {
            var osHint = statusSelect.parentElement.querySelector('.form-text.os-status-locked-hint');
            if (osHint)
                osHint.remove();
            if (osStatusLocked) {
                var text = document.createElement('small');
                text.className = 'form-text text-muted os-status-locked-hint';
                text.textContent = 'Status nÃ£o pode ser alterado apÃ³s concluÃ­do ou cancelado.';
                statusSelect.parentElement.appendChild(text);
            }
        }
        document.getElementById('osDetailResolution').value = os.resolution || '';
        var dl = document.getElementById('osDetailFields');
        if (dl) {
            dl.innerHTML =
                '<dt class="col-sm-4">Cliente</dt><dd class="col-sm-8">' + esc(os.customer_name || 'â€”') + '</dd>' +
                    '<dt class="col-sm-4">WhatsApp</dt><dd class="col-sm-8">' + esc(formatPhone(os.customer_whatsapp)) + '</dd>' +
                    '<dt class="col-sm-4">Tipo</dt><dd class="col-sm-8">' + esc(osTypeLabel(os.type)) + '</dd>' +
                    '<dt class="col-sm-4">Status</dt><dd class="col-sm-8">' + getSupportStatusBadge(os.status) + '</dd>' +
                    '<dt class="col-sm-4">Data prevista</dt><dd class="col-sm-8">' + esc(formatDateOnly(os.due_date)) + '</dd>' +
                    '<dt class="col-sm-4">Aberta em</dt><dd class="col-sm-8">' + esc(os.created_at || 'â€”') + '</dd>' +
                    '<dt class="col-sm-4">ConcluÃ­da em</dt><dd class="col-sm-8">' + esc(os.completed_at || 'â€”') + '</dd>' +
                    '<dt class="col-sm-4">DescriÃ§Ã£o</dt><dd class="col-sm-8">' + esc(os.description || 'â€”') + '</dd>' +
                    (os.resolution ? ('<dt class="col-sm-4">ResoluÃ§Ã£o</dt><dd class="col-sm-8">' + esc(os.resolution) + '</dd>') : '');
        }
        safeShowModal('modalServiceOrderDetail');
    }
    function saveServiceOrderDetail() {
        var id = document.getElementById('osDetailOsId').value;
        if (!id)
            return;
        var statusSelect = document.getElementById('osDetailStatus');
        var resolution = document.getElementById('osDetailResolution').value;
        var body = {};
        if (!statusSelect.disabled)
            body.status = statusSelect.value;
        if (resolution !== undefined)
            body.resolution = resolution;
        if (Object.keys(body).length === 0)
            return;
        api('/service-orders/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function () {
            safeHideModal('modalServiceOrderDetail');
            loadSupport();
        }).catch(function (err) { alert(err.message); });
    }
    var osCustomersCache = [];
    function filterOsCustomers(q) {
        var lower = (q || '').toLowerCase().trim();
        var digits = lower.replace(/\D/g, '');
        return osCustomersCache.filter(function (c) {
            var name = (c.name || '').toLowerCase();
            var whatsapp = (c.whatsapp || '').replace(/\D/g, '');
            var cpf = (c.cpf_cnpj || '').replace(/\D/g, '');
            return name.indexOf(lower) >= 0 ||
                (digits.length >= 4 && (whatsapp.indexOf(digits) >= 0 || cpf.indexOf(digits) >= 0));
        }).slice(0, 15);
    }
    function renderOsCustomerSearch(q) {
        var resEl = document.getElementById('osCustomerSearchResults');
        if (!resEl)
            return;
        if (!q || q.length < 2) {
            resEl.classList.add('d-none');
            resEl.innerHTML = '';
            return;
        }
        var list = filterOsCustomers(q);
        if (!list.length) {
            resEl.innerHTML = '<div class="p-2 text-muted small">Nenhum cliente encontrado</div>';
            resEl.classList.remove('d-none');
            return;
        }
        resEl.innerHTML = list.map(function (c) {
            var label = (c.name || 'â€”') + ' â€¢ ' + formatPhone(c.whatsapp) + (c.id ? ' (#' + c.id + ')' : '');
            return '<div class="os-customer-item list-group-item list-group-item-action" role="button" tabindex="0" data-cid="' + esc(String(c.id)) + '" data-cname="' + esc(c.name || '') + '" data-cwhatsapp="' + esc(c.whatsapp || '') + '">' + esc(label) + '</div>';
        }).join('');
        resEl.classList.remove('d-none');
        resEl.querySelectorAll('.os-customer-item').forEach(function (el) {
            el.addEventListener('mousedown', function (e) {
                e.preventDefault();
                document.getElementById('newOsCustomerId').value = this.getAttribute('data-cid') || '';
                document.getElementById('newOsCustomerDisplay').textContent = this.getAttribute('data-cname') + ' â€” ' + formatPhone(this.getAttribute('data-cwhatsapp'));
                document.getElementById('newOsCustomerSearch').value = '';
                resEl.classList.add('d-none');
                resEl.innerHTML = '';
            });
        });
    }
    function openNewServiceOrderModal() {
        document.getElementById('newOsCustomerId').value = '';
        document.getElementById('newOsCustomerSearch').value = '';
        document.getElementById('newOsCustomerDisplay').textContent = 'Opcional â€” deixe vazio para OS sem vÃ­nculo';
        document.getElementById('newOsType').value = 'INSTALLATION';
        document.getElementById('newOsDescription').value = '';
        document.getElementById('newOsDueDate').value = '';
        if (customersCache.length) {
            osCustomersCache = customersCache;
        }
        else {
            api('/customers').then(function (data) {
                osCustomersCache = data.rows || [];
            }).catch(function () { osCustomersCache = []; });
        }
        safeShowModal('modalNewServiceOrder');
    }
    function saveNewServiceOrder() {
        var customerId = document.getElementById('newOsCustomerId').value;
        var type = document.getElementById('newOsType').value || 'INSTALLATION';
        var description = (document.getElementById('newOsDescription').value || '').trim() || null;
        var dueDate = (document.getElementById('newOsDueDate').value || '').trim() || null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate || ''))
            dueDate = null;
        var body = {
            customer_id: customerId ? parseInt(customerId, 10) : null,
            type: type,
            description: description,
            due_date: dueDate
        };
        api('/service-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (res) {
            safeHideModal('modalNewServiceOrder');
            loadSupport();
            if (res.id)
                alert('Ordem de serviÃ§o #' + res.id + ' criada.');
        }).catch(function (err) { alert(err.message); });
    }
    var ticketsCache = [];
    var ticketCustomersCache = [];
    /** ConfiguraÃ§Ã£o central de status â€” Chamados e OS (rÃ³tulos, cores, Ã­cones) */
    var SUPPORT_STATUS_TICKET = [
        { value: 'OPEN', label: 'Aberto', badgeClass: 'open', icon: 'bi-circle' },
        { value: 'IN_PROGRESS', label: 'Em atendimento', badgeClass: 'progress', icon: 'bi-gear' },
        { value: 'PENDING', label: 'Pendente', badgeClass: 'pending', icon: 'bi-clock' },
        { value: 'WAITING_CUSTOMER', label: 'Aguardando cliente', badgeClass: 'pending', icon: 'bi-person-lines-fill' },
        { value: 'EN_ROUTE', label: 'Em deslocamento', badgeClass: 'progress', icon: 'bi-truck' },
        { value: 'RESOLVED', label: 'Resolvido', badgeClass: 'resolved', icon: 'bi-check2-circle' },
        { value: 'CLOSED', label: 'Fechado', badgeClass: 'closed', icon: 'bi-x-circle' },
        { value: 'CANCELLED', label: 'Cancelado', badgeClass: 'cancelled', icon: 'bi-slash-circle' }
    ];
    var SUPPORT_STATUS_OS = [
        { value: 'OPEN', label: 'Aberto', badgeClass: 'open', icon: 'bi-circle' },
        { value: 'IN_PROGRESS', label: 'Em andamento', badgeClass: 'progress', icon: 'bi-gear' },
        { value: 'PENDING', label: 'Pendente', badgeClass: 'pending', icon: 'bi-clock' },
        { value: 'COMPLETED', label: 'ConcluÃ­do', badgeClass: 'completed', icon: 'bi-check2-circle' },
        { value: 'CANCELLED', label: 'Cancelado', badgeClass: 'cancelled', icon: 'bi-x-circle' }
    ];
    function getSupportStatusConfig(value, kind) {
        var list = kind === 'os' ? SUPPORT_STATUS_OS : SUPPORT_STATUS_TICKET;
        var found = list.filter(function (s) { return s.value === value; })[0];
        if (found)
            return found;
        var all = SUPPORT_STATUS_TICKET.concat(SUPPORT_STATUS_OS);
        return all.filter(function (s) { return s.value === value; })[0] || { value: value, label: value, badgeClass: 'pending', icon: 'bi-question' };
    }
    function getSupportStatusLabel(value) {
        return getSupportStatusConfig(value, null).label;
    }
    function getSupportStatusBadge(value, useCssClass) {
        var c = getSupportStatusConfig(value, null);
        var css = useCssClass !== false ? ' support-status support-status--' + c.badgeClass : '';
        var badge = useCssClass !== false ? 'support-status support-status--' + c.badgeClass : 'badge bg-' + ({ open: 'warning', progress: 'info', pending: 'secondary', resolved: 'success', completed: 'success', closed: 'secondary', cancelled: 'danger' }[c.badgeClass] || 'secondary');
        return '<span class="' + badge + '"><i class="bi ' + esc(c.icon) + '"></i>' + esc(c.label) + '</span>';
    }
    function buildStatusDropdownMenu(kind) {
        var list = kind === 'os' ? SUPPORT_STATUS_OS : SUPPORT_STATUS_TICKET;
        return list.map(function (s) {
            return '<li><a class="dropdown-item" href="#" data-status="' + esc(s.value) + '"><i class="bi ' + esc(s.icon) + ' me-2"></i>' + esc(s.label) + '</a></li>';
        }).join('');
    }
    /** Regra: apÃ³s resolvido/concluÃ­do/fechado/cancelado, status nÃ£o pode mais ser alterado */
    function isSupportStatusLocked(kind, status) {
        if (kind === 'ticket')
            return status === 'RESOLVED' || status === 'CLOSED' || status === 'CANCELLED';
        if (kind === 'os')
            return status === 'COMPLETED' || status === 'CANCELLED';
        return false;
    }
    function setSupportKpis(total, openC, progressC, completedC) {
        var el = document.getElementById('supportKpiTotal');
        if (el)
            el.textContent = total;
        el = document.getElementById('supportKpiOpen');
        if (el)
            el.textContent = openC;
        el = document.getElementById('supportKpiProgress');
        if (el)
            el.textContent = progressC;
        el = document.getElementById('supportKpiCompleted');
        if (el)
            el.textContent = completedC;
    }
    function loadSupport() {
        safeShowModal('tab-tickets');
        var out = document.getElementById('outTickets');
        if (!out)
            return;
        var filterTypeEl = document.getElementById('supportFilterType');
        var filterStatusEl = document.getElementById('supportFilterStatus');
        var filterType = filterTypeEl ? filterTypeEl.value : '';
        var filterStatus = filterStatusEl ? filterStatusEl.value : '';
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
        Promise.all([api('/tickets'), api('/service-orders')]).then(function (results) {
            var ticketRows = (results[0] && results[0].rows) ? results[0].rows : [];
            var osRows = (results[1] && results[1].rows) ? results[1].rows : [];
            ticketsCache = ticketRows;
            serviceOrdersCache = osRows;
            var items = [];
            ticketRows.forEach(function (r) {
                items.push({
                    kind: 'ticket',
                    id: r.id,
                    typeFilter: 'TICKET',
                    typeLabel: 'Chamado',
                    title: (r.subject || '').slice(0, 60) + ((r.subject || '').length > 60 ? '\u2026' : ''),
                    customer_name: r.customer_name,
                    customer_whatsapp: r.customer_whatsapp,
                    status: r.status || 'OPEN',
                    created_at: r.created_at,
                    due_date: null,
                    completed_at: r.closed_at,
                    raw: r
                });
            });
            osRows.forEach(function (r) {
                items.push({
                    kind: 'os',
                    id: r.id,
                    typeFilter: r.type || 'OTHER',
                    typeLabel: osTypeLabel(r.type),
                    title: (r.description || '').slice(0, 60) + ((r.description || '').length > 60 ? '\u2026' : '') || '\u2014',
                    customer_name: r.customer_name,
                    customer_whatsapp: r.customer_whatsapp,
                    status: r.status || 'OPEN',
                    created_at: r.created_at,
                    due_date: r.due_date,
                    completed_at: r.completed_at,
                    raw: r
                });
            });
            items.sort(function (a, b) {
                var da = new Date(a.created_at || 0).getTime();
                var db = new Date(b.created_at || 0).getTime();
                return db - da;
            });
            if (filterType)
                items = items.filter(function (i) { return i.typeFilter === filterType; });
            if (filterStatus) {
                if (filterStatus === '_DONE_') {
                    items = items.filter(function (i) { return ['RESOLVED', 'CLOSED', 'COMPLETED'].indexOf(i.status) >= 0; });
                }
                else {
                    items = items.filter(function (i) { return i.status === filterStatus; });
                }
            }
            var total = items.length;
            var openCount = items.filter(function (i) { return i.status === 'OPEN'; }).length;
            var progressCount = items.filter(function (i) { return i.status === 'IN_PROGRESS'; }).length;
            var completedCount = items.filter(function (i) { return ['RESOLVED', 'CLOSED', 'COMPLETED'].indexOf(i.status) >= 0; }).length;
            setSupportKpis(total, openCount, progressCount, completedCount);
            var infoEl = document.getElementById('supportFilterInfo');
            if (infoEl)
                infoEl.textContent = total === 0 ? 'Nenhum registro com os filtros selecionados.' : 'Exibindo ' + total + ' registro(s).';
            if (!items.length) {
                out.innerHTML = '<div class="os-empty"><i class="bi bi-headset d-block"></i><p class="mb-0">Nenhum chamado ou ordem de serviÃ§o.</p><p class="small mt-1">Use <strong>Novo chamado</strong> ou <strong>Nova OS</strong> para criar.</p></div>';
                return;
            }
            var thead = '<tr><th>#</th><th>Tipo</th><th>Assunto / DescriÃ§Ã£o</th><th>Cliente</th><th>WhatsApp</th><th>Status</th><th>Prazo</th><th class="text-end">AÃ§Ãµes</th></tr>';
            var tbody = items.map(function (i) {
                var statusCfg = getSupportStatusConfig(i.status, i.kind);
                var statusBadgeHtml = getSupportStatusBadge(i.status);
                var statusLocked = isSupportStatusLocked(i.kind, i.status);
                var statusDropdown = statusLocked
                    ? '<span class="text-muted small"><i class="bi bi-lock me-1"></i>Encerrado</span>'
                    : '<div class="dropdown d-inline-block" data-support-id="' + i.id + '" data-support-kind="' + i.kind + '">' +
                        '<button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-arrow-repeat me-1"></i>Alterar status</button>' +
                        '<ul class="dropdown-menu dropdown-menu-end">' + buildStatusDropdownMenu(i.kind) + '</ul></div>';
                var mainBtn = i.kind === 'ticket'
                    ? (statusLocked
                        ? '<button type="button" class="btn btn-sm btn-outline-primary" data-support-open="' + i.id + '"><i class="bi bi-eye me-1"></i>Ver</button>'
                        : '<button type="button" class="btn btn-sm btn-outline-primary" data-support-open="' + i.id + '"><i class="bi bi-pencil-square me-1"></i>Atender</button>')
                    : (statusLocked
                        ? '<button type="button" class="btn btn-sm btn-outline-primary" data-support-os="' + i.id + '"><i class="bi bi-eye me-1"></i>Ver</button>'
                        : '<button type="button" class="btn btn-sm btn-outline-primary" data-support-os="' + i.id + '"><i class="bi bi-eye me-1"></i>Detalhes</button>');
                var printBtn = i.kind === 'ticket'
                    ? '<button type="button" class="btn btn-sm btn-outline-secondary" data-support-print-ticket="' + i.id + '"><i class="bi bi-printer me-1"></i>Imprimir</button>'
                    : '';
                var actions = '<div class="btn-group btn-group-sm">' + mainBtn + printBtn + statusDropdown + '</div>';
                return '<tr class="support-row support-row--' + esc(statusCfg.badgeClass || 'pending') + '">' +
                    '<td class="cell-id">#' + esc(i.id) + '</td>' +
                    '<td><span class="badge bg-secondary">' + esc(i.typeLabel) + '</span></td>' +
                    '<td class="cell-desc" title="' + esc(i.raw.subject || i.raw.description || '') + '">' + esc(i.title || '\u2014') + '</td>' +
                    '<td>' + esc(i.customer_name || '\u2014') + '</td>' +
                    '<td>' + esc(formatPhone(i.customer_whatsapp)) + '</td>' +
                    '<td>' + statusBadgeHtml + '</td>' +
                    '<td>' + esc(formatDateOnly(i.due_date)) + '</td>' +
                    '<td class="text-end">' + actions + '</td></tr>';
            }).join('');
            out.innerHTML = '<table class="table table-hover mb-0"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
            document.querySelectorAll('[data-support-open]').forEach(function (btn) {
                btn.addEventListener('click', function () { openTicketModal(Number(this.getAttribute('data-support-open'))); });
            });
            document.querySelectorAll('[data-support-os]').forEach(function (btn) {
                btn.addEventListener('click', function () { openServiceOrderDetail(Number(this.getAttribute('data-support-os'))); });
            });
            document.querySelectorAll('[data-support-print-ticket]').forEach(function (btn) {
                btn.addEventListener('click', function () { printTicketById(Number(this.getAttribute('data-support-print-ticket'))); });
            });
            out.querySelectorAll('.dropdown[data-support-id] .dropdown-item').forEach(function (link) {
                link.addEventListener('click', function (e) {
                    e.preventDefault();
                    var dropdown = this.closest('.dropdown');
                    if (!dropdown)
                        return;
                    var id = Number(dropdown.getAttribute('data-support-id'));
                    var kind = dropdown.getAttribute('data-support-kind');
                    var status = this.getAttribute('data-status');
                    if (!status)
                        return;
                    var path = kind === 'ticket' ? '/tickets/' + id : '/service-orders/' + id;
                    api(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: status }) }).then(loadSupport).catch(function (err) { alert(err.message); });
                });
            });
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    function setTicketCustomerContextDisplay(context) {
        var documentEl = document.getElementById('ticketCustomerDocumentDisplay');
        var addressEl = document.getElementById('ticketCustomerAddressDisplay');
        var planEl = document.getElementById('ticketCustomerPlanDisplay');
        var pppoeEl = document.getElementById('ticketCustomerPppoeDisplay');
        if (documentEl)
            documentEl.textContent = (context && context.document) || '?';
        if (addressEl)
            addressEl.textContent = (context && context.address) || '?';
        if (planEl)
            planEl.textContent = (context && context.planCode) || '?';
        if (pppoeEl)
            pppoeEl.textContent = (context && context.pppoeUser) || '?';
    }
    function buildTicketCustomerContext(data) {
        var customer = data && data.customer ? data.customer : {};
        var installation = data && data.installation ? data.installation : {};
        var addr = parseAddressJson((installation && installation.address_json) || (customer && customer.address_json));
        var parts = [addr.street || addr.endereco, addr.number || addr.numero, addr.district || addr.bairro, addr.city || addr.cidade, addr.state || addr.uf].filter(Boolean);
        return {
            document: customer && customer.cpf_cnpj ? String(customer.cpf_cnpj) : '',
            address: parts.join(', '),
            planCode: (installation && installation.plan_code) || (customer && customer.plan_code) || '',
            pppoeUser: installation && installation.pppoe_user ? String(installation.pppoe_user) : ''
        };
    }
    function loadTicketCustomerContext(customerId) {
        if (!customerId) {
            setTicketCustomerContextDisplay(null);
            return;
        }
        api('/customers/' + customerId).then(function (data) {
            setTicketCustomerContextDisplay(buildTicketCustomerContext(data));
        }).catch(function () { setTicketCustomerContextDisplay(null); });
    }
    function setTicketCustomerDisplay(id, name, whatsapp) {
        var idVal = id != null && id !== '' ? String(id) : '';
        var nameVal = name || '?';
        var whatsappVal = whatsapp ? formatPhone(whatsapp) : '?';
        document.getElementById('ticketCustomerId').value = idVal;
        document.getElementById('ticketCustomerName').value = name || '';
        document.getElementById('ticketCustomerWhatsapp').value = whatsapp || '';
        document.getElementById('ticketCustomerIdDisplay').textContent = idVal || '?';
        document.getElementById('ticketCustomerNameDisplay').textContent = nameVal;
        document.getElementById('ticketCustomerWhatsappDisplay').textContent = whatsappVal;
        if (!idVal)
            setTicketCustomerContextDisplay(null);
    }
    function fillTicketModal(ticket) {
        document.getElementById('ticketId').value = ticket && ticket.id != null ? ticket.id : '';
        document.getElementById('ticketModalId').textContent = ticket && ticket.id ? '#' + ticket.id : '';
        var custInfo = '';
        if (ticket && (ticket.customer_name || ticket.customer_whatsapp || ticket.customer_id)) {
            custInfo = (ticket.customer_name || 'Cliente') +
                (ticket.customer_id ? ' â€¢ ID ' + ticket.customer_id : '') +
                (ticket.customer_whatsapp ? ' â€¢ ' + ticket.customer_whatsapp : '');
        }
        document.getElementById('ticketModalCustomerInfo').textContent = custInfo;
        setTicketCustomerDisplay(ticket && ticket.customer_id, ticket && ticket.customer_name, ticket && ticket.customer_whatsapp);
        document.getElementById('ticketCustomerSearch').value = '';
        var resEl = document.getElementById('ticketCustomerSearchResults');
        if (resEl) {
            resEl.classList.add('d-none');
            resEl.innerHTML = '';
        }
        document.getElementById('ticketSubject').value = ticket && ticket.subject ? ticket.subject : '';
        document.getElementById('ticketPriority').value = (ticket && ticket.priority) || 'NORMAL';
        var statusEl = document.getElementById('ticketStatus');
        statusEl.value = (ticket && ticket.status) || 'OPEN';
        var ticketStatusLocked = ticket && isSupportStatusLocked('ticket', ticket.status);
        statusEl.disabled = ticketStatusLocked;
        if (ticketStatusLocked && statusEl.closest('.ticket-section')) {
            var wrap = statusEl.closest('.mb-2') || statusEl.parentElement;
            var hint = wrap && wrap.querySelector('.form-text.ticket-status-locked-hint');
            if (hint)
                hint.remove();
            if (wrap) {
                var text = document.createElement('small');
                text.className = 'form-text text-muted ticket-status-locked-hint';
                text.textContent = 'Status nÃ£o pode ser alterado apÃ³s resolvido ou fechado.';
                wrap.appendChild(text);
            }
        }
        document.getElementById('ticketDefectText').value = ticket && ticket.defect_text ? ticket.defect_text : '';
        document.getElementById('ticketSolutionText').value = ticket && ticket.solution_text ? ticket.solution_text : '';
    }
    function filterTicketCustomers(q) {
        if (!q || q.length < 2)
            return [];
        var lower = q.toLowerCase().replace(/\s+/g, ' ');
        var digits = q.replace(/\D/g, '');
        return ticketCustomersCache.filter(function (c) {
            var name = (c.name || '').toLowerCase();
            var whatsapp = String(c.whatsapp || '').replace(/\D/g, '');
            var cpf = String(c.cpf_cnpj || '').replace(/\D/g, '');
            return name.indexOf(lower) >= 0 ||
                (digits.length >= 4 && (whatsapp.indexOf(digits) >= 0 || cpf.indexOf(digits) >= 0));
        }).slice(0, 15);
    }
    function renderTicketCustomerSearch(q) {
        var resEl = document.getElementById('ticketCustomerSearchResults');
        if (!resEl)
            return;
        if (!q || q.length < 2) {
            resEl.classList.add('d-none');
            resEl.innerHTML = '';
            return;
        }
        var list = filterTicketCustomers(q);
        if (!list.length) {
            resEl.innerHTML = '<div class="p-2 text-muted small">Nenhum cliente encontrado</div>';
            resEl.classList.remove('d-none');
            return;
        }
        resEl.innerHTML = list.map(function (c) {
            var label = (c.name || 'â€”') + ' â€¢ ' + formatPhone(c.whatsapp) + (c.id ? ' (#' + c.id + ')' : '');
            return '<div class="p-2 border-bottom ticket-customer-item" role="button" tabindex="0" data-cid="' + esc(String(c.id)) + '" data-cname="' + esc(c.name || '') + '" data-cwhatsapp="' + esc(c.whatsapp || '') + '">' + esc(label) + '</div>';
        }).join('');
        resEl.classList.remove('d-none');
        resEl.querySelectorAll('.ticket-customer-item').forEach(function (el) {
            el.addEventListener('mousedown', function (e) {
                e.preventDefault();
                setTicketCustomerDisplay(this.getAttribute('data-cid'), this.getAttribute('data-cname'), this.getAttribute('data-cwhatsapp'));
                document.getElementById('ticketCustomerSearch').value = '';
                resEl.classList.add('d-none');
                resEl.innerHTML = '';
            });
        });
    }
    function openTicketModal(id) {
        var existing = id ? ticketsCache.find(function (t) { return t.id == id; }) : null;
        fillTicketModal(existing || {});
        if (existing && existing.customer_id && !existing.customer_name && !existing.customer_whatsapp) {
            api('/customers/' + existing.customer_id).then(function (data) {
                var c = data.customer || {};
                setTicketCustomerDisplay(existing.customer_id, c.name, c.whatsapp);
            }).catch(function () { });
        }
        if (customersCache.length) {
            ticketCustomersCache = customersCache;
        }
        else if (!ticketCustomersCache.length) {
            api('/customers').then(function (data) {
                ticketCustomersCache = data.rows || [];
            }).catch(function () { ticketCustomersCache = []; });
        }
        safeShowModal('modalTicket');
    }
    function collectTicketForm(finalize) {
        var idVal = document.getElementById('ticketId').value.trim();
        var customerIdVal = document.getElementById('ticketCustomerId').value.trim();
        var subject = document.getElementById('ticketSubject').value.trim();
        var priority = document.getElementById('ticketPriority').value;
        var status = document.getElementById('ticketStatus').value;
        var defectText = document.getElementById('ticketDefectText').value;
        var solutionText = document.getElementById('ticketSolutionText').value;
        if (!subject) {
            alert('Informe o assunto do chamado.');
            return null;
        }
        var body = {
            subject: subject,
            priority: priority,
            customer_id: customerIdVal ? parseInt(customerIdVal, 10) : null,
            defect_text: defectText || null,
            solution_text: solutionText || null
        };
        var statusSelect = document.getElementById('ticketStatus');
        if (idVal && !statusSelect.disabled) {
            body.status = finalize ? 'RESOLVED' : status || 'OPEN';
        }
        else if (!idVal && finalize) {
            body.status = 'RESOLVED';
        }
        return { id: idVal ? parseInt(idVal, 10) : null, body: body };
    }
    function saveTicketFromForm(finalize) {
        var data = collectTicketForm(finalize);
        if (!data)
            return;
        var doClose = function () {
            safeHideModal('modalTicket');
            navigateToTab('tickets');
        };
        if (data.id) {
            api('/tickets/' + data.id, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data.body)
            }).then(function () {
                loadSupport();
                doClose();
            }).catch(function (err) { alert(err.message); });
        }
        else {
            api('/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data.body)
            }).then(function () {
                loadSupport();
                doClose();
            }).catch(function (err) { alert(err.message); });
        }
    }
    function openTicketPrintWindow(printData) {
        var labelOrFallback = function (value, map) {
            var normalized = value ? String(value).trim().toUpperCase() : '';
            if (!normalized)
                return 'Nao informado';
            return map[normalized] || String(value);
        };
        var present = function (value) {
            var text = value != null ? String(value).trim() : '';
            return text ? text : 'Nao informado';
        };
        var idVal = printData.id || '';
        var subject = present(printData.subject);
        var customerName = present(printData.customerName);
        var customerId = present(printData.customerId);
        var customerWhatsapp = printData.customerWhatsapp ? formatPhone(printData.customerWhatsapp) : 'Nao informado';
        var customerDocument = present(printData.customerDocument);
        var customerPlan = present(printData.customerPlan);
        var customerPppoe = present(printData.customerPppoe);
        var customerAddress = present(printData.customerAddress);
        var priority = labelOrFallback(printData.priority, { LOW: 'Baixa', NORMAL: 'Normal', HIGH: 'Alta', URGENT: 'Urgente' });
        var status = labelOrFallback(printData.status, { OPEN: 'Aberto', IN_PROGRESS: 'Em atendimento', PENDING: 'Pendente', WAITING_CUSTOMER: 'Aguardando cliente', EN_ROUTE: 'Em deslocamento', RESOLVED: 'Resolvido', CLOSED: 'Fechado', CANCELLED: 'Cancelado' });
        var channel = labelOrFallback(printData.channel, { WHATSAPP: 'WhatsApp', PHONE: 'Telefone', APP: 'App', PORTAL: 'Portal', PRESENTIAL: 'Presencial' });
        var ticketType = labelOrFallback(printData.ticketType, { SUPPORT: 'Suporte tecnico', FINANCIAL: 'Financeiro', COMMERCIAL: 'Comercial', CANCELLATION: 'Cancelamento', INSTALLATION: 'Instalacao' });
        var technicalCategory = labelOrFallback(printData.technicalCategory, { SEM_CONEXAO_PPPOE: 'Sem conexao PPPoE', ONU_OFFLINE: 'ONU offline', SEM_SINAL_OPTICO: 'Sem sinal optico', LENTIDAO: 'Lentidao', WIFI_RUIM: 'Wi-Fi ruim', OUTROS: 'Outros' });
        var assignedToName = present(printData.assignedToName);
        var slaDueAt = present(printData.slaDueAt);
        var defectText = present(printData.defectText);
        var solutionText = present(printData.solutionText);
        var win = window.open('', '_blank');
        if (!win)
            return;
        win.document.write('<html><head><title>Chamado ' + esc(idVal || '') + '</title>');
        win.document.write('<style>body{font-family:Segoe UI,Arial,sans-serif;margin:0;padding:24px;background:#f8fafc;color:#0f172a;font-size:13px;} .sheet{max-width:900px;margin:0 auto;background:#fff;border:1px solid #cbd5e1;border-radius:18px;overflow:hidden;box-shadow:0 20px 50px rgba(15,23,42,.08);} .hero{padding:24px 28px;background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#fff;} .eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.12em;opacity:.75;font-weight:700;} h1{font-size:24px;margin:8px 0 4px;} .subtitle{font-size:13px;opacity:.8;} .content{padding:22px 28px 28px;} .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;} .card{border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#fff;} .card h2{margin:0;padding:12px 14px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;background:#f8fafc;color:#475569;border-bottom:1px solid #e2e8f0;} table{width:100%;border-collapse:collapse;} td{padding:10px 14px;border-bottom:1px solid #eef2f7;vertical-align:top;} tr:last-child td{border-bottom:none;} td:first-child{width:34%;font-weight:700;color:#475569;background:#fbfdff;} .badge{display:inline-block;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.04em;} .badge.status{background:#dbeafe;color:#1d4ed8;} .badge.priority{background:#fef3c7;color:#b45309;} .section{margin-top:16px;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;} .section h2{margin:0;padding:12px 14px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;background:#f8fafc;color:#475569;border-bottom:1px solid #e2e8f0;} .section .body{padding:14px;white-space:pre-wrap;line-height:1.65;color:#1e293b;min-height:80px;} .footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:18px;color:#64748b;font-size:12px;} @media print{body{background:#fff;padding:0;} .sheet{box-shadow:none;border:none;}}</style>');
        win.document.write('</head><body>');
        win.document.write('<div class="sheet">');
        win.document.write('<div class="hero"><div class="eyebrow">Portal do Provedor</div><h1>Chamado #' + esc(idVal || 'novo') + '</h1><div class="subtitle">Relatorio tecnico de atendimento</div></div>');
        win.document.write('<div class="content">');
        win.document.write('<div class="grid">');
        win.document.write('<div class="card"><h2>Dados do Cliente</h2><table>');
        win.document.write('<tr><td>ID</td><td>' + esc(customerId) + '</td></tr>');
        win.document.write('<tr><td>Nome</td><td>' + esc(customerName) + '</td></tr>');
        win.document.write('<tr><td>WhatsApp</td><td>' + esc(customerWhatsapp) + '</td></tr>');
        win.document.write('<tr><td>CPF/CNPJ</td><td>' + esc(customerDocument) + '</td></tr>');
        win.document.write('<tr><td>Plano</td><td>' + esc(customerPlan) + '</td></tr>');
        win.document.write('<tr><td>Login PPPoE</td><td>' + esc(customerPppoe) + '</td></tr>');
        win.document.write('<tr><td>Endereco</td><td>' + esc(customerAddress) + '</td></tr>');
        win.document.write('</table></div>');
        win.document.write('<div class="card"><h2>Dados do Chamado</h2><table>');
        win.document.write('<tr><td>Assunto</td><td>' + esc(subject) + '</td></tr>');
        win.document.write('<tr><td>Tipo</td><td>' + esc(ticketType) + '</td></tr>');
        win.document.write('<tr><td>Canal</td><td>' + esc(channel) + '</td></tr>');
        win.document.write('<tr><td>Categoria tecnica</td><td>' + esc(technicalCategory) + '</td></tr>');
        win.document.write('<tr><td>Prioridade</td><td><span class="badge priority">' + esc(priority) + '</span></td></tr>');
        win.document.write('<tr><td>Status</td><td><span class="badge status">' + esc(status) + '</span></td></tr>');
        win.document.write('<tr><td>Responsavel</td><td>' + esc(assignedToName) + '</td></tr>');
        win.document.write('<tr><td>SLA</td><td>' + esc(slaDueAt) + '</td></tr>');
        win.document.write('</table></div>');
        win.document.write('</div>');
        win.document.write('<div class="section"><h2>Defeito Constatado</h2><div class="body">' + esc(defectText) + '</div></div>');
        win.document.write('<div class="section"><h2>Solucao do Problema</h2><div class="body">' + esc(solutionText) + '</div></div>');
        win.document.write('<div class="footer"><span>Gerado via Portal do Provedor</span><span>Documento operacional para atendimento ISP</span></div>');
        win.document.write('</div></div>');
        win.document.write('</body></html>');
        win.document.close();
        win.focus();
        setTimeout(function () { win.print(); }, 150);
    }
    function printTicketById(id) {
        if (!id)
            return;
        var ticket = ticketsCache.find(function (t) { return t.id == id; });
        if (!ticket) {
            alert('Chamado nÃƒÂ£o encontrado para impressÃƒÂ£o.');
            return;
        }
        api('/customers/' + ticket.customer_id).then(function (data) {
            var context = buildTicketCustomerContext(data);
            openTicketPrintWindow({
                id: String(ticket.id || ''),
                subject: ticket.subject || '',
                customerName: ticket.customer_name || '',
                customerId: ticket.customer_id != null ? String(ticket.customer_id) : '',
                customerWhatsapp: ticket.customer_whatsapp || '',
                customerDocument: context.document || '',
                customerPlan: context.planCode || '',
                customerPppoe: context.pppoeUser || '',
                customerAddress: context.address || '',
                priority: ticket.priority || '',
                status: ticket.status || '',
                channel: ticket.channel || '',
                ticketType: ticket.ticket_type || '',
                technicalCategory: ticket.technical_category || '',
                assignedToName: ticket.assigned_to_name || '',
                slaDueAt: ticket.sla_due_at || '',
                defectText: ticket.defect_text || '',
                solutionText: ticket.solution_text || ''
            });
        }).catch(function () {
            openTicketPrintWindow({
                id: String(ticket.id || ''),
                subject: ticket.subject || '',
                customerName: ticket.customer_name || '',
                customerId: ticket.customer_id != null ? String(ticket.customer_id) : '',
                customerWhatsapp: ticket.customer_whatsapp || '',
                customerDocument: '',
                customerPlan: '',
                customerPppoe: '',
                customerAddress: '',
                priority: ticket.priority || '',
                status: ticket.status || '',
                channel: ticket.channel || '',
                ticketType: ticket.ticket_type || '',
                technicalCategory: ticket.technical_category || '',
                assignedToName: ticket.assigned_to_name || '',
                slaDueAt: ticket.sla_due_at || '',
                defectText: ticket.defect_text || '',
                solutionText: ticket.solution_text || ''
            });
        });
    }
    function printTicket() {
        openTicketPrintWindow({
            id: document.getElementById('ticketId').value.trim(),
            subject: document.getElementById('ticketSubject').value.trim(),
            customerName: document.getElementById('ticketCustomerName').value.trim(),
            customerId: document.getElementById('ticketCustomerId').value.trim(),
            customerWhatsapp: document.getElementById('ticketCustomerWhatsapp').value.trim(),
            customerDocument: (((document.getElementById('ticketCustomerDocumentDisplay') || {}).textContent) || '').trim(),
            customerPlan: (((document.getElementById('ticketCustomerPlanDisplay') || {}).textContent) || '').trim(),
            customerPppoe: (((document.getElementById('ticketCustomerPppoeDisplay') || {}).textContent) || '').trim(),
            customerAddress: (((document.getElementById('ticketCustomerAddressDisplay') || {}).textContent) || '').trim(),
            priority: document.getElementById('ticketPriority').value,
            status: document.getElementById('ticketStatus').value,
            channel: (((document.getElementById('ticketChannel') || {}).value) || '').trim(),
            ticketType: (((document.getElementById('ticketType') || {}).value) || '').trim(),
            technicalCategory: (((document.getElementById('ticketCategory') || {}).value) || '').trim(),
            assignedToName: (((document.getElementById('ticketAssignedToName') || {}).value) || '').trim(),
            slaDueAt: (((document.getElementById('ticketSlaDueAt') || {}).value) || '').trim(),
            defectText: document.getElementById('ticketDefectText').value,
            solutionText: document.getElementById('ticketSolutionText').value
        });
    }
    document.getElementById('btnLoadSupport') && document.getElementById('btnLoadSupport').addEventListener('click', loadSupport);
    document.getElementById('btnNewServiceOrder') && document.getElementById('btnNewServiceOrder').addEventListener('click', openNewServiceOrderModal);
    document.getElementById('btnSaveServiceOrderDetail') && document.getElementById('btnSaveServiceOrderDetail').addEventListener('click', saveServiceOrderDetail);
    document.getElementById('btnSaveNewServiceOrder') && document.getElementById('btnSaveNewServiceOrder').addEventListener('click', saveNewServiceOrder);
    document.getElementById('supportFilterType') && document.getElementById('supportFilterType').addEventListener('change', loadSupport);
    document.getElementById('supportFilterStatus') && document.getElementById('supportFilterStatus').addEventListener('change', loadSupport);
    (function setupOsCustomerSearch() {
        var searchEl = document.getElementById('newOsCustomerSearch');
        var resEl = document.getElementById('osCustomerSearchResults');
        if (searchEl) {
            searchEl.addEventListener('input', function () { renderOsCustomerSearch(this.value.trim()); });
            searchEl.addEventListener('focus', function () {
                if (this.value.trim().length >= 2)
                    renderOsCustomerSearch(this.value.trim());
            });
            searchEl.addEventListener('blur', function (e) {
                if (resEl && resEl.contains(e.relatedTarget))
                    return;
                setTimeout(function () {
                    if (resEl)
                        resEl.classList.add('d-none');
                }, 250);
            });
        }
    })();
    document.getElementById('btnNewTicket') && document.getElementById('btnNewTicket').addEventListener('click', function () {
        openTicketModal(null);
    });
    (function setupTicketCustomerSearch() {
        var searchEl = document.getElementById('ticketCustomerSearch');
        var resEl = document.getElementById('ticketCustomerSearchResults');
        var clearBtn = document.getElementById('btnTicketClearCustomer');
        if (searchEl) {
            searchEl.addEventListener('input', function () {
                renderTicketCustomerSearch(this.value.trim());
            });
            searchEl.addEventListener('focus', function () {
                if (this.value.trim().length >= 2)
                    renderTicketCustomerSearch(this.value.trim());
            });
            searchEl.addEventListener('blur', function (e) {
                if (resEl && resEl.contains(e.relatedTarget))
                    return;
                setTimeout(function () {
                    if (resEl) {
                        resEl.classList.add('d-none');
                    }
                }, 250);
            });
        }
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                setTicketCustomerDisplay('', '', '');
                if (searchEl)
                    searchEl.value = '';
                if (resEl) {
                    resEl.classList.add('d-none');
                    resEl.innerHTML = '';
                }
            });
        }
    })();
    document.getElementById('btnSaveTicket') && document.getElementById('btnSaveTicket').addEventListener('click', function () {
        saveTicketFromForm(false);
    });
    document.getElementById('btnFinalizeTicket') && document.getElementById('btnFinalizeTicket').addEventListener('click', function () {
        saveTicketFromForm(true);
    });
    document.getElementById('btnPrintTicket') && document.getElementById('btnPrintTicket').addEventListener('click', printTicket);
    document.addEventListener('click', function (ev) {
        var target = ev.target;
        if (!target || typeof target.closest !== 'function')
            return;
        var newBtn = target.closest('#btnNewContractModel');
        if (newBtn) {
            ev.preventDefault();
            openContractModelModal(null);
            return;
        }
        var reloadContractsBtn = target.closest('#btnLoadContracts, #btnLoadContractsList');
        if (reloadContractsBtn) {
            ev.preventDefault();
            loadContracts();
            return;
        }
        var saveBtn = target.closest('#btnSaveContractModel');
        if (saveBtn) {
            ev.preventDefault();
            saveContractModel();
            return;
        }
        var editBtn = target.closest('[data-contract-model-edit]');
        if (editBtn) {
            ev.preventDefault();
            var id = Number(editBtn.getAttribute('data-contract-model-edit'));
            var model = contractModelsCache.find(function (item) { return Number(item.id) === id; }) || null;
            openContractModelModal(model);
            return;
        }
        var deactivateBtn = target.closest('[data-contract-model-deactivate]');
        if (deactivateBtn) {
            ev.preventDefault();
            deactivateContractModel(Number(deactivateBtn.getAttribute('data-contract-model-deactivate')));
            return;
        }
        var tokenBtn = target.closest('[data-contract-variable]');
        if (tokenBtn) {
            ev.preventDefault();
            var variable = tokenBtn.getAttribute('data-contract-variable') || '';
            var editor = getContractModelEditor();
            if (!editor || !variable)
                return;
            if (typeof editor.getSelection === 'function' && typeof editor.insertText === 'function') {
                var range = editor.getSelection(true) || { index: (editor.root && editor.root.textContent ? editor.root.textContent.length : 0) };
                editor.insertText(range.index, variable);
            }
            else if (editor.root) {
                editor.root.innerHTML += esc(variable);
            }
            return;
        }
        var providerReloadBtn = target.closest('#btnProviderReload');
        if (providerReloadBtn) {
            ev.preventDefault();
            loadProviderSettings();
            loadReceiptTemplate('pagar');
            return;
        }
        var providerSaveBtn = target.closest('#btnProviderSave');
        if (providerSaveBtn) {
            ev.preventDefault();
            saveProviderSettings();
            return;
        }
        var receiptTabBtn = target.closest('[data-receipt-key]');
        if (receiptTabBtn) {
            ev.preventDefault();
            var receiptKey = receiptTabBtn.getAttribute('data-receipt-key');
            if (!receiptKey)
                return;
            setActiveReceiptButton(receiptKey);
            loadReceiptTemplate(receiptKey);
            return;
        }
        var receiptSaveBtn = target.closest('#btnReceiptTemplateSave');
        if (receiptSaveBtn) {
            ev.preventDefault();
            saveReceiptTemplate();
            return;
        }
        var logoPortalBtn = target.closest('#btnProvLogoPortalUpload');
        if (logoPortalBtn) {
            ev.preventDefault();
            document.getElementById('provLogoPortalFile') && document.getElementById('provLogoPortalFile').click();
            return;
        }
        var logoSiteBtn = target.closest('#btnProvLogoSiteUpload');
        if (logoSiteBtn) {
            ev.preventDefault();
            document.getElementById('provLogoSiteFile') && document.getElementById('provLogoSiteFile').click();
            return;
        }
    });
    document.addEventListener('input', function (ev) {
        var target = ev.target;
        if (!target || !target.id)
            return;
        if (target.id === 'receiptTemplateBody') {
            var receiptPreviewEl = getReceiptPreviewEl();
            if (receiptPreviewEl) {
                receiptPreviewEl.innerHTML = highlightTemplatePreview(target.value || '');
            }
            return;
        }
        if (target.id === 'provLogoPortal' || target.id === 'provLogoSite') {
            updateProviderLogoPreview(target.id);
        }
    });
    document.addEventListener('change', function (ev) {
        var target = ev.target;
        if (!target || !target.id)
            return;
        if (target.id === 'provLogoPortalFile') {
            doProviderLogoUpload('provLogoPortalFile', 'portal', 'provLogoPortal');
            return;
        }
        if (target.id === 'provLogoSiteFile') {
            doProviderLogoUpload('provLogoSiteFile', 'site', 'provLogoSite');
        }
    });
    var customersCache = [];
    function formatPhone(w) {
        if (!w)
            return 'â€”';
        var d = String(w).replace(/\D/g, '');
        if (d.length >= 11)
            return '(' + d.slice(-11, -9) + ') ' + d.slice(-9, -4) + '-' + d.slice(-4);
        if (d.length >= 10)
            return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
        return w;
    }
    function formatCpfCnpj(v) {
        if (!v)
            return 'â€”';
        var d = String(v).replace(/\D/g, '');
        if (d.length === 11)
            return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        if (d.length === 14)
            return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
        return v;
    }
    var currentCustomerId = null;
    function statusBadge(active) {
        var isActive = active !== 0 && active !== '0' && active !== false;
        return isActive ? '<span class="badge bg-success badge-status">Ativo</span>' : '<span class="badge bg-secondary badge-status">Inativo</span>';
    }
    function renderCustomersTable(rows) {
        if (!rows || !rows.length) {
            return '<div class="isp-cadastro__empty"><i class="bi bi-people d-block"></i><p class="mb-0">Nenhum cliente encontrado.</p><p class="small mt-1">Atualize a lista ou ajuste os filtros.</p></div>';
        }
        var thead = '<tr><th>CÃ³digo</th><th>Nome</th><th>CPF/CNPJ</th><th>Telefone</th><th>Email</th><th>Plano</th><th>Status</th><th>Pontos</th><th class="text-end">AÃ§Ãµes</th></tr>';
        var tbody = rows.map(function (r) {
            return '<tr class="customer-row" data-view-customer="' + esc(r.id) + '">' +
                '<td><span class="cell-code">#' + esc(r.id) + '</span></td>' +
                '<td><span class="cell-name">' + esc(r.name || 'â€”') + '</span></td>' +
                '<td>' + esc(formatCpfCnpj(r.cpf_cnpj)) + '</td>' +
                '<td>' + esc(formatPhone(r.whatsapp)) + '</td>' +
                '<td>' + esc(r.email || 'â€”') + '</td>' +
                '<td>' + esc(r.plan_code || 'â€”') + '</td>' +
                '<td>' + statusBadge(r.active) + '</td>' +
                '<td>' + esc(r.points_balance ?? 0) + '</td>' +
                '<td class="text-end"><div class="btn-group btn-group-sm" onclick="event.stopPropagation();"><button type="button" class="btn btn-outline-secondary btn-action" data-view-customer="' + esc(r.id) + '"><i class="bi bi-eye me-1"></i>Dados</button><button type="button" class="btn btn-outline-primary btn-action" data-edit-customer="' + esc(r.id) + '"><i class="bi bi-pencil me-1"></i>Editar</button></div></td>' +
                '</tr>';
        }).join('');
        return '<div class="table-responsive"><table class="table isp-cadastro__table"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div>';
    }
    var currentInstallationId = null;
    var cadContratoWizardStep = 1;
    var cadContratoValorEditado = false;
    var cadContratoCustomerData = null;
    function openCadastrarContratoModal(customerId, customerName) {
        var custIdEl = document.getElementById('cadContratoCustomerId');
        var nomeEl = document.getElementById('cadContratoClienteNome');
        var cardCliente = document.getElementById('cadContratoClienteCard');
        var planoEl = document.getElementById('cadContratoPlano');
        var erroEl = document.getElementById('cadContratoErro');
        if (custIdEl)
            custIdEl.value = customerId ? String(customerId) : '';
        if (nomeEl)
            nomeEl.textContent = customerName || '';
        if (cardCliente)
            cardCliente.classList.toggle('d-none', !customerId);
        if (erroEl) {
            erroEl.classList.add('d-none');
            erroEl.textContent = '';
        }
        cadContratoValorEditado = false;
        cadContratoCustomerData = null;
        if (customerId) {
            api('/customers/' + customerId).then(function (data) {
                cadContratoCustomerData = data;
            }).catch(function () { });
        }
        if (planoEl) {
            planoEl.innerHTML = '<option value="">Carregando...</option>';
            api('/plans').then(function (data) {
                var plans = Array.isArray(data) ? data : (data.plans || data.rows || []);
                planoEl.innerHTML = '<option value="">Selecione o plano</option>';
                plans.forEach(function (p) {
                    var code = p.code || p.id;
                    var price = p.price != null ? Number(p.price) : '';
                    var label = (p.code || '') + (p.speed_display ? ' - ' + p.speed_display : '') + (price !== '' ? ' - R$ ' + Number(price).toFixed(2) : '');
                    var opt = new Option(label || code, code);
                    if (price !== '')
                        opt.setAttribute('data-price', String(price));
                    planoEl.appendChild(opt);
                });
            }).catch(function () {
                planoEl.innerHTML = '<option value="">Erro ao carregar planos</option>';
            });
        }
        document.getElementById('cadContratoValor').value = '';
        document.getElementById('cadContratoVencimento').value = '10';
        document.getElementById('cadContratoGerarFatura').value = '1';
        document.getElementById('cadContratoDescontoRecorrente').value = '';
        document.getElementById('cadContratoDescontoAteVenc').value = '';
        document.getElementById('cadContratoAcrescimo').value = '';
        document.getElementById('cadContratoIsentarAte').value = '';
        document.getElementById('cadContratoLiberarAte').value = '';
        document.getElementById('cadContratoObs').value = '';
        document.getElementById('cadContratoLogin').value = '';
        document.getElementById('cadContratoSenha').value = '';
        document.getElementById('cadContratoLoginInstalado').value = '';
        document.getElementById('cadContratoSenhaInstalado').value = '';
        document.getElementById('cadContratoValorCustom').value = '';
        document.getElementById('cadContratoValorMotivo').value = '';
        document.getElementById('cadContratoJaInstaladoNao').checked = true;
        document.getElementById('cadContratoCriarAcesso').checked = true;
        document.getElementById('cadContratoBlocoNaoInstalado').classList.remove('d-none');
        document.getElementById('cadContratoBlocoJaInstalado').classList.add('d-none');
        var modeloEl = document.getElementById('cadContratoModeloDocumento');
        if (modeloEl) {
            modeloEl.innerHTML = '<option value="">Modelo padrÃ£o</option>';
        }
        var modoA = document.getElementById('cadContratoModoA');
        if (modoA)
            modoA.checked = true;
        document.getElementById('cadContratoAceite') && (document.getElementById('cadContratoAceite').checked = false);
        var ph = document.getElementById('cadContratoPreviewPlaceholder');
        if (ph) {
            ph.style.display = 'block';
            ph.textContent = 'Selecione um modelo e os dados do plano para ver a prÃ©-visualizaÃ§Ã£o.';
        }
        var prevIframe = document.getElementById('cadContratoPreviewIframe');
        if (prevIframe) {
            prevIframe.srcdoc = '';
            prevIframe.style.display = 'none';
        }
        var eqList = document.getElementById('cadContratoEquipamentosList');
        if (eqList)
            eqList.innerHTML = '';
        cadContratoWizardStep = 1;
        cadContratoUpdateWizardUI();
        updateCadContratoTotal();
        safeShowModal('modalCadastrarContrato');
    }
    function cadContratoUpdateWizardUI() {
        var step = cadContratoWizardStep;
        [1, 2, 3, 4].forEach(function (s) {
            var pane = document.getElementById('cadContratoPane' + s);
            if (pane)
                pane.classList.toggle('d-none', s !== step);
            var stepEl = document.querySelector('.cad-contrato-wizard-step[data-cad-step="' + s + '"]');
            if (stepEl) {
                stepEl.classList.remove('active', 'completed');
                if (s === step)
                    stepEl.classList.add('active');
                else if (s < step)
                    stepEl.classList.add('completed');
            }
        });
        var btnAnt = document.getElementById('btnCadContratoAnterior');
        var btnProx = document.getElementById('btnCadContratoProximo');
        var btnSalvar = document.getElementById('btnSalvarCadastroContrato');
        if (btnAnt)
            btnAnt.style.display = step > 1 ? 'inline-block' : 'none';
        if (btnProx) {
            btnProx.classList.toggle('d-none', step === 4);
            var t = btnProx.querySelector('.btn-text');
            if (t)
                t.textContent = step === 3 ? 'RevisÃ£o e finalizar' : (step === 2 ? 'Contrato (documento)' : 'PrÃ³ximo');
        }
        if (btnSalvar) {
            btnSalvar.classList.toggle('d-none', step !== 4);
            if (step === 4)
                btnSalvar.innerHTML = '<i class="bi bi-check-lg me-1"></i>Finalizar';
        }
    }
    function updateCadContratoTotal() {
        var valorEl = document.getElementById('cadContratoValor');
        var valorStr = (valorEl && valorEl.value || '').replace(',', '.');
        var base = parseFloat(valorStr) || 0;
        var descRec = (document.getElementById('cadContratoDescontoRecorrente') || {}).value || '';
        var descRecVal = 0;
        if (descRec.trim()) {
            if (descRec.trim().endsWith('%')) {
                var pct = parseFloat(descRec.replace(/%/g, '').replace(',', '.')) || 0;
                descRecVal = base * (pct / 100);
            }
            else {
                descRecVal = parseFloat(descRec.replace(',', '.')) || 0;
            }
        }
        var descAteVenc = parseFloat((document.getElementById('cadContratoDescontoAteVenc') || {}).value || '0') || 0;
        var acresc = parseFloat((document.getElementById('cadContratoAcrescimo') || {}).value || '0') || 0;
        var total = Math.max(0, base - descRecVal - descAteVenc + acresc);
        var totalEl = document.getElementById('cadContratoTotalCalculado');
        if (totalEl)
            totalEl.textContent = 'R$ ' + total.toFixed(2).replace('.', ',');
    }
    document.getElementById('cadContratoPlano') && document.getElementById('cadContratoPlano').addEventListener('change', function () {
        if (cadContratoValorEditado)
            return;
        var sel = this.options[this.selectedIndex];
        var price = sel && sel.getAttribute('data-price');
        var valorEl = document.getElementById('cadContratoValor');
        if (valorEl && price !== null && price !== '') {
            var v = parseFloat(price);
            valorEl.value = !isNaN(v) ? v.toFixed(2) : '';
        }
        else if (valorEl)
            valorEl.value = '';
        updateCadContratoTotal();
    });
    function cadContratoStepNext() {
        var planCode = (document.getElementById('cadContratoPlano').value || '').trim();
        var valorEl = document.getElementById('cadContratoValor');
        var vencEl = document.getElementById('cadContratoVencimento');
        var erroEl = document.getElementById('cadContratoErro');
        if (cadContratoWizardStep === 1) {
            if (!planCode) {
                erroEl.textContent = 'Selecione o plano.';
                erroEl.classList.remove('d-none');
                return;
            }
            var val = parseFloat((valorEl.value || '0').replace(',', '.'));
            if (!val || val <= 0) {
                erroEl.textContent = 'Informe o valor mensal.';
                erroEl.classList.remove('d-none');
                return;
            }
            var due = parseInt(vencEl.value || '10', 10);
            if (isNaN(due) || due < 1 || due > 28) {
                erroEl.textContent = 'Vencimento deve ser entre 1 e 28.';
                erroEl.classList.remove('d-none');
                return;
            }
            erroEl.classList.add('d-none');
        }
        if (cadContratoWizardStep === 4)
            return;
        cadContratoWizardStep++;
        if (cadContratoWizardStep === 3) {
            loadCadContratoTemplates();
            cadContratoUpdatePreview();
        }
        if (cadContratoWizardStep === 4) {
            var planoSelect = document.getElementById('cadContratoPlano');
            var planoOpt = planoSelect && planoSelect.options[planoSelect.selectedIndex];
            document.getElementById('cadContratoResumoPlano').textContent = planoOpt ? planoOpt.text : 'â€”';
            document.getElementById('cadContratoResumoValor').textContent = document.getElementById('cadContratoTotalCalculado').textContent;
            document.getElementById('cadContratoResumoVencimento').textContent = 'Dia ' + (document.getElementById('cadContratoVencimento').value || '10');
            document.getElementById('cadContratoResumoGerarFatura').textContent = document.getElementById('cadContratoGerarFatura').value === '1' ? 'Sim' : 'NÃ£o';
            var jaInstalado = document.getElementById('cadContratoJaInstaladoSim').checked;
            document.getElementById('cadContratoResumoAcesso').textContent = jaInstalado ? 'JÃ¡ instalado (atualizar credenciais opcional)' : 'Nova instalaÃ§Ã£o (PPPoE)';
            var hoje = new Date();
            var diaVenc = parseInt(document.getElementById('cadContratoVencimento').value || '10', 10);
            var proxVenc = new Date(hoje.getFullYear(), hoje.getMonth(), diaVenc);
            if (proxVenc <= hoje)
                proxVenc.setMonth(proxVenc.getMonth() + 1);
            document.getElementById('cadContratoResumoPrimeiraCobranca').textContent = 'PrÃ³ximo vencimento: ' + proxVenc.getDate().toString().padStart(2, '0') + '/' + (proxVenc.getMonth() + 1).toString().padStart(2, '0') + '/' + proxVenc.getFullYear();
            var modoA = document.getElementById('cadContratoModoA');
            var modoB = document.getElementById('cadContratoModoB');
            var modoC = document.getElementById('cadContratoModoC');
            var modoLabel = (modoA && modoA.checked) ? 'AutomÃ¡tico (gerar ao finalizar)' : (modoB && modoB.checked) ? 'Assinatura antes de ativar' : (modoC && modoC.checked) ? 'Gerar depois' : 'â€”';
            var modeloSelect = document.getElementById('cadContratoModeloDocumento');
            var modeloOpt = modeloSelect && modeloSelect.options[modeloSelect.selectedIndex];
            var modeloLabel = (modeloOpt && modeloOpt.value) ? modeloOpt.text : 'Modelo padrÃ£o';
            document.getElementById('cadContratoResumoDocumento').textContent = modeloLabel + ' â€” ' + modoLabel;
        }
        cadContratoUpdateWizardUI();
    }
    function cadContratoStepPrev() {
        if (cadContratoWizardStep <= 1)
            return;
        cadContratoWizardStep--;
        document.getElementById('cadContratoErro').classList.add('d-none');
        cadContratoUpdateWizardUI();
    }
    document.getElementById('btnCadContratoProximo') && document.getElementById('btnCadContratoProximo').addEventListener('click', cadContratoStepNext);
    document.getElementById('btnCadContratoAnterior') && document.getElementById('btnCadContratoAnterior').addEventListener('click', cadContratoStepPrev);
    document.querySelectorAll('.cad-contrato-wizard-step').forEach(function (el) {
        el.addEventListener('click', function () {
            var s = parseInt(this.getAttribute('data-cad-step'), 10);
            if (s < cadContratoWizardStep) {
                cadContratoWizardStep = s;
                cadContratoUpdateWizardUI();
            }
        });
    });
    ['cadContratoValor', 'cadContratoDescontoRecorrente', 'cadContratoDescontoAteVenc', 'cadContratoAcrescimo'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el)
            el.addEventListener('input', updateCadContratoTotal);
    });
    document.getElementById('btnCadContratoEditarValor') && document.getElementById('btnCadContratoEditarValor').addEventListener('click', function () {
        var valorEl = document.getElementById('cadContratoValor');
        document.getElementById('cadContratoValorCustom').value = valorEl.value || '';
        safeShowModal('modalCadContratoEditarValor');
    });
    document.getElementById('btnCadContratoConfirmarValor') && document.getElementById('btnCadContratoConfirmarValor').addEventListener('click', function () {
        var v = parseFloat((document.getElementById('cadContratoValorCustom').value || '0').replace(',', '.'));
        if (!isNaN(v) && v >= 0) {
            document.getElementById('cadContratoValor').value = v.toFixed(2);
            cadContratoValorEditado = true;
            updateCadContratoTotal();
            safeHideModal('modalCadContratoEditarValor');
        }
    });
    document.getElementById('cadContratoJaInstaladoNao') && document.getElementById('cadContratoJaInstaladoNao').addEventListener('change', function () {
        document.getElementById('cadContratoBlocoNaoInstalado').classList.remove('d-none');
        document.getElementById('cadContratoBlocoJaInstalado').classList.add('d-none');
    });
    document.getElementById('cadContratoJaInstaladoSim') && document.getElementById('cadContratoJaInstaladoSim').addEventListener('change', function () {
        document.getElementById('cadContratoBlocoNaoInstalado').classList.add('d-none');
        document.getElementById('cadContratoBlocoJaInstalado').classList.remove('d-none');
    });
    function cadContratoEquipamentoToggleValorMulta(row) {
        var tipo = (row.querySelector('.cad-eq-tipo') || {}).value;
        var valorWrap = row.querySelector('.cad-eq-valor-wrap');
        var multaWrap = row.querySelector('.cad-eq-multa-wrap');
        if (valorWrap)
            valorWrap.style.display = tipo === 'VENDA' ? '' : 'none';
        if (multaWrap)
            multaWrap.style.display = tipo === 'COMODATO' ? '' : 'none';
    }
    function cadContratoAddEquipamentoRow() {
        var tpl = document.getElementById('cadContratoEquipamentoRowTpl');
        var list = document.getElementById('cadContratoEquipamentosList');
        if (!tpl || !list)
            return;
        var index = list.querySelectorAll('.cad-contrato-equipamento-row').length;
        var clone = tpl.content.cloneNode(true);
        var row = clone.querySelector('.cad-contrato-equipamento-row');
        row.setAttribute('data-index', index);
        row.querySelector('.cad-eq-tipo').addEventListener('change', function () { cadContratoEquipamentoToggleValorMulta(row); });
        row.querySelector('.cad-eq-remove').addEventListener('click', function () { row.remove(); });
        cadContratoEquipamentoToggleValorMulta(row);
        list.appendChild(clone);
    }
    document.getElementById('btnCadContratoAddEquipamento') && document.getElementById('btnCadContratoAddEquipamento').addEventListener('click', cadContratoAddEquipamentoRow);
    function cadContratoGetEquipamentosData() {
        var list = document.getElementById('cadContratoEquipamentosList');
        if (!list)
            return [];
        var rows = list.querySelectorAll('.cad-contrato-equipamento-row');
        var out = [];
        rows.forEach(function (row) {
            var tipo = (row.querySelector('.cad-eq-tipo') || {}).value;
            var item = (row.querySelector('.cad-eq-item') || {}).value.trim();
            var serial = (row.querySelector('.cad-eq-serial') || {}).value.trim();
            var valor = parseFloat((row.querySelector('.cad-eq-valor') || {}).value || '0') || 0;
            var multa = parseFloat((row.querySelector('.cad-eq-multa') || {}).value || '0') || 0;
            var osId = parseInt((row.querySelector('.cad-eq-os') || {}).value || '0', 10) || null;
            if (!item)
                return;
            out.push({ movement_type: tipo, name: item, serial_mac: serial || null, value: valor, penalty: multa, os_id: osId });
        });
        return out;
    }
    document.getElementById('btnCadContratoSugerirLogin') && document.getElementById('btnCadContratoSugerirLogin').addEventListener('click', function () {
        var cust = cadContratoCustomerData;
        var customerId = (document.getElementById('cadContratoCustomerId') || {}).value || '';
        var sug = '';
        if (cust) {
            var cpf = (cust.cpf_cnpj || '').replace(/\D/g, '');
            if (cpf.length >= 11)
                sug = cpf;
            else if (customerId)
                sug = 'cliente' + customerId;
            else if ((cust.whatsapp || '').replace(/\D/g, '').length >= 10)
                sug = (cust.whatsapp || '').replace(/\D/g, '');
        }
        else if (customerId)
            sug = 'cliente' + customerId;
        if (sug)
            document.getElementById('cadContratoLogin').value = sug;
    });
    function randomPassword(len) {
        var s = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        var r = '';
        for (var i = 0; i < (len || 10); i++)
            r += s.charAt(Math.floor(Math.random() * s.length));
        return r;
    }
    document.getElementById('btnCadContratoGerarSenha') && document.getElementById('btnCadContratoGerarSenha').addEventListener('click', function () {
        document.getElementById('cadContratoSenha').value = randomPassword(10);
    });
    document.getElementById('btnCadContratoCopiarSenha') && document.getElementById('btnCadContratoCopiarSenha').addEventListener('click', function () {
        var senha = document.getElementById('cadContratoSenha').value;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(senha).then(function () { alert('Senha copiada.'); }).catch(function () { alert('NÃ£o foi possÃ­vel copiar.'); });
        }
        else {
            alert('Senha: ' + senha);
        }
    });
    function loadCadContratoTemplates() {
        var sel = document.getElementById('cadContratoModeloDocumento');
        if (!sel)
            return;
        sel.innerHTML = '<option value="">â€” Carregando â€”</option>';
        api('/contract-templates').then(function (data) {
            var rows = data.rows || [];
            sel.innerHTML = '<option value="">Modelo padrÃ£o</option>';
            rows.forEach(function (r) {
                if (r.is_active !== false)
                    sel.appendChild(new Option(r.name || 'Modelo ' + r.id, r.id));
            });
            cadContratoUpdatePreview();
        }).catch(function () {
            sel.innerHTML = '<option value="">Modelo padrÃ£o</option>';
        });
    }
    function cadContratoUpdatePreview() {
        var iframe = document.getElementById('cadContratoPreviewIframe');
        var placeholder = document.getElementById('cadContratoPreviewPlaceholder');
        var templateId = (document.getElementById('cadContratoModeloDocumento') || {}).value || '';
        var customerName = (document.getElementById('cadContratoClienteNome') || {}).textContent || '';
        var customerId = (document.getElementById('cadContratoCustomerId') || {}).value || '';
        var cust = cadContratoCustomerData || {};
        var payload = {
            template_id: templateId ? parseInt(templateId, 10) : null,
            customer_name: customerName,
            customer_whatsapp: (cust.whatsapp || '').trim(),
            customer_document: (cust.cpf_cnpj || '').toString().replace(/\D/g, ''),
            plan_code: (document.getElementById('cadContratoPlano') || {}).value || '',
            amount: parseFloat((document.getElementById('cadContratoValor') || {}).value || '0') || 0,
            due_day: (document.getElementById('cadContratoVencimento') || {}).value || '10',
            observations: (document.getElementById('cadContratoObs') || {}).value || '',
        };
        var base = window.__API_BASE__ != null ? window.__API_BASE__ : '/api/portal';
        var token = typeof getToken === 'function' ? getToken() : '';
        fetch(base + '/contract-templates/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
        }).then(function (res) {
            if (!res.ok)
                return res.text().then(function () {
                    if (placeholder)
                        placeholder.textContent = 'Erro ao carregar prÃ©-visualizaÃ§Ã£o.';
                });
            return res.text();
        }).then(function (html) {
            if (typeof html !== 'string')
                return;
            if (iframe) {
                iframe.srcdoc = html;
                iframe.style.display = 'block';
            }
            if (placeholder)
                placeholder.style.display = 'none';
        }).catch(function () {
            if (placeholder) {
                placeholder.textContent = 'Erro ao carregar prÃ©-visualizaÃ§Ã£o.';
                placeholder.style.display = 'block';
            }
            if (iframe)
                iframe.style.display = 'none';
        });
    }
    document.getElementById('cadContratoModeloDocumento') && document.getElementById('cadContratoModeloDocumento').addEventListener('change', cadContratoUpdatePreview);
    document.getElementById('btnCadContratoAtualizarPreview') && document.getElementById('btnCadContratoAtualizarPreview').addEventListener('click', cadContratoUpdatePreview);
    function openServicoDadosModal(ct, cust, inst, addrStr) {
        function fd(d) {
            if (!d)
                return 'â€”';
            var s = String(d).slice(0, 10);
            return s.length >= 10 ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : d;
        }
        function fdFull(d) {
            if (!d)
                return 'â€”';
            var s = String(d);
            if (s.length >= 10)
                return fd(s) + ' ' + (s.slice(11, 19) || '');
            return d;
        }
        var statusLabel = (ct && ct.status === 'ACTIVE') ? 'Ativo' : (ct && ct.status === 'CANCELLED') ? 'Inativo' : (ct && ct.status) || 'â€”';
        var login = (inst && inst.pppoe_user) || 'â€”';
        var senha = (inst && inst.pppoe_password) ? 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢' : 'â€”';
        var enderecoCobr = addrStr || 'â€”';
        var enderecoInst = addrStr || 'â€”';
        var planCode = (ct && ct.plan_code) || (inst && inst.plan_code) || 'â€”';
        var planDesc = planCode !== 'â€”' ? planCode + ' - PÃ³s Pago - Valor R$ ' + (ct && ct.amount != null ? Number(ct.amount).toFixed(2) : 'â€”') : 'â€”';
        var html = '<div class="servico-dados-nav">' +
            '<button type="button" class="btn btn-outline-primary btn-sm active" data-servico-pane="0">Dados do ServiÃ§o</button>' +
            '<button type="button" class="btn btn-outline-secondary btn-sm" data-servico-pane="1">InformaÃ§Ãµes TÃ©cnicas</button>' +
            '<button type="button" class="btn btn-outline-secondary btn-sm" data-servico-pane="2">SessÃµes Radius</button>' +
            '<button type="button" class="btn btn-outline-secondary btn-sm" data-servico-pane="3">GrÃ¡ficos</button>' +
            '<button type="button" class="btn btn-outline-secondary btn-sm" data-servico-pane="4">Provisionar ONU</button>' +
            '</div>';
        html += '<div id="servico-pane-0" class="servico-dados-pane active">';
        html += '<div class="servico-dados-section ficha-section">' +
            '<h6><i class="bi bi-wifi me-1"></i>Dados do ServiÃ§o</h6>' +
            '<div class="row"><div class="col-md-6">' +
            '<div class="row-label">Status</div><div class="row-value">' + esc(statusLabel) + '</div>' +
            '<div class="row-label">Contrato</div><div class="row-value">' + esc(ct && ct.id ? String(ct.id) : 'â€”') + '</div>' +
            '<div class="row-label">Contrato Data InÃ­cio</div><div class="row-value">' + esc(ct && ct.starts_at ? fd(ct.starts_at) : 'â€”') + '</div>' +
            '<div class="row-label">Data Cadastro</div><div class="row-value">' + esc(ct && ct.created_at ? fdFull(ct.created_at) : 'â€”') + '</div>' +
            '</div><div class="col-md-6">' +
            '<div class="row-label">Login</div><div class="row-value"><code>' + esc(login) + '</code></div>' +
            '<div class="row-label">Senha</div><div class="row-value"><code>' + esc(senha) + '</code></div>' +
            (login === 'â€”' || senha === 'â€”' ? '<p class="small text-warning mb-2">Defina usuÃ¡rio e senha PPPoE para o cliente poder conectar (e para o teste RADIUS funcionar).</p>' : '') +
            '<div class="mt-2">' +
            '<button type="button" class="btn btn-sm btn-outline-primary me-1 btn-servico-edit-pppoe" data-inst-id="' + (inst && inst.id ? esc(inst.id) : '') + '">Alterar Senha</button>' +
            '<button type="button" class="btn btn-sm btn-outline-primary me-1 btn-servico-edit-pppoe" data-inst-id="' + (inst && inst.id ? esc(inst.id) : '') + '">Alterar Login</button>' +
            '<button type="button" class="btn btn-sm btn-outline-warning me-1">Alterar Status</button>' +
            '<button type="button" class="btn btn-sm btn-outline-secondary me-1">Resetar Radius</button>' +
            '<button type="button" class="btn btn-sm btn-outline-secondary">Imprimir</button>' +
            '</div></div></div></div>';
        html += '<div class="servico-dados-section ficha-section"><h6><i class="bi bi-key me-1"></i>Dados de Acesso</h6>' +
            '<div class="row-label">Vendedor / ComissÃ£o / Pop</div><div class="row-value">â€”</div>' +
            '<div class="row-label">Tags</div><div class="row-value servico-dados-tags"><span class="badge bg-secondary">CLIENTE NOVO</span></div></div>';
        html += '<div class="servico-dados-section ficha-section"><h6><i class="bi bi-currency-dollar me-1"></i>Dados do Plano</h6>' +
            '<div class="row-label">Vencimento</div><div class="row-value">' + esc(ct && ct.due_day != null ? 'Dia ' + ct.due_day : 'â€”') + '</div>' +
            '<div class="row-label">Portador / Forma de CobranÃ§a</div><div class="row-value">Boleto</div></div>';
        html += '<div class="servico-dados-section ficha-section"><h6><i class="bi bi-geo-alt me-1"></i>EndereÃ§o de CobranÃ§a / InstalaÃ§Ã£o</h6>' +
            '<div class="row-value small">' + esc(enderecoCobr) + '</div></div>';
        html += '<div class="servico-dados-section ficha-section"><h6><i class="bi bi-person-badge me-1"></i>Central do Assinante</h6>' +
            '<table class="table table-sm ficha-table"><thead><tr><th>UsuÃ¡rio</th><th>Senha</th><th>Data de Cadastro</th></tr></thead><tbody>' +
            '<tr><td>' + esc(login) + '</td><td><code>' + esc(senha) + '</code></td><td>' + esc(ct && ct.created_at ? fdFull(ct.created_at) : 'â€”') + '</td></tr></tbody></table>' +
            '<button type="button" class="btn btn-sm btn-outline-primary"><i class="bi bi-plus me-1"></i>Adicionar Acesso</button></div>';
        html += '<div class="servico-dados-section ficha-section"><h6><i class="bi bi-info-circle me-1"></i>InformaÃ§Ãµes Adicionais</h6>' +
            '<div class="row-value">' + esc(inst && inst.notes || 'â€”') + '</div></div>';
        html += '</div>';
        html += '<div id="servico-pane-1" class="servico-dados-pane">';
        html += '<div class="servico-info-card"><h6 class="mb-3">Dados do ServiÃ§o</h6>' +
            '<div class="row"><div class="col-md-4">' +
            '<div class="row-label">Contrato</div><div class="row-value">' + esc(ct && ct.id ? String(ct.id) : 'â€”') + '</div>' +
            '<div class="row-label">NAS</div><div class="row-value">â€”</div>' +
            '<div class="row-label">Login</div><div class="row-value"><code>' + esc(login) + '</code></div>' +
            '<div class="row-label">IP Fixo</div><div class="row-value">â€”</div>' +
            '<div class="row-label">MAC</div><div class="row-value">â€”</div>' +
            '</div><div class="col-md-4">' +
            '<div class="row-label">Plano</div><div class="row-value small">' + esc(planDesc) + '</div>' +
            '<div class="row-label">Grupo</div><div class="row-value">â€”</div>' +
            '<div class="row-label">Status ServiÃ§o</div><div class="row-value">' + esc(statusLabel) + '</div>' +
            '</div><div class="col-md-4">' +
            '<div class="mt-2">' +
            '<button type="button" class="btn btn-sm btn-outline-danger me-1 mb-1">Desconectar</button>' +
            '<button type="button" class="btn btn-sm btn-outline-secondary me-1 mb-1">Ping</button>' +
            '<button type="button" class="btn btn-sm btn-outline-secondary me-1 mb-1">Log do Radius</button>' +
            '<button type="button" class="btn btn-sm btn-outline-secondary me-1 mb-1">Encerrar SessÃ£o</button>' +
            '<button type="button" class="btn btn-sm btn-outline-secondary me-1 mb-1">Monitorar TrÃ¡fego</button>' +
            '<button type="button" class="btn btn-sm btn-outline-secondary mb-1">Wireless Info</button>' +
            '</div></div></div>' +
            '<div class="row mt-2"><div class="col-auto"><label class="form-label small mb-0">ICMP Size</label><input type="number" class="form-control form-control-sm" style="width:80px" value="64" /></div>' +
            '<div class="col-auto"><label class="form-label small mb-0">ICMP Count</label><input type="number" class="form-control form-control-sm" style="width:80px" value="4" /></div>' +
            '<div class="col-auto align-self-end"><div class="row-label">Status ConexÃ£o</div><div class="row-value servico-status-offline"><i class="bi bi-circle-fill me-1"></i>Offline</div></div></div></div>';
        html += '</div>';
        html += '<div id="servico-pane-2" class="servico-dados-pane">';
        html += '<h6 class="mb-2">Ãšltimas sessÃµes registradas no RADIUS</h6>' +
            '<div class="d-flex flex-wrap gap-2 align-items-center mb-2">' +
            '<button type="button" class="btn btn-sm btn-outline-secondary"><i class="bi bi-printer me-1"></i>Print</button>' +
            '<span class="text-muted small">Buscar:</span>' +
            '<input type="text" class="form-control form-control-sm" style="max-width:180px" placeholder="UsuÃ¡rio, MAC..." />' +
            '</div>' +
            '<div class="table-responsive"><table class="table table-sm ficha-table">' +
            '<thead><tr><th>UsuÃ¡rio</th><th>MAC</th><th>Conectou</th><th>Desconectou</th><th>IP</th><th>IPv6 Prefix</th><th>IPv6 PD</th><th>Service Name</th><th>NAS Port Id</th><th>NAS IP</th><th>IP PÃºblico CGNAT</th><th>Porta Inicial CGNAT</th><th>Porta Final CGNAT</th><th>Protocolo</th><th>Motivo Ence.</th></tr></thead>' +
            '<tbody><tr><td colspan="15" class="text-center text-muted py-4">NÃ£o foram encontrados resultados</td></tr></tbody></table></div>' +
            '<div class="finance-ficha-pagination mt-2">' +
            '<span>Mostrando de 0 atÃ© 0 de 0 registros</span>' +
            '<div class="btn-group btn-group-sm"><button type="button" class="btn btn-outline-secondary" disabled>Primeiro</button><button type="button" class="btn btn-outline-secondary" disabled>Anterior</button><button type="button" class="btn btn-outline-secondary" disabled>Seguinte</button><button type="button" class="btn btn-outline-secondary" disabled>Ãšltimo</button></div></div>';
        html += '</div>';
        html += '<div id="servico-pane-3" class="servico-dados-pane">';
        html += '<h6 class="mb-3">GrÃ¡ficos</h6>' +
            '<div class="servico-info-card text-center text-muted py-5">GrÃ¡ficos de trÃ¡fego (em breve)</div>' +
            '<p class="small text-muted mt-2">GrÃ¡ficos Anteriores (RRD)</p>';
        html += '</div>';
        html += '<div id="servico-pane-4" class="servico-dados-pane">';
        html += '<h6 class="mb-2">Provisionar ONU</h6>' +
            '<div class="servico-info-card">' +
            '<div class="row align-items-end mb-2"><div class="col-md-6"><label class="form-label small mb-1">OLT</label><div class="input-group input-group-sm"><input type="text" class="form-control" value="POP01 - OLT1 - pop001-site.senai" placeholder="OLT" /><button type="button" class="btn btn-outline-primary">Atualizar</button></div></div><div class="col"><label class="form-label small mb-1">Buscar:</label><input type="text" class="form-control form-control-sm" style="max-width:160px" placeholder="OLT, Slot, PON..." /></div></div>' +
            '<div class="table-responsive"><table class="table table-sm ficha-table">' +
            '<thead><tr><th>OLT</th><th>Slot</th><th>PON</th><th>Phy Addr</th><th>Type</th></tr></thead>' +
            '<tbody><tr><td colspan="5" class="text-center text-muted py-4">NÃ£o foram encontrados resultados</td></tr></tbody></table></div>' +
            '<div class="finance-ficha-pagination mt-2">' +
            '<span>Mostrando de 0 atÃ© 0 de 0 registros</span>' +
            '<div class="btn-group btn-group-sm"><button type="button" class="btn btn-outline-secondary" disabled>Primeiro</button><button type="button" class="btn btn-outline-secondary" disabled>Anterior</button><button type="button" class="btn btn-outline-secondary" disabled>Seguinte</button><button type="button" class="btn btn-outline-secondary" disabled>Ãšltimo</button></div></div>' +
            '<div id="servico-onu-erro" class="alert alert-danger mt-2 small d-none" role="alert">Erro de conexÃ£o com OLT (telnet/SSH). Verifique o host e a rede.</div>' +
            '</div>';
        html += '</div>';
        var bodyEl = document.getElementById('modalServicoDadosBody');
        if (!bodyEl)
            return;
        bodyEl.innerHTML = html;
        document.querySelectorAll('#modalServicoDadosBody [data-servico-pane]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var paneId = this.getAttribute('data-servico-pane');
                document.querySelectorAll('#modalServicoDadosBody .servico-dados-nav .btn').forEach(function (b) { b.classList.remove('active'); b.classList.add('btn-outline-secondary'); b.classList.remove('btn-outline-primary'); });
                this.classList.add('active');
                this.classList.remove('btn-outline-secondary');
                this.classList.add('btn-outline-primary');
                document.querySelectorAll('#modalServicoDadosBody .servico-dados-pane').forEach(function (p) { p.classList.remove('active'); });
                var p = document.getElementById('servico-pane-' + paneId);
                if (p)
                    p.classList.add('active');
            });
        });
        document.querySelectorAll('#modalServicoDadosBody .btn-servico-edit-pppoe').forEach(function (btn) {
            var instId = btn.getAttribute('data-inst-id');
            if (!instId || !inst)
                return;
            btn.addEventListener('click', function () {
                safeHideModal('modalServicoDados');
                openEditPppoe(parseInt(instId, 10), inst);
            });
        });
        safeShowModal('modalServicoDados');
    }
    function showCustomerFichaInline() {
        var listWrap = document.getElementById('customersListWrap');
        var fichaSec = document.getElementById('customerFichaSection');
        if (listWrap)
            listWrap.classList.add('d-none');
        if (fichaSec)
            fichaSec.classList.remove('d-none');
    }
    function hideCustomerFicha() {
        var listWrap = document.getElementById('customersListWrap');
        var fichaSec = document.getElementById('customerFichaSection');
        var editSec = document.getElementById('customerEditFormSection');
        if (listWrap)
            listWrap.classList.remove('d-none');
        if (fichaSec)
            fichaSec.classList.add('d-none');
        if (editSec)
            editSec.classList.add('d-none');
    }
    function viewCustomer(id) {
        if ((window.location.pathname || '') !== '/portal/clientes/' + id) {
            window.history.replaceState({}, '', '/portal/clientes/' + id);
        }
        currentCustomerId = id;
        var c = customersCache.find(function (x) { return x.id == id; });
        var bodyEl = document.getElementById('customerFichaBody');
        if (!bodyEl)
            return;
        bodyEl.innerHTML = '<p class="mb-0"><span class="spinner-border spinner-border-sm me-2"></span>Carregando...</p>';
        showCustomerFichaInline();
        Promise.all([
            api('/customers/' + id),
            api('/customers/' + id + '/history').catch(function () { return { rows: [] }; }),
            api('/contracts?customer_id=' + id).catch(function () { return { rows: [] }; }),
            api('/tickets').catch(function () { return { rows: [] }; }),
            api('/customers/' + id + '/comodato').catch(function () { return { rows: [] }; })
        ]).then(function (results) {
            var data = results[0];
            var historyData = results[1];
            var contractsData = results[2];
            var ticketsData = results[3];
            var comodatoData = results[4];
            var cust = data.customer || {};
            var inst = data.installation || null;
            var invoices = data.invoices || [];
            var history = historyData.rows || [];
            var contracts = contractsData.rows || [];
            var comodatoRows = (comodatoData && comodatoData.rows) ? comodatoData.rows : [];
            var allTickets = ticketsData && Array.isArray(ticketsData.rows) ? ticketsData.rows : [];
            var customerTickets = allTickets.filter(function (t) { return t.customer_id == id; });
            currentInstallationId = inst && inst.id ? inst.id : null;
            var addr = cust.address_json;
            try {
                addr = typeof addr === 'string' ? JSON.parse(addr) : addr;
            }
            catch (e) {
                addr = null;
            }
            var addrStr = addr && typeof addr === 'object' ? (addr.logradouro || addr.rua || '') + (addr.numero ? ', ' + addr.numero : '') + (addr.bairro ? ' - ' + addr.bairro : '') + (addr.cidade ? ', ' + addr.cidade : '') : (addr ? JSON.stringify(addr) : '');
            if (!addrStr && inst && inst.address_json) {
                try {
                    var ia = typeof inst.address_json === 'string' ? JSON.parse(inst.address_json) : inst.address_json;
                    addrStr = ia.logradouro || ia.rua || JSON.stringify(ia);
                }
                catch (e) { }
            }
            var fichaTabs = [
                { key: 'cadastro', label: 'Cadastro' },
                { key: 'contratos', label: 'Contratos' },
                { key: 'financeiro', label: 'Financeiro' },
                { key: 'instalacao', label: 'InstalaÃ§Ã£o' },
                { key: 'comodato', label: 'Comodato / Venda' },
                { key: 'ocorrencias', label: 'OcorrÃªncias' },
                { key: 'extrato', label: 'Extrato de acesso' },
                { key: 'documentos', label: 'Documentos' },
                { key: 'aditivos', label: 'Aditivos' },
                { key: 'anotacoes', label: 'AnotaÃ§Ãµes' },
                { key: 'variaveis', label: 'VariÃ¡veis' },
                { key: 'beneficios', label: 'BenefÃ­cios' },
                { key: 'assinaturas', label: 'Assinaturas EletrÃ´nicas' },
                { key: 'historico', label: 'HistÃ³rico' }
            ];
            var navHtml = '<div class="customer-ficha-tabs-wrap"><nav class="nav customer-ficha-tabs">';
            fichaTabs.forEach(function (t, i) {
                navHtml += '<button type="button" class="nav-link' + (i === 0 ? ' active' : '') + '" data-ficha-tab="' + esc(t.key) + '">' + esc(t.label) + '</button>';
            });
            navHtml += '</nav></div>';
            var paneCadastro = '<div class="ficha-section">' +
                '<div class="ficha-section__title"><i class="bi bi-person-vcard"></i> Dados cadastrais</div>' +
                '<dl class="row ficha-dl mb-0">' +
                '<dt class="col-sm-3 col-md-2">CÃ³digo</dt><dd class="col-sm-9 col-md-4"><code>#' + esc(cust.id) + '</code></dd>' +
                '<dt class="col-sm-3 col-md-2">Nome</dt><dd class="col-sm-9 col-md-4">' + esc(cust.name || 'â€”') + '</dd>' +
                '<dt class="col-sm-3 col-md-2">CPF/CNPJ</dt><dd class="col-sm-9 col-md-4">' + esc(formatCpfCnpj(cust.cpf_cnpj)) + '</dd>' +
                '<dt class="col-sm-3 col-md-2">WhatsApp</dt><dd class="col-sm-9 col-md-4">' + esc(formatPhone(cust.whatsapp)) + '</dd>' +
                '<dt class="col-sm-3 col-md-2">Email</dt><dd class="col-sm-9 col-md-4">' + esc(cust.email || 'â€”') + '</dd>' +
                '<dt class="col-sm-3 col-md-2">Plano</dt><dd class="col-sm-9 col-md-4">' + esc(cust.plan_code || inst?.plan_code || 'â€”') + '</dd>' +
                '<dt class="col-sm-3 col-md-2">Status</dt><dd class="col-sm-9 col-md-4">' + statusBadge(cust.active) + '</dd>' +
                '<dt class="col-sm-3 col-md-2">Pontos (Clube)</dt><dd class="col-sm-9 col-md-4">' + esc(String(cust.points_balance ?? 0)) + ' pts</dd>' +
                '<dt class="col-sm-3 col-md-2">NÃ­vel</dt><dd class="col-sm-9 col-md-4"><span class="badge bg-secondary">' + esc((cust.tier || 'BRONZE').toUpperCase()) + '</span></dd>' +
                '<dt class="col-sm-3 col-md-2">Cadastro</dt><dd class="col-sm-9 col-md-4">' + esc(cust.created_at ? (String(cust.created_at).slice(0, 10).split('-').reverse().join('/') + (String(cust.created_at).length > 10 ? ' ' + String(cust.created_at).slice(11, 16) : '')) : 'â€”') + '</dd>';
            if (addrStr)
                paneCadastro += '<dt class="col-sm-3 col-md-2">EndereÃ§o</dt><dd class="col-sm-9 col-md-10">' + esc(addrStr) + '</dd>';
            if (cust.notes)
                paneCadastro += '<dt class="col-sm-3 col-md-2">ObservaÃ§Ãµes</dt><dd class="col-sm-9 col-md-10">' + esc(cust.notes) + '</dd>';
            paneCadastro += '</dl></div>';
            paneCadastro += '<div class="ficha-section">' +
                '<div class="ficha-section__title"><i class="bi bi-wifi"></i> Dados de acesso (PPPoE)</div>';
            if (inst) {
                var contratoServico = (contracts.length ? 'Contrato #' + esc(contracts[0].id) + ' â€” ServiÃ§o: ' + esc(inst.plan_code || contracts[0].plan_code || 'â€”') : 'ServiÃ§o: ' + esc(inst.plan_code || 'â€”'));
                var user = inst.pppoe_user || 'â€”';
                var pass = inst.pppoe_password ? 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢' : 'â€”';
                paneCadastro += '<p class="small text-secondary mb-2"><strong>' + contratoServico + '</strong></p>' +
                    '<dl class="row ficha-dl mb-0">' +
                    '<dt class="col-sm-3 col-md-2">UsuÃ¡rio</dt><dd class="col-sm-9 col-md-10"><code id="dispPppoeUser">' + esc(user) + '</code> <button type="button" class="btn btn-sm btn-outline-secondary ms-2" data-copy-pppoe-user="' + esc(inst.pppoe_user || '') + '"><i class="bi bi-clipboard me-1"></i>Copiar</button></dd>' +
                    '<dt class="col-sm-3 col-md-2">Senha</dt><dd class="col-sm-9 col-md-10"><code id="dispPppoePass">' + pass + '</code> <button type="button" class="btn btn-sm btn-outline-secondary ms-2" data-reveal-pppoe data-pass="' + esc(inst.pppoe_password || '') + '">Revelar</button>';
                if (currentInstallationId)
                    paneCadastro += ' <button type="button" class="btn btn-sm btn-outline-primary ms-1" id="btnEditPppoe"><i class="bi bi-pencil me-1"></i>Editar acesso</button>';
                paneCadastro += '</dd></dl>';
            }
            else {
                paneCadastro += '<p class="text-muted small mb-0">Sem instalaÃ§Ã£o cadastrada. Marque o pedido como Instalado para gerar usuÃ¡rio e senha PPPoE.</p>';
            }
            paneCadastro += '</div>';
            var financeSubtabs = [
                'TÃ­tulos', 'CarnÃªs', 'AcrÃ©scimos/Descontos', 'Notas Fiscais', 'CartÃµes', 'Acordos de Pagamento',
                'Promessas de Pagamento', 'CobranÃ§a', 'IndicaÃ§Ãµes', 'Cadastro Negativo', 'Faturamento'
            ];
            var aberto = { count: 0, total: 0 }, pagos = { count: 0, total: 0 }, cancelados = { count: 0, total: 0 }, vencidos = { count: 0, total: 0 };
            invoices.forEach(function (inv) {
                var st = inv.status || 'PENDING';
                var amt = Number(inv.amount) || 0;
                if (st === 'PAID') {
                    pagos.count++;
                    pagos.total += amt;
                }
                else if (st === 'OVERDUE') {
                    vencidos.count++;
                    vencidos.total += amt;
                }
                else if (st === 'CANCELLED') {
                    cancelados.count++;
                    cancelados.total += amt;
                }
                else {
                    aberto.count++;
                    aberto.total += amt;
                }
            });
            function diasAteVenc(d) {
                if (!d)
                    return 'â€”';
                var s = String(d).slice(0, 10);
                if (s.length < 10)
                    return 'â€”';
                var venc = new Date(s);
                var hoje = new Date();
                hoje.setHours(0, 0, 0, 0);
                venc.setHours(0, 0, 0, 0);
                var diff = Math.floor((venc - hoje) / (24 * 60 * 60 * 1000));
                return diff < 0 ? diff : diff;
            }
            var paneFinanceiro = '<div class="ficha-section">' +
                '<div class="ficha-section__title"><i class="bi bi-currency-dollar"></i> Financeiro</div>' +
                '<div class="finance-ficha-subtabs">';
            financeSubtabs.forEach(function (label, i) {
                paneFinanceiro += '<button type="button" class="btn btn-outline-secondary btn-sm finance-ficha-subtab' + (i === 0 ? ' active' : '') + '" data-finance-sub="' + esc(String(i)) + '">' + esc(label) + '</button>';
            });
            paneFinanceiro += '</div>' +
                '<div class="finance-ficha-toolbar">' +
                '<button type="button" class="btn btn-primary btn-sm" id="btnFinanceTituloAvulso"><i class="bi bi-plus-lg me-1"></i>Cadastrar TÃ­tulo Avulso</button>' +
                '<button type="button" class="btn btn-outline-primary btn-sm" id="btnFinanceMensalidadeAvulsa">Cadastrar Mensalidade Avulsa</button>' +
                '<button type="button" class="btn btn-outline-success btn-sm" id="btnFinanceCarneParcelado"><i class="bi bi-journal-plus me-1"></i>Gerar carnÃª parcelado</button>' +
                '<span class="text-muted small">Contrato:</span>' +
                '<select class="form-select form-select-sm" id="financeContratoSelect"><option value="">â€” Todos â€”</option>';
            if (contracts.length) {
                contracts.forEach(function (ct) {
                    paneFinanceiro += '<option value="' + esc(ct.id) + '">#' + esc(ct.id) + ' ' + esc(ct.plan_code || '') + '</option>';
                });
            }
            paneFinanceiro += '</select></div>' +
                '<div class="finance-ficha-summary">' +
                'Em aberto(<strong>' + aberto.count + '</strong>): ' + aberto.total.toFixed(2).replace('.', ',') + ' | ' +
                'Pagos(<strong>' + pagos.count + '</strong>): ' + pagos.total.toFixed(2).replace('.', ',') + ' | ' +
                'Cancelados(<strong>' + cancelados.count + '</strong>): ' + cancelados.total.toFixed(2).replace('.', ',') + ' | ' +
                'Vencidos(<strong>' + vencidos.count + '</strong>): ' + vencidos.total.toFixed(2).replace('.', ',') +
                '</div>' +
                '<p class="small fw-600 text-secondary mb-1">TÃ­tulos em aberto</p>' +
                '<div class="finance-ficha-toolbar">' +
                '<span class="text-muted small">Buscar:</span>' +
                '<input type="text" class="form-control form-control-sm" id="financeTitulosSearch" placeholder="Contrato, N. Doc...." style="max-width:200px" />' +
                '</div>' +
                '<div class="table-responsive">' +
                '<table class="table ficha-table table-sm">' +
                '<thead><tr><th>Contrato</th><th>N. Doc.</th><th>EmissÃ£o</th><th>Vencimento</th><th>Dias</th><th>Valor</th><th>Valor Cor.</th><th>Portador</th><th>Modo</th><th>NF</th><th>AÃ§Ãµes</th></tr></thead>' +
                '<tbody id="financeTitulosBody">';
            if (invoices.length) {
                invoices.forEach(function (inv) {
                    var st = inv.status || 'PENDING';
                    var dias = diasAteVenc(inv.due_date);
                    var ref = inv.ref_month || 'â€”';
                    var emissao = ref;
                    paneFinanceiro += '<tr>' +
                        '<td>' + esc(inv.plan_code || ref) + '</td>' +
                        '<td>' + esc(inv.id) + '</td>' +
                        '<td>' + esc(emissao) + '</td>' +
                        '<td>' + esc(inv.due_date || 'â€”') + '</td>' +
                        '<td>' + (typeof dias === 'number' ? String(dias) : esc(dias)) + '</td>' +
                        '<td>R$ ' + (Number(inv.amount) || 0).toFixed(2).replace('.', ',') + '</td>' +
                        '<td>R$ ' + (Number(inv.amount) || 0).toFixed(2).replace('.', ',') + '</td>' +
                        '<td>â€”</td><td>â€”</td><td>â€”</td>' +
                        '<td>';
                    if (st === 'CANCELLED')
                        paneFinanceiro += '<span class="text-muted small">Cancelado</span>';
                    else if (st === 'PAID')
                        paneFinanceiro += '<button type="button" class="btn btn-sm btn-outline-secondary" data-mark-unpaid-inv="' + inv.id + '">Desfazer</button>';
                    else
                        paneFinanceiro += '<button type="button" class="btn btn-sm btn-success me-1" data-mark-paid-inv="' + inv.id + '">Quitar</button>' +
                            '<button type="button" class="btn btn-sm btn-outline-danger me-1" data-invoice-cancel="' + inv.id + '">Desativar</button>' +
                            '<button type="button" class="btn btn-sm btn-outline-primary" data-invoice-edit="' + inv.id + '" data-invoice-due="' + esc(inv.due_date || '') + '" data-invoice-amount="' + esc(inv.amount) + '" data-invoice-plan="' + esc((inv.plan_code || '').toString()) + '" data-invoice-notes="' + esc((inv.notes || '').toString()) + '">Alterar</button>';
                    paneFinanceiro += '</td></tr>';
                });
            }
            else {
                paneFinanceiro += '<tr><td colspan="11" class="text-center text-muted py-4">NÃ£o foram encontrados resultados</td></tr>';
            }
            var totalReg = invoices.length;
            paneFinanceiro += '</tbody></table></div>' +
                '<div class="finance-ficha-pagination">' +
                '<span>Mostrando de ' + (totalReg ? 1 : 0) + ' atÃ© ' + totalReg + ' de ' + totalReg + ' registros</span>' +
                '<div class="btn-group btn-group-sm">' +
                '<button type="button" class="btn btn-outline-secondary" disabled>Primeiro</button>' +
                '<button type="button" class="btn btn-outline-secondary" disabled>Anterior</button>' +
                '<button type="button" class="btn btn-outline-secondary" disabled>Seguinte</button>' +
                '<button type="button" class="btn btn-outline-secondary" disabled>Ãšltimo</button>' +
                '</div></div>' +
                '<div class="finance-ficha-carene">' +
                '<span class="text-muted">CarnÃª:</span> ' +
                '<label class="ms-2 small">CompetÃªncia</label>' +
                '<input type="month" class="form-control form-control-sm d-inline-block ms-1" id="financeFichaCareneMonth" style="width: 140px;" />' +
                '<button type="button" class="btn btn-sm btn-primary ms-2" id="btnFinanceFichaCarenePrint"><i class="bi bi-printer me-1"></i>Imprimir carnÃª</button>' +
                '<span class="text-muted small ms-2">Capa</span>' +
                '<button type="button" class="btn btn-link btn-sm p-0 ms-1" id="btnFinanceFichaCareneCapa" title="Em breve">Capa</button> ' +
                '<span class="text-muted small ms-1">Protocolo</span>' +
                '<button type="button" class="btn btn-link btn-sm p-0 ms-1" id="btnFinanceFichaCareneProtocolo" title="Em breve">Protocolo</button>' +
                '</div></div>';
            var paneHistorico = '<div class="ficha-section">' +
                '<div class="ficha-section__title"><i class="bi bi-clock-history"></i> HistÃ³rico</div>' +
                '<button type="button" class="btn btn-sm btn-outline-primary mb-2" id="btnAddHistory"><i class="bi bi-plus me-1"></i>Adicionar anotaÃ§Ã£o</button>';
            if (history.length) {
                paneHistorico += '<div class="table-responsive"><table class="table ficha-table table-sm"><thead><tr><th>Data</th><th>Tipo</th><th>Assunto</th><th>ConteÃºdo</th></tr></thead><tbody>';
                history.forEach(function (h) {
                    var typeLabel = { NOTE: 'AnotaÃ§Ã£o', CONTACT: 'Contato', CONTRACT: 'Contrato', INSTALLATION: 'InstalaÃ§Ã£o', PAYMENT: 'Pagamento', TICKET: 'Chamado', OS: 'OS', OTHER: 'Outro' }[h.type] || h.type;
                    paneHistorico += '<tr><td>' + esc(h.created_at) + '</td><td>' + esc(typeLabel) + '</td><td>' + esc(h.subject || 'â€”') + '</td><td>' + esc((h.content || '').slice(0, 80)) + (h.content && h.content.length > 80 ? '...' : '') + '</td></tr>';
                });
                paneHistorico += '</tbody></table></div>';
            }
            else {
                paneHistorico += '<p class="text-muted small mb-0">Nenhuma anotaÃ§Ã£o. Clique em Adicionar anotaÃ§Ã£o.</p>';
            }
            paneHistorico += '</div>';
            function formatDateBr(d) {
                if (!d)
                    return 'â€”';
                var s = String(d).slice(0, 10);
                if (s.length < 10)
                    return d;
                return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
            }
            var paneContratos = '<div class="ficha-section">' +
                '<div class="ficha-section__title"><i class="bi bi-file-earmark-text"></i> Contratos</div>' +
                '<div class="contratos-toolbar">' +
                '<button type="button" class="btn btn-primary btn-sm" id="btnContratoCadastrar"><i class="bi bi-plus-lg me-1"></i>Cadastra contrato/ServiÃ§o</button>' +
                '<span class="text-muted small">Buscar:</span>' +
                '<input type="text" class="form-control form-control-sm" id="contratosSearch" placeholder="Contrato ID, cliente..." />' +
                '</div>' +
                '<div class="table-responsive">' +
                '<table class="table ficha-table table-sm">' +
                '<thead><tr>' +
                '<th>Contrato ID</th><th>Data Cadastro</th><th>ServiÃ§os</th><th>Dia Venc.</th><th>Pop / EndereÃ§o</th><th>Forma Cobra.</th><th>Status</th><th>OpÃ§Ãµes</th>' +
                '</tr></thead><tbody id="contratosTableBody">';
            if (contracts.length) {
                contracts.forEach(function (ct) {
                    var servicosLines = [
                        'Plano: ' + (ct.plan_code || 'â€”'),
                        'Valor: R$ ' + (Number(ct.amount) || 0).toFixed(2),
                        'SituaÃ§Ã£o: ' + (ct.status === 'ACTIVE' ? 'Ativo' : ct.status === 'CANCELLED' ? 'Cancelado' : ct.status === 'SUSPENDED' ? 'Suspenso' : ct.status || 'â€”')
                    ].join('\n');
                    var statusLines = [
                        'Status: ' + (ct.status === 'ACTIVE' ? 'Ativo' : ct.status === 'CANCELLED' ? 'Inativo' : ct.status || 'â€”'),
                        'Data: ' + (ct.created_at ? formatDateBr(ct.created_at) + ' ' + String(ct.created_at).slice(11, 19) : 'â€”'),
                        'Modo: AutomÃ¡tico',
                        'Motivo:'
                    ].join('\n');
                    var endereco = addrStr || 'â€”';
                    if (endereco.length > 50)
                        endereco = endereco.slice(0, 47) + '...';
                    paneContratos += '<tr>' +
                        '<td>' + esc(ct.id) + '</td>' +
                        '<td>' + esc(formatDateBr(ct.created_at)) + '</td>' +
                        '<td class="servicos-cell">' + esc(servicosLines) + '</td>' +
                        '<td>' + esc(ct.due_day != null ? String(ct.due_day) : 'â€”') + '</td>' +
                        '<td class="small">' + esc(endereco) + '</td>' +
                        '<td>Boleto</td>' +
                        '<td class="status-cell">' + esc(statusLines) + '</td>' +
                        '<td><div class="dropdown"><button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" data-bs-boundary="viewport" aria-expanded="false">OpÃ§Ãµes</button>' +
                        '<ul class="dropdown-menu dropdown-menu-end">' +
                        '<li><button type="button" class="dropdown-item text-warning" data-contrato-desativar="' + ct.id + '"><i class="bi bi-pause-circle me-1"></i>Desativar</button></li>' +
                        '<li><button type="button" class="dropdown-item text-danger" data-contrato-excluir="' + ct.id + '"><i class="bi bi-trash me-1"></i>Excluir contrato</button></li>' +
                        '<li><hr class="dropdown-divider"></li>' +
                        '<li><button type="button" class="dropdown-item" data-contrato-imprimir="' + ct.id + '"><i class="bi bi-printer me-1"></i>Imprimir contrato</button></li>' +
                        '<li><button type="button" class="dropdown-item" data-contrato-status="' + ct.id + '">Alterar status</button></li>' +
                        '<li><button type="button" class="dropdown-item" data-contrato-view="' + ct.id + '">Ver detalhes</button></li>' +
                        '</ul></div></td></tr>';
                });
            }
            else {
                paneContratos += '<tr><td colspan="8" class="text-center text-muted py-4">NÃ£o foram encontrados resultados</td></tr>';
            }
            paneContratos += '</tbody></table></div></div>';
            var comodatoTbody = '';
            if (comodatoRows.length) {
                comodatoRows.forEach(function (row) {
                    var dataStr = row.created_at ? String(row.created_at).slice(0, 10).split('-').reverse().join('/') : 'â€”';
                    var statusMap = { OPEN: 'Aberto', RETURNED: 'Devolvido', CLOSED: 'Encerrado', CANCELLED: 'Cancelado' };
                    var status = statusMap[row.status] || row.status || 'â€”';
                    var tipoMap = { COMODATO: 'Comodato', VENDA: 'Venda', AVULSO: 'Avulso', ALUGUEL: 'Aluguel' };
                    var tipo = tipoMap[row.movement_type] || row.movement_type || 'â€”';
                    var itensPreview = 'â€”';
                    if (row.items_json) {
                        try {
                            var arr = typeof row.items_json === 'string' ? JSON.parse(row.items_json) : row.items_json;
                            if (Array.isArray(arr))
                                itensPreview = arr.length + ' item(ns)';
                            else
                                itensPreview = tipo;
                        }
                        catch (e) { }
                    }
                    var acaoBtn = (row.status === 'OPEN')
                        ? '<button type="button" class="btn btn-sm btn-outline-warning comodato-btn-devolucao" data-customer-id="' + id + '" data-mov-id="' + row.id + '" data-total="' + (row.total_value != null ? row.total_value : '') + '" data-items="' + esc(itensPreview) + '" title="Registrar devoluÃ§Ã£o"><i class="bi bi-arrow-return-left me-1"></i>DevoluÃ§Ã£o</button>'
                        : 'â€”';
                    comodatoTbody += '<tr>' +
                        '<td>#' + esc(row.id) + '</td>' +
                        '<td>' + esc(dataStr) + '</td>' +
                        '<td>' + esc(cust.name || 'â€”') + '</td>' +
                        '<td>' + (row.contract_id ? '#' + row.contract_id : 'â€”') + '</td>' +
                        '<td>' + (row.os_id ? '#' + row.os_id : 'â€”') + '</td>' +
                        '<td>' + esc(row.nf_number || 'â€”') + '</td>' +
                        '<td>' + esc(status) + '</td>' +
                        '<td>' + esc((row.notes || '').slice(0, 40)) + (row.notes && row.notes.length > 40 ? 'â€¦' : '') + '</td>' +
                        '<td>R$ ' + (row.total_value != null ? Number(row.total_value).toFixed(2).replace('.', ',') : '0,00') + '</td>' +
                        '<td>' + esc(itensPreview) + '</td>' +
                        '<td>' + esc(row.created_by || 'â€”') + '</td>' +
                        '<td>' + acaoBtn + '</td></tr>';
                });
            }
            else {
                comodatoTbody = '<tr><td colspan="12" class="text-center text-muted py-4">NÃ£o foram encontrados resultados</td></tr>';
            }
            var paneComodato = '<div class="ficha-section">' +
                '<div class="ficha-section__title"><i class="bi bi-box-seam"></i> Comodato / Venda</div>' +
                '<div class="comodato-subtabs">' +
                '<button type="button" class="btn btn-outline-primary btn-sm comodato-subtab active" data-comodato-type="comodato">Comodato</button>' +
                '<button type="button" class="btn btn-outline-secondary btn-sm comodato-subtab" data-comodato-type="vendas">Vendas</button>' +
                '<button type="button" class="btn btn-outline-secondary btn-sm comodato-subtab" data-comodato-type="avulsos">LanÃ§amentos Avulsos (OS)</button>' +
                '</div>' +
                '<div class="comodato-toolbar">' +
                '<button type="button" class="btn btn-primary btn-sm" id="btnComodatoCadastrar"><i class="bi bi-plus-lg me-1"></i>Cadastrar</button>' +
                '<button type="button" class="btn btn-outline-secondary btn-sm" id="btnComodatoHistorico"><i class="bi bi-clock-history me-1"></i>HistÃ³rico equipamento</button>' +
                '<span class="text-muted small">Buscar:</span>' +
                '<input type="text" class="form-control form-control-sm" id="comodatoSearch" placeholder="ID, cliente, contrato..." />' +
                '</div>' +
                '<div class="table-responsive">' +
                '<table class="table ficha-table table-sm">' +
                '<thead><tr>' +
                '<th>ID</th><th>Data</th><th>Cliente</th><th>Contrato</th><th>OS</th><th>Nota Fiscal</th>' +
                '<th>Status Comodato</th><th>ObservaÃ§Ãµes</th><th>V. Total</th><th>Itens</th><th>UsuÃ¡rio</th><th>AÃ§Ãµes</th>' +
                '</tr></thead>' +
                '<tbody id="comodatoTableBody">' + comodatoTbody + '</tbody></table></div></div>';
            var paneInstalacao = '<div class="ficha-section">' +
                '<div class="ficha-section__title d-flex justify-content-between align-items-center"><span><i class="bi bi-hdd-network"></i> InstalaÃ§Ã£o</span>';
            if (inst) {
                paneInstalacao += '<div class="btn-group btn-group-sm">' +
                    '<button type="button" class="btn btn-outline-primary" id="btnInstEdit"><i class="bi bi-pencil me-1"></i>Editar instalaÃ§Ã£o</button>' +
                    '<button type="button" class="btn btn-outline-success" data-inst-status="ACTIVE">Ativar</button>' +
                    '<button type="button" class="btn btn-outline-warning" data-inst-status="SUSPENDED">Suspender</button>' +
                    '<button type="button" class="btn btn-outline-danger" data-inst-status="CANCELLED">Cancelar</button>' +
                    '</div>';
            }
            else {
                paneInstalacao += '<button type="button" class="btn btn-outline-primary btn-sm" id="btnInstCriar"><i class="bi bi-plus-lg me-1"></i>Criar instalaÃ§Ã£o</button>';
            }
            paneInstalacao += '</div>';
            if (inst) {
                var instStatus = inst.status || 'â€”';
                var instDate = inst.installed_at ? formatDateBr(inst.installed_at) : 'â€”';
                var instOnt = inst.ont_serial || 'â€”';
                var instCto = inst.cto_code || 'â€”';
                var instAddr = addrStr || 'â€”';
                if (instAddr.length > 80)
                    instAddr = instAddr.slice(0, 77) + '...';
                paneInstalacao += '<dl class="row ficha-dl mb-0">' +
                    '<dt class="col-sm-3 col-md-2">Status</dt><dd class="col-sm-9 col-md-4">' + esc(instStatus) + '</dd>' +
                    '<dt class="col-sm-3 col-md-2">Instalada em</dt><dd class="col-sm-9 col-md-4">' + esc(instDate) + '</dd>' +
                    '<dt class="col-sm-3 col-md-2">Serial ONT</dt><dd class="col-sm-9 col-md-4">' + esc(instOnt) + '</dd>' +
                    '<dt class="col-sm-3 col-md-2">CTO / Ponto</dt><dd class="col-sm-9 col-md-4">' + esc(instCto) + '</dd>' +
                    '<dt class="col-sm-3 col-md-2">EndereÃ§o</dt><dd class="col-sm-9 col-md-10">' + esc(instAddr) + '</dd>' +
                    '</dl>';
                if (inst.notes) {
                    paneInstalacao += '<div class="mt-2"><span class="small text-muted d-block">ObservaÃ§Ãµes da instalaÃ§Ã£o</span><p class="mb-0">' + esc(inst.notes) + '</p></div>';
                }
            }
            else {
                paneInstalacao += '<p class="text-muted small mb-0">Sem instalaÃ§Ã£o cadastrada para este cliente. Marque o pedido como <strong>Instalado</strong> no fluxo de pedidos/OS para gerar a instalaÃ§Ã£o, endereÃ§o e acesso PPPoE.</p>';
            }
            paneInstalacao += '</div>' +
                '<div class="ficha-section mt-3">' +
                '<div class="ficha-section__title"><i class="bi bi-list-check"></i> Procedimentos recomendados</div>' +
                '<ol class="small mb-0">' +
                '<li>Gerar ou localizar o Pedido / OS de instalaÃ§Ã£o do cliente.</li>' +
                '<li>Realizar a visita tÃ©cnica e conferir viabilidade (sinal, CTO, equipamentos).</li>' +
                '<li>Preencher dados tÃ©cnicos: Serial ONT, CTO / ponto, endereÃ§o completo da instalaÃ§Ã£o.</li>' +
                '<li>Vincular o Plano correto ao contrato / instalaÃ§Ã£o e definir dia de vencimento.</li>' +
                '<li>Marcar o pedido / OS como <strong>Instalado</strong> para gerar usuÃ¡rio e senha PPPoE.</li>' +
                '<li>Testar navegaÃ§Ã£o com o usuÃ¡rio PPPoE gerado e registrar qualquer observaÃ§Ã£o.</li>' +
                '</ol></div>';
            var paneOcorrencias = '<div class="ficha-section">' +
                '<div class="ficha-section__title d-flex justify-content-between align-items-center">' +
                '<span><i class="bi bi-chat-dots"></i> OcorrÃªncias (Chamados)</span>' +
                '<button type="button" class="btn btn-sm btn-outline-primary" id="btnOcorrenciaNovo"><i class="bi bi-plus-lg me-1"></i>Novo chamado</button>' +
                '</div>';
            if (customerTickets.length) {
                paneOcorrencias += '<div class="table-responsive"><table class="table ficha-table table-sm">' +
                    '<thead><tr><th>ID</th><th>Assunto</th><th>Prioridade</th><th>Status</th><th>Abertura</th><th>Fechamento</th><th>AÃ§Ãµes</th></tr></thead><tbody>';
                customerTickets.forEach(function (t) {
                    var priMap = { LOW: 'Baixa', NORMAL: 'Normal', HIGH: 'Alta', URGENT: 'Urgente' };
                    var stMap = { OPEN: 'Aberto', IN_PROGRESS: 'Em andamento', PENDING: 'Pendente', RESOLVED: 'Resolvido', CLOSED: 'Fechado' };
                    var pri = priMap[t.priority] || t.priority || 'Normal';
                    var st = stMap[t.status] || t.status || 'Aberto';
                    var opened = t.created_at ? String(t.created_at).slice(0, 19).replace('T', ' ') : 'â€”';
                    var closed = t.closed_at ? String(t.closed_at).slice(0, 19).replace('T', ' ') : 'â€”';
                    paneOcorrencias += '<tr>' +
                        '<td>#' + esc(t.id) + '</td>' +
                        '<td>' + esc(t.subject || 'â€”') + '</td>' +
                        '<td>' + esc(pri) + '</td>' +
                        '<td>' + esc(st) + '</td>' +
                        '<td>' + esc(opened) + '</td>' +
                        '<td>' + esc(closed) + '</td>' +
                        '<td><button type="button" class="btn btn-sm btn-outline-secondary" data-open-ticket-id="' + esc(t.id) + '"><i class="bi bi-headset me-1"></i>Atender</button></td>' +
                        '</tr>';
                });
                paneOcorrencias += '</tbody></table></div>';
            }
            else {
                paneOcorrencias += '<p class="text-muted small mb-0">Nenhum chamado registrado para este cliente. Clique em <strong>Novo chamado</strong> para abrir um atendimento.</p>';
            }
            paneOcorrencias += '</div>';
            var today = new Date().toISOString().slice(0, 10);
            var weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            var paneExtrato = '<div class="ficha-section">' +
                '<div class="ficha-section__title"><i class="bi bi-router"></i> Extrato de acesso (sessÃµes PPPoE / RADIUS)</div>' +
                '<div class="row g-2 mb-3 align-items-end">' +
                '<div class="col-sm-3"><label class="form-label small">De</label><input type="date" class="form-control form-control-sm" id="trafegoDateFrom" value="' + esc(weekAgo) + '" /></div>' +
                '<div class="col-sm-3"><label class="form-label small">AtÃ©</label><input type="date" class="form-control form-control-sm" id="trafegoDateTo" value="' + esc(today) + '" /></div>' +
                '<div class="col-sm-3"><label class="form-label small">PerÃ­odo</label><select class="form-select form-select-sm" id="trafegoPeriodo"><option value="24h">Ãšltimas 24h</option><option value="7d">Ãšltimos 7 dias</option><option value="30d">Ãšltimos 30 dias</option></select></div>' +
                '<div class="col-sm-3"><button type="button" class="btn btn-sm btn-primary w-100" id="btnTrafegoBuscar"><i class="bi bi-arrow-clockwise me-1"></i>Atualizar extrato</button></div>' +
                '</div>' +
                '<div class="finance-table-wrap mb-2">' +
                '<div id="outTrafegoResumo" class="p-2 small text-muted">Clique em <strong>Atualizar extrato</strong> para carregar as sessÃµes de acesso (conexÃµes PPPoE registradas no FreeRADIUS).</div>' +
                '</div>' +
                '<div class="finance-table-wrap table-responsive">' +
                '<div id="outTrafegoTabela" class="p-3 text-center text-muted small">Nenhuma sessÃ£o carregada. Use o perÃ­odo acima e clique em Atualizar extrato.</div>' +
                '</div>' +
                '</div>';
            var placeholder = '<div class="ficha-section"><p class="text-muted small mb-0">Em breve.</p></div>';
            var panes = {
                cadastro: paneCadastro,
                contratos: paneContratos,
                financeiro: paneFinanceiro,
                instalacao: paneInstalacao,
                comodato: paneComodato,
                ocorrencias: paneOcorrencias,
                extrato: paneExtrato,
                documentos: placeholder,
                aditivos: placeholder,
                anotacoes: placeholder,
                variaveis: placeholder,
                beneficios: placeholder,
                assinaturas: placeholder,
                historico: paneHistorico
            };
            var html = navHtml;
            fichaTabs.forEach(function (t, i) {
                html += '<div class="customer-ficha-pane' + (i === 0 ? ' active' : '') + '" id="customer-ficha-pane-' + esc(t.key) + '" data-ficha-pane="' + esc(t.key) + '">' + panes[t.key] + '</div>';
            });
            if (bodyEl)
                bodyEl.innerHTML = html;
            var careneMonthEl = document.getElementById('financeFichaCareneMonth');
            if (careneMonthEl && !careneMonthEl.value)
                careneMonthEl.value = new Date().toISOString().slice(0, 7);
            (function bindFichaTabs() {
                var tabsWrap = bodyEl.querySelector('.customer-ficha-tabs-wrap');
                if (!tabsWrap)
                    return;
                tabsWrap.addEventListener('click', function (e) {
                    var btn = e.target && e.target.closest && e.target.closest('[data-ficha-tab]');
                    if (!btn)
                        return;
                    var key = btn.getAttribute('data-ficha-tab');
                    if (!key)
                        return;
                    bodyEl.querySelectorAll('.customer-ficha-tabs .nav-link').forEach(function (l) { l.classList.remove('active'); });
                    bodyEl.querySelectorAll('.customer-ficha-pane').forEach(function (p) { p.classList.remove('active'); });
                    btn.classList.add('active');
                    var pane = bodyEl.querySelector('#customer-ficha-pane-' + key);
                    if (pane)
                        pane.classList.add('active');
                });
            })();
            document.querySelectorAll('.comodato-subtab').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    document.querySelectorAll('.comodato-subtab').forEach(function (b) {
                        b.classList.remove('active', 'btn-outline-primary');
                        b.classList.add('btn-outline-secondary');
                    });
                    this.classList.add('active', 'btn-outline-primary');
                    this.classList.remove('btn-outline-secondary');
                });
            });
            var btnComodatoCadastrar = document.getElementById('btnComodatoCadastrar');
            if (btnComodatoCadastrar) {
                btnComodatoCadastrar.addEventListener('click', function () {
                    openComodatoVendaModal(id, cust.name || 'Cliente #' + id, contracts);
                });
            }
            var btnContratoCadastrar = document.getElementById('btnContratoCadastrar');
            if (btnContratoCadastrar) {
                btnContratoCadastrar.addEventListener('click', function () {
                    hideCustomerFicha();
                    openCadastrarContratoModal(id, cust.name || 'Cliente #' + id);
                });
            }
            (function () {
                var btnTrafegoBuscar = document.getElementById('btnTrafegoBuscar');
                var outTabela = document.getElementById('outTrafegoTabela');
                var outResumo = document.getElementById('outTrafegoResumo');
                if (!btnTrafegoBuscar || !outTabela)
                    return;
                function fmtBytes(n) {
                    if (n >= 1e9)
                        return (n / 1e9).toFixed(2) + ' GB';
                    if (n >= 1e6)
                        return (n / 1e6).toFixed(2) + ' MB';
                    if (n >= 1e3)
                        return (n / 1e3).toFixed(2) + ' KB';
                    return n + ' B';
                }
                function fmtDuration(sec) {
                    if (sec == null || !Number(sec))
                        return 'â€”';
                    var h = Math.floor(Number(sec) / 3600), m = Math.floor((Number(sec) % 3600) / 60), s = Math.floor(Number(sec) % 60);
                    if (h > 0)
                        return h + 'h ' + m + 'm';
                    if (m > 0)
                        return m + 'm ' + s + 's';
                    return s + 's';
                }
                btnTrafegoBuscar.addEventListener('click', function () {
                    var fromEl = document.getElementById('trafegoDateFrom');
                    var toEl = document.getElementById('trafegoDateTo');
                    var from = (fromEl && fromEl.value) ? fromEl.value : '';
                    var to = (toEl && toEl.value) ? toEl.value : '';
                    outTabela.innerHTML = '<p class="mb-0"><span class="spinner-border spinner-border-sm me-2"></span>Carregando...</p>';
                    var qs = (from ? 'from=' + encodeURIComponent(from) : '') + (to ? (from ? '&' : '') + 'to=' + encodeURIComponent(to) : '');
                    api('/customers/' + id + '/radius-sessions' + (qs ? '?' + qs : '')).then(function (data) {
                        var rows = data.rows || [];
                        var username = data.username || '';
                        var summary = data.summary || {};
                        var resumoParts = [];
                        if (username)
                            resumoParts.push('UsuÃ¡rio PPPoE: <code>' + esc(username) + '</code>');
                        if (summary.totalSessions != null)
                            resumoParts.push(summary.totalSessions + ' sessÃ£o(Ãµes) no perÃ­odo');
                        if (summary.totalDownload != null && summary.totalUpload != null && (summary.totalDownload > 0 || summary.totalUpload > 0)) {
                            resumoParts.push('Total: â†“ ' + fmtBytes(summary.totalDownload) + ' / â†‘ ' + fmtBytes(summary.totalUpload));
                        }
                        else if (rows.length)
                            resumoParts.push(rows.length + ' sessÃ£o(Ãµes) listada(s)');
                        if (outResumo)
                            outResumo.innerHTML = resumoParts.length ? resumoParts.join('. ') + '.' : 'Nenhuma sessÃ£o no perÃ­odo.';
                        if (!rows.length) {
                            outTabela.innerHTML = '<p class="text-muted small mb-0">Nenhuma sessÃ£o encontrada no perÃ­odo.</p>';
                            return;
                        }
                        var tbl = '<table class="table table-sm table-hover mb-0"><thead><tr><th>InÃ­cio</th><th>Fim</th><th>DuraÃ§Ã£o</th><th>NAS</th><th>Download</th><th>Upload</th><th>TÃ©rmino</th><th>IP</th></tr></thead><tbody>';
                        for (var i = 0; i < rows.length; i++) {
                            var r = rows[i];
                            var start = r.acctstarttime ? (String(r.acctstarttime).replace('T', ' ').slice(0, 19)) : 'â€”';
                            var stop = r.acctstoptime ? (String(r.acctstoptime).replace('T', ' ').slice(0, 19)) : (r.acctstoptime === null || r.acctstoptime === undefined ? 'Em uso' : 'â€”');
                            var dur = fmtDuration(r.acctsessiontime);
                            var nas = (r.nasipaddress != null && r.nasipaddress !== '') ? String(r.nasipaddress) : 'â€”';
                            var down = r.acctinputoctets != null ? fmtBytes(Number(r.acctinputoctets)) : 'â€”';
                            var up = r.acctoutputoctets != null ? fmtBytes(Number(r.acctoutputoctets)) : 'â€”';
                            var term = (r.acctterminatecause != null && r.acctterminatecause !== '') ? String(r.acctterminatecause) : 'â€”';
                            var ip = (r.framedipaddress != null && r.framedipaddress !== '') ? String(r.framedipaddress) : 'â€”';
                            tbl += '<tr><td>' + esc(start) + '</td><td>' + esc(stop) + '</td><td>' + esc(dur) + '</td><td>' + esc(nas) + '</td><td>' + esc(down) + '</td><td>' + esc(up) + '</td><td>' + esc(term) + '</td><td>' + esc(ip) + '</td></tr>';
                        }
                        tbl += '</tbody></table>';
                        outTabela.innerHTML = tbl;
                    }).catch(function (err) {
                        outTabela.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
                    });
                });
            })();
            document.querySelectorAll('[data-contrato-status]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var cid = Number(this.getAttribute('data-contrato-status'));
                    var novo = prompt('Novo status (ACTIVE, SUSPENDED, CANCELLED, EXPIRED):', 'ACTIVE');
                    if (novo == null)
                        return;
                    novo = (novo || '').trim().toUpperCase();
                    if (!novo)
                        return;
                    api('/contracts/' + cid, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: novo }) }).then(function () { viewCustomer(id); }).catch(function (err) { alert(err.message); });
                });
            });
            document.querySelectorAll('[data-contrato-view]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var cid = this.getAttribute('data-contrato-view');
                    var ct = contracts.find(function (c) { return String(c.id) === String(cid); });
                    if (!ct)
                        return;
                    openServicoDadosModal(ct, cust, inst, addrStr);
                });
            });
            document.querySelectorAll('[data-contrato-desativar]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var cid = Number(this.getAttribute('data-contrato-desativar'));
                    if (!confirm('Desativar este contrato? O status serÃ¡ alterado para Cancelado.'))
                        return;
                    api('/contracts/' + cid, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'CANCELLED' }) }).then(function () { viewCustomer(id); loadStats(); }).catch(function (err) { alert(err.message); });
                });
            });
            document.querySelectorAll('[data-contrato-excluir]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var cid = Number(this.getAttribute('data-contrato-excluir'));
                    if (!confirm('Excluir definitivamente este contrato? Esta aÃ§Ã£o nÃ£o pode ser desfeita.'))
                        return;
                    api('/contracts/' + cid, { method: 'DELETE' }).then(function () { viewCustomer(id); loadStats(); }).catch(function (err) { alert(err.message); });
                });
            });
            document.querySelectorAll('[data-contrato-imprimir]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var cid = this.getAttribute('data-contrato-imprimir');
                    if (!cid)
                        return;
                    var token = getToken();
                    var url = (window.__API_BASE__ != null ? window.__API_BASE__ : '/api/portal') + '/contracts/' + cid + '/print';
                    fetch(url, { method: 'GET', headers: { 'Authorization': 'Bearer ' + token }, credentials: 'same-origin' })
                        .then(function (res) {
                        if (res.status === 401) {
                            redirectLogin();
                            throw new Error('SessÃ£o expirada.');
                        }
                        if (!res.ok)
                            throw new Error('Erro ao carregar contrato para impressÃ£o.');
                        return res.text();
                    })
                        .then(function (html) {
                        var win = window.open('', '_blank');
                        if (!win) {
                            alert('Permita pop-ups para imprimir o contrato.');
                            return;
                        }
                        win.document.write(html);
                        win.document.close();
                        win.focus();
                        setTimeout(function () { win.print(); }, 300);
                    })
                        .catch(function (err) { alert(err.message); });
                });
            });
            document.querySelectorAll('.finance-ficha-subtab').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    document.querySelectorAll('.finance-ficha-subtab').forEach(function (b) { b.classList.remove('active'); });
                    this.classList.add('active');
                    // Futuro: alternar entre sub-painÃ©is (TÃ­tulos, CarnÃªs, etc.) na ficha
                });
            });
            var btnFinanceTituloAvulso = document.getElementById('btnFinanceTituloAvulso');
            if (btnFinanceTituloAvulso) {
                btnFinanceTituloAvulso.addEventListener('click', function () {
                    alert('Cadastrar tÃ­tulo avulso em breve.');
                });
            }
            var btnFinanceMensalidadeAvulsa = document.getElementById('btnFinanceMensalidadeAvulsa');
            if (btnFinanceMensalidadeAvulsa) {
                btnFinanceMensalidadeAvulsa.addEventListener('click', function () {
                    alert('Cadastrar mensalidade avulsa em breve.');
                });
            }
            var btnFinanceCarneParcelado = document.getElementById('btnFinanceCarneParcelado');
            if (btnFinanceCarneParcelado) {
                btnFinanceCarneParcelado.addEventListener('click', function () {
                    openCarneParceladoModal(cust, contracts);
                });
            }
            var btnFinanceFichaCarenePrint = document.getElementById('btnFinanceFichaCarenePrint');
            if (btnFinanceFichaCarenePrint) {
                btnFinanceFichaCarenePrint.addEventListener('click', function () {
                    var monthEl = document.getElementById('financeFichaCareneMonth');
                    var refMonth = (monthEl && monthEl.value) ? monthEl.value : new Date().toISOString().slice(0, 7);
                    if (!refMonth) {
                        alert('Selecione a competÃªncia.');
                        return;
                    }
                    api('/finance/invoices?customer_id=' + encodeURIComponent(cust.id) + '&ref_month=' + encodeURIComponent(refMonth)).then(function (data) {
                        var rows = data.rows || [];
                        var customerName = cust.name || 'Cliente';
                        var customerWhatsapp = cust.whatsapp || '';
                        var customerEmail = (cust.email || '').trim() || null;
                        if (rows.length) {
                            customerName = rows[0].customer_name || customerName;
                            customerWhatsapp = rows[0].whatsapp != null ? rows[0].whatsapp : customerWhatsapp;
                        }
                        var statusLabel = { PENDING: 'Pendente', PAID: 'Pago', OVERDUE: 'Vencido' };
                        var win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
                        if (!win) {
                            alert('Permita pop-ups para abrir a janela de impressÃ£o.');
                            return;
                        }
                        var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>CarnÃª ' + esc(customerName) + ' â€” ' + refMonth + '</title><style>body{font-family:system-ui,sans-serif;margin:1rem;font-size:12px;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ccc;padding:6px;text-align:left;} th{background:#f0f0f0;} h2{margin:0 0 0.5rem 0;font-size:16px;}</style></head><body>';
                        html += '<h2>CarnÃª â€” ' + esc(customerName) + '</h2><p class="small">CompetÃªncia: ' + esc(refMonth) + ' | Contato: ' + esc(customerWhatsapp) + (customerEmail ? ' | ' + esc(customerEmail) : '') + '</p>';
                        html += '<table><thead><tr><th>CompetÃªncia</th><th>Vencimento</th><th>Valor</th><th>Plano</th><th>Status</th></tr></thead><tbody>';
                        rows.forEach(function (inv) {
                            html += '<tr><td>' + esc(inv.ref_month) + '</td><td>' + esc(inv.due_date) + '</td><td>R$ ' + (inv.amount != null ? Number(inv.amount).toFixed(2).replace('.', ',') : '0,00') + '</td><td>' + esc(inv.plan_code || '') + '</td><td>' + esc(statusLabel[inv.status] || inv.status || '') + '</td></tr>';
                        });
                        html += '</tbody></table></body></html>';
                        win.document.write(html);
                        win.document.close();
                        win.focus();
                        setTimeout(function () { win.print(); }, 300);
                    }).catch(function (err) { alert(err.message); });
                });
            }
            var btnFinanceFichaCareneCapa = document.getElementById('btnFinanceFichaCareneCapa');
            if (btnFinanceFichaCareneCapa) {
                btnFinanceFichaCareneCapa.addEventListener('click', function () { alert('Capa do carnÃª em breve.'); });
            }
            var btnFinanceFichaCareneProtocolo = document.getElementById('btnFinanceFichaCareneProtocolo');
            if (btnFinanceFichaCareneProtocolo) {
                btnFinanceFichaCareneProtocolo.addEventListener('click', function () { alert('Protocolo em breve.'); });
            }
            var btnToggle = document.getElementById('btnToggleCustomer');
            var isActive = cust.active !== 0 && cust.active !== '0' && cust.active !== false;
            if (btnToggle) {
                btnToggle.innerHTML = isActive ? '<i class="bi bi-pause-circle"></i> Desativar' : '<i class="bi bi-play-circle"></i> Reativar';
                btnToggle.className = isActive ? 'btn btn-warning btn-sm' : 'btn btn-success btn-sm';
            }
            document.querySelectorAll('[data-copy-pppoe-user]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var u = this.getAttribute('data-copy-pppoe-user');
                    if (u && navigator.clipboard) {
                        navigator.clipboard.writeText(u).then(function () {
                            var label = btn.querySelector('.btn-label');
                            var icon = btn.innerHTML;
                            btn.innerHTML = '<span class="btn-label">Copiado!</span>';
                            btn.classList.add('btn-success');
                            btn.classList.remove('btn-outline-secondary');
                            setTimeout(function () { btn.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copiar'; btn.classList.remove('btn-success'); btn.classList.add('btn-outline-secondary'); }, 2000);
                        });
                    }
                });
            });
            document.querySelectorAll('[data-reveal-pppoe]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var disp = document.getElementById('dispPppoePass');
                    if (disp) {
                        if (this.getAttribute('data-reveal-pppoe') != null) {
                            disp.textContent = this.getAttribute('data-pass') || 'â€”';
                            this.textContent = 'Ocultar';
                            this.removeAttribute('data-reveal-pppoe');
                            this.setAttribute('data-hide-pppoe', '1');
                        }
                        else {
                            disp.textContent = 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢';
                            this.textContent = 'Revelar';
                            this.removeAttribute('data-hide-pppoe');
                            this.setAttribute('data-reveal-pppoe', '1');
                        }
                    }
                });
            });
            document.querySelectorAll('[data-mark-paid-inv]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var invId = Number(this.getAttribute('data-mark-paid-inv'));
                    if (!confirm('Quitar esta fatura? SerÃ¡ lanÃ§ado no movimento de caixa.'))
                        return;
                    api('/finance/invoices/' + invId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paid: true }) }).then(function () { viewCustomer(id); loadStats(); }).catch(function (err) { alert(err.message); });
                });
            });
            document.querySelectorAll('[data-mark-unpaid-inv]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var invId = Number(this.getAttribute('data-mark-unpaid-inv'));
                    api('/finance/invoices/' + invId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paid: false }) }).then(function () { viewCustomer(id); loadStats(); }).catch(function (err) { alert(err.message); });
                });
            });
            bodyEl.querySelectorAll('[data-invoice-cancel]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var invId = Number(this.getAttribute('data-invoice-cancel'));
                    if (!confirm('Desativar (cancelar) esta fatura?'))
                        return;
                    api('/finance/invoices/' + invId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'CANCELLED' }) }).then(function () { viewCustomer(id); loadStats(); }).catch(function (err) { alert(err.message); });
                });
            });
            bodyEl.querySelectorAll('[data-invoice-edit]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var invId = Number(this.getAttribute('data-invoice-edit'));
                    var due = this.getAttribute('data-invoice-due') || '';
                    var amount = this.getAttribute('data-invoice-amount') || '';
                    var plan = this.getAttribute('data-invoice-plan') || '';
                    var notes = this.getAttribute('data-invoice-notes') || '';
                    openEditInvoiceModal(invId, due, amount, plan, notes, function () { viewCustomer(id); loadStats(); });
                });
            });
            if (document.getElementById('btnEditPppoe')) {
                document.getElementById('btnEditPppoe').onclick = function () { openEditPppoe(currentInstallationId, inst); };
            }
            if (document.getElementById('btnInstEdit')) {
                document.getElementById('btnInstEdit').onclick = function () { openEditCustomer(id); };
            }
            if (document.getElementById('btnInstCriar')) {
                document.getElementById('btnInstCriar').onclick = function () { openEditCustomer(id); };
            }
            if (document.getElementById('btnOcorrenciaNovo')) {
                document.getElementById('btnOcorrenciaNovo').onclick = function () {
                    if (typeof openTicketModal === 'function') {
                        openTicketModal(null);
                        if (typeof setTicketCustomerDisplay === 'function') {
                            setTicketCustomerDisplay(id, cust.name || ('Cliente #' + id), cust.whatsapp || '');
                        }
                    }
                };
            }
            bodyEl.querySelectorAll('[data-open-ticket-id]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var tid = Number(this.getAttribute('data-open-ticket-id'));
                    if (!tid || typeof openTicketModal !== 'function')
                        return;
                    openTicketModal(tid);
                });
            });
            bodyEl.querySelectorAll('[data-inst-status]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    if (!currentInstallationId) {
                        alert('Nenhuma instalaÃ§Ã£o vinculada a este cliente.');
                        return;
                    }
                    var status = this.getAttribute('data-inst-status');
                    if (!status)
                        return;
                    var msg = status === 'ACTIVE' ? 'Ativar instalaÃ§Ã£o?' : status === 'SUSPENDED' ? 'Suspender instalaÃ§Ã£o?' : 'Cancelar instalaÃ§Ã£o?';
                    if (!confirm(msg))
                        return;
                    api('/installations/' + currentInstallationId, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: status })
                    }).then(function () {
                        viewCustomer(id);
                    }).catch(function (err) { alert(err.message); });
                });
            });
            if (document.getElementById('btnAddHistory')) {
                document.getElementById('btnAddHistory').onclick = function () {
                    var content = prompt('ConteÃºdo da anotaÃ§Ã£o:');
                    if (!content)
                        return;
                    api('/customers/' + id + '/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'NOTE', content: content }) }).then(function () { viewCustomer(id); }).catch(function (err) { alert(err.message); });
                };
            }
        }).catch(function (err) {
            var errBody = document.getElementById('customerFichaBody');
            if (errBody)
                errBody.innerHTML = '<div class="alert alert-danger mb-0">' + esc(err.message) + '</div>';
        });
    }
    function openComodatoVendaModal(customerId, customerName, contracts) {
        window._comodatoVendaCustomerId = customerId;
        window._comodatoVendaContracts = contracts || [];
        var modal = document.getElementById('modalComodatoVenda');
        var bodyEl = document.getElementById('modalComodatoVendaBody');
        if (!modal || !bodyEl)
            return;
        bodyEl.innerHTML = '<p class="text-center py-4 mb-0"><span class="spinner-border spinner-border-sm me-2"></span>Carregando estoque...</p>';
        safeShowModal('modalComodatoVenda');
        Promise.all([
            api(estoqueApiBase + '/produtos'),
            api(estoqueApiBase + '/locais')
        ]).then(function (results) {
            var produtos = (results[0] && results[0].list) ? results[0].list : [];
            var locais = (results[1] && results[1].list) ? results[1].list : [];
            var prodOpts = '<option value="">â€” Produto (estoque) â€”</option>' + produtos.map(function (p) {
                return '<option value="' + p.id + '" data-nome="' + esc(p.nome || '') + '">' + esc(p.codigo || '') + ' â€” ' + esc(p.nome || '') + '</option>';
            }).join('');
            var locOpts = locais.length
                ? locais.map(function (l, idx) {
                    return '<option value="' + l.id + '"' + (idx === 0 ? ' selected' : '') + '>' + esc(l.nome || '') + '</option>';
                }).join('')
                : '<option value="">â€” Nenhum local cadastrado â€”</option>';
            var contractOpts = '<option value="">â€” Nenhum â€”</option>' + (window._comodatoVendaContracts || []).map(function (c) {
                return '<option value="' + c.id + '">Contrato #' + c.id + (c.plan_code ? ' â€” ' + esc(c.plan_code) : '') + '</option>';
            }).join('');
            var hoje = new Date().toISOString().slice(0, 10);
            function rowHtml() {
                return '<tr class="comodato-venda-item-row">' +
                    '<td><select class="form-select form-select-sm comodato-venda-produto">' + prodOpts + '</select></td>' +
                    '<td><select class="form-select form-select-sm comodato-venda-local">' + locOpts + '</select></td>' +
                    '<td><input type="number" class="form-control form-control-sm comodato-venda-qty" min="0.001" step="0.001" value="1" placeholder="Qtd" style="width:60px"></td>' +
                    '<td><input type="number" class="form-control form-control-sm comodato-venda-valor" step="0.01" min="0" placeholder="0" style="width:72px"></td>' +
                    '<td><input type="text" class="form-control form-control-sm comodato-venda-mac" placeholder="MAC" style="width:120px"></td>' +
                    '<td><input type="text" class="form-control form-control-sm comodato-venda-serial" placeholder="Serial" style="width:100px"></td>' +
                    '<td><input type="text" class="form-control form-control-sm comodato-venda-marca" placeholder="Marca" style="width:80px"></td>' +
                    '<td><input type="text" class="form-control form-control-sm comodato-venda-modelo" placeholder="Modelo" style="width:90px"></td>' +
                    '<td><input type="text" class="form-control form-control-sm comodato-venda-patrimonio" placeholder="PatrimÃ´nio" style="width:85px"></td>' +
                    '<td><button type="button" class="btn btn-sm btn-outline-danger comodato-venda-remove-row" title="Remover"><i class="bi bi-trash"></i></button></td></tr>';
            }
            bodyEl.innerHTML =
                '<div class="border-bottom pb-2 mb-2"><strong class="small text-uppercase text-muted">Dados do cliente</strong>' +
                    '<p class="small mb-1 mt-1"><strong>Cliente:</strong> ' + esc(customerName) + '</p>' +
                    '<input type="hidden" id="comodatoVendaCustomerId" value="' + esc(String(customerId)) + '">' +
                    '<div class="row g-2">' +
                    '<div class="col-md-4"><label class="form-label small">Contrato</label><select class="form-select form-select-sm" id="comodatoVendaContractId">' + contractOpts + '</select></div>' +
                    '<div class="col-md-8"><label class="form-label small">EndereÃ§o da instalaÃ§Ã£o</label><input type="text" class="form-control form-control-sm" id="comodatoVendaEnderecoInstalacao" placeholder="EndereÃ§o onde o equipamento serÃ¡ instalado"></div></div></div>' +
                    '<div class="border-bottom pb-2 mb-2"><strong class="small text-uppercase text-muted">CondiÃ§Ãµes</strong>' +
                    '<div class="row g-2 mt-1">' +
                    '<div class="col-md-2"><label class="form-label small">Tipo <span class="text-danger">*</span></label><select class="form-select form-select-sm" id="comodatoVendaTipo"><option value="COMODATO">Comodato</option><option value="VENDA">Venda</option><option value="ALUGUEL">Aluguel</option><option value="AVULSO">Avulso (OS)</option></select></div>' +
                    '<div class="col-md-2"><label class="form-label small">Data da entrega</label><input type="date" class="form-control form-control-sm" id="comodatoVendaData" value="' + hoje + '"></div>' +
                    '<div class="col-md-3"><label class="form-label small">TÃ©cnico responsÃ¡vel</label><input type="text" class="form-control form-control-sm" id="comodatoVendaTecnico" placeholder="Nome do tÃ©cnico"></div>' +
                    '<div class="col-md-2"><label class="form-label small">OS (ID)</label><input type="number" class="form-control form-control-sm" id="comodatoVendaOsId" placeholder="Opc." min="0"></div>' +
                    '<div class="col-md-2"><label class="form-label small">NÂº NF</label><input type="text" class="form-control form-control-sm" id="comodatoVendaNf" placeholder="Opc."></div></div></div>' +
                    '<div class="border-bottom pb-2 mb-2"><strong class="small text-uppercase text-muted">Dados do equipamento</strong>' +
                    (locais.length === 0 ? '<div class="alert alert-warning py-2 small mb-2">Cadastre ao menos um <strong>Local</strong> em Estoque &gt; Locais para poder registrar a saÃ­da.</div>' : '') +
                    '<div class="table-responsive"><table class="table table-sm table-bordered"><thead><tr><th>Produto</th><th>Local</th><th>Qtd</th><th>Valor un.</th><th>MAC</th><th>Serial</th><th>Marca</th><th>Modelo</th><th>PatrimÃ´nio</th><th></th></tr></thead><tbody id="comodatoVendaItensBody">' + rowHtml() + '</tbody></table></div>' +
                    '<button type="button" class="btn btn-sm btn-outline-primary" id="comodatoVendaAddRow"><i class="bi bi-plus-lg me-1"></i>Adicionar item</button>' +
                    '<div class="mt-2"><strong class="small text-uppercase text-muted">Documentos</strong>' +
                    '<div class="row g-2 mt-1"><div class="col-md-6"><label class="form-label small">Contrato de comodato (URL PDF)</label><input type="text" class="form-control form-control-sm" id="comodatoVendaContratoPdf" placeholder="URL do PDF"></div>' +
                    '<div class="col-md-6"><label class="form-label small">Assinatura digital (URL ou ref.)</label><input type="text" class="form-control form-control-sm" id="comodatoVendaAssinatura" placeholder="URL ou identificador"></div></div></div>' +
                    '<div class="mt-2"><label class="form-label small">ObservaÃ§Ãµes</label><input type="text" class="form-control form-control-sm" id="comodatoVendaNotes" placeholder="Opcional"></div>';
            document.getElementById('comodatoVendaAddRow').addEventListener('click', function () {
                var tbody = document.getElementById('comodatoVendaItensBody');
                if (tbody)
                    tbody.insertAdjacentHTML('beforeend', rowHtml());
                tbody.querySelectorAll('.comodato-venda-remove-row').forEach(function (btn) {
                    btn.onclick = function () { this.closest('tr').remove(); };
                });
            });
            document.querySelectorAll('#comodatoVendaItensBody .comodato-venda-remove-row').forEach(function (btn) {
                btn.onclick = function () { this.closest('tr').remove(); };
            });
        }).catch(function (err) {
            bodyEl.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message || 'Erro ao carregar estoque.') + '</div>';
        });
    }
    function saveComodatoVenda() {
        var customerId = window._comodatoVendaCustomerId;
        if (!customerId)
            return;
        var errEl = document.getElementById('modalComodatoVendaError');
        if (errEl) {
            errEl.classList.add('d-none');
            errEl.textContent = '';
        }
        var tipo = (document.getElementById('comodatoVendaTipo') || {}).value;
        if (!tipo)
            tipo = 'COMODATO';
        var contractIdEl = document.getElementById('comodatoVendaContractId');
        var contractId = contractIdEl && contractIdEl.value ? parseInt(contractIdEl.value, 10) : null;
        var osIdEl = document.getElementById('comodatoVendaOsId');
        var osId = osIdEl && osIdEl.value && parseInt(osIdEl.value, 10) > 0 ? parseInt(osIdEl.value, 10) : null;
        var nf = (document.getElementById('comodatoVendaNf') || {}).value;
        var notes = (document.getElementById('comodatoVendaNotes') || {}).value;
        var dataMov = (document.getElementById('comodatoVendaData') || {}).value || new Date().toISOString().slice(0, 10);
        var enderecoInstalacao = (document.getElementById('comodatoVendaEnderecoInstalacao') || {}).value;
        var tecnico = (document.getElementById('comodatoVendaTecnico') || {}).value;
        var contratoPdf = (document.getElementById('comodatoVendaContratoPdf') || {}).value;
        var assinatura = (document.getElementById('comodatoVendaAssinatura') || {}).value;
        var itens = [];
        var rows = document.querySelectorAll('#comodatoVendaItensBody tr.comodato-venda-item-row');
        rows.forEach(function (tr) {
            var prod = tr.querySelector('.comodato-venda-produto');
            var loc = tr.querySelector('.comodato-venda-local');
            var qty = tr.querySelector('.comodato-venda-qty');
            var val = tr.querySelector('.comodato-venda-valor');
            var mac = tr.querySelector('.comodato-venda-mac');
            var serial = tr.querySelector('.comodato-venda-serial');
            var marca = tr.querySelector('.comodato-venda-marca');
            var modelo = tr.querySelector('.comodato-venda-modelo');
            var patrimonio = tr.querySelector('.comodato-venda-patrimonio');
            if (prod && prod.value && loc && loc.value && qty && parseFloat(qty.value) > 0) {
                var nome = prod.options[prod.selectedIndex] ? prod.options[prod.selectedIndex].getAttribute('data-nome') || prod.options[prod.selectedIndex].text : '';
                itens.push({
                    produto_id: parseInt(prod.value, 10),
                    local_id: parseInt(loc.value, 10),
                    quantidade: parseFloat(qty.value),
                    valor_unitario: (val && val.value && parseFloat(val.value) >= 0) ? parseFloat(val.value) : null,
                    produto_nome: nome,
                    mac: mac && mac.value ? mac.value.trim() : null,
                    serial: serial && serial.value ? serial.value.trim() : null,
                    marca: marca && marca.value ? marca.value.trim() : null,
                    modelo: modelo && modelo.value ? modelo.value.trim() : null,
                    patrimonio: patrimonio && patrimonio.value ? patrimonio.value.trim() : null
                });
            }
        });
        if (!itens.length) {
            if (errEl) {
                errEl.textContent = 'Preencha ao menos uma linha: selecione Produto, Local e informe a Quantidade.';
                errEl.classList.remove('d-none');
            }
            return;
        }
        var totalValue = itens.reduce(function (acc, it) {
            return acc + (it.valor_unitario != null ? it.valor_unitario * it.quantidade : 0);
        }, 0);
        var itemsJson = itens.map(function (it) {
            return {
                produto_id: it.produto_id,
                produto_nome: it.produto_nome,
                local_id: it.local_id,
                quantidade: it.quantidade,
                valor_unitario: it.valor_unitario,
                mac: it.mac || null,
                serial: it.serial || null,
                marca: it.marca || null,
                modelo: it.modelo || null,
                patrimonio: it.patrimonio || null,
                valor: it.valor_unitario != null ? it.valor_unitario * it.quantidade : null
            };
        });
        var btn = document.getElementById('btnComodatoVendaSave');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvando...';
        }
        api('/customers/' + customerId + '/comodato', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                movement_type: tipo,
                contract_id: contractId,
                os_id: osId,
                nf_number: nf ? String(nf).trim() : null,
                notes: notes ? String(notes).trim() : null,
                total_value: totalValue,
                items_json: itemsJson,
                endereco_instalacao: enderecoInstalacao ? String(enderecoInstalacao).trim() : null,
                data_entrega: dataMov || null,
                tecnico_responsavel: tecnico ? String(tecnico).trim() : null,
                contrato_pdf_url: contratoPdf ? String(contratoPdf).trim() : null,
                assinatura_digital: assinatura ? String(assinatura).trim() : null
            })
        }).then(function () {
            if (tipo === 'COMODATO' || tipo === 'VENDA' || tipo === 'ALUGUEL') {
                var movItens = itens.map(function (it) {
                    return {
                        produto_id: it.produto_id,
                        local_id: it.local_id,
                        quantidade: it.quantidade,
                        entrada_saida: 'S',
                        valor_unitario: it.valor_unitario
                    };
                });
                return api(estoqueApiBase + '/movimentacoes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tipo: tipo,
                        data_movimento: dataMov,
                        observacoes: notes ? 'Cliente #' + customerId + (contractId ? ' â€” Contrato #' + contractId : '') + (notes ? ' â€” ' + notes : '') : 'Cliente #' + customerId + (contractId ? ' â€” Contrato #' + contractId : ''),
                        customer_id: customerId,
                        itens: movItens
                    })
                });
            }
        }).then(function () {
            safeHideModal('modalComodatoVenda');
            if (typeof viewCustomer === 'function' && currentCustomerId)
                viewCustomer(currentCustomerId);
        }).catch(function (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Erro ao salvar.';
                errEl.classList.remove('d-none');
            }
        }).finally(function () {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar';
            }
        });
    }
    document.getElementById('btnComodatoVendaSave') && document.getElementById('btnComodatoVendaSave').addEventListener('click', saveComodatoVenda);
    function openDevolucaoModal(customerId, movId, row) {
        window._devolucaoCustomerId = customerId;
        window._devolucaoMovId = movId;
        var info = 'Movimento #' + movId + (row.total_value != null ? ' â€” R$ ' + Number(row.total_value).toFixed(2).replace('.', ',') : '');
        if (row.items_preview)
            info += ' â€” ' + row.items_preview;
        document.getElementById('devolucaoCustomerId').value = customerId;
        document.getElementById('devolucaoMovId').value = movId;
        document.getElementById('devolucaoEquipamentoInfo').textContent = info;
        document.getElementById('devolucaoData').value = new Date().toISOString().slice(0, 10);
        document.getElementById('devolucaoCondicao').value = 'PERFEITO';
        document.getElementById('devolucaoMulta').value = '';
        document.getElementById('devolucaoMultaWrap').classList.add('d-none');
        document.getElementById('modalDevolucaoError').classList.add('d-none');
        safeShowModal('modalDevolucaoEquipamento');
    }
    document.getElementById('devolucaoCondicao') && document.getElementById('devolucaoCondicao').addEventListener('change', function () {
        document.getElementById('devolucaoMultaWrap').classList.toggle('d-none', this.value !== 'NAO_DEVOLVIDO');
    });
    function saveDevolucao() {
        var customerId = window._devolucaoCustomerId;
        var movId = window._devolucaoMovId;
        if (!customerId || !movId)
            return;
        var errEl = document.getElementById('modalDevolucaoError');
        var dataDev = (document.getElementById('devolucaoData') || {}).value;
        if (!dataDev) {
            if (errEl) {
                errEl.textContent = 'Informe a data da devoluÃ§Ã£o.';
                errEl.classList.remove('d-none');
            }
            return;
        }
        var condicao = (document.getElementById('devolucaoCondicao') || {}).value;
        var multa = (document.getElementById('devolucaoMulta') || {}).value;
        if (errEl)
            errEl.classList.add('d-none');
        var btn = document.getElementById('btnDevolucaoSave');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvando...';
        }
        var body = { data_devolucao: dataDev, condicao_devolucao: condicao, status: 'RETURNED' };
        if (condicao === 'NAO_DEVOLVIDO' && multa && parseFloat(multa) >= 0)
            body.multa_valor = parseFloat(multa);
        api('/customers/' + customerId + '/comodato/' + movId, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function () {
            safeHideModal('modalDevolucaoEquipamento');
            if (typeof viewCustomer === 'function' && currentCustomerId)
                viewCustomer(currentCustomerId);
        }).catch(function (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Erro ao registrar devoluÃ§Ã£o.';
                errEl.classList.remove('d-none');
            }
        }).finally(function () {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Registrar devoluÃ§Ã£o';
            }
        });
    }
    document.getElementById('btnDevolucaoSave') && document.getElementById('btnDevolucaoSave').addEventListener('click', saveDevolucao);
    document.addEventListener('click', function (e) {
        var btn = e.target && (e.target.closest('.comodato-btn-devolucao'));
        if (btn) {
            var cid = btn.getAttribute('data-customer-id');
            var mid = btn.getAttribute('data-mov-id');
            var total = btn.getAttribute('data-total');
            var items = btn.getAttribute('data-items');
            if (cid && mid)
                openDevolucaoModal(cid, mid, { id: mid, total_value: total != null && total !== '' ? parseFloat(total) : null, items_preview: items || '' });
        }
    });
    function openHistoricoEquipamentoModal() {
        document.getElementById('historicoMac').value = '';
        document.getElementById('historicoSerial').value = '';
        document.getElementById('historicoEquipamentoBody').innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Informe MAC ou Serial e clique em Buscar.</td></tr>';
        safeShowModal('modalHistoricoEquipamento');
    }
    function buscarHistoricoEquipamento() {
        var mac = (document.getElementById('historicoMac') || {}).value.trim();
        var serial = (document.getElementById('historicoSerial') || {}).value.trim();
        if (!mac && !serial) {
            document.getElementById('historicoEquipamentoBody').innerHTML = '<tr><td colspan="7" class="text-center text-warning py-2">Informe MAC ou Serial.</td></tr>';
            return;
        }
        var qs = [];
        if (mac)
            qs.push('mac=' + encodeURIComponent(mac));
        if (serial)
            qs.push('serial=' + encodeURIComponent(serial));
        document.getElementById('historicoEquipamentoBody').innerHTML = '<tr><td colspan="7" class="text-center py-2"><span class="spinner-border spinner-border-sm me-1"></span>Buscando...</td></tr>';
        api('/equipamento-historico?' + qs.join('&')).then(function (r) {
            var rows = (r && r.rows) ? r.rows : [];
            var condMap = { PERFEITO: 'Perfeito', DANIFICADO: 'Danificado', NAO_DEVOLVIDO: 'NÃ£o devolvido' };
            if (!rows.length) {
                document.getElementById('historicoEquipamentoBody').innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Nenhum registro encontrado.</td></tr>';
                return;
            }
            var html = rows.map(function (h) {
                var dataInst = h.data_instalacao ? String(h.data_instalacao).slice(0, 10).split('-').reverse().join('/') : 'â€”';
                var dataDev = h.data_devolucao ? String(h.data_devolucao).slice(0, 10).split('-').reverse().join('/') : 'â€”';
                var cond = condMap[h.condicao_devolucao] || h.condicao_devolucao || 'â€”';
                return '<tr><td>' + esc(h.customer_name || 'â€”') + '</td><td>' + esc(h.equipamento_nome || 'â€”') + '</td><td>' + esc(h.mac || 'â€”') + '</td><td>' + esc(h.serial || 'â€”') + '</td><td>' + dataInst + '</td><td>' + dataDev + '</td><td>' + cond + '</td></tr>';
            }).join('');
            document.getElementById('historicoEquipamentoBody').innerHTML = html;
        }).catch(function (err) {
            document.getElementById('historicoEquipamentoBody').innerHTML = '<tr><td colspan="7" class="text-center text-danger py-2">' + esc(err.message || 'Erro ao buscar.') + '</td></tr>';
        });
    }
    document.getElementById('btnComodatoHistorico') && document.getElementById('btnComodatoHistorico').addEventListener('click', openHistoricoEquipamentoModal);
    document.getElementById('btnHistoricoBuscar') && document.getElementById('btnHistoricoBuscar').addEventListener('click', buscarHistoricoEquipamento);
    function openEditPppoe(instId, inst) {
        if (!instId || !inst)
            return;
        var user = prompt('UsuÃ¡rio PPPoE:', inst.pppoe_user || '');
        if (user === null)
            return;
        var pass = prompt('Senha PPPoE (deixe em branco para nÃ£o alterar):', '');
        var body = { pppoe_user: user ? user.trim() : null };
        if (pass !== null && pass !== '')
            body.pppoe_password = pass;
        api('/installations/' + instId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function () {
            if (currentCustomerId)
                viewCustomer(currentCustomerId);
        }).catch(function (err) { alert(err.message); });
    }
    function parseAddressJson(addr) {
        if (!addr)
            return {};
        try {
            return typeof addr === 'string' ? JSON.parse(addr) : addr;
        }
        catch (e) {
            return {};
        }
    }
    function openEditCustomer(id) {
        if ((window.location.pathname || '') !== '/portal/clientes/' + id + '/editar') {
            window.history.replaceState({}, '', '/portal/clientes/' + id + '/editar');
        }
        currentCustomerId = id;
        hideCustomerFicha();
        var editSec = document.getElementById('customerEditFormSection');
        if (!editSec)
            return;
        var titleEl = document.getElementById('customerEditFormTitle');
        if (titleEl)
            titleEl.innerHTML = '<i class="bi bi-pencil-square me-2"></i>Editar Cliente';
        var readonlyRow = document.getElementById('editCustomerReadonlyRow');
        if (readonlyRow) {
            readonlyRow.classList.remove('d-none');
            readonlyRow.style.display = '';
        }
        var whatsappInput = document.getElementById('editCustomerWhatsapp');
        if (whatsappInput) {
            whatsappInput.setAttribute('readonly', 'readonly');
            whatsappInput.setAttribute('disabled', 'disabled');
            whatsappInput.placeholder = '';
        }
        var hint = document.getElementById('editWhatsappHint');
        if (hint)
            hint.textContent = 'Identificador Ãºnico â€” nÃ£o editÃ¡vel';
        var idEl = document.getElementById('editCustomerId');
        if (idEl)
            idEl.value = id;
        var saveBtn = document.getElementById('btnSaveCustomer');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Carregando...';
        }
        showCustomerEditForm();
        api('/customers/' + id).then(function (data) {
            var cust = data.customer || {};
            var inst = data.installation || null;
            document.getElementById('editCustomerCode').value = '#' + (cust.id || id);
            document.getElementById('editCustomerCreated').value = cust.created_at || 'â€”';
            var ptsEl = document.getElementById('editCustomerPointsTier');
            if (ptsEl)
                ptsEl.value = (cust.points_balance ?? 0) + ' pts Â· ' + (cust.tier || 'BRONZE');
            document.getElementById('editCustomerName').value = cust.name || '';
            var cpfRaw = cust.cpf_cnpj ? String(cust.cpf_cnpj).replace(/\D/g, '') : '';
            document.getElementById('editCustomerCpf').value = cpfRaw ? formatCpfCnpj(cpfRaw) : '';
            document.getElementById('editCustomerWhatsapp').value = formatPhone(cust.whatsapp) || '';
            document.getElementById('editCustomerActive').value = (cust.active === 0 || cust.active === '0') ? '0' : '1';
            var notesEl = document.getElementById('editCustomerNotes');
            if (notesEl)
                notesEl.value = cust.notes || '';
            var addr = parseAddressJson(inst && inst.address_json ? inst.address_json : cust.address_json);
            document.getElementById('editAddrStreet').value = addr.logradouro || addr.rua || '';
            document.getElementById('editAddrNumber').value = addr.numero || '';
            document.getElementById('editAddrComplement').value = addr.complemento || '';
            document.getElementById('editAddrNeighborhood').value = addr.bairro || '';
            document.getElementById('editAddrCity').value = addr.cidade || '';
            document.getElementById('editAddrState').value = addr.uf || addr.estado || '';
            document.getElementById('editAddrZip').value = addr.cep || '';
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar tudo';
            }
        }).catch(function (err) {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar tudo';
            }
            alert(err.message || 'Erro ao carregar cliente.');
        });
    }
    function bindCustomerActions() {
        document.querySelectorAll('[data-view-customer]').forEach(function (btn) {
            btn.addEventListener('click', function () { viewCustomer(Number(this.getAttribute('data-view-customer'))); });
        });
        document.querySelectorAll('[data-edit-customer]').forEach(function (btn) {
            btn.addEventListener('click', function () { openEditCustomer(Number(this.getAttribute('data-edit-customer'))); });
        });
    }
    function filterCustomers(rows, q) {
        if (!q || !q.trim())
            return rows;
        var lower = q.trim().toLowerCase();
        return rows.filter(function (r) {
            return (r.name && r.name.toLowerCase().indexOf(lower) >= 0) ||
                (r.whatsapp && String(r.whatsapp).indexOf(lower) >= 0) ||
                (r.email && r.email.toLowerCase().indexOf(lower) >= 0) ||
                (r.cpf_cnpj && String(r.cpf_cnpj).replace(/\D/g, '').indexOf(lower.replace(/\D/g, '')) >= 0);
        });
    }
    function filterCustomersByStatus(rows, statusVal) {
        if (!statusVal || statusVal === '')
            return rows;
        var active = statusVal === '1';
        return rows.filter(function (r) {
            var isActive = r.active !== 0 && r.active !== '0' && r.active !== false;
            return isActive === active;
        });
    }
    function getFilteredCustomers() {
        var q = (document.getElementById('customersSearch') || {}).value || '';
        var statusVal = (document.getElementById('customersStatusFilter') || {}).value || '';
        var step = filterCustomers(customersCache, q);
        return filterCustomersByStatus(step, statusVal);
    }
    function updateCustomersUI() {
        var filtered = getFilteredCustomers();
        document.getElementById('outCustomers').innerHTML = renderCustomersTable(filtered);
        document.getElementById('customersCount').textContent = filtered.length + ' cliente' + (filtered.length !== 1 ? 's' : '');
        var activeCount = customersCache.filter(function (r) { return r.active !== 0 && r.active !== '0' && r.active !== false; }).length;
        var inactiveCount = customersCache.length - activeCount;
        var activeEl = document.getElementById('customersActiveCount');
        var inactiveEl = document.getElementById('customersInactiveCount');
        if (activeEl)
            activeEl.textContent = activeCount;
        if (inactiveEl)
            inactiveEl.textContent = inactiveCount;
        bindCustomerActions();
    }
    function loadCustomersList() {
        setLoading('outCustomers');
        api('/customers').then(function (data) {
            customersCache = data.rows || [];
            updateCustomersUI();
        }).catch(function (err) {
            document.getElementById('outCustomers').innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    document.getElementById('btnCustomerFichaVoltar') && document.getElementById('btnCustomerFichaVoltar').addEventListener('click', hideCustomerFicha);
    safeOn('btnLoadCustomers', 'click', loadCustomersList);
    safeOn('btnEditCustomer', 'click', function () {
        if (currentCustomerId)
            openEditCustomer(currentCustomerId);
    });
    function showCustomerEditForm() {
        var listWrap = document.getElementById('customersListWrap');
        var fichaSec = document.getElementById('customerFichaSection');
        var editSec = document.getElementById('customerEditFormSection');
        if (listWrap)
            listWrap.classList.add('d-none');
        if (fichaSec)
            fichaSec.classList.add('d-none');
        if (editSec)
            editSec.classList.remove('d-none');
    }
    function hideCustomerEditForm() {
        var listWrap = document.getElementById('customersListWrap');
        var editSec = document.getElementById('customerEditFormSection');
        if (listWrap)
            listWrap.classList.remove('d-none');
        if (editSec)
            editSec.classList.add('d-none');
    }
    function openNewCustomer() {
        if ((window.location.pathname || '') !== '/portal/clientes/new') {
            window.history.replaceState({}, '', '/portal/clientes/new');
        }
        var editSec = document.getElementById('customerEditFormSection');
        if (!editSec)
            return;
        currentCustomerId = null;
        var editId = document.getElementById('editCustomerId');
        if (editId)
            editId.value = '';
        var titleEl = document.getElementById('customerEditFormTitle');
        if (titleEl)
            titleEl.innerHTML = '<i class="bi bi-person-plus-fill me-2"></i>Cadastrar cliente';
        var readonlyRow = document.getElementById('editCustomerReadonlyRow');
        if (readonlyRow) {
            readonlyRow.classList.add('d-none');
            readonlyRow.style.display = 'none';
        }
        var whatsappInput = document.getElementById('editCustomerWhatsapp');
        if (whatsappInput) {
            whatsappInput.removeAttribute('readonly');
            whatsappInput.removeAttribute('disabled');
            whatsappInput.placeholder = 'DDD + nÃºmero (ex: 11999999999)';
        }
        var hint = document.getElementById('editWhatsappHint');
        if (hint)
            hint.textContent = 'ObrigatÃ³rio; use sÃ³ nÃºmeros com DDD (ex: 11999999999)';
        var n = document.getElementById('editCustomerName');
        if (n)
            n.value = '';
        var cp = document.getElementById('editCustomerCpf');
        if (cp)
            cp.value = '';
        var wa = document.getElementById('editCustomerWhatsapp');
        if (wa)
            wa.value = '';
        var em = document.getElementById('editCustomerEmail');
        if (em)
            em.value = '';
        var act = document.getElementById('editCustomerActive');
        if (act)
            act.value = '1';
        var notesEl = document.getElementById('editCustomerNotes');
        if (notesEl)
            notesEl.value = '';
        var s = document.getElementById('editAddrStreet');
        if (s)
            s.value = '';
        var num = document.getElementById('editAddrNumber');
        if (num)
            num.value = '';
        var comp = document.getElementById('editAddrComplement');
        if (comp)
            comp.value = '';
        var nb = document.getElementById('editAddrNeighborhood');
        if (nb)
            nb.value = '';
        var city = document.getElementById('editAddrCity');
        if (city)
            city.value = '';
        var st = document.getElementById('editAddrState');
        if (st)
            st.value = '';
        var zip = document.getElementById('editAddrZip');
        if (zip)
            zip.value = '';
        showCustomerEditForm();
    }
    document.getElementById('btnCustomerEditVoltar') && document.getElementById('btnCustomerEditVoltar').addEventListener('click', hideCustomerEditForm);
    document.getElementById('btnCustomerEditCancel') && document.getElementById('btnCustomerEditCancel').addEventListener('click', hideCustomerEditForm);
    safeOn('btnLoadCustomersInitial', 'click', function () {
        loadCustomersList();
    });
    var btnNew = document.getElementById('btnNewCustomer');
    if (btnNew)
        btnNew.addEventListener('click', function () { openNewCustomer(); });
    else {
        document.addEventListener('click', function (e) {
            var target = e.target && e.target.closest ? e.target.closest('#btnNewCustomer') : null;
            if (!target)
                return;
            openNewCustomer();
        }, true);
    }
    document.addEventListener('click', function (e) {
        var target = e.target && e.target.closest ? e.target.closest('#btnCustomerEditVoltar, #btnCustomerEditCancel, #btnCustomerFichaVoltar') : null;
        if (!target)
            return;
        if (target.id === 'btnCustomerFichaVoltar')
            navigateToCustomersPath('/portal/clientes');
        else
            navigateToCustomersPath(currentCustomerId ? '/portal/clientes/' + currentCustomerId : '/portal/clientes');
    }, true);
    document.addEventListener('click', function (e) {
        var target = e.target && e.target.closest ? e.target.closest('#btnLoadCustomers, #btnLoadCustomersInitial') : null;
        if (!target)
            return;
        e.preventDefault();
        loadCustomersList();
    }, true);
    safeOn('btnSalvarCadastroContrato', 'click', function () {
        var customerId = document.getElementById('cadContratoCustomerId').value.trim();
        var planCode = (document.getElementById('cadContratoPlano').value || '').trim();
        var amount = parseFloat((document.getElementById('cadContratoValor').value || '0').replace(',', '.')) || 0;
        var dueDay = Math.min(28, Math.max(1, parseInt(document.getElementById('cadContratoVencimento').value || '10', 10) || 10));
        var jaInstalado = document.getElementById('cadContratoJaInstaladoSim').checked;
        var login = (jaInstalado ? document.getElementById('cadContratoLoginInstalado').value : document.getElementById('cadContratoLogin').value || '').trim();
        var senha = (jaInstalado ? document.getElementById('cadContratoSenhaInstalado').value : document.getElementById('cadContratoSenha').value || '').trim();
        var criarAcesso = !jaInstalado && document.getElementById('cadContratoCriarAcesso').checked;
        var modoC = document.getElementById('cadContratoModoC') && document.getElementById('cadContratoModoC').checked;
        var templateId = (document.getElementById('cadContratoModeloDocumento') || {}).value || '';
        var erroEl = document.getElementById('cadContratoErro');
        function showErr(msg) {
            erroEl.textContent = msg;
            erroEl.classList.remove('d-none');
        }
        if (!customerId) {
            showErr('Cliente nÃ£o definido.');
            return;
        }
        if (!planCode) {
            showErr('Selecione o plano.');
            return;
        }
        erroEl.classList.add('d-none');
        var btn = this;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Finalizando...';
        api('/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_id: parseInt(customerId, 10), plan_code: planCode, amount: amount, due_day: dueDay }) })
            .then(function (contractRes) {
            var newId = contractRes && contractRes.id;
            var useLogin = criarAcesso ? login : (jaInstalado ? login : null);
            if (useLogin !== null && useLogin !== '') {
                return api('/customers/' + customerId).then(function (custData) {
                    var inst = custData.installation;
                    if (inst && inst.id) {
                        return api('/installations/' + inst.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pppoe_user: useLogin, pppoe_password: senha || undefined, plan_code: planCode, due_day: dueDay }) });
                    }
                    else {
                        return api('/installations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_id: parseInt(customerId, 10), plan_code: planCode, due_day: dueDay, pppoe_user: useLogin, pppoe_password: senha || undefined }) });
                    }
                }).then(function () { return newId; });
            }
            return newId;
        })
            .then(function (newContractId) {
            if (!modoC && newContractId && templateId !== undefined) {
                var bodyDoc = templateId ? { template_id: parseInt(templateId, 10) } : {};
                return api('/contracts/' + newContractId + '/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyDoc) })
                    .then(function () { return newContractId; })
                    .catch(function () { return newContractId; });
            }
            return newContractId;
        })
            .then(function (newContractId) {
            var equipamentos = cadContratoGetEquipamentosData();
            if (equipamentos.length > 0 && newContractId && customerId) {
                var byType = { COMODATO: [], VENDA: [] };
                equipamentos.forEach(function (eq) {
                    if (byType[eq.movement_type])
                        byType[eq.movement_type].push(eq);
                });
                var comodatoPromises = [];
                ['COMODATO', 'VENDA'].forEach(function (movType) {
                    var items = byType[movType];
                    if (items.length === 0)
                        return;
                    var totalValue = 0;
                    var itemsJson = items.map(function (it) {
                        totalValue += Number(it.value) || 0;
                        return { name: it.name, serial_mac: it.serial_mac || null, value: it.value, penalty: it.penalty, os_id: it.os_id };
                    });
                    var firstOsId = items[0].os_id || null;
                    comodatoPromises.push(api('/customers/' + customerId + '/comodato', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            movement_type: movType,
                            contract_id: newContractId,
                            os_id: firstOsId,
                            total_value: totalValue,
                            items_json: itemsJson,
                            notes: items.map(function (i) { return i.name + (i.serial_mac ? ' (' + i.serial_mac + ')' : ''); }).join(', ')
                        })
                    }).catch(function () { }));
                });
                return Promise.all(comodatoPromises).then(function () { return newContractId; });
            }
            return newContractId;
        })
            .then(function (newContractId) {
            safeHideModal('modalCadastrarContrato');
            navigateToTab('contracts');
            loadContracts();
            if (typeof loadContractModels === 'function')
                loadContractModels();
            if (newContractId && confirm('Contrato cadastrado. Deseja imprimir o contrato agora?')) {
                var token = getToken();
                var url = (window.__API_BASE__ != null ? window.__API_BASE__ : '/api/portal') + '/contracts/' + newContractId + '/print';
                fetch(url, { method: 'GET', headers: { 'Authorization': 'Bearer ' + token }, credentials: 'same-origin' })
                    .then(function (res) {
                    if (res.status === 401) {
                        redirectLogin();
                        throw new Error('SessÃ£o expirada.');
                    }
                    if (!res.ok)
                        throw new Error('Erro ao carregar contrato para impressÃ£o.');
                    return res.text();
                })
                    .then(function (html) {
                    var win = window.open('', '_blank');
                    if (!win) {
                        alert('Permita pop-ups para imprimir o contrato.');
                        return;
                    }
                    win.document.write(html);
                    win.document.close();
                    win.focus();
                    setTimeout(function () { win.print(); }, 300);
                })
                    .catch(function (err) { alert(err.message); });
            }
        })
            .catch(function (err) {
            showErr(err.message || 'Erro ao cadastrar.');
        })
            .finally(function () {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Finalizar';
        });
    });
    function handleSaveCustomerClick() {
        var id = document.getElementById('editCustomerId').value;
        var name = document.getElementById('editCustomerName').value.trim();
        var whatsappRaw = (document.getElementById('editCustomerWhatsapp').value || '').trim();
        var email = document.getElementById('editCustomerEmail').value.trim() || null;
        var cpfVal = (document.getElementById('editCustomerCpf').value || '').replace(/\D/g, '');
        var active = document.getElementById('editCustomerActive').value === '1';
        if (!name) {
            alert('Nome Ã© obrigatÃ³rio.');
            return;
        }
        if (!id) {
            if (!whatsappRaw || whatsappRaw.replace(/\D/g, '').length < 10) {
                alert('WhatsApp Ã© obrigatÃ³rio (mÃ­nimo 10 dÃ­gitos com DDD).');
                return;
            }
            var body = { name: name, whatsapp: whatsappRaw, email: email, active: active };
            if (cpfVal)
                body.cpf_cnpj = cpfVal;
            var addr = {
                logradouro: (document.getElementById('editAddrStreet') || {}).value || '',
                numero: (document.getElementById('editAddrNumber') || {}).value || '',
                complemento: (document.getElementById('editAddrComplement') || {}).value || '',
                bairro: (document.getElementById('editAddrNeighborhood') || {}).value || '',
                cidade: (document.getElementById('editAddrCity') || {}).value || '',
                uf: (document.getElementById('editAddrState') || {}).value || '',
                cep: (document.getElementById('editAddrZip') || {}).value || ''
            };
            if (addr.logradouro || addr.numero || addr.bairro || addr.cidade || addr.cep)
                body.address_json = addr;
            api('/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                .then(function (res) {
                var newId = res && (res.id || (res.customer && res.customer.id));
                hideCustomerEditForm();
                document.getElementById('btnLoadCustomers').click();
                loadStats();
                if (newId) {
                    // Abre apenas a ficha do cliente recÃ©m-criado.
                    if (typeof viewCustomer === 'function') {
                        viewCustomer(newId);
                    }
                }
                else {
                    alert('Cliente cadastrado com sucesso.');
                }
            })
                .catch(function (err) { alert(err.message); });
            return;
        }
        var customerPayload = { name: name || null, email: email, active: active };
        if (cpfVal)
            customerPayload.cpf_cnpj = cpfVal;
        var notesVal = (document.getElementById('editCustomerNotes') || {}).value;
        if (notesVal !== undefined)
            customerPayload.notes = notesVal.trim() || null;
        var addr = {
            logradouro: (document.getElementById('editAddrStreet') || {}).value || '',
            numero: (document.getElementById('editAddrNumber') || {}).value || '',
            complemento: (document.getElementById('editAddrComplement') || {}).value || '',
            bairro: (document.getElementById('editAddrNeighborhood') || {}).value || '',
            cidade: (document.getElementById('editAddrCity') || {}).value || '',
            uf: (document.getElementById('editAddrState') || {}).value || '',
            cep: (document.getElementById('editAddrZip') || {}).value || ''
        };
        customerPayload.address_json = addr;
        var done = function () {
            hideCustomerEditForm();
            hideCustomerFicha();
            document.getElementById('btnLoadCustomers').click();
            loadStats();
        };
        api('/customers/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(customerPayload) })
            .then(done)
            .catch(function (err) { alert(err.message); });
    }
    safeOn('btnSaveCustomer', 'click', handleSaveCustomerClick);
    document.addEventListener('click', function (e) {
        var target = e.target && e.target.closest ? e.target.closest('#btnSaveCustomer') : null;
        if (!target)
            return;
        e.preventDefault();
        handleSaveCustomerClick.call(target);
    }, true);
    safeOn('btnToggleCustomer', 'click', function () {
        if (!currentCustomerId)
            return;
        var c = customersCache.find(function (x) { return x.id == currentCustomerId; });
        if (!c)
            return;
        var isActive = c.active !== 0 && c.active !== '0' && c.active !== false;
        var newActive = !isActive;
        api('/customers/' + currentCustomerId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: newActive }) }).then(function () {
            c.active = newActive ? 1 : 0;
            hideCustomerFicha();
            document.getElementById('btnLoadCustomers').click();
            loadStats();
        }).catch(function (err) { alert(err.message); });
    });
    function onCustomersFilterChange() {
        updateCustomersUI();
    }
    var searchEl = document.getElementById('customersSearch');
    if (searchEl)
        searchEl.addEventListener('input', onCustomersFilterChange);
    var statusFilterEl = document.getElementById('customersStatusFilter');
    if (statusFilterEl)
        statusFilterEl.addEventListener('change', onCustomersFilterChange);
    document.addEventListener('input', function (e) {
        var target = e.target && e.target.closest ? e.target.closest('#customersSearch') : null;
        if (!target)
            return;
        onCustomersFilterChange();
    }, true);
    document.addEventListener('change', function (e) {
        var target = e.target && e.target.closest ? e.target.closest('#customersStatusFilter') : null;
        if (!target)
            return;
        onCustomersFilterChange();
    }, true);
    function loadCampaigns() {
        var outCamp = document.getElementById('outCampaigns');
        if (!outCamp) return;
        setLoading('outCampaigns');
        api('/campaigns').then(function (data) {
            var out = document.getElementById('outCampaigns');
            if (!out) return;
            var campaigns = data.campaigns || [];
            out.innerHTML = renderTable(campaigns, [
                { key: 'id', label: 'ID' },
                { key: 'name', label: 'Nome' },
                { key: 'status', label: 'Status' },
                { key: 'created_at', label: 'Criada em' },
            ]);
        }).catch(function (err) {
            var out = document.getElementById('outCampaigns');
            if (out) out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    var btnAddCampaign = document.getElementById('btnAddCampaign');
    if (btnAddCampaign) btnAddCampaign.addEventListener('click', function () {
        var name = prompt('Nome da campanha:');
        if (!name || !name.trim())
            return;
        api('/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) }).then(function () {
            loadCampaigns();
            loadStats();
        }).catch(function (err) { alert(err.message); });
    });
    function saveProviderSettings() {
        var errEl = document.getElementById('provError');
        if (errEl) {
            errEl.classList.add('d-none');
            errEl.textContent = '';
        }
        var fantasy = (document.getElementById('provFantasyName') || {}).value || '';
        var legal = (document.getElementById('provLegalName') || {}).value || '';
        if (!fantasy.trim() && !legal.trim()) {
            if (errEl) {
                errEl.classList.remove('d-none');
                errEl.textContent = 'Informe pelo menos o nome fantasia ou raz?o social.';
            }
            else {
                alert('Informe pelo menos o nome fantasia ou raz?o social.');
            }
            return;
        }
        var payload = collectProviderPayload();
        api('/provider', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(function () {
            alert('Dados do provedor salvos com sucesso.');
        }).catch(function (err) {
            if (errEl) {
                errEl.classList.remove('d-none');
                errEl.textContent = err.message || 'Erro ao salvar dados do provedor.';
            }
            else {
                alert(err.message);
            }
        });
    }
    // Logs do FreeRADIUS (aba Sistema)
    var radiusLogsOutput = document.getElementById('radiusLogsOutput');
    function loadRadiusLogs() {
        if (!radiusLogsOutput)
            return;
        var user = (document.getElementById('radiusLogUser') || {}).value || '';
        var tailVal = (document.getElementById('radiusLogTail') || {}).value || '400';
        var tail = parseInt(tailVal, 10) || 400;
        if (tail < 50)
            tail = 50;
        if (tail > 2000)
            tail = 2000;
        radiusLogsOutput.textContent = 'Carregando logs do FreeRADIUS...';
        var url = '/system/radius/logs?tail=' + encodeURIComponent(String(tail));
        if (user && user.trim())
            url += '&user=' + encodeURIComponent(user.trim());
        api(url).then(function (data) {
            if (!data.ok) {
                radiusLogsOutput.textContent = data.message || 'Erro ao ler logs do FreeRADIUS.';
                return;
            }
            var logsText = data.logs || '(Nenhum log retornado para este filtro/intervalo.)';
            var isEmpty = logsText.indexOf('Nenhum registro') !== -1 || logsText.indexOf('Nenhum log') !== -1;
            var hint = '';
            if (isEmpty && data.message) {
                if (data.message.indexOf('journalctl') !== -1) {
                    hint = '\n\n---\n' + data.message;
                }
                else if (data.message.indexOf('Docker CLI') !== -1) {
                    hint = '\n\n---\nNenhum registro em radpostauth. Quando houver autenticaÃ§Ãµes (aceitas ou rejeitadas), elas aparecerÃ£o aqui. Para ver os logs do serviÃ§o FreeRADIUS desta instalaÃ§Ã£o: no host, use journalctl -u freeradius-standalone -n ' + (tail || 400) + ' --no-pager.';
                }
                else {
                    hint = '\n\n---\n' + data.message;
                }
            }
            radiusLogsOutput.textContent = logsText + hint;
        }).catch(function (err) {
            radiusLogsOutput.textContent = err.message || 'Erro ao ler logs do FreeRADIUS.';
        });
    }
    var btnRadius = document.getElementById('btnRadiusLoadLogs');
    if (btnRadius) {
        btnRadius.addEventListener('click', function () { loadRadiusLogs(); });
    }
    function fmtBytes(n) {
        if (n >= 1e9)
            return (n / 1e9).toFixed(2) + ' GB';
        if (n >= 1e6)
            return (n / 1e6).toFixed(2) + ' MB';
        if (n >= 1e3)
            return (n / 1e3).toFixed(2) + ' KB';
        return n + ' B';
    }
    function fmtDuration(sec) {
        if (sec == null || !Number(sec))
            return 'â€”';
        var h = Math.floor(Number(sec) / 3600), m = Math.floor((Number(sec) % 3600) / 60);
        if (h > 0)
            return h + 'h ' + m + 'm';
        if (m > 0)
            return m + 'm';
        return Math.floor(Number(sec) % 60) + 's';
    }
    function loadRadiusOnlineAndStats() {
        api('/radius/status').then(function (data) {
            var badge = document.getElementById('radiusStatusBadge');
            if (badge) {
                var s = (data.status || '').toLowerCase();
                badge.textContent = s === 'online' ? 'Online' : (s === 'stopped' ? 'Parado' : 'â€”');
                badge.className = 'badge ms-2 ' + (s === 'online' ? 'bg-success' : (s === 'stopped' ? 'bg-danger' : 'bg-secondary'));
            }
        }).catch(function () {
            var badge = document.getElementById('radiusStatusBadge');
            if (badge) {
                badge.textContent = 'Parado';
                badge.className = 'badge ms-2 bg-danger';
            }
        });
        api('/radius/init-status').then(function (data) {
            var badgeEl = document.getElementById('radiusInitStatusBadge');
            var msgEl = document.getElementById('radiusInitStatusMessage');
            var hintsEl = document.getElementById('radiusInitStatusHints');
            if (badgeEl) {
                var serviceRunning = !!data.service_running || !!data.container_running;
                if (data.init_ok) {
                    badgeEl.textContent = 'Iniciado corretamente';
                    badgeEl.className = 'badge bg-success';
                }
                else if (serviceRunning) {
                    badgeEl.textContent = 'ServiÃ§o rodando';
                    badgeEl.className = 'badge bg-info';
                }
                else if (data.docker_cli_unavailable) {
                    badgeEl.textContent = 'VerificaÃ§Ã£o indisponÃ­vel';
                    badgeEl.className = 'badge bg-secondary';
                }
                else if (data.container_status === 'not_found' || data.container_status === 'unavailable') {
                    badgeEl.textContent = 'ServiÃ§o nÃ£o disponÃ­vel';
                    badgeEl.className = 'badge bg-warning text-dark';
                }
                else {
                    badgeEl.textContent = 'Parado ou com erro';
                    badgeEl.className = 'badge bg-danger';
                }
            }
            if (msgEl)
                msgEl.textContent = data.init_message || 'â€”';
            if (hintsEl) {
                if (data.init_hints && data.init_hints.length) {
                    hintsEl.textContent = data.init_hints.join(' ');
                    hintsEl.style.display = 'inline';
                }
                else {
                    hintsEl.style.display = 'none';
                }
            }
        }).catch(function () {
            var badgeEl = document.getElementById('radiusInitStatusBadge');
            var msgEl = document.getElementById('radiusInitStatusMessage');
            if (badgeEl) {
                badgeEl.textContent = 'â€”';
                badgeEl.className = 'badge bg-secondary';
            }
            if (msgEl)
                msgEl.textContent = 'NÃ£o foi possÃ­vel verificar a inicializaÃ§Ã£o.';
        });
        api('/radius/stats').then(function (data) {
            var el = document.getElementById('radiusStatOnline');
            if (el)
                el.textContent = (data.online != null) ? data.online : 'â€”';
            el = document.getElementById('radiusStatPeak');
            if (el)
                el.textContent = (data.peakConcurrent != null) ? data.peakConcurrent : (data.peakToday != null ? data.peakToday : 'â€”');
            var tr = data.trafficToday || {};
            el = document.getElementById('radiusStatTraffic');
            if (el)
                el.textContent = (tr.input != null && tr.output != null) ? (fmtBytes(tr.input) + ' / ' + fmtBytes(tr.output)) : 'â€”';
            el = document.getElementById('radiusStatTotalUsers');
            if (el)
                el.textContent = (data.totalUsers != null) ? data.totalUsers : 'â€”';
        }).catch(function () {
            ['radiusStatOnline', 'radiusStatTraffic', 'radiusStatPeak', 'radiusStatTotalUsers'].forEach(function (id) {
                var e = document.getElementById(id);
                if (e)
                    e.textContent = 'â€”';
            });
        });
        api('/radius/summary').then(function (data) {
            var block = document.getElementById('radiusSummaryBlock');
            var textEl = document.getElementById('radiusSummaryText');
            if (!block || !textEl)
                return;
            var parts = [];
            if (data.totalUsers != null)
                parts.push(data.totalUsers + ' usuÃ¡rio(s) no RADIUS');
            if (data.sessionsStartedToday != null)
                parts.push(data.sessionsStartedToday + ' sessÃµes iniciadas hoje');
            if (data.sessionsEndedToday != null)
                parts.push(data.sessionsEndedToday + ' encerradas hoje');
            if (data.usersByGroup && data.usersByGroup.length) {
                var topGroups = data.usersByGroup.slice(0, 5).map(function (g) { return g.groupname + ': ' + g.count; }).join(', ');
                parts.push('Grupos: ' + topGroups);
            }
            textEl.textContent = parts.length ? parts.join(' Â· ') : 'â€”';
            block.style.display = parts.length ? 'block' : 'none';
        }).catch(function () {
            var block = document.getElementById('radiusSummaryBlock');
            if (block)
                block.style.display = 'none';
        });
        api('/radius/online').then(function (data) {
            var tbody = document.getElementById('radiusOnlineTableBody');
            if (!tbody)
                return;
            var rows = data.rows || [];
            if (!rows.length) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3">Nenhuma sessÃ£o ativa.</td></tr>';
                return;
            }
            var html = '';
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i];
                var user = (r.username != null && r.username !== '') ? esc(String(r.username)) : 'â€”';
                var ip = (r.framedipaddress != null && r.framedipaddress !== '') ? esc(String(r.framedipaddress)) : 'â€”';
                var nasDisplay = (r.nas_shortname && r.nas_shortname !== '') ? esc(String(r.nas_shortname)) : ((r.nas_description && r.nas_description !== '') ? esc(String(r.nas_description)) : ((r.nasipaddress != null && r.nasipaddress !== '') ? esc(String(r.nasipaddress)) : 'â€”'));
                var group = (r.groupname != null && r.groupname !== '') ? esc(String(r.groupname)) : 'â€”';
                var start = r.acctstarttime ? (String(r.acctstarttime).replace('T', ' ').slice(0, 19)) : 'â€”';
                var dur = fmtDuration(r.acctsessiontime);
                var down = r.acctinputoctets != null ? fmtBytes(Number(r.acctinputoctets)) : 'â€”';
                var up = r.acctoutputoctets != null ? fmtBytes(Number(r.acctoutputoctets)) : 'â€”';
                html += '<tr><td><code>' + user + '</code></td><td>' + ip + '</td><td>' + nasDisplay + '</td><td>' + group + '</td><td>' + start + '</td><td>' + dur + '</td><td>' + down + '</td><td>' + up + '</td><td><button type="button" class="btn btn-sm btn-outline-danger" data-radius-disconnect="' + esc(r.username || '') + '" title="Enviar CoA Disconnect">Desconectar</button></td></tr>';
            }
            tbody.innerHTML = html;
            tbody.querySelectorAll('[data-radius-disconnect]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var u = this.getAttribute('data-radius-disconnect');
                    if (!u || !confirm('Desconectar o usuÃ¡rio ' + u + ' agora?'))
                        return;
                    var b = this;
                    b.disabled = true;
                    api('/radius/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u }) }).then(function () {
                        loadRadiusOnlineAndStats();
                    }).catch(function (err) {
                        alert(err.message || 'Falha ao desconectar');
                    }).finally(function () { b.disabled = false; });
                });
            });
        }).catch(function (err) {
            var tbody = document.getElementById('radiusOnlineTableBody');
            if (tbody)
                tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger py-2">' + esc(err.message || 'Erro ao carregar sessÃµes.') + '</td></tr>';
        });
    }
    var btnRadiusRefresh = document.getElementById('btnRadiusRefreshOnline');
    if (btnRadiusRefresh)
        btnRadiusRefresh.addEventListener('click', function () { loadRadiusOnlineAndStats(); });
    var btnApplyQuota = document.getElementById('btnApplyQuota');
    if (btnApplyQuota) {
        btnApplyQuota.addEventListener('click', function () {
            var btn = this;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Aplicando...';
            api('/radius/apply-quota', { method: 'POST' }).then(function (data) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-database-down me-1"></i>Aplicar franquia';
                alert('Franquia aplicada. ' + (data.reduced || 0) + ' cliente(s) com velocidade reduzida, ' + (data.restored || 0) + ' restaurado(s).');
                loadRadiusOnlineAndStats();
            }).catch(function (err) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-database-down me-1"></i>Aplicar franquia';
                alert(err.message);
            });
        });
    }
    function renderRadiusContext(data) {
        var providerName = data.provider_name || data.provider_fantasy_name || data.provider_short_name || data.provider_legal_name || 'Provedor';
        var fantasyName = data.provider_fantasy_name || data.provider_short_name || data.provider_legal_name || providerName;
        var serviceName = data.radius_service || (data.standalone ? 'freeradius-standalone' : 'freeradius');
        var modeLabel = data.radius_mode === 'standalone'
            ? 'InstalaÃ§Ã£o Ãºnica'
            : (data.radius_mode === 'tenant' ? 'Modo legado' : 'â€”');
        var providerNameEl = document.getElementById('radiusProviderName');
        var providerFantasyNameEl = document.getElementById('radiusProviderFantasyName');
        var serviceEl = document.getElementById('radiusServiceName');
        var installModeEl = document.getElementById('radiusInstallMode');
        var modeBadgeEl = document.getElementById('radiusModeBadge');
        if (providerNameEl)
            providerNameEl.textContent = providerName;
        if (providerFantasyNameEl)
            providerFantasyNameEl.textContent = fantasyName;
        if (serviceEl)
            serviceEl.textContent = serviceName;
        if (installModeEl)
            installModeEl.textContent = modeLabel;
        if (modeBadgeEl) {
            modeBadgeEl.textContent = modeLabel;
            modeBadgeEl.className = 'badge ms-2 ' + (data.radius_mode === 'standalone' ? 'bg-success' : 'bg-secondary');
        }
        var restartBtn = document.getElementById('btnRadiusRestart');
        if (restartBtn && data.radius_service) {
            restartBtn.title = 'Reiniciar ' + data.radius_service;
        }
    }
    function loadRadiusConfig() {
        api('/radius/config').then(function (data) {
            renderRadiusContext(data);
            var el = document.getElementById('radiusConfigBlockRedirectUrl');
            if (el)
                el.value = data.block_redirect_url || '';
            var block = document.getElementById('radiusCredentialsBlock');
            var hostEl = document.getElementById('radiusCredHost');
            var portEl = document.getElementById('radiusCredPort');
            var secretEl = document.getElementById('radiusCredSecret');
            if (block && (hostEl || portEl || secretEl)) {
                if (data.radius_host || data.radius_port || data.radius_secret_configured) {
                    if (hostEl)
                        hostEl.value = data.radius_host || 'â€”';
                    if (portEl)
                        portEl.value = data.radius_port || '1812';
                    if (secretEl) {
                        secretEl.value = data.radius_secret_configured ? '••••••••••••••••' : '';
                        secretEl.type = 'password';
                    }
                    block.style.display = 'block';
                    var hostWarning = document.getElementById('radiusHostWarning');
                    if (hostWarning && (data.radius_host === '127.0.0.1' || data.radius_host === 'localhost' || !data.radius_host)) {
                        hostWarning.style.display = 'block';
                    }
                    else if (hostWarning) {
                        hostWarning.style.display = 'none';
                    }
                }
                else {
                    block.style.display = 'none';
                }
            }
        }).catch(function () { });
    }
    var btnRadiusRestart = document.getElementById('btnRadiusRestart');
    if (btnRadiusRestart) {
        btnRadiusRestart.addEventListener('click', function () {
            var btn = this;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Reiniciando...';
            api('/radius/restart', { method: 'POST' }).then(function (data) {
                alert(data.message || 'ServiÃ§o reiniciado.');
                loadRadiusOnlineAndStats();
                loadRadiusConfig();
            }).catch(function (err) {
                alert(err.message || 'Falha ao reiniciar o RADIUS.');
            }).finally(function () {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>Reiniciar RADIUS';
            });
        });
    }
    var btnRadiusTest = document.getElementById('btnRadiusTest');
    if (btnRadiusTest) {
        btnRadiusTest.addEventListener('click', function () {
            var usernameEl = document.getElementById('radiusTestUsername') as HTMLInputElement | null;
            var passwordEl = document.getElementById('radiusTestPassword') as HTMLInputElement | null;
            var output = document.getElementById('radiusTestOutput');
            var username = usernameEl ? usernameEl.value.trim() : '';
            var password = passwordEl ? passwordEl.value : '';
            if (!output)
                return;
            if (!username || !password) {
                output.innerHTML = '<div class="alert alert-warning py-2 mb-0">Informe usuÃ¡rio e senha para testar a autenticaÃ§Ã£o.</div>';
                return;
            }
            var btn = this;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Testando...';
            output.innerHTML = '<div class="alert alert-info py-2 mb-0">Enviando Access-Request ao RADIUS...</div>';
            api('/radius/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, password: password })
            }).then(function (data) {
                output.innerHTML = '<div class="alert ' + (data.success ? 'alert-success' : 'alert-danger') + ' py-2 mb-0">' + esc(data.message || (data.success ? 'Autenticado com sucesso.' : 'AutenticaÃ§Ã£o rejeitada.')) + '</div>';
            }).catch(function (err) {
                output.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message || 'Falha ao testar o RADIUS.') + '</div>';
            }).finally(function () {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-play-circle me-1"></i>Testar';
            });
        });
    }
    var btnRadiusSecretToggle = document.getElementById('btnRadiusSecretToggle');
    if (btnRadiusSecretToggle) {
        btnRadiusSecretToggle.addEventListener('click', function () {
            alert('Por segurança, o secret do RADIUS não é revelado no portal do provedor.');
        });
    }
    var btnRadiusSecretCopy = document.getElementById('btnRadiusSecretCopy');
    if (btnRadiusSecretCopy) {
        btnRadiusSecretCopy.addEventListener('click', function () {
            alert('Por segurança, o secret do RADIUS não é exposto nem copiado a partir do portal do provedor.');
        });
    }
    function fallbackCopy(str) {
        var ta = document.createElement('textarea');
        ta.value = str;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            alert('Chave copiada.');
        }
        catch (e) {
            alert('Copie manualmente o campo Secret.');
        }
        document.body.removeChild(ta);
    }
    function renderVouchersInto(outputId) {
        var out = document.getElementById(outputId);
        if (!out)
            return;
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
        api('/vouchers').then(function (data) {
            var rows = data.rows || [];
            if (!rows.length) {
                out.innerHTML = '<p class="text-muted mb-0">Nenhum voucher. Clique em <strong>Gerar vouchers</strong>.</p>';
                return;
            }
            var tbl = '<table class="table table-sm table-hover mb-0"><thead><tr><th>ID</th><th>CÃ³digo</th><th>DuraÃ§Ã£o (min)</th><th>Limite (MB)</th><th>Criado</th><th>Usado</th></tr></thead><tbody>';
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i];
                var used = r.used_at ? (String(r.used_at).slice(0, 19).replace('T', ' ')) : 'â€”';
                tbl += '<tr><td>' + esc(r.id) + '</td><td><code>' + esc(r.code) + '</code></td><td>' + (r.duration_minutes || 'â€”') + '</td><td>' + (r.data_limit_mb != null ? r.data_limit_mb : 'â€”') + '</td><td>' + (r.created_at ? String(r.created_at).slice(0, 16).replace('T', ' ') : 'â€”') + '</td><td>' + used + '</td></tr>';
            }
            tbl += '</tbody></table><p class="small text-muted mt-2 mb-0">UsuÃ¡rio RADIUS: <code>voucher_ID</code>, senha: cÃ³digo. Ex.: voucher_1 / ' + (rows[0] ? esc(rows[0].code) : '') + '</p>';
            out.innerHTML = tbl;
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    function setWifiVoucherFeedback(message, kind) {
        var out = document.getElementById('wifiVoucherBatchFeedback');
        if (!out)
            return;
        if (!kind) {
            out.className = 'small text-muted mt-3';
            out.textContent = message;
            return;
        }
        out.className = kind === 'success'
            ? 'alert alert-success py-2 mt-3 mb-0 small'
            : kind === 'error'
                ? 'alert alert-danger py-2 mt-3 mb-0 small'
                : 'alert alert-info py-2 mt-3 mb-0 small';
        out.textContent = message;
    }
    function createWifiVoucherBatch(reloadFn) {
        var count = parseInt(getWifiFieldValue('wifiVoucherCount', '5'), 10) || 1;
        var dur = parseInt(getWifiFieldValue('wifiVoucherDuration', '240'), 10) || 240;
        var prefix = getWifiFieldValue('wifiVoucherPrefix', 'V');
        var dataLimitRaw = getWifiFieldValue('wifiVoucherDataLimit', '');
        var dataLimit = dataLimitRaw ? Number(dataLimitRaw) : null;
        if (count < 1 || count > 50) {
            setWifiVoucherFeedback('Informe uma quantidade entre 1 e 50 vouchers.', 'error');
            return;
        }
        if (dur < 1 || dur > 10080) {
            setWifiVoucherFeedback('A duração deve ficar entre 1 e 10080 minutos.', 'error');
            return;
        }
        if (dataLimit != null && (!Number.isFinite(dataLimit) || dataLimit < 0)) {
            setWifiVoucherFeedback('O limite de dados deve ser um número válido maior ou igual a zero.', 'error');
            return;
        }
        var btn = document.getElementById('btnWifiCreateVoucherBatch');
        if (btn)
            btn.setAttribute('disabled', 'disabled');
        setWifiVoucherFeedback('Emitindo lote de vouchers do hotspot...', 'info');
        api('/vouchers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                count: count,
                duration_minutes: dur,
                prefix: prefix || 'V',
                data_limit_mb: dataLimit
            })
        }).then(function (data) {
            var created = Array.isArray(data.created) ? data.created : [];
            var preview = created.slice(0, 3).map(function (item) { return item.code; }).join(', ');
            var message = 'Lote emitido com sucesso: ' + (data.count || created.length || 0) + ' voucher(s).';
            if (preview)
                message += ' Exemplos: ' + preview + '.';
            setWifiVoucherFeedback(message, 'success');
            reloadFn();
        }).catch(function (err) {
            setWifiVoucherFeedback(err.message || 'Não foi possível emitir o lote de vouchers.', 'error');
        }).finally(function () {
            if (btn)
                btn.removeAttribute('disabled');
        });
    }
    function loadVouchers() {
        renderVouchersInto('radiusVouchersOutput');
    }
    function formatWifiMoney(value) {
        var num = Number(value || 0);
        return 'R$ ' + num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function formatWifiDateTime(value) {
        if (!value)
            return '—';
        var date = new Date(String(value));
        if (isNaN(date.getTime()))
            return String(value);
        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    function getWifiPaymentStatusLabel(value) {
        var key = String(value || '').toUpperCase();
        return ({
            ATIVA: 'Aguardando pagamento',
            PENDING: 'Pendente',
            PAID: 'Pago',
            RELEASED: 'Liberado',
            EXPIRED: 'Expirado',
            CANCELLED: 'Cancelado'
        })[key] || (key || '—');
    }
    function getWifiPaymentStatusClass(value) {
        var key = String(value || '').toUpperCase();
        if (key === 'RELEASED')
            return 'wifi-finance-status wifi-finance-status--released';
        if (key === 'PAID')
            return 'wifi-finance-status wifi-finance-status--paid';
        if (key === 'ATIVA' || key === 'PENDING')
            return 'wifi-finance-status wifi-finance-status--pending';
        if (key === 'EXPIRED')
            return 'wifi-finance-status wifi-finance-status--expired';
        if (key === 'CANCELLED')
            return 'wifi-finance-status wifi-finance-status--cancelled';
        return 'wifi-finance-status';
    }
    function loadWifiFinance() {
        var out = document.getElementById('wifiFinanceOutput');
        if (!out)
            return;
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando financeiro...';
        api('/wifi/finance-summary').then(function (data) {
            var summary = data.summary || {};
            var rows = Array.isArray(data.recent_sessions) ? data.recent_sessions : [];
            var plans = Array.isArray(data.top_plans) ? data.top_plans : [];
            var cards = [
                { label: 'Receita total', value: formatWifiMoney(summary.gross_revenue), hint: (summary.paid_sessions || 0) + ' cobrança(s) pagas' },
                { label: 'Receita no mês', value: formatWifiMoney(summary.revenue_month), hint: (summary.sessions_month || 0) + ' sessão(ões) criadas no mês' },
                { label: 'Sessões liberadas', value: String(summary.released_sessions || 0), hint: (summary.pending_sessions || 0) + ' aguardando pagamento' },
                { label: 'Vouchers', value: String(summary.total_vouchers || 0), hint: (summary.used_vouchers || 0) + ' usados · ' + (summary.available_vouchers || 0) + ' disponíveis' }
            ];
            var html = '<div class="wifi-finance-grid mb-3">';
            for (var i = 0; i < cards.length; i++) {
                var card = cards[i];
                html += '<div class="wifi-finance-card">'
                    + '<div class="wifi-finance-card__label">' + esc(card.label) + '</div>'
                    + '<div class="wifi-finance-card__value">' + esc(card.value) + '</div>'
                    + '<div class="wifi-finance-card__hint">' + esc(card.hint) + '</div>'
                    + '</div>';
            }
            html += '</div>';
            html += '<div class="row g-3">';
            html += '<div class="col-xl-4"><div class="border rounded-4 p-3 bg-light h-100">'
                + '<div class="small text-muted text-uppercase mb-2">Resumo operacional</div>'
                + '<div class="wifi-finance-meta"><strong>Modelo padrão:</strong> ' + esc(summary.default_template_name || 'Não definido') + '</div>'
                + '<div class="wifi-finance-meta"><strong>Templates ativos:</strong> ' + esc(summary.active_templates || 0) + '</div>'
                + '<div class="wifi-finance-meta"><strong>Cobranças pagas:</strong> ' + esc(summary.paid_sessions || 0) + '</div>'
                + '<div class="wifi-finance-meta"><strong>Sessões expiradas:</strong> ' + esc(summary.expired_sessions || 0) + '</div>'
                + '<div class="wifi-finance-meta"><strong>Em aberto:</strong> ' + esc(summary.pending_sessions || 0) + '</div>'
                + '</div></div>';
            html += '<div class="col-xl-8"><div class="border rounded-4 p-3 bg-white h-100 shadow-sm">'
                + '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">'
                + '<div><div class="small text-muted text-uppercase">Top planos Pix</div><div class="fw-semibold">Monetização por plano</div></div>'
                + '<span class="badge bg-secondary-subtle text-secondary border">Hotspot pago</span>'
                + '</div>';
            if (!plans.length) {
                html += '<div class="small text-muted">Nenhum plano Pix vendido ainda.</div>';
            }
            else {
                html += '<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr><th>Plano</th><th>Vendas</th><th>Pagas</th><th>Receita</th></tr></thead><tbody>';
                for (var p = 0; p < plans.length; p++) {
                    var plan = plans[p];
                    html += '<tr>'
                        + '<td><strong>' + esc(plan.plan_name || 'Plano') + '</strong></td>'
                        + '<td>' + esc(plan.total_sales || 0) + '</td>'
                        + '<td>' + esc(plan.paid_sales || 0) + '</td>'
                        + '<td>' + esc(formatWifiMoney(plan.revenue)) + '</td>'
                        + '</tr>';
                }
                html += '</tbody></table></div>';
            }
            html += '</div></div>';
            html += '</div>';
            html += '<div class="border rounded-4 p-3 bg-white shadow-sm mt-3">';
            html += '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">'
                + '<div><div class="small text-muted text-uppercase">Últimas sessões</div><div class="fw-semibold">Pagamentos e liberações do hotspot</div></div>'
                + '<span class="badge bg-info-subtle text-info border">EFI, voucher e liberação</span>'
                + '</div>';
            if (!rows.length) {
                html += '<div class="small text-muted">Nenhuma sessão financeira registrada ainda.</div>';
            }
            else {
                html += '<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr><th>#</th><th>Modelo</th><th>Plano / pagador</th><th>Status</th><th>Valor</th><th>Criado</th><th>Pago / liberado</th></tr></thead><tbody>';
                for (var r = 0; r < rows.length; r++) {
                    var row = rows[r];
                    var payer = [row.payer_name || 'Visitante', row.payer_phone || ''].filter(Boolean).join(' · ');
                    var doneAt = row.released_at || row.paid_at;
                    html += '<tr>'
                        + '<td><strong>#' + esc(row.id) + '</strong></td>'
                        + '<td><div class="fw-semibold">' + esc(row.template_name || 'Modelo') + '</div><div class="small text-muted">' + esc(row.gateway_type || 'gateway') + '</div></td>'
                        + '<td><div class="fw-semibold">' + esc(row.plan_name || 'Sem plano') + '</div><div class="small text-muted">' + esc(payer) + '</div></td>'
                        + '<td><span class="' + getWifiPaymentStatusClass(row.status) + '">' + esc(getWifiPaymentStatusLabel(row.status)) + '</span></td>'
                        + '<td>' + esc(formatWifiMoney(row.amount)) + '</td>'
                        + '<td>' + esc(formatWifiDateTime(row.created_at)) + '</td>'
                        + '<td>' + esc(formatWifiDateTime(doneAt)) + '</td>'
                        + '</tr>';
                }
                html += '</tbody></table></div>';
            }
            html += '</div>';
            out.innerHTML = html;
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message || 'Não foi possível carregar o financeiro do Wi-Fi.') + '</div>';
        });
    }
    function renderWifiList(title, items) {
        if (!Array.isArray(items) || !items.length)
            return '';
        var html = '<div class="mt-3"><div class="small text-muted text-uppercase mb-2">' + esc(title) + '</div><ul class="small ps-3 mb-0">';
        for (var i = 0; i < items.length; i++) {
            html += '<li class="mb-1">' + esc(items[i]) + '</li>';
        }
        html += '</ul></div>';
        return html;
    }
    function renderWifiTemplateSelectOptions() {
        var select = document.getElementById('wifiMikrotikTemplate');
        if (!select)
            return;
        if (!wifiTemplatesCache.length) {
            select.innerHTML = '<option value="">Nenhum template carregado</option>';
            return;
        }
        var html = '';
        for (var i = 0; i < wifiTemplatesCache.length; i++) {
            var row = wifiTemplatesCache[i];
            var isDefault = wifiFlag(row.is_default);
            html += '<option value="' + esc(row.id) + '"' + (isDefault ? ' selected' : '') + '>' + esc(row.name || 'Template') + (isDefault ? ' (padrao)' : '') + '</option>';
        }
        select.innerHTML = html;
    }
    function renderWifiDefaultTemplateBanner(template) {
        var banner = document.getElementById('wifiDefaultTemplateBanner');
        if (!banner)
            return;
        if (!template) {
            banner.className = 'alert alert-warning py-2 mb-3 small';
            banner.textContent = 'Nenhum modelo padrão definido.';
            return;
        }
        banner.className = 'alert alert-primary py-2 mb-3 small';
        banner.innerHTML = '<strong>Modelo padrão atual:</strong> ' + esc(template.name || 'Template') + ' <span class="text-muted">(' + esc(template.slug || '') + ')</span>';
    }
    function wifiFlag(value) {
        return value === true || value === 1 || value === '1' || value === 't' || value === 'true' || value === 'yes';
    }
    function getWifiFieldValue(id, fallback) {
        var el = document.getElementById(id);
        if (!el)
            return fallback || '';
        var value = String(el.value || '').trim();
        return value || (fallback || '');
    }
    function findWifiTemplateById(id) {
        var numericId = Number(id || 0);
        if (!numericId)
            return null;
        for (var i = 0; i < wifiTemplatesCache.length; i++) {
            if (Number(wifiTemplatesCache[i].id) === numericId)
                return wifiTemplatesCache[i];
        }
        return null;
    }
    function setWifiInputValue(id, value) {
        var el = document.getElementById(id);
        if (!el || value == null)
            return;
        el.value = String(value);
    }
    function setWifiTextAreaLines(id, items) {
        var el = document.getElementById(id);
        if (!el || !Array.isArray(items))
            return;
        el.value = items.join(', ');
    }
    function applyWifiTemplateDefaults(template) {
        if (!template)
            return;
        var cfg = template.config_json && typeof template.config_json === 'object' ? template.config_json : {};
        setWifiInputValue('wifiMikrotikInterface', cfg.mikrotik_interface || 'bridge-hotspot');
        setWifiInputValue('wifiMikrotikBridge', cfg.mikrotik_bridge || cfg.mikrotik_interface || 'bridge-hotspot');
        setWifiInputValue('wifiMikrotikSsid', cfg.mikrotik_ssid || 'WiFi Multi');
        setWifiInputValue('wifiMikrotikPortalUrl', cfg.mikrotik_portal_url || ((window.location && window.location.origin) ? window.location.origin + '/hotspot' : ''));
        setWifiInputValue('wifiMikrotikRadiusHost', cfg.hotspot_radius_host || '');
        setWifiInputValue('wifiMikrotikNasIp', cfg.hotspot_radius_nas_ip || '');
        setWifiInputValue('wifiMikrotikCoaPort', cfg.mikrotik_coa_port || 3799);
        setWifiInputValue('wifiMikrotikAddress', cfg.mikrotik_hotspot_address || '10.10.10.1');
        setWifiInputValue('wifiMikrotikMask', cfg.mikrotik_hotspot_mask || 24);
        setWifiInputValue('wifiMikrotikPoolStart', cfg.mikrotik_pool_start || '10.10.10.10');
        setWifiInputValue('wifiMikrotikPoolEnd', cfg.mikrotik_pool_end || '10.10.10.254');
        setWifiInputValue('wifiMikrotikDnsName', cfg.mikrotik_dns_name || 'login.multi.local');
        setWifiInputValue('wifiMikrotikPaymentHost', cfg.mikrotik_payment_host || '');
        setWifiTextAreaLines('wifiMikrotikWalledGarden', Array.isArray(cfg.mikrotik_walled_garden) ? cfg.mikrotik_walled_garden : []);
    }
    function renderWifiWarnings(messages) {
        var out = document.getElementById('wifiMikrotikWarnings');
        if (!out)
            return;
        if (!Array.isArray(messages) || !messages.length) {
            out.innerHTML = '';
            return;
        }
        var html = '';
        for (var i = 0; i < messages.length; i++) {
            html += '<div class="alert alert-warning py-2 mb-2 small">' + esc(messages[i]) + '</div>';
        }
        out.innerHTML = html;
    }
    function preloadWifiCloudDefaults() {
        api('/radius/config').then(function (data) {
            var radiusHostInput = document.getElementById('wifiMikrotikRadiusHost');
            var nasInput = document.getElementById('wifiMikrotikNasIp');
            var portalUrlInput = document.getElementById('wifiMikrotikPortalUrl');
            if (radiusHostInput && !radiusHostInput.value) {
                radiusHostInput.value = data.radius_host || '';
            }
            if (nasInput && !nasInput.value) {
                nasInput.value = data.radius_nas_ip || '';
            }
            if (portalUrlInput && !portalUrlInput.value && window.location && window.location.origin) {
                portalUrlInput.value = window.location.origin + '/hotspot';
            }
        }).catch(function () { });
    }
    function loadWifiMikrotikConfig() {
        var output = document.getElementById('wifiMikrotikOutput');
        var summary = document.getElementById('wifiMikrotikSummary');
        if (!output || !summary)
            return;
        var params = new URLSearchParams({
            template_id: getWifiFieldValue('wifiMikrotikTemplate', ''),
            interface: getWifiFieldValue('wifiMikrotikInterface', 'bridge-hotspot'),
            bridge: getWifiFieldValue('wifiMikrotikBridge', 'bridge-hotspot'),
            ssid: getWifiFieldValue('wifiMikrotikSsid', 'WiFi Multi'),
            hotspot_address: getWifiFieldValue('wifiMikrotikAddress', '10.10.10.1'),
            hotspot_mask: getWifiFieldValue('wifiMikrotikMask', '24'),
            pool_start: getWifiFieldValue('wifiMikrotikPoolStart', '10.10.10.10'),
            pool_end: getWifiFieldValue('wifiMikrotikPoolEnd', '10.10.10.254'),
            dns_name: getWifiFieldValue('wifiMikrotikDnsName', 'login.multi.local'),
            portal_url: getWifiFieldValue('wifiMikrotikPortalUrl', ''),
            radius_host: getWifiFieldValue('wifiMikrotikRadiusHost', ''),
            nas_ip: getWifiFieldValue('wifiMikrotikNasIp', ''),
            coa_port: getWifiFieldValue('wifiMikrotikCoaPort', '3799'),
            payment_host: getWifiFieldValue('wifiMikrotikPaymentHost', ''),
            walled_garden: getWifiFieldValue('wifiMikrotikWalledGarden', '')
        });
        summary.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Gerando configuracao...';
        output.textContent = '# Gerando script...';
        renderWifiWarnings([]);
        api('/wifi/mikrotik-config?' + params.toString()).then(function (data) {
            wifiLastGeneratedFileName = data.file_name || 'mikrotik-hotspot.rsc';
            output.textContent = data.script || '# Nenhum script gerado';
            var items = Array.isArray(data.summary) ? data.summary : [];
            if (!items.length) {
                summary.textContent = 'Script gerado com sucesso.';
            }
            else {
                summary.innerHTML = '<div class="small text-muted mb-2">Resumo do template</div><ul class="small ps-3 mb-0">' + items.map(function (item) { return '<li class="mb-1">' + esc(item) + '</li>'; }).join('') + '</ul>';
            }
            renderWifiWarnings(Array.isArray(data.warnings) ? data.warnings : []);
        }).catch(function (err) {
            summary.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message || 'Nao foi possivel gerar a configuracao.') + '</div>';
            output.textContent = '# Falha ao gerar configuracao';
            renderWifiWarnings([]);
        });
    }
    function copyWifiMikrotikConfig() {
        var output = document.getElementById('wifiMikrotikOutput');
        if (!output)
            return;
        var text = output.textContent || '';
        if (!text.trim()) {
            alert('Gere o script antes de copiar.');
            return;
        }
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text).then(function () {
                alert('Script copiado.');
            }).catch(function () {
                alert('Nao foi possivel copiar automaticamente. Selecione o texto manualmente.');
            });
            return;
        }
        alert('Copie manualmente o script exibido.');
    }
    function downloadWifiMikrotikConfig() {
        var output = document.getElementById('wifiMikrotikOutput');
        if (!output)
            return;
        var text = output.textContent || '';
        if (!text.trim() || text.indexOf('# Falha') === 0 || text.indexOf('# Gerando') === 0) {
            alert('Gere o script antes de baixar.');
            return;
        }
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = wifiLastGeneratedFileName || 'mikrotik-hotspot.rsc';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    function renderWifiTemplatesInto() {
        var out = document.getElementById('wifiTemplatesOutput');
        if (!out)
            return;
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando modelos...';
        api('/wifi/templates').then(function (data) {
            var rows = data.rows || [];
            wifiTemplatesCache = rows;
            renderWifiTemplateSelectOptions();
            var currentTemplate = null;
            for (var t = 0; t < rows.length; t++) {
                if (rows[t] && wifiFlag(rows[t].is_default)) {
                    currentTemplate = rows[t];
                    break;
                }
            }
            if (!currentTemplate && rows.length)
                currentTemplate = rows[0];
            var select = document.getElementById('wifiMikrotikTemplate');
            if (select && currentTemplate && currentTemplate.id != null) {
                select.value = String(currentTemplate.id);
            }
            renderWifiDefaultTemplateBanner(currentTemplate);
            applyWifiTemplateDefaults(currentTemplate);
            if (!rows.length) {
                out.innerHTML = '<div class="alert alert-warning py-2 mb-0">Nenhum modelo de hotspot encontrado.</div>';
                renderWifiDefaultTemplateBanner(null);
                return;
            }
            var html = '<div class="row g-3">';
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                var cfg = row.config_json && typeof row.config_json === 'object' ? row.config_json : {};
                var authType = String(row.auth_type || 'local');
                var authLabel = authType === 'phone' ? 'Telefone / lead capture'
                    : authType === 'radius' ? 'Usuario do RADIUS'
                        : authType === 'temporary_pix' ? 'Freemium + Pix'
                            : authType === 'pix' ? 'Pix'
                                : authType === 'voucher' ? 'Voucher'
                                    : authType === 'social' ? 'Login social'
                                        : authType === 'custom_portal' ? 'Portal customizado'
                                            : authType === 'simple_login' ? 'Login basico'
                                                : authType;
                var pixPlans = Array.isArray(row.pix_plans) ? row.pix_plans : [];
                var idealFor = Array.isArray(cfg.ideal_for) ? cfg.ideal_for : [];
                var features = Array.isArray(cfg.features) ? cfg.features : [];
                var flowSteps = Array.isArray(cfg.flow_steps) ? cfg.flow_steps : [];
                var technologies = Array.isArray(cfg.technologies) ? cfg.technologies : [];
                var limitations = Array.isArray(cfg.limitations) ? cfg.limitations : [];
                var gateways = Array.isArray(cfg.gateways_supported) ? cfg.gateways_supported : [];
                var ctas = Array.isArray(cfg.ctas) ? cfg.ctas : [];
                var planHtml = '';
                if (pixPlans.length) {
                    planHtml = '<div class="mt-3"><div class="small text-muted text-uppercase mb-2">Planos Pix</div><div class="d-flex flex-wrap gap-2">';
                    for (var p = 0; p < pixPlans.length; p++) {
                        var plan = pixPlans[p];
                        planHtml += '<span class="badge text-bg-light border">' + esc(plan.name || 'Plano') + ' · ' + formatWifiMoney(plan.price) + ' · ' + esc(plan.duration_minutes || 0) + ' min</span>';
                    }
                    planHtml += '</div></div>';
                }
                html += '<div class="col-xxl-6 col-xl-6 col-md-12"><div class="border rounded-4 p-3 bg-white h-100 shadow-sm">'
                    + '<div class="d-flex justify-content-between align-items-start gap-2 mb-2">'
                    + '<div><div class="small text-muted text-uppercase mb-1">Modelo</div><div class="fw-bold">' + esc(row.name || 'Template') + '</div></div>'
                    + (wifiFlag(row.is_default) ? '<span class="badge bg-success">Padrao</span>' : '<span class="badge bg-secondary-subtle text-secondary border">Disponivel</span>')
                    + '</div>'
                    + '<div class="small text-muted mb-3">' + esc(row.description || 'Sem descricao') + '</div>'
                    + (cfg.headline ? '<div class="fw-semibold mb-2">' + esc(cfg.headline) + '</div>' : '')
                    + '<div class="d-flex flex-wrap gap-2 mb-3">'
                    + '<span class="badge text-bg-primary">' + esc(authLabel) + '</span>'
                    + (row.portal_enabled ? '<span class="badge text-bg-light border">Portal captivo</span>' : '')
                    + (row.radius_enabled ? '<span class="badge text-bg-light border">RADIUS</span>' : '')
                    + (row.requires_phone ? '<span class="badge text-bg-light border">Telefone</span>' : '')
                    + (row.payment_required ? '<span class="badge text-bg-light border">Pagamento</span>' : '')
                    + (cfg.category ? '<span class="badge text-bg-light border">' + esc(String(cfg.category).replace(/_/g, ' ')) + '</span>' : '')
                    + '</div>'
                    + '<div class="small">'
                    + '<div class="mb-1"><strong>Tempo gratis:</strong> ' + esc(row.free_minutes || 0) + ' min</div>'
                    + '<div class="mb-1"><strong>Sessao:</strong> ' + esc(row.session_timeout_minutes || 0) + ' min</div>'
                    + '<div class="mb-1"><strong>OTP:</strong> ' + (row.otp_enabled ? 'Sim' : 'Nao') + '</div>'
                    + '<div><strong>Vincular MAC:</strong> ' + (row.bind_mac ? 'Sim' : 'Nao') + '</div>'
                    + '</div>'
                    + renderWifiList('Uso ideal', idealFor)
                    + renderWifiList('Recursos', features)
                    + renderWifiList('Fluxo operacional', flowSteps)
                    + renderWifiList('Tecnologias', technologies)
                    + renderWifiList('Limitacoes', limitations)
                    + renderWifiList('Gateways suportados', gateways)
                    + renderWifiList('Chamadas comerciais', ctas)
                    + planHtml
                    + '<div class="d-flex gap-2 mt-3">'
                    + '<button type="button" class="btn btn-sm ' + (wifiFlag(row.is_default) ? 'btn-success disabled' : 'btn-outline-primary') + '" data-wifi-default="' + esc(row.id) + '">' + (wifiFlag(row.is_default) ? 'Modelo padrao' : 'Definir como padrao') + '</button>'
                    + '<button type="button" class="btn btn-sm btn-outline-dark" data-wifi-generate="' + esc(row.id) + '">Gerar MikroTik</button>'
                    + '</div>'
                    + '</div></div>';
            }
            html += '</div>';
            out.innerHTML = html;
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    function loadWifi() {
        var btnLoad = document.getElementById('btnWifiLoadHotspot');
        if (btnLoad)
            btnLoad.onclick = function () { loadWifi(); };
        var btnGenerate = document.getElementById('btnWifiGenerateHotspot');
        if (btnGenerate)
            btnGenerate.onclick = function () {
                var target = document.getElementById('wifiVoucherCount');
                if (target && typeof target.scrollIntoView === 'function')
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (target && typeof target.focus === 'function')
                    target.focus();
            };
        var btnCreateVoucherBatch = document.getElementById('btnWifiCreateVoucherBatch');
        if (btnCreateVoucherBatch)
            btnCreateVoucherBatch.onclick = function () { createWifiVoucherBatch(loadWifi); };
        var btnRefreshVoucherList = document.getElementById('btnWifiRefreshVoucherList');
        if (btnRefreshVoucherList)
            btnRefreshVoucherList.onclick = function () { renderVouchersInto('wifiHotspotOutput'); };
        var btnGenerateConfig = document.getElementById('btnWifiGenerateMikrotik');
        if (btnGenerateConfig)
            btnGenerateConfig.onclick = function () { loadWifiMikrotikConfig(); };
        var btnCopyConfig = document.getElementById('btnWifiCopyMikrotik');
        if (btnCopyConfig)
            btnCopyConfig.onclick = function () { copyWifiMikrotikConfig(); };
        var btnDownloadConfig = document.getElementById('btnWifiDownloadMikrotik');
        if (btnDownloadConfig)
            btnDownloadConfig.onclick = function () { downloadWifiMikrotikConfig(); };
        var templateSelect = document.getElementById('wifiMikrotikTemplate');
        if (templateSelect)
            templateSelect.onchange = function () { applyWifiTemplateDefaults(findWifiTemplateById(templateSelect.value)); };
        preloadWifiCloudDefaults();
        renderWifiTemplatesInto();
        loadWifiFinance();
        renderVouchersInto('wifiHotspotOutput');
    }
    var btnLoadVouchers = document.getElementById('btnLoadVouchers');
    if (btnLoadVouchers)
        btnLoadVouchers.addEventListener('click', loadVouchers);
    var btnGenerateVouchers = document.getElementById('btnGenerateVouchers');
    if (btnGenerateVouchers) {
        btnGenerateVouchers.addEventListener('click', function () {
            var count = parseInt(prompt('Quantos vouchers gerar?', '5'), 10) || 1;
            if (count < 1 || count > 50) {
                alert('Entre 1 e 50.');
                return;
            }
            var dur = parseInt(prompt('DuraÃ§Ã£o em minutos (ex.: 240 = 4h)', '240'), 10) || 240;
            api('/vouchers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: count, duration_minutes: dur }) }).then(function (data) {
                alert('Gerados ' + (data.count || 0) + ' voucher(s).');
                loadVouchers();
            }).catch(function (err) { alert(err.message); });
        });
    }
    function promptGenerateHotspotVouchers(reloadFn) {
        createWifiVoucherBatch(reloadFn);
    }
    document.addEventListener('click', function (event) {
        var target = event.target && event.target.closest ? event.target.closest('[data-wifi-default]') : null;
        if (!target)
            return;
        var id = Number(target.getAttribute('data-wifi-default') || 0);
        if (!id)
            return;
        target.setAttribute('disabled', 'disabled');
        api('/wifi/templates/' + id + '/default', { method: 'POST' }).then(function () {
            loadWifi();
        }).catch(function (err) {
            target.removeAttribute('disabled');
            alert(err.message || 'NÃ£o foi possÃ­vel definir o modelo padrÃ£o.');
        });
    });
    document.addEventListener('click', function (event) {
        var target = event.target && event.target.closest ? event.target.closest('[data-wifi-generate]') : null;
        if (!target)
            return;
        var id = String(target.getAttribute('data-wifi-generate') || '');
        var select = document.getElementById('wifiMikrotikTemplate');
        if (select && id)
            select.value = id;
        applyWifiTemplateDefaults(findWifiTemplateById(id));
        loadWifiMikrotikConfig();
        var output = document.getElementById('wifiMikrotikOutput');
        if (output && typeof output.scrollIntoView === 'function') {
            output.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
    var btnSaveRadiusConfig = document.getElementById('btnSaveRadiusConfig');
    if (btnSaveRadiusConfig) {
        btnSaveRadiusConfig.addEventListener('click', function () {
            var url = (document.getElementById('radiusConfigBlockRedirectUrl') || {}).value || '';
            api('/radius/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ block_redirect_url: url || null }) }).then(function () {
                alert('ConfiguraÃ§Ã£o salva.');
            }).catch(function (err) { alert(err.message); });
        });
    }
    if (document.getElementById('tab-system')) {
        document.querySelectorAll('[data-tab="system"]').forEach(function (link) {
            link.addEventListener('click', function () {
                loadRadiusConfig();
            });
        });
    }
    var btnAuthFailures = document.getElementById('btnRadiusAuthFailures');
    if (btnAuthFailures) {
        btnAuthFailures.addEventListener('click', function () {
            var out = document.getElementById('radiusAuthFailuresOutput');
            if (!out)
                return;
            out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
            api('/radius/auth-failures?limit=50').then(function (data) {
                var rows = data.rows || [];
                if (!rows.length) {
                out.innerHTML = '<p class="text-muted mb-0">Nenhum registro em radpostauth.</p><p class="small text-muted mt-1 mb-0">Quando houver tentativas de login (aceitas ou rejeitadas), os registros aparecerÃ£o aqui. Se o RADIUS estiver rejeitando antes de autenticar (ex.: BlastRADIUS), nenhuma linha serÃ¡ gravada. No host, consulte <code>journalctl -u freeradius-standalone -n 200 --no-pager</code>.</p>';
                    return;
                }
                var tbl = '<table class="table table-sm table-hover mb-0"><thead><tr><th>Data/Hora</th><th>UsuÃ¡rio</th><th>Resposta</th><th>NAS/Calling</th></tr></thead><tbody>';
                for (var i = 0; i < rows.length; i++) {
                    var r = rows[i];
                    var dt = r.authdate ? (String(r.authdate).replace('T', ' ').slice(0, 19)) : 'â€”';
                    tbl += '<tr><td>' + esc(dt) + '</td><td><code>' + esc(r.username || '') + '</code></td><td>' + esc(r.reply || '') + '</td><td>' + esc(r.calledstationid || '') + ' / ' + esc(r.callingstationid || '') + '</td></tr>';
                }
                tbl += '</tbody></table>';
                out.innerHTML = tbl;
            }).catch(function (err) {
                out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
            });
        });
    }
    // PersonalizaÃ§Ã£o de recibos / modelos â€” modelos padrÃ£o completos (variÃ¡veis: {{cliente_nome}}, {{documento}}, {{endereco}}, {{valor}}, {{data}}, {{empresa_nome}})
    var DEFAULT_RECEIPT_TEMPLATES = {
        pagar: {
            name: 'Recibo contas a pagar',
            description: 'Recibo padrÃ£o para pagamento de contas (fornecedores, despesas).',
            body: 'RECIBO DE PAGAMENTO\n\n{{empresa_nome}}\nDocumento: {{documento}}\nEndereÃ§o: {{endereco}}\n\nRecebemos de {{cliente_nome}} a quantia de {{valor}} (valor por extenso), referente ao pagamento abaixo descrito.\n\nData: {{data}}\n\n_________________________\nAssinatura'
        },
        receber_quitacao: {
            name: 'Recibo a receber / quitaÃ§Ã£o',
            description: 'Recibo de quitaÃ§Ã£o de fatura ou valor recebido do cliente.',
            body: 'RECIBO DE QUITAÃ‡ÃƒO\n\n{{empresa_nome}}\n{{endereco}}\nDocumento: {{documento}}\n\nDeclaramos ter recebido de {{cliente_nome}} o valor de {{valor}}, referente Ã  quitaÃ§Ã£o em {{data}}.\n\nEste recibo serve como comprovante de pagamento.\n\n_________________________\n{{empresa_nome}}'
        },
        fatura_suporte: {
            name: 'Fatura de suporte',
            description: 'Fatura para cobranÃ§a de suporte tÃ©cnico ou visita.',
            body: 'FATURA â€“ SERVIÃ‡O DE SUPORTE\n\n{{empresa_nome}}\n{{endereco}}\nDocumento: {{documento}}\n\nCliente: {{cliente_nome}}\nEndereÃ§o do cliente: {{endereco}}\n\nValor dos serviÃ§os: {{valor}}\nData de emissÃ£o: {{data}}\n\nPagamento conforme condiÃ§Ãµes acordadas.\n\n_________________________\n{{empresa_nome}}'
        },
        fatura_instalacao: {
            name: 'Fatura instalaÃ§Ã£o',
            description: 'Fatura para cobranÃ§a de instalaÃ§Ã£o de serviÃ§o.',
            body: 'FATURA â€“ INSTALAÃ‡ÃƒO\n\n{{empresa_nome}}\n{{endereco}}\nDocumento: {{documento}}\n\nCliente: {{cliente_nome}}\nDocumento do cliente: {{documento}}\nEndereÃ§o da instalaÃ§Ã£o: {{endereco}}\n\nValor da instalaÃ§Ã£o: {{valor}}\nData: {{data}}\n\n_________________________\n{{empresa_nome}}'
        },
        fatura_mudanca_endereco: {
            name: 'Fatura mudanÃ§a de endereÃ§o',
            description: 'Fatura para cobranÃ§a de mudanÃ§a de endereÃ§o.',
            body: 'FATURA â€“ MUDANÃ‡A DE ENDEREÃ‡O\n\n{{empresa_nome}}\n{{endereco}}\nDocumento: {{documento}}\n\nCliente: {{cliente_nome}}\nNovo endereÃ§o: {{endereco}}\n\nValor do serviÃ§o de mudanÃ§a: {{valor}}\nData: {{data}}\n\n_________________________\n{{empresa_nome}}'
        }
    };
    function getReceiptPreviewEl() {
        return document.getElementById('receiptTemplatePreview');
    }
    function loadReceiptTemplate(key) {
        if (!key)
            return;
        api('/receipt-templates/' + encodeURIComponent(key)).then(function (data) {
            var tpl = data.template || {};
            var def = DEFAULT_RECEIPT_TEMPLATES[key];
            var name = (tpl.name && tpl.name.trim()) ? tpl.name.trim() : (def ? def.name : '');
            var description = (tpl.description != null && String(tpl.description).trim()) ? String(tpl.description).trim() : (def ? def.description : '');
            var body = (tpl.body && tpl.body.trim()) ? tpl.body.trim() : (def ? def.body : '');
            var receiptPreviewEl = getReceiptPreviewEl();
            (document.getElementById('receiptTemplateName') || {}).value = name;
            (document.getElementById('receiptTemplateDescription') || {}).value = description;
            (document.getElementById('receiptTemplateBody') || {}).value = body;
            if (receiptPreviewEl) {
                receiptPreviewEl.innerHTML = highlightTemplatePreview(body);
            }
        }).catch(function (err) {
            var receiptPreviewEl = getReceiptPreviewEl();
            if (receiptPreviewEl) {
                receiptPreviewEl.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message || 'Erro ao carregar modelo.') + '</div>';
            }
        });
    }
    function setActiveReceiptButton(key) {
        document.querySelectorAll('[data-receipt-key]').forEach(function (b) {
            b.classList.remove('btn-primary', 'text-white', 'active');
            b.classList.add('btn-outline-secondary');
        });
        var active = document.querySelector('[data-receipt-key="' + key + '"]');
        if (active) {
            active.classList.add('btn-primary', 'text-white', 'active');
            active.classList.remove('btn-outline-secondary');
        }
    }
    function saveReceiptTemplate() {
        var activeBtn = document.querySelector('[data-receipt-key].active') || document.querySelector('[data-receipt-key]');
        if (!activeBtn) {
            alert('Selecione um modelo para salvar.');
            return;
        }
        var key = activeBtn.getAttribute('data-receipt-key');
        var name = (document.getElementById('receiptTemplateName') || {}).value || '';
        var desc = (document.getElementById('receiptTemplateDescription') || {}).value || '';
        var body = (document.getElementById('receiptTemplateBody') || {}).value || '';
        if (!body.trim()) {
            alert('Preencha o corpo do modelo.');
            return;
        }
        api('/receipt-templates/' + encodeURIComponent(key), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, description: desc, body: body })
        }).then(function () {
            alert('Modelo salvo com sucesso.');
        }).catch(function (err) { alert(err.message || 'Erro ao salvar modelo.'); });
    }
    function formatMoney(v) {
        return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function formatPhoneShort(w) {
        if (!w)
            return 'â€”';
        var d = String(w).replace(/\D/g, '');
        if (d.length >= 11)
            return d.slice(-11, -9) + ' ' + d.slice(-9, -4) + '-' + d.slice(-4);
        return w;
    }
    var loadFinance, loadCaixaMovements;
    if (window.PortalFinance) {
        var fin = window.PortalFinance.init({ api: api, esc: esc, formatMoney: formatMoney, formatPhoneShort: formatPhoneShort, setLoading: setLoading, loadStats: loadStats });
        loadFinance = fin.loadFinance;
        loadCaixaMovements = fin.loadCaixaMovements;
    }
    else {
        loadFinance = function () { };
        loadCaixaMovements = function () { };
    }
    function loadProviderSettings() {
        var errEl = document.getElementById('provError');
        if (errEl) {
            errEl.classList.add('d-none');
            errEl.textContent = '';
        }
        api('/provider').then(function (data) {
            var s = data.settings || {};
            (document.getElementById('provFantasyName') || {}).value = s.fantasy_name || '';
            (document.getElementById('provLegalName') || {}).value = s.legal_name || '';
            (document.getElementById('provDocument') || {}).value = s.document || '';
            (document.getElementById('provIE') || {}).value = s.ie || '';
            (document.getElementById('provIM') || {}).value = s.im || '';
            (document.getElementById('provWhatsapp') || {}).value = s.whatsapp || '';
            (document.getElementById('provPhone') || {}).value = s.phone || '';
            (document.getElementById('provEmail') || {}).value = s.email || '';
            (document.getElementById('provWebsite') || {}).value = s.website || '';
            (document.getElementById('provStreet') || {}).value = s.street || '';
            (document.getElementById('provNumber') || {}).value = s.number || '';
            (document.getElementById('provComplement') || {}).value = s.complement || '';
            (document.getElementById('provNeighborhood') || {}).value = s.neighborhood || '';
            (document.getElementById('provCity') || {}).value = s.city || '';
            (document.getElementById('provState') || {}).value = s.state || '';
            (document.getElementById('provZip') || {}).value = s.zip || '';
            (document.getElementById('provLogoPortal') || {}).value = s.logo_portal || '';
            (document.getElementById('provLogoSite') || {}).value = s.logo_site || '';
            (document.getElementById('provLogoReceipt') || {}).value = s.logo_receipt || '';
            (document.getElementById('provColorPrimary') || {}).value = s.color_primary || '#0d3a5c';
            (document.getElementById('provColorAccent') || {}).value = s.color_accent || '#0b5ed7';
            (document.getElementById('provShortName') || {}).value = s.short_name || '';
            (document.getElementById('provTimezone') || {}).value = s.timezone || '';
            updateProviderLogoPreview('provLogoPortal');
            updateProviderLogoPreview('provLogoSite');
        }).catch(function (err) {
            if (errEl) {
                errEl.classList.remove('d-none');
                errEl.textContent = err.message || 'Erro ao carregar dados do provedor.';
            }
        });
    }
    function updateProviderLogoPreview(fieldId) {
        var input = document.getElementById(fieldId);
        var img = document.getElementById(fieldId + 'Preview');
        var wrap = document.getElementById(fieldId + 'PreviewWrap');
        if (!input || !img || !wrap)
            return;
        var url = (input.value || '').trim();
        if (url) {
            img.src = url;
            img.onerror = function () { wrap.style.display = 'none'; };
            img.onload = function () { wrap.style.display = 'block'; };
            wrap.style.display = 'block';
        }
        else {
            img.removeAttribute('src');
            wrap.style.display = 'none';
        }
    }
    function doProviderLogoUpload(fileInputId, type, urlInputId) {
        var fileInput = document.getElementById(fileInputId);
        var urlInput = document.getElementById(urlInputId);
        if (!fileInput || !urlInput || !fileInput.files || !fileInput.files.length)
            return;
        var file = fileInput.files[0];
        var formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);
        var base = window.__API_BASE__ != null ? window.__API_BASE__ : '/api/portal';
        var token = typeof getToken === 'function' ? getToken() : '';
        var btn = type === 'site' ? document.getElementById('btnProvLogoSiteUpload') : document.getElementById('btnProvLogoPortalUpload');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        }
        fetch(base + '/upload-logo', { method: 'POST', body: formData, credentials: 'same-origin', headers: { 'Authorization': 'Bearer ' + token } })
            .then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok)
                    throw new Error(data.message || 'Falha no upload');
                return data;
            });
        })
            .then(function (data) {
            if (data.url) {
                urlInput.value = data.url;
                updateProviderLogoPreview(urlInputId);
            }
            fileInput.value = '';
        })
            .catch(function (err) { alert(err.message || 'Erro ao enviar logo.'); })
            .finally(function () {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-upload me-1"></i> Enviar';
            }
        });
    }
    function collectProviderPayload() {
        var fantasy = (document.getElementById('provFantasyName') || {}).value || '';
        var legal = (document.getElementById('provLegalName') || {}).value || '';
        var payload = {
            fantasy_name: fantasy.trim() || null,
            legal_name: legal.trim() || null,
            document: (document.getElementById('provDocument') || {}).value || null,
            ie: (document.getElementById('provIE') || {}).value || null,
            im: (document.getElementById('provIM') || {}).value || null,
            whatsapp: (document.getElementById('provWhatsapp') || {}).value || null,
            phone: (document.getElementById('provPhone') || {}).value || null,
            email: (document.getElementById('provEmail') || {}).value || null,
            website: (document.getElementById('provWebsite') || {}).value || null,
            street: (document.getElementById('provStreet') || {}).value || null,
            number: (document.getElementById('provNumber') || {}).value || null,
            complement: (document.getElementById('provComplement') || {}).value || null,
            neighborhood: (document.getElementById('provNeighborhood') || {}).value || null,
            city: (document.getElementById('provCity') || {}).value || null,
            state: (document.getElementById('provState') || {}).value || null,
            zip: (document.getElementById('provZip') || {}).value || null,
            logo_portal: (document.getElementById('provLogoPortal') || {}).value || null,
            logo_site: (document.getElementById('provLogoSite') || {}).value || null,
            logo_receipt: (document.getElementById('provLogoReceipt') || {}).value || null,
            color_primary: (document.getElementById('provColorPrimary') || {}).value || null,
            color_accent: (document.getElementById('provColorAccent') || {}).value || null,
            short_name: (document.getElementById('provShortName') || {}).value || null,
            timezone: (document.getElementById('provTimezone') || {}).value || null
        };
        return payload;
    }
    function highlightTemplatePreview(text) {
        if (!text)
            return '<p class="text-muted mb-0">Digite o modelo ao lado para visualizar aqui uma prÃ©via simples.</p>';
        var escText = esc(text).replace(/\n/g, '<br/>');
        return escText.replace(/\{\{([^}]+)\}\}/g, '<span class="badge bg-light text-primary border border-primary-subtle">{{$1}}</span>');
    }
    // Itens das sub-seÃ§Ãµes (Cadastros, CarnÃªs, etc.): gateway abre modal; demais em breve
    document.addEventListener('click', function (e) {
        var target = e.target;
        var item = target && target.closest ? target.closest('.finance-sub-item') : null;
        if (!item)
            return;
        e.preventDefault();
        var href = item.getAttribute('href') || '';
        if (href && (window.location.pathname || '') !== href) {
            window.history.pushState({}, '', href);
        }
        var action = item.getAttribute('data-finance-action');
        if (!action)
            return;
        if (action === 'gateway') {
            openGatewayListModal();
            return;
        }
        if (action === 'carne-gerar') {
            openCarneGerarModal();
            return;
        }
        if (action === 'carne-imprimir') {
            openCarneImprimirModal();
            return;
        }
        if (action === 'carne-entrega') {
            openCarneEntregaModal();
            return;
        }
        if (action === 'fornecedor') {
            openSupplierListModal();
            return;
        }
        if (action === 'planocontas') {
            openChartListModal();
            return;
        }
        if (action === 'pagar-add') {
            openPayableFormModal(null);
            return;
        }
        if (action === 'pagar-nfe') {
            safeShowModal('finance-page-pagar-nfe');
            return;
        }
        if (action === 'pagar-list') {
            openPayableListModal();
            return;
        }
        var extraFinanceMap = {
            ofxfiltro: 'finance-page-ofxfiltro',
            pontorecebimento: 'finance-page-pontorecebimento',
            empresas: 'finance-page-empresas',
            funcionarios: 'finance-page-funcionarios',
            portador: 'finance-page-portador',
            contador: 'finance-page-contador',
            vencimento: 'finance-page-vencimento',
            feriado: 'finance-page-feriado',
            contrato: 'finance-page-contrato',
            contadigital: 'finance-page-contadigital',
            'receber-add': 'finance-page-receber-add',
            'receber-list': 'finance-page-receber-list',
            'protocolo-list': 'finance-page-protocolo-list',
            'protocolo-add': 'finance-page-protocolo-add',
            'declaracao-quitacao': 'finance-page-declaracao-quitacao',
            'ad-lote': 'finance-page-ad-lote',
            'cobranca-atraso': 'finance-page-cobranca-atraso',
            'cobranca-lembrador': 'finance-page-cobranca-lembrador',
            'cobranca-spc': 'finance-page-cobranca-spc',
            'cobranca-sms': 'finance-page-cobranca-sms',
            'cobranca-email': 'finance-page-cobranca-email',
            'cobranca-cartas': 'finance-page-cobranca-cartas',
            'cobranca-recorrente': 'finance-page-cobranca-recorrente',
            'pix-e2id': 'finance-page-pix-e2id',
            'pix-emv': 'finance-page-pix-emv',
            'pagar-nfe': 'finance-page-pagar-nfe',
        };
        if (extraFinanceMap[action]) {
            safeShowModal(extraFinanceMap[action]);
            return;
        }
        var label = (item.textContent || '').trim();
        alert('PÃ¡gina nÃ£o disponÃ­vel: ' + label);
    });
    var estoqueApiBase = '/estoque';
    function loadEstoque() {
        safeShowModal('tab-estoque');
        var menu = document.getElementById('estoqueMenuTop');
        if (!menu)
            return;
        document.querySelectorAll('.estoque-menu-btn').forEach(function (b) { b.classList.remove('active'); });
        document.querySelectorAll('.estoque-pane').forEach(function (p) { p.classList.remove('active'); });
        var first = menu.querySelector('.estoque-menu-btn');
        var firstPane = document.getElementById('estoque-pane-cadastros');
        if (first)
            first.classList.add('active');
        if (firstPane)
            firstPane.classList.add('active');
        estoqueShowDashboard();
    }
    function estoqueShowContent(title, showNew, showRefresh, section) {
        var main = document.querySelector('#tab-estoque .estoque-main');
        var area = document.getElementById('estoqueContentArea');
        var titleEl = document.getElementById('estoqueContentTitle');
        var metaEl = document.getElementById('estoqueContentMeta');
        var filterBar = document.getElementById('estoqueFilterBar');
        var btnNew = document.getElementById('estoqueBtnNew');
        var btnRefresh = document.getElementById('estoqueBtnRefresh');
        var breadcrumbCurrent = document.getElementById('estoqueBreadcrumbCurrent');
        if (main)
            main.classList.add('estoque-main--list');
        if (area)
            area.classList.add('visible');
        if (titleEl)
            titleEl.textContent = title;
        if (metaEl) {
            metaEl.textContent = '';
            metaEl.style.display = 'none';
        }
        if (filterBar) {
            filterBar.style.display = 'none';
            filterBar.innerHTML = '';
        }
        if (btnNew) {
            btnNew.style.display = showNew ? 'inline-flex' : 'none';
            btnNew.onclick = null;
        }
        if (btnRefresh) {
            btnRefresh.style.display = showRefresh ? 'inline-flex' : 'none';
            btnRefresh.onclick = null;
        }
        if (breadcrumbCurrent) {
            breadcrumbCurrent.textContent = section || title;
            breadcrumbCurrent.classList.add('active');
            breadcrumbCurrent.setAttribute('aria-current', 'page');
        }
    }
    function estoqueBadgeAtivo(v) { return v ? '<span class="estoque-badge estoque-badge--ativo">Ativo</span>' : '<span class="estoque-badge estoque-badge--inativo">Inativo</span>'; }
    function estoqueBadgeTipo(tipo) {
        var t = (tipo || '').toString();
        var c = 'estoque-badge--tipo ' + (t ? 'estoque-badge--' + t : '');
        return '<span class="estoque-badge ' + c + '">' + esc(t || 'â€”') + '</span>';
    }
    function estoqueLoadList(action) {
        safeShowModal('tab-estoque');
        var map = {
            categoria: { path: '/categorias', title: 'Categorias', cols: [{ key: 'id', label: 'ID', cellClass: 'cell-num' }, { key: 'nome', label: 'Nome' }, { key: 'ativo', label: 'Status', render: estoqueBadgeAtivo, raw: true }], canEdit: true, canDelete: true },
            fabricante: { path: '/fabricantes', title: 'Fabricantes', cols: [{ key: 'id', label: 'ID', cellClass: 'cell-num' }, { key: 'nome', label: 'Nome' }, { key: 'ativo', label: 'Status', render: estoqueBadgeAtivo, raw: true }], canEdit: true, canDelete: true },
            produto: { path: '/produtos', title: 'Produtos', cols: [{ key: 'id', label: 'ID', cellClass: 'cell-num' }, { key: 'codigo', label: 'CÃ³digo', cellClass: 'cell-code' }, { key: 'nome', label: 'Nome' }, { key: 'categoria_nome', label: 'Categoria' }, { key: 'unidade', label: 'Un.', cellClass: 'cell-num' }, { key: 'ativo', label: 'Status', render: estoqueBadgeAtivo, raw: true }], canEdit: true, canDelete: true, hasFilter: true },
            kitinstalacao: { path: '/kits', title: 'Kit de InstalaÃ§Ã£o', cols: [{ key: 'id', label: 'ID', cellClass: 'cell-num' }, { key: 'nome', label: 'Nome' }, { key: 'ativo', label: 'Status', render: estoqueBadgeAtivo, raw: true }], canEdit: true, canDelete: true },
            local: { path: '/locais', title: 'Locais Estoques', cols: [{ key: 'id', label: 'ID', cellClass: 'cell-num' }, { key: 'nome', label: 'Nome' }, { key: 'ativo', label: 'Status', render: estoqueBadgeAtivo, raw: true }], canEdit: true, canDelete: true },
            fornecedores: { path: '/fornecedores', title: 'Fornecedores', cols: [{ key: 'id', label: 'ID', cellClass: 'cell-num' }, { key: 'nome', label: 'Nome' }, { key: 'documento', label: 'Documento' }, { key: 'contato', label: 'Contato' }, { key: 'ativo', label: 'Status', render: estoqueBadgeAtivo, raw: true }], canEdit: true, canDelete: true },
            ncm: { path: '/ncm', title: 'NCM', cols: [{ key: 'id', label: 'ID', cellClass: 'cell-num' }, { key: 'codigo', label: 'CÃ³digo', cellClass: 'cell-code' }, { key: 'descricao', label: 'DescriÃ§Ã£o' }], canEdit: true, canDelete: true },
            veiculo: { path: '/veiculos', title: 'VeÃ­culos', cols: [{ key: 'id', label: 'ID', cellClass: 'cell-num' }, { key: 'placa', label: 'Placa', cellClass: 'cell-code' }, { key: 'modelo', label: 'Modelo' }, { key: 'ativo', label: 'Status', render: estoqueBadgeAtivo, raw: true }], canEdit: true, canDelete: true },
            saldo: { path: '/saldo', title: 'Saldo Estoque', cols: [{ key: 'produto_codigo', label: 'CÃ³digo', cellClass: 'cell-code' }, { key: 'produto_nome', label: 'Produto' }, { key: 'local_nome', label: 'Local' }, { key: 'quantidade', label: 'Quantidade', cellClass: 'cell-num' }], canEdit: false, canDelete: false },
            lancamentos: { path: '/lancamentos', title: 'LanÃ§amentos', cols: [{ key: 'id', label: 'ID', cellClass: 'cell-num' }, { key: 'tipo', label: 'Tipo', render: estoqueBadgeTipo, raw: true }, { key: 'data_movimento', label: 'Data' }, { key: 'numero_documento', label: 'Documento' }, { key: 'itens_count', label: 'Itens', cellClass: 'cell-num' }], canEdit: false, canDelete: false },
            quantitativo: { path: '/quantitativo-produto', title: 'Quantitativo por Produto', cols: [{ key: 'produto_id', label: 'ID', cellClass: 'cell-num' }, { key: 'codigo', label: 'CÃ³digo', cellClass: 'cell-code' }, { key: 'nome', label: 'Produto' }, { key: 'quantidade_total', label: 'Total', cellClass: 'cell-num' }], canEdit: false, canDelete: false },
            'veiculo-viagem': { path: '/viagens', title: 'Registro de Viagem', cols: [{ key: 'id', label: 'ID', cellClass: 'cell-num' }, { key: 'placa', label: 'Placa' }, { key: 'data_saida', label: 'SaÃ­da' }, { key: 'data_retorno', label: 'Retorno' }, { key: 'motorista', label: 'Motorista' }, { key: 'destino', label: 'Destino' }], canEdit: false, canDelete: false, hasNew: true }
        };
        var cfg = map[action];
        if (!cfg)
            return;
        var section = (action === 'veiculo-viagem') ? 'VeÃ­culo' : ['categoria', 'fabricante', 'produto', 'produtofornecedor', 'kitinstalacao', 'local', 'fornecedores', 'ncm', 'veiculo'].indexOf(action) >= 0 ? 'Cadastros' : ['saldo', 'lancamentos', 'quantitativo'].indexOf(action) >= 0 ? 'Consultas' : 'Estoque';
        estoqueShowContent(cfg.title, cfg.canEdit || cfg.hasNew, true, section);
        var body = document.getElementById('estoqueContentBody');
        var metaEl = document.getElementById('estoqueContentMeta');
        var filterBar = document.getElementById('estoqueFilterBar');
        var btnNew = document.getElementById('estoqueBtnNew');
        var btnRefresh = document.getElementById('estoqueBtnRefresh');
        var doLoad = function () {
            body.innerHTML = '<p class="mb-0 py-3"><span class="spinner-border spinner-border-sm me-2"></span>Carregando...</p>';
            api(estoqueApiBase + cfg.path).then(function (data) {
                var list = data.list || [];
                if (metaEl) {
                    metaEl.textContent = list.length + ' registro(s)';
                    metaEl.style.display = 'inline';
                }
                if (cfg.hasFilter && filterBar) {
                    filterBar.style.display = 'flex';
                    filterBar.innerHTML = '<label class="form-label mb-0 me-2 text-nowrap">Buscar:</label><input type="text" class="form-control form-control-sm" id="estoqueFilterSearch" placeholder="Nome ou cÃ³digo...">';
                }
                function renderTable(rows) {
                    if (!rows.length) {
                        return '<div class="estoque-empty">' +
                            '<i class="bi bi-inbox d-block"></i>' +
                            '<div class="estoque-empty__title">Nenhum registro</div>' +
                            '<div class="estoque-empty__text">' + (cfg.canEdit ? 'Clique em <strong>Novo</strong> para cadastrar.' : 'NÃ£o hÃ¡ dados para exibir.') + '</div>' +
                            '</div>';
                    }
                    var thead = cfg.cols.map(function (c) { return '<th' + (c.cellClass ? ' class="' + c.cellClass + '"' : '') + '>' + esc(c.label) + '</th>'; }).join('');
                    if (cfg.canEdit || cfg.canDelete)
                        thead += '<th class="text-end">AÃ§Ãµes</th>';
                    var tbody = rows.map(function (r) {
                        var cells = cfg.cols.map(function (c) {
                            var val = r[c.key];
                            if (c.render)
                                val = c.render(val, r);
                            var cellClass = c.cellClass ? ' class="' + c.cellClass + '"' : '';
                            var safe = (c.raw && typeof val === 'string' && val.indexOf('<') >= 0) ? val : esc(String(val ?? ''));
                            return '<td' + cellClass + '>' + safe + '</td>';
                        });
                        var actions = '';
                        if (cfg.canEdit)
                            actions += '<button type="button" class="btn btn-sm btn-outline-primary estoque-btn-action me-1" data-estoque-edit="' + action + ':' + (r.id || r.produto_id) + '"><i class="bi bi-pencil me-1"></i>Editar</button>';
                        if (cfg.canDelete && r.id)
                            actions += '<button type="button" class="btn btn-sm btn-outline-danger estoque-btn-action" data-estoque-delete="' + action + ':' + r.id + '"><i class="bi bi-trash me-1"></i>Excluir</button>';
                        if (actions)
                            cells.push('<td class="text-end">' + actions + '</td>');
                        return '<tr>' + cells.join('') + '</tr>';
                    }).join('');
                    return '<div class="estoque-table-wrap"><table class="table table-sm table-hover"><thead><tr>' + thead + '</tr></thead><tbody>' + tbody + '</tbody></table></div>';
                }
                body.innerHTML = renderTable(list);
                if (list.length && cfg.hasFilter && filterBar) {
                    var searchEl = document.getElementById('estoqueFilterSearch');
                    if (searchEl) {
                        searchEl.addEventListener('input', function () {
                            var q = (this.value || '').trim().toLowerCase();
                            var filtered = !q ? list : list.filter(function (r) {
                                return (r.nome && r.nome.toLowerCase().indexOf(q) >= 0) || (r.codigo && r.codigo.toLowerCase().indexOf(q) >= 0);
                            });
                            body.innerHTML = renderTable(filtered);
                            if (metaEl)
                                metaEl.textContent = q ? (filtered.length + ' de ' + list.length + ' registro(s)') : (list.length + ' registro(s)');
                            body.querySelectorAll('[data-estoque-edit]').forEach(function (btn) {
                                btn.addEventListener('click', function () { var p = this.getAttribute('data-estoque-edit').split(':'); estoqueOpenFormModal(p[0], p[1]); });
                            });
                            body.querySelectorAll('[data-estoque-delete]').forEach(function (btn) {
                                btn.addEventListener('click', function () {
                                    var p = this.getAttribute('data-estoque-delete').split(':');
                                    if (!confirm('Excluir este registro? Esta aÃ§Ã£o nÃ£o pode ser desfeita.'))
                                        return;
                                    api(estoqueApiBase + cfg.path + '/' + p[1], { method: 'DELETE' }).then(function () { doLoad(); }).catch(function (err) { alert(err.message); });
                                });
                            });
                        });
                    }
                }
                if (body.querySelector('[data-estoque-edit]')) {
                    body.querySelectorAll('[data-estoque-edit]').forEach(function (btn) {
                        btn.addEventListener('click', function () { var p = this.getAttribute('data-estoque-edit').split(':'); estoqueOpenFormModal(p[0], p[1]); });
                    });
                }
                if (body.querySelector('[data-estoque-delete]')) {
                    body.querySelectorAll('[data-estoque-delete]').forEach(function (btn) {
                        btn.addEventListener('click', function () {
                            var p = this.getAttribute('data-estoque-delete').split(':');
                            if (!confirm('Excluir este registro? Esta aÃ§Ã£o nÃ£o pode ser desfeita.'))
                                return;
                            api(estoqueApiBase + cfg.path + '/' + p[1], { method: 'DELETE' }).then(function () { doLoad(); }).catch(function (err) { alert(err.message); });
                        });
                    });
                }
            }).catch(function (err) {
                body.innerHTML = '<div class="alert alert-danger py-3 mb-0">' + esc(err.message) + '</div>';
            });
        };
        if (btnRefresh)
            btnRefresh.onclick = doLoad;
        if (btnNew && (cfg.canEdit || cfg.hasNew)) {
            btnNew.onclick = function () {
                if (action === 'veiculo-viagem') {
                    estoqueOpenViagemModal();
                    return;
                }
                estoqueOpenFormModal(action, null);
            };
        }
        doLoad();
    }
    function estoqueLoadMovimentacoesList(tipo, title) {
        safeShowModal('tab-estoque');
        estoqueShowContent(title, true, true, 'MovimentaÃ§Ãµes');
        var body = document.getElementById('estoqueContentBody');
        var metaEl = document.getElementById('estoqueContentMeta');
        var btnNew = document.getElementById('estoqueBtnNew');
        var btnRefresh = document.getElementById('estoqueBtnRefresh');
        var path = '/movimentacoes' + (tipo ? '?tipo=' + encodeURIComponent(tipo) : '');
        var doLoad = function () {
            body.innerHTML = '<p class="mb-0 py-3"><span class="spinner-border spinner-border-sm me-2"></span>Carregando...</p>';
            api(estoqueApiBase + path).then(function (data) {
                var list = data.list || [];
                if (metaEl) {
                    metaEl.textContent = list.length + ' movimentaÃ§Ã£o(Ãµes)';
                    metaEl.style.display = 'inline';
                }
                if (!list.length) {
                    body.innerHTML = '<div class="estoque-empty"><i class="bi bi-arrow-left-right d-block"></i><div class="estoque-empty__title">Nenhuma movimentaÃ§Ã£o</div><div class="estoque-empty__text">Clique em <strong>Nova movimentaÃ§Ã£o</strong> para registrar.</div></div>';
                    return;
                }
                var thead = '<th class="cell-num">ID</th><th>Tipo</th><th>Data</th><th>Documento</th><th class="cell-num">Itens</th><th class="text-end">AÃ§Ãµes</th>';
                var tbody = list.map(function (r) {
                    var tipoBadge = estoqueBadgeTipo(r.tipo);
                    return '<tr><td class="cell-num">' + esc(r.id) + '</td><td>' + tipoBadge + '</td><td>' + esc(r.data_movimento || '') + '</td><td>' + esc(r.numero_documento || 'â€”') + '</td><td class="cell-num">' + esc(String(r.itens_count ?? '')) + '</td><td class="text-end"><button type="button" class="btn btn-sm btn-outline-secondary estoque-btn-action" data-mov-view="' + r.id + '"><i class="bi bi-eye me-1"></i>Ver</button></td></tr>';
                }).join('');
                body.innerHTML = '<div class="estoque-table-wrap"><table class="table table-sm table-hover"><thead><tr>' + thead + '</tr></thead><tbody>' + tbody + '</tbody></table></div>';
                body.querySelectorAll('[data-mov-view]').forEach(function (btn) {
                    btn.addEventListener('click', function (e) { e.preventDefault(); estoqueViewMovimentacao(Number(this.getAttribute('data-mov-view'))); });
                });
            }).catch(function (err) {
                body.innerHTML = '<div class="alert alert-danger py-3 mb-0">' + esc(err.message) + '</div>';
            });
        };
        if (btnRefresh)
            btnRefresh.onclick = doLoad;
        if (btnNew) {
            btnNew.innerHTML = '<i class="bi bi-plus-lg me-1"></i>Nova movimentaÃ§Ã£o';
            btnNew.onclick = function () { estoqueOpenMovimentacaoModal(tipo); };
        }
        doLoad();
    }
    function estoqueViewMovimentacao(id) {
        api(estoqueApiBase + '/movimentacoes/' + id).then(function (m) {
            var titleEl = document.getElementById('modalEstoqueMovDetailTitle');
            var bodyEl = document.getElementById('modalEstoqueMovDetailBody');
            if (titleEl)
                titleEl.innerHTML = '<i class="bi bi-arrow-left-right me-2"></i>MovimentaÃ§Ã£o #' + m.id;
            if (!bodyEl)
                return;
            var itensRows = (m.itens || []).map(function (i) {
                var eou = i.entrada_saida === 'S' ? 'SaÃ­da' : 'Entrada';
                var qty = (i.quantidade || 0);
                return '<tr><td>' + esc(i.produto_nome || 'ID ' + i.produto_id) + '</td><td>' + esc(i.produto_codigo || 'â€”') + '</td><td class="cell-num">' + qty + '</td><td>' + esc(eou) + '</td><td>' + esc(i.local_nome || '') + '</td></tr>';
            }).join('');
            bodyEl.innerHTML =
                '<div class="mov-detail-section">' +
                    '<div class="mov-detail-section__title">Dados da movimentaÃ§Ã£o</div>' +
                    '<dl class="row mb-0 small">' +
                    '<dt class="col-sm-3">Tipo</dt><dd class="col-sm-9">' + estoqueBadgeTipo(m.tipo) + '</dd>' +
                    '<dt class="col-sm-3">Data</dt><dd class="col-sm-9">' + esc(m.data_movimento || 'â€”') + '</dd>' +
                    '<dt class="col-sm-3">Documento</dt><dd class="col-sm-9">' + esc(m.numero_documento || 'â€”') + '</dd>' +
                    '<dt class="col-sm-3">ObservaÃ§Ãµes</dt><dd class="col-sm-9">' + esc(m.observacoes || 'â€”') + '</dd>' +
                    '</dl></div>' +
                    '<div class="mov-detail-section">' +
                    '<div class="mov-detail-section__title">Itens</div>' +
                    (itensRows ? '<div class="table-responsive"><table class="table table-sm mov-itens-table"><thead><tr><th>Produto</th><th>CÃ³digo</th><th class="cell-num">Qtd</th><th>E/S</th><th>Local</th></tr></thead><tbody>' + itensRows + '</tbody></table></div>' : '<p class="mb-0 text-muted small">Nenhum item.</p>') +
                    '</div>';
            safeShowModal('modalEstoqueMovDetail');
        }).catch(function (err) { alert(err.message); });
    }
    function estoqueOpenMovimentacaoModal(tipo) {
        var modal = document.getElementById('modalEstoqueMovForm');
        var bodyEl = document.getElementById('modalEstoqueMovFormBody');
        var titleEl = document.getElementById('modalEstoqueMovFormTitle');
        if (!modal || !bodyEl)
            return;
        window._estoqueMovTipo = tipo || 'COMPRA';
        var tipoLabels = { COMPRA: 'Compra', COMPRA_NFE: 'Compra (NF-e)', VENDA: 'Venda', COMODATO: 'Comodato', CORRECAO: 'CorreÃ§Ã£o', TRANSFERENCIA: 'TransferÃªncia' };
        if (titleEl)
            titleEl.textContent = 'Nova movimentaÃ§Ã£o â€” ' + (tipoLabels[tipo] || tipo);
        bodyEl.innerHTML = '<p class="text-center py-4 mb-0"><span class="spinner-border spinner-border-sm me-2"></span>Carregando...</p>';
        safeShowModal('modalEstoqueMovForm');
        Promise.all([
            api(estoqueApiBase + '/produtos'),
            api(estoqueApiBase + '/locais'),
            api(estoqueApiBase + '/fornecedores')
        ]).then(function (results) {
            var produtos = (results[0] && results[0].list) ? results[0].list : [];
            var locais = (results[1] && results[1].list) ? results[1].list : [];
            var fornecedores = (results[2] && results[2].list) ? results[2].list : [];
            var prodOpts = '<option value="">â€” Produto â€”</option>' + produtos.map(function (p) { return '<option value="' + p.id + '">' + esc(p.codigo || '') + ' â€” ' + esc(p.nome || '') + '</option>'; }).join('');
            var locOpts = '<option value="">â€” Local â€”</option>' + locais.map(function (l) { return '<option value="' + l.id + '">' + esc(l.nome || '') + '</option>'; }).join('');
            var fornOpts = '<option value="">â€” Fornecedor (opcional) â€”</option>' + fornecedores.map(function (f) { return '<option value="' + f.id + '">' + esc(f.nome || '') + '</option>'; }).join('');
            var hoje = new Date().toISOString().slice(0, 10);
            var rowHtml = function () {
                return '<tr><td><select class="form-select form-select-sm estoque-mov-produto">' + prodOpts + '</select></td><td><select class="form-select form-select-sm estoque-mov-local">' + locOpts + '</select></td><td><input type="number" class="form-control form-control-sm estoque-mov-qty" min="0.001" step="0.001" value="1" placeholder="Qtd"></td><td><select class="form-select form-select-sm estoque-mov-es"><option value="E">Entrada</option><option value="S">SaÃ­da</option></select></td><td><button type="button" class="btn btn-sm btn-outline-danger estoque-mov-remove-row" title="Remover"><i class="bi bi-dash-lg"></i></button></td></tr>';
            };
            bodyEl.innerHTML =
                '<input type="hidden" id="estoqueMovTipo" value="' + esc(window._estoqueMovTipo) + '">' +
                    '<div class="row g-2 mb-2"><div class="col-md-4"><label class="form-label">Data movimento</label><input type="date" class="form-control form-control-sm" id="estoqueMovData" value="' + hoje + '"></div>' +
                    '<div class="col-md-4"><label class="form-label">NÂº documento</label><input type="text" class="form-control form-control-sm" id="estoqueMovNumDoc" placeholder="Opcional"></div>' +
                    '<div class="col-md-4"><label class="form-label">Fornecedor</label><select class="form-select form-select-sm" id="estoqueMovFornecedor">' + fornOpts + '</select></div></div>' +
                    '<div class="mb-2"><label class="form-label">ObservaÃ§Ãµes</label><textarea class="form-control form-control-sm" id="estoqueMovObs" rows="2" placeholder="Opcional"></textarea></div>' +
                    '<label class="form-label">Itens</label><div class="table-responsive"><table class="table table-sm"><thead><tr><th>Produto</th><th>Local</th><th style="width:100px">Qtd</th><th style="width:100px">E/S</th><th style="width:50px"></th></tr></thead><tbody id="estoqueMovItensBody">' + rowHtml() + '</tbody></table></div>' +
                    '<button type="button" class="btn btn-sm btn-outline-primary" id="estoqueMovAddRow"><i class="bi bi-plus-lg me-1"></i>Adicionar item</button>';
            var estoqueMovAddRow = document.getElementById('estoqueMovAddRow');
            if (estoqueMovAddRow)
                estoqueMovAddRow.addEventListener('click', function () {
                var tbody = document.getElementById('estoqueMovItensBody');
                if (tbody)
                    tbody.insertAdjacentHTML('beforeend', rowHtml());
                tbody.querySelectorAll('.estoque-mov-remove-row').forEach(function (btn) { btn.onclick = function () { this.closest('tr').remove(); }; });
            });
            document.querySelectorAll('#estoqueMovItensBody .estoque-mov-remove-row').forEach(function (btn) {
                btn.onclick = function () { this.closest('tr').remove(); };
            });
        }).catch(function (err) {
            bodyEl.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    function estoqueSaveMovimentacao() {
        var bodyEl = document.getElementById('modalEstoqueMovFormBody');
        var tipoEl = document.getElementById('estoqueMovTipo');
        var tipo = (tipoEl && tipoEl.value) ? tipoEl.value : (window._estoqueMovTipo || 'COMPRA');
        var dataMov = (document.getElementById('estoqueMovData') || {}).value || new Date().toISOString().slice(0, 10);
        var numDoc = (document.getElementById('estoqueMovNumDoc') || {}).value || null;
        var obs = (document.getElementById('estoqueMovObs') || {}).value || null;
        var fornId = (document.getElementById('estoqueMovFornecedor') || {}).value;
        var itens = [];
        var rows = document.querySelectorAll('#estoqueMovItensBody tr');
        rows.forEach(function (tr) {
            var prod = tr.querySelector('.estoque-mov-produto');
            var loc = tr.querySelector('.estoque-mov-local');
            var qty = tr.querySelector('.estoque-mov-qty');
            var es = tr.querySelector('.estoque-mov-es');
            if (prod && prod.value && loc && loc.value && qty && parseFloat(qty.value) > 0) {
                itens.push({
                    produto_id: parseInt(prod.value, 10),
                    local_id: parseInt(loc.value, 10),
                    quantidade: parseFloat(qty.value),
                    entrada_saida: (es && es.value) ? es.value : 'E'
                });
            }
        });
        var errEl = document.getElementById('modalEstoqueMovFormError');
        if (errEl) {
            errEl.classList.add('d-none');
            errEl.textContent = '';
        }
        if (!itens.length) {
            if (errEl) {
                errEl.textContent = 'Informe ao menos um item (produto, local e quantidade).';
                errEl.classList.remove('d-none');
            }
            return;
        }
        var btn = document.getElementById('btnEstoqueMovFormSave');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Registrando...';
        }
        var body = { tipo: tipo, data_movimento: dataMov, numero_documento: numDoc ? String(numDoc).trim() : null, observacoes: obs ? String(obs).trim() : null, fornecedor_id: fornId ? parseInt(fornId, 10) : null, itens: itens };
        api(estoqueApiBase + '/movimentacoes', { method: 'POST', body: JSON.stringify(body) }).then(function () {
            safeHideModal('modalEstoqueMovForm');
            var tipoMap = { COMPRA: 'compra-list', COMPRA_NFE: 'compra-list', VENDA: 'venda-list', COMODATO: 'comodato-list', CORRECAO: 'correcao-list', TRANSFERENCIA: 'transferencia-list' };
            var key = tipoMap[tipo] || 'compra-list';
            var titles = { compra: 'Compras', venda: 'Vendas', comodato: 'Comodato', correcao: 'CorreÃ§Ãµes', transferencia: 'TransferÃªncias' };
            var t = key.replace('-list', '');
            estoqueLoadMovimentacoesList(tipo === 'COMPRA_NFE' || tipo === 'COMPRA' ? 'COMPRA' : tipo, titles[t] || t);
        }).catch(function (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Erro ao registrar.';
                errEl.classList.remove('d-none');
            }
        }).finally(function () {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Registrar';
            }
        });
    }
    function estoqueOpenViagemModal() {
        var modal = document.getElementById('modalEstoqueViagemForm');
        var bodyEl = document.getElementById('modalEstoqueViagemFormBody');
        if (!modal || !bodyEl)
            return;
        bodyEl.innerHTML = '<p class="text-center py-4 mb-0"><span class="spinner-border spinner-border-sm me-2"></span>Carregando...</p>';
        safeShowModal('modalEstoqueViagemForm');
        api(estoqueApiBase + '/veiculos').then(function (data) {
            var list = (data && data.list) ? data.list : [];
            var opts = '<option value="">â€” Selecione o veÃ­culo â€”</option>' + list.map(function (v) { return '<option value="' + v.id + '">' + esc(v.placa || '') + (v.modelo ? ' â€” ' + esc(v.modelo) : '') + '</option>'; }).join('');
            var hoje = new Date().toISOString().slice(0, 16);
            bodyEl.innerHTML =
                '<div class="mb-2"><label class="form-label">VeÃ­culo <span class="text-danger">*</span></label><select class="form-select form-select-sm" id="estoqueViagemVeiculo">' + opts + '</select></div>' +
                    '<div class="row g-2 mb-2"><div class="col-6"><label class="form-label">Data/hora saÃ­da</label><input type="datetime-local" class="form-control form-control-sm" id="estoqueViagemSaida" value="' + hoje + '"></div>' +
                    '<div class="col-6"><label class="form-label">Data/hora retorno</label><input type="datetime-local" class="form-control form-control-sm" id="estoqueViagemRetorno" placeholder="Opcional"></div></div>' +
                    '<div class="row g-2 mb-2"><div class="col-6"><label class="form-label">Km saÃ­da</label><input type="number" class="form-control form-control-sm" id="estoqueViagemKmSaida" placeholder="Opcional"></div>' +
                    '<div class="col-6"><label class="form-label">Km retorno</label><input type="number" class="form-control form-control-sm" id="estoqueViagemKmRetorno" placeholder="Opcional"></div></div>' +
                    '<div class="mb-2"><label class="form-label">Motorista</label><input type="text" class="form-control form-control-sm" id="estoqueViagemMotorista" placeholder="Nome do motorista"></div>' +
                    '<div class="mb-2"><label class="form-label">Destino</label><input type="text" class="form-control form-control-sm" id="estoqueViagemDestino" placeholder="Cidade ou endereÃ§o"></div>' +
                    '<div class="mb-2"><label class="form-label">ObservaÃ§Ãµes</label><textarea class="form-control form-control-sm" id="estoqueViagemObs" rows="2" placeholder="Opcional"></textarea></div>';
        }).catch(function (err) {
            bodyEl.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    function estoqueSaveViagem() {
        var veiculoId = (document.getElementById('estoqueViagemVeiculo') || {}).value;
        var errEl = document.getElementById('modalEstoqueViagemFormError');
        if (errEl) {
            errEl.classList.add('d-none');
            errEl.textContent = '';
        }
        if (!veiculoId) {
            if (errEl) {
                errEl.textContent = 'Selecione o veÃ­culo.';
                errEl.classList.remove('d-none');
            }
            return;
        }
        var body = {
            veiculo_id: parseInt(veiculoId, 10),
            data_saida: (document.getElementById('estoqueViagemSaida') || {}).value || null,
            data_retorno: (document.getElementById('estoqueViagemRetorno') || {}).value || null,
            km_saida: (document.getElementById('estoqueViagemKmSaida') || {}).value ? parseFloat(document.getElementById('estoqueViagemKmSaida').value) : null,
            km_retorno: (document.getElementById('estoqueViagemKmRetorno') || {}).value ? parseFloat(document.getElementById('estoqueViagemKmRetorno').value) : null,
            motorista: (document.getElementById('estoqueViagemMotorista') || {}).value ? String(document.getElementById('estoqueViagemMotorista').value).trim() : null,
            destino: (document.getElementById('estoqueViagemDestino') || {}).value ? String(document.getElementById('estoqueViagemDestino').value).trim() : null,
            observacoes: (document.getElementById('estoqueViagemObs') || {}).value ? String(document.getElementById('estoqueViagemObs').value).trim() : null
        };
        var btn = document.getElementById('btnEstoqueViagemFormSave');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Registrando...';
        }
        api(estoqueApiBase + '/viagens', { method: 'POST', body: JSON.stringify(body) }).then(function () {
            safeHideModal('modalEstoqueViagemForm');
            estoqueLoadList('veiculo');
        }).catch(function (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Erro ao registrar.';
                errEl.classList.remove('d-none');
            }
        }).finally(function () {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Registrar';
            }
        });
    }
    function buildProdutoFormErp(categorias, fabricantes, ncmList, locais, fornecedores, produtos) {
        var catOpts = '<option value="">â€” Selecione â€”</option>' + (categorias || []).map(function (c) { return '<option value="' + c.id + '">' + esc(c.nome) + '</option>'; }).join('');
        var fabOpts = '<option value="">â€” Selecione â€”</option>' + (fabricantes || []).map(function (f) { return '<option value="' + f.id + '">' + esc(f.nome) + '</option>'; }).join('');
        var ncmOpts = '<option value="">â€” Selecione â€”</option>' + (ncmList || []).map(function (n) { return '<option value="' + n.id + '">' + esc(n.codigo) + (n.descricao ? ' â€” ' + esc(n.descricao) : '') + '</option>'; }).join('');
        var locOpts = '<option value="">â€” Selecione â€”</option>' + (locais || []).map(function (l) { return '<option value="' + l.id + '">' + esc(l.nome) + '</option>'; }).join('');
        var fornOpts = '<option value="">â€” Selecione â€”</option>' + (fornecedores || []).map(function (f) { return '<option value="' + f.id + '">' + esc(f.nome) + '</option>'; }).join('');
        var prodOpts = '<option value="">â€” Nenhum â€”</option>' + (produtos || []).map(function (p) { return '<option value="' + p.id + '">' + esc(p.codigo || '') + ' â€” ' + esc(p.nome || '') + '</option>'; }).join('');
        var unidadeOpts = ['UN', 'M', 'METRO', 'CX', 'PCT', 'PC', 'KG', 'G', 'M2', 'M3', 'L', 'ML', 'PAR', 'JT', 'ROL', 'SAC', 'FD', 'SERVICO', 'OUT'].map(function (u) { return '<option value="' + u + '">' + u + '</option>'; }).join('');
        var tipoProdutoOpts = ['EQUIPAMENTO', 'SERVICO', 'COMBO', 'TAXA', 'INSTALACAO'].map(function (t) { var l = { EQUIPAMENTO: 'Equipamento', SERVICO: 'ServiÃ§o', COMBO: 'Combo', TAXA: 'Taxa', INSTALACAO: 'InstalaÃ§Ã£o' }; return '<option value="' + t + '">' + (l[t] || t) + '</option>'; }).join('');
        var tipoEquipOpts = '<option value="">â€”</option><option value="ONU">ONU</option><option value="ROTEADOR">Roteador</option><option value="SWITCH">Switch</option><option value="CABO">Cabo</option>';
        var origemOpts = '<option value="">â€”</option><option value="0">0-Nacional</option><option value="1">1-Estrangeira import.direta</option><option value="2">2-Estrangeira adquirida no mercado interno</option>';
        return '<input type="hidden" id="estoqueFormId" value="">' +
            '<div class="estoque-form-produto-erp">' +
            '<ul class="nav nav-tabs" role="tablist">' +
            '<li class="nav-item"><button type="button" class="nav-link active" data-bs-toggle="tab" data-bs-target="#tab-prod-basico">BÃ¡sico</button></li>' +
            '<li class="nav-item"><button type="button" class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-prod-financeiro">Financeiro</button></li>' +
            '<li class="nav-item"><button type="button" class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-prod-estoque">Estoque</button></li>' +
            '<li class="nav-item"><button type="button" class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-prod-fiscal">Fiscal</button></li>' +
            '<li class="nav-item"><button type="button" class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-prod-ident">IdentificaÃ§Ã£o</button></li>' +
            '<li class="nav-item"><button type="button" class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-prod-provedor">Provedor</button></li>' +
            '<li class="nav-item"><button type="button" class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-prod-logistica">LogÃ­stica</button></li>' +
            '<li class="nav-item"><button type="button" class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-prod-midia">MÃ­dia</button></li>' +
            '<li class="nav-item"><button type="button" class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-prod-comercial">Comercial</button></li>' +
            '<li class="nav-item"><button type="button" class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-prod-comodato">Comodato</button></li>' +
            '<li class="nav-item"><button type="button" class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-prod-extras">Extras</button></li>' +
            '</ul>' +
            '<div class="tab-content">' +
            '<div class="tab-pane fade show active" id="tab-prod-basico">' +
            '<div class="form-section-erp"><div class="form-section-erp__title">InformaÃ§Ãµes bÃ¡sicas</div>' +
            '<div class="row g-2 mb-2"><div class="col-md-6"><label class="form-label">Nome <span class="text-danger">*</span></label><input type="text" class="form-control form-control-sm" id="estoqueFormNome" placeholder="Nome do produto"></div>' +
            '<div class="col-md-6"><label class="form-label">CÃ³digo (SKU)</label><input type="text" class="form-control form-control-sm" id="estoqueFormCodigo" placeholder="Ex: PROD-001"></div></div>' +
            '<div class="mb-2"><label class="form-label">DescriÃ§Ã£o</label><textarea class="form-control form-control-sm" id="estoqueFormDescricao" rows="2" placeholder="DescriÃ§Ã£o do produto"></textarea></div>' +
            '<div class="row g-2 mb-2"><div class="col-md-4"><label class="form-label">Categoria</label><select class="form-select form-select-sm" id="estoqueFormCategoria">' + catOpts + '</select></div>' +
            '<div class="col-md-4"><label class="form-label">Fabricante</label><select class="form-select form-select-sm" id="estoqueFormFabricante">' + fabOpts + '</select></div>' +
            '<div class="col-md-4"><label class="form-label">Tipo de produto</label><select class="form-select form-select-sm" id="estoqueFormTipoProduto">' + tipoProdutoOpts + '</select></div></div>' +
            '<div class="form-check mb-2"><input type="checkbox" class="form-check-input" id="estoqueFormAtivo" checked><label class="form-check-label">Ativo</label></div></div></div>' +
            '<div class="tab-pane fade" id="tab-prod-financeiro">' +
            '<div class="form-section-erp"><div class="form-section-erp__title">InformaÃ§Ãµes financeiras</div>' +
            '<div class="row g-2 mb-2"><div class="col-md-4"><label class="form-label">PreÃ§o de venda</label><input type="number" class="form-control form-control-sm" id="estoqueFormPrecoVenda" step="0.01" min="0" placeholder="0,00"></div>' +
            '<div class="col-md-4"><label class="form-label">Custo</label><input type="number" class="form-control form-control-sm" id="estoqueFormCusto" step="0.01" min="0" placeholder="0,00"></div>' +
            '<div class="col-md-4"><label class="form-label">Margem (%)</label><input type="number" class="form-control form-control-sm" id="estoqueFormMargemLucro" step="0.01" placeholder="â€”"></div></div>' +
            '<div class="row g-2 mb-2"><div class="col-md-4"><label class="form-label">PreÃ§o mÃ­nimo</label><input type="number" class="form-control form-control-sm" id="estoqueFormPrecoMinimo" step="0.01" min="0" placeholder="â€”"></div>' +
            '<div class="col-md-4"><label class="form-label">Unidade de venda</label><select class="form-select form-select-sm" id="estoqueFormUnidade">' + unidadeOpts + '</select></div>' +
            '<div class="col-md-4"><div class="form-check mt-4"><input type="checkbox" class="form-check-input" id="estoqueFormPermitirDesconto" checked><label class="form-check-label">Permitir desconto</label></div></div></div></div></div>' +
            '<div class="tab-pane fade" id="tab-prod-estoque">' +
            '<div class="form-section-erp"><div class="form-section-erp__title">Controle de estoque</div>' +
            '<div class="form-check mb-2"><input type="checkbox" class="form-check-input" id="estoqueFormControlarEstoque" checked><label class="form-check-label">Controlar estoque</label></div>' +
            '<div class="row g-2 mb-2"><div class="col-md-4"><label class="form-label">Estoque mÃ­nimo</label><input type="number" class="form-control form-control-sm" id="estoqueFormEstoqueMinimo" min="0" step="0.0001" value="0"></div>' +
            '<div class="col-md-4"><label class="form-label">Local do estoque</label><select class="form-select form-select-sm" id="estoqueFormLocalEstoque">' + locOpts + '</select></div>' +
            '<div class="col-md-4"><label class="form-label">Fornecedor principal</label><select class="form-select form-select-sm" id="estoqueFormFornecedorPrincipal">' + fornOpts + '</select></div></div></div></div>' +
            '<div class="tab-pane fade" id="tab-prod-fiscal">' +
            '<div class="form-section-erp"><div class="form-section-erp__title">InformaÃ§Ãµes fiscais</div>' +
            '<div class="row g-2 mb-2"><div class="col-md-6"><label class="form-label">NCM</label><select class="form-select form-select-sm" id="estoqueFormNcm">' + ncmOpts + '</select></div>' +
            '<div class="col-md-3"><label class="form-label">CFOP</label><input type="text" class="form-control form-control-sm" id="estoqueFormCfop" placeholder="Ex: 5102"></div>' +
            '<div class="col-md-3"><label class="form-label">CST</label><input type="text" class="form-control form-control-sm" id="estoqueFormCst" placeholder="â€”"></div></div>' +
            '<div class="row g-2 mb-2"><div class="col-md-6"><label class="form-label">Origem da mercadoria</label><select class="form-select form-select-sm" id="estoqueFormOrigemMercadoria">' + origemOpts + '</select></div>' +
            '<div class="col-md-6"><label class="form-label">CÃ³digo ANATEL</label><input type="text" class="form-control form-control-sm" id="estoqueFormCodigoAnatel" placeholder="Equipamentos telecom"></div></div></div></div>' +
            '<div class="tab-pane fade" id="tab-prod-ident">' +
            '<div class="form-section-erp"><div class="form-section-erp__title">IdentificaÃ§Ã£o</div>' +
            '<div class="row g-2 mb-2"><div class="col-md-6"><label class="form-label">CÃ³digo de barras</label><input type="text" class="form-control form-control-sm" id="estoqueFormCodigoBarras" placeholder="EAN/GTIN"></div>' +
            '<div class="col-md-6"><label class="form-label">Modelo</label><input type="text" class="form-control form-control-sm" id="estoqueFormModelo" placeholder="Modelo"></div></div>' +
            '<div class="row g-2 mb-2"><div class="col-md-6"><label class="form-label">Marca</label><input type="text" class="form-control form-control-sm" id="estoqueFormMarca" placeholder="Marca"></div>' +
            '<div class="col-md-6"><div class="form-check mt-4"><input type="checkbox" class="form-check-input" id="estoqueFormPermitirNumeroSerie"><label class="form-check-label">NÃºmero de sÃ©rie (opcional)</label></div></div></div></div></div>' +
            '<div class="tab-pane fade" id="tab-prod-provedor">' +
            '<div class="form-section-erp"><div class="form-section-erp__title">InformaÃ§Ãµes para provedor (ISP)</div>' +
            '<div class="row g-2 mb-2"><div class="col-md-6"><label class="form-label">Tipo de equipamento</label><select class="form-select form-select-sm" id="estoqueFormTipoEquipamento">' + tipoEquipOpts + '</select></div>' +
            '<div class="col-md-6"><label class="form-label">Compatibilidade</label><input type="text" class="form-control form-control-sm" id="estoqueFormCompatibilidade" placeholder="Fiberhome, Huawei, ZTE, Mikrotik"></div></div>' +
            '<div class="form-check mb-1"><input type="checkbox" class="form-check-input" id="estoqueFormUsadoComodato"><label class="form-check-label">Usado em comodato</label></div>' +
            '<div class="form-check mb-1"><input type="checkbox" class="form-check-input" id="estoqueFormPermitirVenda" checked><label class="form-check-label">Permitir venda</label></div>' +
            '<div class="form-check mb-1"><input type="checkbox" class="form-check-input" id="estoqueFormVincularMac"><label class="form-check-label">Vincular MAC address</label></div>' +
            '<div class="form-check mb-1"><input type="checkbox" class="form-check-input" id="estoqueFormVincularSerialOnu"><label class="form-check-label">Vincular serial da ONU</label></div></div></div>' +
            '<div class="tab-pane fade" id="tab-prod-logistica">' +
            '<div class="form-section-erp"><div class="form-section-erp__title">LogÃ­stica (frete)</div>' +
            '<div class="row g-2 mb-2"><div class="col-md-3"><label class="form-label">Peso (kg)</label><input type="number" class="form-control form-control-sm" id="estoqueFormPesoKg" step="0.001" min="0" placeholder="â€”"></div>' +
            '<div class="col-md-3"><label class="form-label">Altura (cm)</label><input type="number" class="form-control form-control-sm" id="estoqueFormAlturaCm" step="0.01" min="0" placeholder="â€”"></div>' +
            '<div class="col-md-3"><label class="form-label">Largura (cm)</label><input type="number" class="form-control form-control-sm" id="estoqueFormLarguraCm" step="0.01" min="0" placeholder="â€”"></div>' +
            '<div class="col-md-3"><label class="form-label">Comprimento (cm)</label><input type="number" class="form-control form-control-sm" id="estoqueFormComprimentoCm" step="0.01" min="0" placeholder="â€”"></div></div></div></div>' +
            '<div class="tab-pane fade" id="tab-prod-midia">' +
            '<div class="form-section-erp"><div class="form-section-erp__title">MÃ­dia</div>' +
            '<div class="row g-2 mb-2"><div class="col-md-12"><label class="form-label">URL imagem do produto</label><input type="text" class="form-control form-control-sm" id="estoqueFormImagemUrl" placeholder="https://..."></div>' +
            '<div class="col-md-6"><label class="form-label">URL manual</label><input type="text" class="form-control form-control-sm" id="estoqueFormManualUrl" placeholder="https://..."></div>' +
            '<div class="col-md-6"><label class="form-label">URL documentos</label><input type="text" class="form-control form-control-sm" id="estoqueFormDocumentosUrl" placeholder="â€”"></div></div></div></div>' +
            '<div class="tab-pane fade" id="tab-prod-comercial">' +
            '<div class="form-section-erp"><div class="form-section-erp__title">InformaÃ§Ãµes comerciais</div>' +
            '<div class="form-check mb-1"><input type="checkbox" class="form-check-input" id="estoqueFormProdutoPadraoInstalacao"><label class="form-check-label">Produto padrÃ£o de instalaÃ§Ã£o</label></div>' +
            '<div class="form-check mb-1"><input type="checkbox" class="form-check-input" id="estoqueFormUsoOrdemServico" checked><label class="form-check-label">Pode ser usado em Ordem de serviÃ§o</label></div>' +
            '<div class="form-check mb-1"><input type="checkbox" class="form-check-input" id="estoqueFormUsoVenda" checked><label class="form-check-label">Pode ser usado em Venda</label></div>' +
            '<div class="form-check mb-1"><input type="checkbox" class="form-check-input" id="estoqueFormUsoContrato"><label class="form-check-label">Pode ser usado em Contrato</label></div>' +
            '<div class="form-check mb-1"><input type="checkbox" class="form-check-input" id="estoqueFormUsoComodato"><label class="form-check-label">Pode ser usado em Comodato</label></div></div></div>' +
            '<div class="tab-pane fade" id="tab-prod-comodato">' +
            '<div class="form-section-erp"><div class="form-section-erp__title">Controle de comodato</div>' +
            '<div class="form-check mb-2"><input type="checkbox" class="form-check-input" id="estoqueFormPermitirComodato"><label class="form-check-label">Permitir comodato</label></div>' +
            '<div class="row g-2 mb-2"><div class="col-md-4"><label class="form-label">Tempo de comodato (meses)</label><input type="number" class="form-control form-control-sm" id="estoqueFormTempoComodatoMeses" min="0" placeholder="â€”"></div>' +
            '<div class="col-md-4"><label class="form-label">Valor do equipamento</label><input type="number" class="form-control form-control-sm" id="estoqueFormValorEquipamentoComodato" step="0.01" min="0" placeholder="â€”"></div>' +
            '<div class="col-md-4"><div class="form-check mt-4"><input type="checkbox" class="form-check-input" id="estoqueFormTermoDevolucaoObrigatorio"><label class="form-check-label">Termo de devoluÃ§Ã£o obrigatÃ³rio</label></div></div></div></div></div>' +
            '<div class="tab-pane fade" id="tab-prod-extras">' +
            '<div class="form-section-erp"><div class="form-section-erp__title">Campos extras</div>' +
            '<div class="row g-2 mb-2"><div class="col-md-4"><label class="form-label">Garantia (meses)</label><input type="number" class="form-control form-control-sm" id="estoqueFormGarantiaMeses" min="0" placeholder="â€”"></div>' +
            '<div class="col-md-4"><label class="form-label">Produto substituto</label><select class="form-select form-select-sm" id="estoqueFormProdutoSubstituto">' + prodOpts + '</select></div>' +
            '<div class="col-md-4"><label class="form-label">Produto equivalente</label><select class="form-select form-select-sm" id="estoqueFormProdutoEquivalente">' + prodOpts + '</select></div></div>' +
            '<div class="mb-2"><label class="form-label">Tags</label><input type="text" class="form-control form-control-sm" id="estoqueFormTags" placeholder="tag1, tag2"></div>' +
            '<div class="mb-2"><label class="form-label">ObservaÃ§Ãµes internas</label><textarea class="form-control form-control-sm" id="estoqueFormObservacoesInternas" rows="3" placeholder="â€”"></textarea></div></div></div>' +
            '</div></div>';
    }
    function estoqueOpenFormModal(entity, id) {
        var modal = document.getElementById('modalEstoqueForm');
        if (!modal)
            return;
        if (entity === 'fornecedores')
            entity = 'fornecedor';
        var errEl = document.getElementById('modalEstoqueFormError');
        if (errEl) {
            errEl.classList.add('d-none');
            errEl.textContent = '';
        }
        var titleEl = document.getElementById('modalEstoqueFormTitle');
        var bodyEl = document.getElementById('modalEstoqueFormBody');
        var dialog = modal ? modal.querySelector('.modal-dialog') : null;
        if (!bodyEl)
            return;
        var isEdit = !!id;
        if (dialog)
            dialog.classList.remove('modal-lg');
        if (entity === 'produto') {
            if (titleEl)
                titleEl.textContent = isEdit ? 'Editar produto (ERP)' : 'Novo produto (ERP)';
            bodyEl.innerHTML = '<p class="text-center py-4 mb-0"><span class="spinner-border spinner-border-sm me-2"></span>Carregando...</p>';
            window._estoqueFormEntity = entity;
            if (dialog) {
                dialog.classList.remove('modal-lg');
                dialog.classList.add('modal-xl');
            }
            safeShowModal('modalEstoqueForm');
            var promises = [
                api(estoqueApiBase + '/categorias'),
                api(estoqueApiBase + '/fabricantes'),
                api(estoqueApiBase + '/ncm'),
                api(estoqueApiBase + '/locais'),
                api(estoqueApiBase + '/fornecedores'),
                api(estoqueApiBase + '/produtos')
            ];
            if (isEdit)
                promises.push(api(estoqueApiBase + '/produtos/' + id));
            Promise.all(promises).then(function (results) {
                var categorias = (results[0] && results[0].list) ? results[0].list : [];
                var fabricantes = (results[1] && results[1].list) ? results[1].list : [];
                var ncmList = (results[2] && results[2].list) ? results[2].list : [];
                var locais = (results[3] && results[3].list) ? results[3].list : [];
                var fornecedores = (results[4] && results[4].list) ? results[4].list : [];
                var produtos = (results[5] && results[5].list) ? results[5].list : [];
                var produto = isEdit && results[6] ? results[6] : null;
                bodyEl.innerHTML = buildProdutoFormErp(categorias, fabricantes, ncmList, locais, fornecedores, produtos);
                document.getElementById('estoqueFormId').value = id || '';
                function setVal(id, v) {
                    var el = document.getElementById(id);
                    if (el && v != null && v !== '')
                        el.value = v;
                }
                function setCheck(id, v) {
                    var el = document.getElementById(id);
                    if (el)
                        el.checked = !!v;
                }
                if (produto) {
                    setVal('estoqueFormCodigo', produto.codigo);
                    setVal('estoqueFormNome', produto.nome);
                    setVal('estoqueFormDescricao', produto.descricao);
                    setVal('estoqueFormCategoria', produto.categoria_id);
                    setVal('estoqueFormFabricante', produto.fabricante_id);
                    setVal('estoqueFormTipoProduto', produto.tipo_produto || 'EQUIPAMENTO');
                    setCheck('estoqueFormAtivo', produto.ativo !== false);
                    setVal('estoqueFormPrecoVenda', produto.preco_venda);
                    setVal('estoqueFormCusto', produto.custo);
                    setVal('estoqueFormMargemLucro', produto.margem_lucro);
                    setVal('estoqueFormPrecoMinimo', produto.preco_minimo);
                    setVal('estoqueFormUnidade', produto.unidade || 'UN');
                    setCheck('estoqueFormPermitirDesconto', produto.permitir_desconto !== false);
                    setCheck('estoqueFormControlarEstoque', produto.controlar_estoque !== false);
                    setVal('estoqueFormEstoqueMinimo', produto.estoque_minimo);
                    setVal('estoqueFormLocalEstoque', produto.local_estoque_id);
                    setVal('estoqueFormFornecedorPrincipal', produto.fornecedor_principal_id);
                    setVal('estoqueFormNcm', produto.ncm_id);
                    setVal('estoqueFormCfop', produto.cfop);
                    setVal('estoqueFormCst', produto.cst);
                    setVal('estoqueFormOrigemMercadoria', produto.origem_mercadoria);
                    setVal('estoqueFormCodigoAnatel', produto.codigo_anatel);
                    setVal('estoqueFormCodigoBarras', produto.codigo_barras);
                    setVal('estoqueFormModelo', produto.modelo);
                    setVal('estoqueFormMarca', produto.marca);
                    setCheck('estoqueFormPermitirNumeroSerie', produto.permitir_numero_serie);
                    setVal('estoqueFormTipoEquipamento', produto.tipo_equipamento);
                    setVal('estoqueFormCompatibilidade', produto.compatibilidade);
                    setCheck('estoqueFormUsadoComodato', produto.usado_comodato);
                    setCheck('estoqueFormPermitirVenda', produto.permitir_venda !== false);
                    setCheck('estoqueFormVincularMac', produto.vincular_mac);
                    setCheck('estoqueFormVincularSerialOnu', produto.vincular_serial_onu);
                    setVal('estoqueFormPesoKg', produto.peso_kg);
                    setVal('estoqueFormAlturaCm', produto.altura_cm);
                    setVal('estoqueFormLarguraCm', produto.largura_cm);
                    setVal('estoqueFormComprimentoCm', produto.comprimento_cm);
                    setVal('estoqueFormImagemUrl', produto.imagem_url);
                    setVal('estoqueFormManualUrl', produto.manual_url);
                    setVal('estoqueFormDocumentosUrl', produto.documentos_url);
                    setCheck('estoqueFormProdutoPadraoInstalacao', produto.produto_padrao_instalacao);
                    setCheck('estoqueFormUsoOrdemServico', produto.uso_ordem_servico !== false);
                    setCheck('estoqueFormUsoVenda', produto.uso_venda !== false);
                    setCheck('estoqueFormUsoContrato', produto.uso_contrato);
                    setCheck('estoqueFormUsoComodato', produto.uso_comodato);
                    setCheck('estoqueFormPermitirComodato', produto.permitir_comodato);
                    setVal('estoqueFormTempoComodatoMeses', produto.tempo_comodato_meses);
                    setVal('estoqueFormValorEquipamentoComodato', produto.valor_equipamento_comodato);
                    setCheck('estoqueFormTermoDevolucaoObrigatorio', produto.termo_devolucao_obrigatorio);
                    setVal('estoqueFormGarantiaMeses', produto.garantia_meses);
                    setVal('estoqueFormProdutoSubstituto', produto.produto_substituto_id);
                    setVal('estoqueFormProdutoEquivalente', produto.produto_equivalente_id);
                    setVal('estoqueFormTags', produto.tags);
                    setVal('estoqueFormObservacoesInternas', produto.observacoes_internas);
                }
                else {
                    document.getElementById('estoqueFormUnidade').value = 'UN';
                    document.getElementById('estoqueFormEstoqueMinimo').value = '0';
                }
            }).catch(function (err) {
                bodyEl.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
            });
            return;
        }
        if (entity === 'kitinstalacao') {
            if (titleEl)
                titleEl.textContent = isEdit ? 'Editar kit' : 'Novo kit';
            bodyEl.innerHTML = '<p class="text-center py-4 mb-0"><span class="spinner-border spinner-border-sm me-2"></span>Carregando...</p>';
            window._estoqueFormEntity = entity;
            if (dialog)
                dialog.classList.add('modal-lg');
            safeShowModal('modalEstoqueForm');
            var promises = [api(estoqueApiBase + '/produtos')];
            if (isEdit)
                promises.push(api(estoqueApiBase + '/kits/' + id));
            Promise.all(promises).then(function (results) {
                var produtos = (results[0] && results[0].list) ? results[0].list : [];
                var kit = isEdit && results[1] ? results[1] : null;
                var prodOpts = function (selectedId) {
                    return '<option value="">â€” Selecione o produto â€”</option>' + (produtos || []).map(function (p) {
                        return '<option value="' + p.id + '"' + (selectedId && p.id == selectedId ? ' selected' : '') + '>' + esc(p.codigo || '') + ' â€” ' + esc(p.nome || '') + '</option>';
                    }).join('');
                };
                var rowHtml = function (prodId, qty) {
                    return '<tr><td><select class="form-select form-select-sm estoque-kit-item-produto">' + prodOpts(prodId) + '</select></td><td><input type="number" class="form-control form-control-sm estoque-kit-item-qty" min="0.001" step="0.001" value="' + (qty || 1) + '" placeholder="Qtd"></td><td><button type="button" class="btn btn-sm btn-outline-danger estoque-kit-remove-row" title="Remover"><i class="bi bi-dash-lg"></i></button></td></tr>';
                };
                var itensRows = '';
                if (kit && kit.itens && kit.itens.length) {
                    kit.itens.forEach(function (item) { itensRows += rowHtml(item.produto_id, item.quantidade); });
                }
                else {
                    itensRows = rowHtml('', 1);
                }
                bodyEl.innerHTML =
                    '<input type="hidden" id="estoqueFormId" value="' + (id || '') + '">' +
                        '<div class="mb-2"><label class="form-label">Nome do kit <span class="text-danger">*</span></label><input type="text" class="form-control form-control-sm" id="estoqueFormNome" placeholder="Nome do kit"></div>' +
                        '<div class="mb-2"><div class="form-check"><input type="checkbox" class="form-check-input" id="estoqueFormAtivo" checked><label class="form-check-label">Ativo</label></div></div>' +
                        '<div class="mb-2"><label class="form-label">Itens do kit</label></div>' +
                        '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Produto</th><th style="width:100px">Quantidade</th><th style="width:60px"></th></tr></thead><tbody id="estoqueKitItensBody">' + itensRows + '</tbody></table></div>' +
                        '<button type="button" class="btn btn-sm btn-outline-primary" id="estoqueKitAddRow"><i class="bi bi-plus-lg me-1"></i>Adicionar item</button>';
                document.getElementById('estoqueFormId').value = id || '';
                document.getElementById('estoqueFormNome').value = (kit && kit.nome) ? kit.nome : '';
                if (document.getElementById('estoqueFormAtivo'))
                    document.getElementById('estoqueFormAtivo').checked = kit ? (kit.ativo !== false) : true;
                var estoqueKitAddRow = document.getElementById('estoqueKitAddRow');
                if (estoqueKitAddRow)
                    estoqueKitAddRow.addEventListener('click', function () {
                    var tbody = document.getElementById('estoqueKitItensBody');
                    if (tbody)
                        tbody.insertAdjacentHTML('beforeend', rowHtml('', 1));
                    tbody.querySelectorAll('.estoque-kit-remove-row').forEach(function (btn) {
                        btn.onclick = function () { this.closest('tr').remove(); };
                    });
                });
                document.querySelectorAll('#estoqueKitItensBody .estoque-kit-remove-row').forEach(function (btn) {
                    btn.onclick = function () { this.closest('tr').remove(); };
                });
            }).catch(function (err) {
                bodyEl.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
            });
            return;
        }
        var forms = {
            categoria: { title: isEdit ? 'Editar categoria' : 'Nova categoria', fields: '<input type="hidden" id="estoqueFormId" value="' + (id || '') + '"><div class="mb-2"><label class="form-label">Nome</label><input type="text" class="form-control form-control-sm" id="estoqueFormNome" placeholder="Nome"></div><div class="mb-2"><div class="form-check"><input type="checkbox" class="form-check-input" id="estoqueFormAtivo" checked><label class="form-check-label">Ativo</label></div></div>' },
            fabricante: { title: isEdit ? 'Editar fabricante' : 'Novo fabricante', fields: '<input type="hidden" id="estoqueFormId" value="' + (id || '') + '"><div class="mb-2"><label class="form-label">Nome</label><input type="text" class="form-control form-control-sm" id="estoqueFormNome" placeholder="Nome"></div><div class="mb-2"><div class="form-check"><input type="checkbox" class="form-check-input" id="estoqueFormAtivo" checked><label class="form-check-label">Ativo</label></div></div>' },
            local: { title: isEdit ? 'Editar local' : 'Novo local', fields: '<input type="hidden" id="estoqueFormId" value="' + (id || '') + '"><div class="mb-2"><label class="form-label">Nome do local</label><input type="text" class="form-control form-control-sm" id="estoqueFormNome" placeholder="Ex: Estoque Geral, Almoxarifado, Loja"></div><div class="mb-2"><div class="form-check"><input type="checkbox" class="form-check-input" id="estoqueFormAtivo" checked><label class="form-check-label">Ativo</label></div></div>' },
            ncm: { title: isEdit ? 'Editar NCM' : 'Novo NCM', fields: '<input type="hidden" id="estoqueFormId" value="' + (id || '') + '"><div class="mb-2"><label class="form-label">CÃ³digo</label><input type="text" class="form-control form-control-sm" id="estoqueFormCodigo" placeholder="CÃ³digo NCM"></div><div class="mb-2"><label class="form-label">DescriÃ§Ã£o</label><input type="text" class="form-control form-control-sm" id="estoqueFormDescricao" placeholder="DescriÃ§Ã£o"></div>' },
            veiculo: { title: isEdit ? 'Editar veÃ­culo' : 'Novo veÃ­culo', fields: '<input type="hidden" id="estoqueFormId" value="' + (id || '') + '"><div class="mb-2"><label class="form-label">Placa <span class="text-danger">*</span></label><input type="text" class="form-control form-control-sm" id="estoqueFormPlaca" placeholder="ABC-1234" maxlength="20"></div><div class="mb-2"><label class="form-label">Modelo</label><input type="text" class="form-control form-control-sm" id="estoqueFormModelo" placeholder="Modelo do veÃ­culo"></div><div class="mb-2"><div class="form-check"><input type="checkbox" class="form-check-input" id="estoqueFormAtivo" checked><label class="form-check-label">Ativo</label></div></div>' },
            fornecedor: { title: isEdit ? 'Editar fornecedor' : 'Novo fornecedor', fields: '<input type="hidden" id="estoqueFormId" value="' + (id || '') + '"><div class="mb-2"><label class="form-label">Nome <span class="text-danger">*</span></label><input type="text" class="form-control form-control-sm" id="estoqueFormNome" placeholder="RazÃ£o social ou nome"></div><div class="mb-2"><label class="form-label">Documento (CPF/CNPJ)</label><input type="text" class="form-control form-control-sm" id="estoqueFormDocumento" placeholder="00.000.000/0000-00"></div><div class="mb-2"><label class="form-label">Contato</label><input type="text" class="form-control form-control-sm" id="estoqueFormContato" placeholder="Telefone ou e-mail"></div><div class="mb-2"><div class="form-check"><input type="checkbox" class="form-check-input" id="estoqueFormAtivo" checked><label class="form-check-label">Ativo</label></div></div>' },
            kitinstalacao: { title: isEdit ? 'Editar kit' : 'Novo kit', fields: '<input type="hidden" id="estoqueFormId" value="' + (id || '') + '"><div class="mb-2"><label class="form-label">Nome <span class="text-danger">*</span></label><input type="text" class="form-control form-control-sm" id="estoqueFormNome" placeholder="Nome do kit"></div><div class="mb-2"><div class="form-check"><input type="checkbox" class="form-check-input" id="estoqueFormAtivo" checked><label class="form-check-label">Ativo</label></div></div>' }
        };
        var f = forms[entity];
        if (!f) {
            alert('FormulÃ¡rio nÃ£o disponÃ­vel para ' + entity);
            return;
        }
        if (titleEl)
            titleEl.textContent = f.title;
        bodyEl.innerHTML = f.fields;
        window._estoqueFormEntity = entity;
        if (isEdit) {
            var path = estoqueApiBase + (entity === 'kitinstalacao' ? '/kits' : entity === 'ncm' ? '/ncm' : entity === 'veiculo' ? '/veiculos' : entity === 'fornecedor' ? '/fornecedores' : entity === 'local' ? '/locais' : '/' + entity + 's') + '/' + id;
            api(path).then(function (r) {
                document.getElementById('estoqueFormId').value = r.id || id;
                if (document.getElementById('estoqueFormNome'))
                    document.getElementById('estoqueFormNome').value = r.nome || '';
                if (document.getElementById('estoqueFormCodigo'))
                    document.getElementById('estoqueFormCodigo').value = r.codigo || '';
                if (document.getElementById('estoqueFormDescricao'))
                    document.getElementById('estoqueFormDescricao').value = r.descricao || '';
                if (document.getElementById('estoqueFormPlaca'))
                    document.getElementById('estoqueFormPlaca').value = r.placa || '';
                if (document.getElementById('estoqueFormModelo'))
                    document.getElementById('estoqueFormModelo').value = r.modelo || '';
                if (document.getElementById('estoqueFormUnidade'))
                    document.getElementById('estoqueFormUnidade').value = r.unidade || 'UN';
                if (document.getElementById('estoqueFormDocumento'))
                    document.getElementById('estoqueFormDocumento').value = r.documento || '';
                if (document.getElementById('estoqueFormContato'))
                    document.getElementById('estoqueFormContato').value = r.contato || '';
                if (document.getElementById('estoqueFormAtivo'))
                    document.getElementById('estoqueFormAtivo').checked = r.ativo !== false;
            }).catch(function (err) { alert(err.message); return; });
        }
        safeShowModal('modalEstoqueForm');
    }
    function estoqueSaveForm() {
        var entity = window._estoqueFormEntity;
        if (!entity)
            return;
        var idEl = document.getElementById('estoqueFormId');
        var id = idEl && idEl.value ? idEl.value.trim() : null;
        var path = estoqueApiBase + (entity === 'produto' ? '/produtos' : entity === 'kitinstalacao' ? '/kits' : entity === 'ncm' ? '/ncm' : entity === 'veiculo' ? '/veiculos' : entity === 'fornecedor' ? '/fornecedores' : entity === 'local' ? '/locais' : '/' + entity + 's');
        var body = {};
        if (entity === 'categoria' || entity === 'fabricante' || entity === 'local' || entity === 'kitinstalacao') {
            body.nome = (document.getElementById('estoqueFormNome') || {}).value || '';
            body.ativo = (document.getElementById('estoqueFormAtivo') || {}).checked;
        }
        else if (entity === 'fornecedor') {
            body.nome = (document.getElementById('estoqueFormNome') || {}).value || '';
            body.documento = (document.getElementById('estoqueFormDocumento') || {}).value || null;
            body.contato = (document.getElementById('estoqueFormContato') || {}).value || null;
            body.ativo = (document.getElementById('estoqueFormAtivo') || {}).checked;
        }
        else if (entity === 'ncm') {
            body.codigo = (document.getElementById('estoqueFormCodigo') || {}).value || '';
            body.descricao = (document.getElementById('estoqueFormDescricao') || {}).value || null;
        }
        else if (entity === 'veiculo') {
            body.placa = (document.getElementById('estoqueFormPlaca') || {}).value || '';
            body.modelo = (document.getElementById('estoqueFormModelo') || {}).value || null;
            body.ativo = (document.getElementById('estoqueFormAtivo') || {}).checked;
        }
        else if (entity === 'produto') {
            function g(id) { var el = document.getElementById(id); return el ? el.value : ''; }
            function gn(id) { var v = g(id); return v !== '' ? (parseFloat(v) || null) : null; }
            function gi(id) { var v = g(id); return v ? parseInt(v, 10) : null; }
            function cb(id) { var el = document.getElementById(id); return el ? el.checked : false; }
            body.codigo = (g('estoqueFormCodigo') || '').trim() || null;
            body.nome = (g('estoqueFormNome') || '').trim();
            body.descricao = (g('estoqueFormDescricao') || '').trim() || null;
            body.categoria_id = gi('estoqueFormCategoria');
            body.fabricante_id = gi('estoqueFormFabricante');
            body.ncm_id = gi('estoqueFormNcm');
            body.tipo_produto = g('estoqueFormTipoProduto') || 'EQUIPAMENTO';
            body.ativo = cb('estoqueFormAtivo');
            body.preco_venda = gn('estoqueFormPrecoVenda');
            body.custo = gn('estoqueFormCusto');
            body.margem_lucro = gn('estoqueFormMargemLucro');
            body.preco_minimo = gn('estoqueFormPrecoMinimo');
            body.unidade = g('estoqueFormUnidade') || 'UN';
            body.permitir_desconto = cb('estoqueFormPermitirDesconto');
            body.controlar_estoque = cb('estoqueFormControlarEstoque');
            body.estoque_minimo = gn('estoqueFormEstoqueMinimo') != null ? gn('estoqueFormEstoqueMinimo') : 0;
            body.local_estoque_id = gi('estoqueFormLocalEstoque');
            body.fornecedor_principal_id = gi('estoqueFormFornecedorPrincipal');
            body.cfop = (g('estoqueFormCfop') || '').trim() || null;
            body.cst = (g('estoqueFormCst') || '').trim() || null;
            body.origem_mercadoria = (g('estoqueFormOrigemMercadoria') || '').trim() || null;
            body.codigo_anatel = (g('estoqueFormCodigoAnatel') || '').trim() || null;
            body.codigo_barras = (g('estoqueFormCodigoBarras') || '').trim() || null;
            body.modelo = (g('estoqueFormModelo') || '').trim() || null;
            body.marca = (g('estoqueFormMarca') || '').trim() || null;
            body.permitir_numero_serie = cb('estoqueFormPermitirNumeroSerie');
            body.tipo_equipamento = (g('estoqueFormTipoEquipamento') || '').trim() || null;
            body.compatibilidade = (g('estoqueFormCompatibilidade') || '').trim() || null;
            body.usado_comodato = cb('estoqueFormUsadoComodato');
            body.permitir_venda = cb('estoqueFormPermitirVenda');
            body.vincular_mac = cb('estoqueFormVincularMac');
            body.vincular_serial_onu = cb('estoqueFormVincularSerialOnu');
            body.peso_kg = gn('estoqueFormPesoKg');
            body.altura_cm = gn('estoqueFormAlturaCm');
            body.largura_cm = gn('estoqueFormLarguraCm');
            body.comprimento_cm = gn('estoqueFormComprimentoCm');
            body.imagem_url = (g('estoqueFormImagemUrl') || '').trim() || null;
            body.manual_url = (g('estoqueFormManualUrl') || '').trim() || null;
            body.documentos_url = (g('estoqueFormDocumentosUrl') || '').trim() || null;
            body.produto_padrao_instalacao = cb('estoqueFormProdutoPadraoInstalacao');
            body.uso_ordem_servico = cb('estoqueFormUsoOrdemServico');
            body.uso_venda = cb('estoqueFormUsoVenda');
            body.uso_contrato = cb('estoqueFormUsoContrato');
            body.uso_comodato = cb('estoqueFormUsoComodato');
            body.permitir_comodato = cb('estoqueFormPermitirComodato');
            body.tempo_comodato_meses = g('estoqueFormTempoComodatoMeses') !== '' ? parseInt(g('estoqueFormTempoComodatoMeses'), 10) : null;
            body.valor_equipamento_comodato = gn('estoqueFormValorEquipamentoComodato');
            body.termo_devolucao_obrigatorio = cb('estoqueFormTermoDevolucaoObrigatorio');
            body.garantia_meses = g('estoqueFormGarantiaMeses') !== '' ? parseInt(g('estoqueFormGarantiaMeses'), 10) : null;
            body.produto_substituto_id = gi('estoqueFormProdutoSubstituto');
            body.produto_equivalente_id = gi('estoqueFormProdutoEquivalente');
            body.tags = (g('estoqueFormTags') || '').trim() || null;
            body.observacoes_internas = (g('estoqueFormObservacoesInternas') || '').trim() || null;
        }
        if ((entity === 'categoria' || entity === 'fabricante' || entity === 'local' || entity === 'produto' || entity === 'kitinstalacao' || entity === 'fornecedor') && !(body.nome || '').trim()) {
            var errEl = document.getElementById('modalEstoqueFormError');
            if (errEl) {
                errEl.textContent = 'Nome Ã© obrigatÃ³rio.';
                errEl.classList.remove('d-none');
            }
            return;
        }
        if (entity === 'ncm' && !body.codigo) {
            var errEl = document.getElementById('modalEstoqueFormError');
            if (errEl) {
                errEl.textContent = 'CÃ³digo NCM Ã© obrigatÃ³rio.';
                errEl.classList.remove('d-none');
            }
            return;
        }
        if (entity === 'veiculo' && !(body.placa || '').trim()) {
            var errEl = document.getElementById('modalEstoqueFormError');
            if (errEl) {
                errEl.textContent = 'Placa Ã© obrigatÃ³ria.';
                errEl.classList.remove('d-none');
            }
            return;
        }
        if (entity === 'kitinstalacao') {
            var itensRows = document.querySelectorAll('#estoqueKitItensBody tr');
            body.itens = [];
            itensRows.forEach(function (tr) {
                var prodSel = tr.querySelector('.estoque-kit-item-produto');
                var qtyInp = tr.querySelector('.estoque-kit-item-qty');
                if (prodSel && prodSel.value && qtyInp && parseFloat(qtyInp.value) > 0) {
                    body.itens.push({ produto_id: parseInt(prodSel.value, 10), quantidade: parseFloat(qtyInp.value) || 1 });
                }
            });
        }
        var method = id ? 'PUT' : 'POST';
        var url = id ? path + '/' + id : path;
        var btn = document.getElementById('btnEstoqueFormSave');
        var errEl = document.getElementById('modalEstoqueFormError');
        if (errEl) {
            errEl.classList.add('d-none');
            errEl.textContent = '';
        }
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvando...';
        }
        api(url, { method: method, body: JSON.stringify(body) }).then(function () {
            safeHideModal('modalEstoqueForm');
            estoqueLoadList(entity);
        }).catch(function (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Erro ao salvar.';
                errEl.classList.remove('d-none');
            }
        }).finally(function () {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar';
            }
        });
    }
    function estoqueShowDashboard() {
        safeShowModal('tab-estoque');
        var main = document.querySelector('#tab-estoque .estoque-main');
        var area = document.getElementById('estoqueContentArea');
        if (main)
            main.classList.remove('estoque-main--list');
        if (area)
            area.classList.remove('visible');
        estoqueLoadDashboardKpis();
    }
    function estoqueLoadDashboardKpis() {
        var ids = { produtos: 'estoqueKpiProdutos', categorias: 'estoqueKpiCategorias', locais: 'estoqueKpiLocais', mov: 'estoqueKpiMov' };
        api('/estoque/dashboard').then(function (data) {
            var el = document.getElementById(ids.produtos);
            if (el)
                el.textContent = data.produtos != null ? data.produtos : 'â€”';
            el = document.getElementById(ids.categorias);
            if (el)
                el.textContent = data.categorias != null ? data.categorias : 'â€”';
            el = document.getElementById(ids.locais);
            if (el)
                el.textContent = data.locais != null ? data.locais : 'â€”';
            el = document.getElementById(ids.mov);
            if (el)
                el.textContent = data.movimentacoes != null ? data.movimentacoes : 'â€”';
        }).catch(function () {
            var idsArr = [ids.produtos, ids.categorias, ids.locais, ids.mov];
            idsArr.forEach(function (id) {
                var el = document.getElementById(id);
                if (el)
                    el.textContent = 'â€”';
            });
        });
    }
    document.getElementById('estoqueBtnBack') && document.getElementById('estoqueBtnBack').addEventListener('click', function () { estoqueShowDashboard(); });
    document.getElementById('estoqueBreadcrumbRoot') && document.getElementById('estoqueBreadcrumbRoot').addEventListener('click', function (e) { e.preventDefault(); estoqueShowDashboard(); });
    document.getElementById('btnEstoqueFormSave') && document.getElementById('btnEstoqueFormSave').addEventListener('click', function () { estoqueSaveForm(); });
    document.getElementById('btnEstoqueMovFormSave') && document.getElementById('btnEstoqueMovFormSave').addEventListener('click', function () { estoqueSaveMovimentacao(); });
    document.getElementById('btnEstoqueViagemFormSave') && document.getElementById('btnEstoqueViagemFormSave').addEventListener('click', function () { estoqueSaveViagem(); });
    document.querySelector('#tab-estoque') && document.querySelector('#tab-estoque').addEventListener('click', function (e) {
        var btn = e.target.closest('.estoque-menu-btn');
        if (btn) {
            var paneId = btn.getAttribute('data-estoque-pane');
            if (paneId) {
                e.preventDefault();
                document.querySelectorAll('.estoque-menu-btn').forEach(function (b) { b.classList.remove('active'); });
                document.querySelectorAll('.estoque-pane').forEach(function (p) { p.classList.remove('active'); });
                btn.classList.add('active');
                var pane = document.getElementById('estoque-pane-' + paneId);
                if (pane)
                    pane.classList.add('active');
                var contentArea = document.getElementById('estoqueContentArea');
                if (contentArea)
                    contentArea.classList.remove('visible');
            }
            return;
        }
        var item = e.target.closest('.estoque-sub-item');
        if (!item)
            return;
        e.preventDefault();
        var action = item.getAttribute('data-estoque-action');
        if (!action)
            return;
        var movList = ['compra-list', 'venda-list', 'comodato-list', 'correcao-list', 'transferencia-list'];
        var movAdd = { 'compra-add': 'COMPRA', 'compra-nfe': 'COMPRA_NFE', 'venda-add': 'VENDA', 'comodato-add': 'COMODATO', 'correcao-add': 'CORRECAO', 'transferencia-add': 'TRANSFERENCIA', 'transferencia-lote': 'TRANSFERENCIA' };
        if (movList.indexOf(action) >= 0) {
            var t = action.replace('-list', '');
            var tipoMap = { 'compra-list': 'COMPRA', 'venda-list': 'VENDA', 'comodato-list': 'COMODATO', 'correcao-list': 'CORRECAO', 'transferencia-list': 'TRANSFERENCIA' };
            var titles = { compra: 'Compras', venda: 'Vendas', comodato: 'Comodato', correcao: 'CorreÃ§Ãµes', transferencia: 'TransferÃªncias' };
            estoqueLoadMovimentacoesList(tipoMap[action], titles[t] || action);
            return;
        }
        if (movAdd[action]) {
            estoqueOpenMovimentacaoModal(movAdd[action]);
            return;
        }
        if (action === 'produtofornecedor') {
            estoqueShowContent('Produtos - Fornecedores', false, false, 'Cadastros');
            document.getElementById('estoqueContentBody').innerHTML = '<p class="text-muted">Selecione um produto na lista de Produtos para ver e cadastrar fornecedores por produto (API: GET/POST /estoque/produtos/:id/fornecedores).</p>';
            return;
        }
        estoqueLoadList(action);
    });
    function openGatewayListModal() {
        if (safeShowModal('modalGatewayList'))
            loadFinanceGateways();
    }
    function loadFinanceGateways() {
        var out = document.getElementById('outGatewayList');
        if (!out)
            return;
        out.innerHTML = 'Carregando...';
        var active = (document.getElementById('gatewayFilterActive') || {}).value || '';
        var search = (document.getElementById('gatewayFilterSearch') || {}).value || '';
        var q = '/finance/gateways?';
        if (active)
            q += 'active=' + encodeURIComponent(active) + '&';
        if (search)
            q += 'search=' + encodeURIComponent(search) + '&';
        q = q.replace(/\?$|&$/, '');
        api(q).then(function (data) {
            var rows = data.rows || [];
            if (!rows.length) {
                out.innerHTML = '<p class="mb-0 text-muted py-4 text-center">Nenhum gateway cadastrado. Clique em <strong>Cadastrar</strong>.</p>';
                return;
            }
            var gatewayLabel = function (t) {
                var map = { gerencianet: 'GerenciaNet', gerencianet_pix: 'GerenciaNet PIX', cora_api: 'Cora API', cora_api_v2: 'Cora API V2', boleto_facil: 'Boleto FÃ¡cil', widepay: 'WidePay', pagar_me: 'Pagar.me', asaas: 'Asaas', outro: 'Outro' };
                return map[t] || t;
            };
            var sim = 'Sim';
            var nao = 'NÃ£o';
            var html = '<div class="table-responsive"><table class="table table-sm table-hover"><thead><tr><th>ID</th><th>DescriÃ§Ã£o</th><th>Portadores</th><th>Gateway</th><th>Pix</th><th>CartÃ£o</th><th>Boleto</th><th>Retorno</th><th class="text-end">AÃ§Ãµes</th></tr></thead><tbody>';
            rows.forEach(function (r) {
                var port = (r.portadores || '').toString().replace(/\n/g, ', ');
                if (port.length > 60)
                    port = port.slice(0, 57) + '...';
                html += '<tr><td>' + esc(r.id) + '</td><td>' + esc(r.description) + '</td><td class="small">' + esc(port) + '</td><td>' + esc(gatewayLabel(r.gateway_type)) + '</td>';
                html += '<td>' + (r.pix ? sim : nao) + '</td><td>' + (r.card ? sim : nao) + '</td><td>' + (r.boleto ? sim : nao) + '</td><td>' + (r.retorno ? sim : nao) + '</td>';
                html += '<td class="text-end"><button type="button" class="btn btn-sm btn-outline-primary me-1" data-gateway-edit="' + r.id + '">Editar</button><button type="button" class="btn btn-sm btn-outline-danger" data-gateway-delete="' + r.id + '">Excluir</button></td></tr>';
            });
            html += '</tbody></table></div>';
            out.innerHTML = html;
            out.querySelectorAll('[data-gateway-edit]').forEach(function (btn) {
                btn.addEventListener('click', function () { openGatewayFormModal(Number(this.getAttribute('data-gateway-edit'))); });
            });
            out.querySelectorAll('[data-gateway-delete]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = Number(this.getAttribute('data-gateway-delete'));
                    if (!confirm('Excluir este gateway?'))
                        return;
                    api('/finance/gateways/' + id, { method: 'DELETE' }).then(function () { loadFinanceGateways(); }).catch(function (err) { alert(err.message); });
                });
            });
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    function openGatewayFormModal(editId) {
        var title = document.getElementById('modalGatewayFormTitle');
        var idEl = document.getElementById('gatewayFormId');
        var desc = document.getElementById('gatewayFormDescription');
        var typeSel = document.getElementById('gatewayFormType');
        var port = document.getElementById('gatewayFormPortadores');
        var pix = document.getElementById('gatewayFormPix');
        var card = document.getElementById('gatewayFormCard');
        var boleto = document.getElementById('gatewayFormBoleto');
        var retorno = document.getElementById('gatewayFormRetorno');
        var clientId = document.getElementById('gatewayFormClientId');
        var clientSecret = document.getElementById('gatewayFormClientSecret');
        var sandbox = document.getElementById('gatewayFormSandbox');
        var active = document.getElementById('gatewayFormActive');
        if (!idEl || !desc)
            return;
        idEl.value = editId ? String(editId) : '';
        title.textContent = editId ? 'Editar gateway' : 'Cadastrar gateway';
        desc.value = '';
        typeSel.value = 'gerencianet';
        port.value = '';
        pix.checked = false;
        card.checked = false;
        boleto.checked = false;
        retorno.checked = false;
        clientId.value = '';
        clientSecret.value = '';
        sandbox.checked = false;
        active.checked = true;
        toggleGatewayEfiConfig();
        if (editId) {
            api('/finance/gateways/' + editId).then(function (r) {
                desc.value = r.description || '';
                typeSel.value = r.gateway_type || 'gerencianet';
                port.value = (r.portadores || '').toString();
                pix.checked = !!r.pix;
                card.checked = !!r.card;
                boleto.checked = !!r.boleto;
                retorno.checked = !!r.retorno;
                active.checked = r.active !== false;
                var cfg = r.config || {};
                clientId.value = cfg.client_id || '';
                clientSecret.value = cfg.client_secret || '';
                sandbox.checked = !!cfg.sandbox;
                toggleGatewayEfiConfig();
            }).catch(function (err) { alert(err.message); });
        }
        safeShowModal('modalGatewayForm');
    }
    function toggleGatewayEfiConfig() {
        var typeSel = document.getElementById('gatewayFormType');
        var wrap = document.getElementById('gatewayFormEfiWrap');
        if (!wrap)
            return;
        var t = (typeSel && typeSel.value) || '';
        wrap.style.display = (t === 'gerencianet' || t === 'gerencianet_pix') ? 'block' : 'none';
    }
    document.getElementById('gatewayFormType') && document.getElementById('gatewayFormType').addEventListener('change', toggleGatewayEfiConfig);
    document.getElementById('btnGatewayCadastrar') && document.getElementById('btnGatewayCadastrar').addEventListener('click', function () {
        var listModal = document.getElementById('modalGatewayList');
        safeHideModal('modalGatewayList');
        openGatewayFormModal(null);
    });
    document.getElementById('btnGatewayBuscar') && document.getElementById('btnGatewayBuscar').addEventListener('click', function () { loadFinanceGateways(); });
    document.getElementById('gatewayFilterActive') && document.getElementById('gatewayFilterActive').addEventListener('change', function () { loadFinanceGateways(); });
    document.getElementById('gatewayFilterSearch') && document.getElementById('gatewayFilterSearch').addEventListener('keydown', function (e) {
        if (e.key === 'Enter')
            loadFinanceGateways();
    });
    document.getElementById('btnGatewayFormSave') && document.getElementById('btnGatewayFormSave').addEventListener('click', function () {
        var idEl = document.getElementById('gatewayFormId');
        var desc = (document.getElementById('gatewayFormDescription') || {}).value || '';
        var typeSel = (document.getElementById('gatewayFormType') || {}).value || 'gerencianet';
        var port = (document.getElementById('gatewayFormPortadores') || {}).value || '';
        var pix = (document.getElementById('gatewayFormPix') || {}).checked;
        var card = (document.getElementById('gatewayFormCard') || {}).checked;
        var boleto = (document.getElementById('gatewayFormBoleto') || {}).checked;
        var retorno = (document.getElementById('gatewayFormRetorno') || {}).checked;
        var clientId = (document.getElementById('gatewayFormClientId') || {}).value || '';
        var clientSecret = (document.getElementById('gatewayFormClientSecret') || {}).value || '';
        var sandbox = (document.getElementById('gatewayFormSandbox') || {}).checked;
        var active = (document.getElementById('gatewayFormActive') || {}).checked;
        if (!desc.trim()) {
            alert('Informe a descriÃ§Ã£o.');
            return;
        }
        var config = null;
        if (typeSel === 'gerencianet' || typeSel === 'gerencianet_pix') {
            config = { client_id: clientId.trim(), sandbox: sandbox };
            if (clientSecret)
                config.client_secret = clientSecret;
        }
        var payload = { description: desc.trim(), gateway_type: typeSel, portadores: port || null, pix: pix, card: card, boleto: boleto, retorno: retorno, config: config, active: active };
        var editId = idEl && idEl.value ? Number(idEl.value) : null;
        var method = editId ? 'PUT' : 'POST';
        var url = editId ? '/finance/gateways/' + editId : '/finance/gateways';
        api(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(function () {
            safeHideModal('modalGatewayForm');
            loadFinanceGateways();
            alert(editId ? 'Gateway atualizado.' : 'Gateway cadastrado.');
        }).catch(function (err) { alert(err.message); });
    });
    // ---- Fornecedores ----
    function openSupplierListModal() {
        if (safeShowModal('modalSupplierList'))
            loadSuppliers();
    }
    function loadSuppliers() {
        var out = document.getElementById('outSupplierList');
        if (!out)
            return;
        out.innerHTML = 'Carregando...';
        var search = (document.getElementById('supplierFilterSearch') || {}).value || '';
        var ativo = (document.getElementById('supplierFilterAtivo') || {}).value || '';
        var q = '/finance/suppliers?';
        if (search)
            q += 'search=' + encodeURIComponent(search) + '&';
        if (ativo)
            q += 'ativo=' + ativo + '&';
        q = q.replace(/\?$|&$/, '');
        api(q).then(function (data) {
            var rows = data.rows || [];
            if (!rows.length) {
                out.innerHTML = '<p class="mb-0 text-muted py-4 text-center">Nenhum fornecedor cadastrado. Clique em <strong>Cadastrar</strong>.</p>';
                return;
            }
            var html = '<div class="table-responsive"><table class="table table-sm table-hover"><thead><tr><th>ID</th><th>Nome/RazÃ£o</th><th>Fantasia</th><th>CPF/CNPJ</th><th>Cidade</th><th>Ativo</th><th class="text-end">AÃ§Ãµes</th></tr></thead><tbody>';
            rows.forEach(function (r) {
                html += '<tr><td>' + esc(r.id) + '</td><td>' + esc(r.nome_razao) + '</td><td>' + esc(r.nome_fantasia || '') + '</td><td>' + esc(r.cpf_cnpj || '') + '</td><td>' + esc(r.cidade || '') + '</td><td>' + (r.ativo ? 'Sim' : 'NÃ£o') + '</td>';
                html += '<td class="text-end"><button type="button" class="btn btn-sm btn-outline-primary me-1" data-supplier-edit="' + r.id + '">Editar</button><button type="button" class="btn btn-sm btn-outline-danger" data-supplier-delete="' + r.id + '">Excluir</button></td></tr>';
            });
            html += '</tbody></table></div>';
            out.innerHTML = html;
            out.querySelectorAll('[data-supplier-edit]').forEach(function (btn) { btn.addEventListener('click', function () { openSupplierFormModal(Number(this.getAttribute('data-supplier-edit'))); }); });
            out.querySelectorAll('[data-supplier-delete]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = Number(this.getAttribute('data-supplier-delete'));
                    if (!confirm('Excluir este fornecedor?'))
                        return;
                    api('/finance/suppliers/' + id, { method: 'DELETE' }).then(function () { loadSuppliers(); }).catch(function (err) { alert(err.message); });
                });
            });
        }).catch(function (err) { out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>'; });
    }
    function openSupplierFormModal(editId) {
        var title = document.getElementById('modalSupplierFormTitle');
        var idEl = document.getElementById('supplierFormId');
        var ids = ['supplierFormTipoPessoa', 'supplierFormSituacaoFiscal', 'supplierFormNomeRazao', 'supplierFormNomeFantasia', 'supplierFormCpfCnpj', 'supplierFormIe', 'supplierFormIm', 'supplierFormEndereco', 'supplierFormNumero', 'supplierFormBairro', 'supplierFormCep', 'supplierFormCidade', 'supplierFormUf', 'supplierFormEmail', 'supplierFormTelefones', 'supplierFormCelulares', 'supplierFormObservacao', 'supplierFormAtivo'];
        idEl.value = editId ? String(editId) : '';
        title.textContent = editId ? 'Editar fornecedor' : 'Cadastrar fornecedor';
        ids.forEach(function (id) {
            var el = document.getElementById(id);
            if (!el)
                return;
            if (el.type === 'checkbox')
                el.checked = id === 'supplierFormAtivo' ? true : false;
            else
                el.value = '';
        });
        if (editId) {
            api('/finance/suppliers/' + editId).then(function (r) {
                document.getElementById('supplierFormTipoPessoa').value = r.tipo_pessoa || 'JURIDICA';
                document.getElementById('supplierFormSituacaoFiscal').value = r.situacao_fiscal || '';
                document.getElementById('supplierFormNomeRazao').value = r.nome_razao || '';
                document.getElementById('supplierFormNomeFantasia').value = r.nome_fantasia || '';
                document.getElementById('supplierFormCpfCnpj').value = r.cpf_cnpj || '';
                document.getElementById('supplierFormIe').value = r.ie || '';
                document.getElementById('supplierFormIm').value = r.im || '';
                document.getElementById('supplierFormEndereco').value = r.endereco || '';
                document.getElementById('supplierFormNumero').value = r.numero || '';
                document.getElementById('supplierFormBairro').value = r.bairro || '';
                document.getElementById('supplierFormCep').value = r.cep || '';
                document.getElementById('supplierFormCidade').value = r.cidade || '';
                document.getElementById('supplierFormUf').value = r.uf || '';
                document.getElementById('supplierFormEmail').value = r.email || '';
                document.getElementById('supplierFormTelefones').value = r.telefones || '';
                document.getElementById('supplierFormCelulares').value = r.celulares || '';
                document.getElementById('supplierFormObservacao').value = r.observacao || '';
                document.getElementById('supplierFormAtivo').checked = r.ativo !== false;
            }).catch(function (err) { alert(err.message); });
        }
        safeShowModal('modalSupplierForm');
    }
    document.getElementById('btnSupplierCadastrar') && document.getElementById('btnSupplierCadastrar').addEventListener('click', function () {
        safeHideModal('modalSupplierList');
        openSupplierFormModal(null);
    });
    document.getElementById('btnSupplierBuscar') && document.getElementById('btnSupplierBuscar').addEventListener('click', function () { loadSuppliers(); });
    document.getElementById('supplierFilterAtivo') && document.getElementById('supplierFilterAtivo').addEventListener('change', function () { loadSuppliers(); });
    document.getElementById('supplierFilterSearch') && document.getElementById('supplierFilterSearch').addEventListener('keydown', function (e) {
        if (e.key === 'Enter')
            loadSuppliers();
    });
    document.getElementById('btnSupplierFormSave') && document.getElementById('btnSupplierFormSave').addEventListener('click', function () {
        var idEl = document.getElementById('supplierFormId');
        var nomeRazao = (document.getElementById('supplierFormNomeRazao') || {}).value || '';
        if (!nomeRazao.trim()) {
            alert('Informe o nome/razÃ£o social.');
            return;
        }
        var payload = { nome_razao: nomeRazao.trim(), tipo_pessoa: (document.getElementById('supplierFormTipoPessoa') || {}).value || 'JURIDICA', situacao_fiscal: (document.getElementById('supplierFormSituacaoFiscal') || {}).value || null, nome_fantasia: (document.getElementById('supplierFormNomeFantasia') || {}).value || null, cpf_cnpj: (document.getElementById('supplierFormCpfCnpj') || {}).value || null, ie: (document.getElementById('supplierFormIe') || {}).value || null, im: (document.getElementById('supplierFormIm') || {}).value || null, endereco: (document.getElementById('supplierFormEndereco') || {}).value || null, numero: (document.getElementById('supplierFormNumero') || {}).value || null, bairro: (document.getElementById('supplierFormBairro') || {}).value || null, cep: (document.getElementById('supplierFormCep') || {}).value || null, cidade: (document.getElementById('supplierFormCidade') || {}).value || null, uf: (document.getElementById('supplierFormUf') || {}).value || null, email: (document.getElementById('supplierFormEmail') || {}).value || null, telefones: (document.getElementById('supplierFormTelefones') || {}).value || null, celulares: (document.getElementById('supplierFormCelulares') || {}).value || null, observacao: (document.getElementById('supplierFormObservacao') || {}).value || null, ativo: (document.getElementById('supplierFormAtivo') || {}).checked };
        var editId = idEl && idEl.value ? Number(idEl.value) : null;
        var method = editId ? 'PUT' : 'POST';
        var url = editId ? '/finance/suppliers/' + editId : '/finance/suppliers';
        api(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(function () {
            safeHideModal('modalSupplierForm');
            loadSuppliers();
            openSupplierListModal();
            alert(editId ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
        }).catch(function (err) { alert(err.message); });
    });
    // ---- Plano de Contas ----
    function openChartListModal() {
        if (safeShowModal('modalChartList'))
            loadChartOfAccounts();
    }
    function loadChartOfAccounts() {
        var out = document.getElementById('outChartList');
        if (!out)
            return;
        out.innerHTML = 'Carregando...';
        var tipo = (document.getElementById('chartFilterTipo') || {}).value || '';
        var ativo = (document.getElementById('chartFilterAtivo') || {}).value || '';
        var q = '/finance/chart-of-accounts?';
        if (tipo)
            q += 'tipo=' + encodeURIComponent(tipo) + '&';
        if (ativo)
            q += 'ativo=' + ativo + '&';
        q = q.replace(/\?$|&$/, '');
        api(q).then(function (data) {
            var rows = data.rows || [];
            if (!rows.length) {
                out.innerHTML = '<p class="mb-0 text-muted py-4 text-center">Nenhuma conta cadastrada. Clique em <strong>Cadastrar</strong>.</p>';
                return;
            }
            var html = '<div class="table-responsive"><table class="table table-sm table-hover"><thead><tr><th>ID</th><th>CÃ³digo</th><th>DescriÃ§Ã£o</th><th>Tipo</th><th>Conta plano</th><th>Ativo</th><th class="text-end">AÃ§Ãµes</th></tr></thead><tbody>';
            rows.forEach(function (r) {
                html += '<tr><td>' + esc(r.id) + '</td><td>' + esc(r.codigo_financeiro) + '</td><td>' + esc(r.descricao) + '</td><td>' + esc(r.tipo) + '</td><td>' + esc(r.conta_plano || 'NORMAL') + '</td><td>' + (r.ativo ? 'Sim' : 'NÃ£o') + '</td>';
                html += '<td class="text-end"><button type="button" class="btn btn-sm btn-outline-primary me-1" data-chart-edit="' + r.id + '">Editar</button><button type="button" class="btn btn-sm btn-outline-danger" data-chart-delete="' + r.id + '">Excluir</button></td></tr>';
            });
            html += '</tbody></table></div>';
            out.innerHTML = html;
            out.querySelectorAll('[data-chart-edit]').forEach(function (btn) { btn.addEventListener('click', function () { openChartFormModal(Number(this.getAttribute('data-chart-edit'))); }); });
            out.querySelectorAll('[data-chart-delete]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = Number(this.getAttribute('data-chart-delete'));
                    if (!confirm('Excluir esta conta?'))
                        return;
                    api('/finance/chart-of-accounts/' + id, { method: 'DELETE' }).then(function () { loadChartOfAccounts(); }).catch(function (err) { alert(err.message); });
                });
            });
        }).catch(function (err) { out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>'; });
    }
    function openChartFormModal(editId) {
        var title = document.getElementById('modalChartFormTitle');
        var idEl = document.getElementById('chartFormId');
        idEl.value = editId ? String(editId) : '';
        title.textContent = editId ? 'Editar plano de contas' : 'Cadastrar plano de contas';
        ['chartFormTipo', 'chartFormCodigo', 'chartFormDescricao', 'chartFormContaPlano', 'chartFormDre', 'chartFormDreTipo', 'chartFormSiciConta', 'chartFormVisivel', 'chartFormAtivo'].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el)
                return;
            if (el.type === 'checkbox')
                el.checked = (id === 'chartFormVisivel' || id === 'chartFormAtivo');
            else
                el.value = id === 'chartFormTipo' ? 'DESPESA' : (id === 'chartFormContaPlano' ? 'NORMAL' : '');
        });
        if (editId) {
            api('/finance/chart-of-accounts/' + editId).then(function (r) {
                document.getElementById('chartFormTipo').value = r.tipo || 'DESPESA';
                document.getElementById('chartFormCodigo').value = r.codigo_financeiro || '';
                document.getElementById('chartFormDescricao').value = r.descricao || '';
                document.getElementById('chartFormContaPlano').value = r.conta_plano || 'NORMAL';
                document.getElementById('chartFormDre').value = r.dre || '';
                document.getElementById('chartFormDreTipo').value = r.dre_tipo || '';
                document.getElementById('chartFormSiciConta').value = r.sici_conta || '';
                document.getElementById('chartFormVisivel').checked = r.visivel !== false;
                document.getElementById('chartFormAtivo').checked = r.ativo !== false;
            }).catch(function (err) { alert(err.message); });
        }
        safeShowModal('modalChartForm');
    }
    document.getElementById('btnChartCadastrar') && document.getElementById('btnChartCadastrar').addEventListener('click', function () {
        safeHideModal('modalChartList');
        openChartFormModal(null);
    });
    document.getElementById('btnChartBuscar') && document.getElementById('btnChartBuscar').addEventListener('click', function () { loadChartOfAccounts(); });
    document.getElementById('chartFilterTipo') && document.getElementById('chartFilterTipo').addEventListener('change', function () { loadChartOfAccounts(); });
    document.getElementById('chartFilterAtivo') && document.getElementById('chartFilterAtivo').addEventListener('change', function () { loadChartOfAccounts(); });
    document.getElementById('btnChartFormSave') && document.getElementById('btnChartFormSave').addEventListener('click', function () {
        var idEl = document.getElementById('chartFormId');
        var codigo = (document.getElementById('chartFormCodigo') || {}).value || '';
        var descricao = (document.getElementById('chartFormDescricao') || {}).value || '';
        if (!codigo.trim() || !descricao.trim()) {
            alert('CÃ³digo e descriÃ§Ã£o sÃ£o obrigatÃ³rios.');
            return;
        }
        var payload = { tipo: (document.getElementById('chartFormTipo') || {}).value || 'DESPESA', codigo_financeiro: codigo.trim(), descricao: descricao.trim(), conta_plano: (document.getElementById('chartFormContaPlano') || {}).value || 'NORMAL', dre: (document.getElementById('chartFormDre') || {}).value || null, dre_tipo: (document.getElementById('chartFormDreTipo') || {}).value || null, sici_conta: (document.getElementById('chartFormSiciConta') || {}).value || null, visivel: (document.getElementById('chartFormVisivel') || {}).checked, ativo: (document.getElementById('chartFormAtivo') || {}).checked };
        var editId = idEl && idEl.value ? Number(idEl.value) : null;
        var method = editId ? 'PUT' : 'POST';
        var url = editId ? '/finance/chart-of-accounts/' + editId : '/finance/chart-of-accounts';
        api(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(function () {
            safeHideModal('modalChartForm');
            loadChartOfAccounts();
            openChartListModal();
            alert(editId ? 'Plano de contas atualizado.' : 'Plano de contas cadastrado.');
        }).catch(function (err) { alert(err.message); });
    });
    // ---- Contas a Pagar ----
    function openPayableListModal() {
        if (safeShowModal('modalPayableList'))
            loadPayables();
    }
    function loadPayables() {
        var out = document.getElementById('outPayableList');
        if (!out)
            return;
        out.innerHTML = 'Carregando...';
        var status = (document.getElementById('payableFilterStatus') || {}).value || '';
        var from = (document.getElementById('payableFilterFrom') || {}).value || '';
        var to = (document.getElementById('payableFilterTo') || {}).value || '';
        var q = '/finance/payables?';
        if (status)
            q += 'status=' + encodeURIComponent(status) + '&';
        if (from)
            q += 'from=' + encodeURIComponent(from) + '&';
        if (to)
            q += 'to=' + encodeURIComponent(to) + '&';
        q = q.replace(/\?$|&$/, '');
        api(q).then(function (data) {
            var rows = data.rows || [];
            if (!rows.length) {
                out.innerHTML = '<p class="mb-0 text-muted py-4 text-center">Nenhuma conta a pagar. Clique em <strong>Cadastrar</strong>.</p>';
                return;
            }
            var fmt = function (v) { return (v != null && !isNaN(v)) ? 'R$ ' + Number(v).toFixed(2).replace('.', ',') : 'â€”'; };
            var html = '<div class="table-responsive"><table class="table table-sm table-hover"><thead><tr><th>ID</th><th>DescriÃ§Ã£o</th><th>Fornecedor</th><th>Plano</th><th>Vencimento</th><th>Valor</th><th>Status</th><th class="text-end">AÃ§Ãµes</th></tr></thead><tbody>';
            rows.forEach(function (r) {
                html += '<tr><td>' + esc(r.id) + '</td><td>' + esc(r.descricao || '') + '</td><td>' + esc(r.fornecedor_nome || '') + '</td><td>' + esc(r.plano_descricao || '') + '</td><td>' + esc(r.vencimento || '') + '</td><td>' + fmt(r.valor) + '</td><td>' + esc(r.status || 'ABERTO') + '</td>';
                html += '<td class="text-end"><button type="button" class="btn btn-sm btn-outline-primary me-1" data-payable-edit="' + r.id + '">Editar</button><button type="button" class="btn btn-sm btn-outline-success" data-payable-status="' + r.id + '" data-payable-current="' + (r.status || '') + '">Status</button></td></tr>';
            });
            html += '</tbody></table></div>';
            out.innerHTML = html;
            out.querySelectorAll('[data-payable-edit]').forEach(function (btn) { btn.addEventListener('click', function () { openPayableFormModal(Number(this.getAttribute('data-payable-edit'))); }); });
            out.querySelectorAll('[data-payable-status]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = Number(this.getAttribute('data-payable-status'));
                    var cur = (this.getAttribute('data-payable-current') || 'ABERTO').toUpperCase();
                    var next = cur === 'ABERTO' ? 'PAGO' : (cur === 'PAGO' ? 'CANCELADO' : 'ABERTO');
                    if (!confirm('Alterar status para ' + next + '?'))
                        return;
                    api('/finance/payables/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) }).then(function () { loadPayables(); }).catch(function (err) { alert(err.message); });
                });
            });
        }).catch(function (err) { out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>'; });
    }
    function openPayableFormModal(editId) {
        var title = document.getElementById('modalPayableFormTitle');
        var idEl = document.getElementById('payableFormId');
        idEl.value = editId ? String(editId) : '';
        title.textContent = editId ? 'Editar conta a pagar' : 'Cadastrar conta a pagar';
        var selFor = document.getElementById('payableFormFornecedorId');
        var selPlano = document.getElementById('payableFormPlanoContasId');
        if (selFor)
            selFor.innerHTML = '<option value="">-- Selecione --</option>';
        if (selPlano)
            selPlano.innerHTML = '<option value="">-- Selecione --</option>';
        ['payableFormDescricao', 'payableFormValor', 'payableFormVencimento', 'payableFormEmpresa', 'payableFormFormaPagamento', 'payableFormNotaFiscal', 'payableFormEmissao', 'payableFormCompetencia', 'payableFormObservacao'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el)
                el.value = '';
        });
        document.getElementById('payableFormStatus').value = 'ABERTO';
        Promise.all([api('/finance/suppliers?ativo=1'), api('/finance/chart-of-accounts?ativo=1')]).then(function (results) {
            var suppliers = (results[0] && results[0].rows) ? results[0].rows : [];
            var charts = (results[1] && results[1].rows) ? results[1].rows : [];
            suppliers.forEach(function (s) {
                if (selFor)
                    selFor.innerHTML += '<option value="' + s.id + '">' + esc(s.nome_razao || '') + '</option>';
            });
            charts.forEach(function (c) {
                if (selPlano)
                    selPlano.innerHTML += '<option value="' + c.id + '">' + esc(c.codigo_financeiro) + ' - ' + esc(c.descricao) + '</option>';
            });
            if (editId) {
                return api('/finance/payables/' + editId).then(function (r) {
                    if (selFor)
                        selFor.value = r.fornecedor_id != null ? String(r.fornecedor_id) : '';
                    if (selPlano)
                        selPlano.value = r.plano_contas_id != null ? String(r.plano_contas_id) : '';
                    document.getElementById('payableFormDescricao').value = r.descricao || '';
                    document.getElementById('payableFormValor').value = r.valor != null ? String(r.valor) : '';
                    document.getElementById('payableFormVencimento').value = (r.vencimento || '').toString().slice(0, 10);
                    document.getElementById('payableFormEmpresa').value = r.empresa || '';
                    document.getElementById('payableFormFormaPagamento').value = r.forma_pagamento || '';
                    document.getElementById('payableFormNotaFiscal').value = r.nota_fiscal || '';
                    document.getElementById('payableFormEmissao').value = (r.emissao || '').toString().slice(0, 10);
                    document.getElementById('payableFormCompetencia').value = (r.competencia || '').toString().slice(0, 10);
                    document.getElementById('payableFormStatus').value = r.status || 'ABERTO';
                    document.getElementById('payableFormObservacao').value = r.observacao || '';
                });
            }
            else {
                var venc = new Date();
                venc.setDate(venc.getDate() + 7);
                document.getElementById('payableFormVencimento').value = venc.toISOString().slice(0, 10);
            }
        }).then(function () {
            safeShowModal('modalPayableForm');
        }).catch(function (err) {
            if (editId)
                alert(err.message);
            else {
                safeShowModal('modalPayableForm');
            }
        });
    }
    document.getElementById('btnPayableCadastrar') && document.getElementById('btnPayableCadastrar').addEventListener('click', function () {
        safeHideModal('modalPayableList');
        openPayableFormModal(null);
    });
    document.getElementById('btnPayableBuscar') && document.getElementById('btnPayableBuscar').addEventListener('click', function () { loadPayables(); });
    document.getElementById('payableFilterStatus') && document.getElementById('payableFilterStatus').addEventListener('change', function () { loadPayables(); });
    document.getElementById('btnPayableFormSave') && document.getElementById('btnPayableFormSave').addEventListener('click', function () {
        var idEl = document.getElementById('payableFormId');
        var valor = parseFloat((document.getElementById('payableFormValor') || {}).value, 10);
        var vencimento = (document.getElementById('payableFormVencimento') || {}).value || '';
        if (!vencimento || isNaN(valor)) {
            alert('Informe vencimento e valor.');
            return;
        }
        var payload = { descricao: (document.getElementById('payableFormDescricao') || {}).value || null, valor: valor, vencimento: vencimento, fornecedor_id: (document.getElementById('payableFormFornecedorId') || {}).value ? Number((document.getElementById('payableFormFornecedorId').value)) : null, plano_contas_id: (document.getElementById('payableFormPlanoContasId') || {}).value ? Number((document.getElementById('payableFormPlanoContasId').value)) : null, empresa: (document.getElementById('payableFormEmpresa') || {}).value || null, forma_pagamento: (document.getElementById('payableFormFormaPagamento') || {}).value || null, nota_fiscal: (document.getElementById('payableFormNotaFiscal') || {}).value || null, emissao: (document.getElementById('payableFormEmissao') || {}).value || null, competencia: (document.getElementById('payableFormCompetencia') || {}).value || null, status: (document.getElementById('payableFormStatus') || {}).value || 'ABERTO', observacao: (document.getElementById('payableFormObservacao') || {}).value || null };
        var editId = idEl && idEl.value ? Number(idEl.value) : null;
        var method = editId ? 'PUT' : 'POST';
        var url = editId ? '/finance/payables/' + editId : '/finance/payables';
        api(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(function () {
            safeHideModal('modalPayableForm');
            loadPayables();
            openPayableListModal();
            alert(editId ? 'Conta a pagar atualizada.' : 'Conta a pagar cadastrada.');
        }).catch(function (err) { alert(err.message); });
    });
    // ---- CarnÃª parcelado (Ficha do Cliente) ----
    function fillCarneParceladoFromContract(contracts, contractId) {
        var sel = document.getElementById('carneParceladoContratoSelect');
        var planoEl = document.getElementById('carneParceladoPlano');
        var valorEl = document.getElementById('carneParceladoValor');
        var vencEl = document.getElementById('carneParceladoVencimento');
        if (!contracts || !contracts.length)
            return;
        var ct = null;
        if (contractId) {
            ct = contracts.find(function (c) { return String(c.id) === String(contractId); }) || null;
        }
        if (!ct)
            ct = contracts[0];
        if (!ct)
            return;
        if (sel && !sel.value)
            sel.value = String(ct.id);
        if (planoEl && !planoEl.value)
            planoEl.value = ct.plan_code || '';
        if (valorEl && !valorEl.value) {
            var amt = Number(ct.amount || 0);
            if (amt > 0)
                valorEl.value = amt.toFixed(2);
        }
        if (vencEl && !vencEl.value && ct.due_day != null)
            vencEl.value = String(ct.due_day);
    }
    function openCarneParceladoModal(cust, contracts) {
        var custIdEl = document.getElementById('carneParceladoCustomerId');
        if (custIdEl)
            custIdEl.value = String(cust.id);
        var sel = document.getElementById('carneParceladoContratoSelect');
        if (sel) {
            sel.innerHTML = '<option value=\"\">â€” Selecionar contrato (opcional) â€”</option>';
            (contracts || []).forEach(function (ct) {
                sel.innerHTML += '<option value=\"' + esc(ct.id) + '\">#' + esc(ct.id) + ' ' + esc(ct.plan_code || '') + '</option>';
            });
        }
        // Limpa campos
        ['carneParceladoPlano', 'carneParceladoPlanoConta', 'carneParceladoValor', 'carneParceladoVencimento', 'carneParceladoObs'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el)
                el.value = '';
        });
        var parcelasEl = document.getElementById('carneParceladoParcelas');
        if (parcelasEl && !parcelasEl.value)
            parcelasEl.value = '12';
        // CompetÃªncia inicial: prÃ³ximo mÃªs
        var refEl = document.getElementById('carneParceladoRefMonth');
        if (refEl) {
            var now = new Date();
            var next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            refEl.value = next.toISOString().slice(0, 7);
        }
        // Prefill a partir do primeiro contrato
        if (contracts && contracts.length) {
            fillCarneParceladoFromContract(contracts, null);
        }
        if (sel) {
            sel.onchange = function () {
                var cid = this.value || '';
                if (cid)
                    fillCarneParceladoFromContract(contracts, cid);
            };
        }
        var errEl = document.getElementById('carneParceladoErro');
        if (errEl) {
            errEl.classList.add('d-none');
            errEl.textContent = '';
        }
        hideCustomerFicha();
        safeShowModal('modalCarneParcelado');
    }
    document.getElementById('btnCarneParceladoGerar') && document.getElementById('btnCarneParceladoGerar').addEventListener('click', function () {
        var custId = (document.getElementById('carneParceladoCustomerId') || {}).value;
        var valor = (document.getElementById('carneParceladoValor') || {}).value;
        var venc = (document.getElementById('carneParceladoVencimento') || {}).value;
        var parcelas = (document.getElementById('carneParceladoParcelas') || {}).value;
        var refMonth = (document.getElementById('carneParceladoRefMonth') || {}).value;
        var plano = (document.getElementById('carneParceladoPlano') || {}).value || '';
        var obs = (document.getElementById('carneParceladoObs') || {}).value || '';
        var errEl = document.getElementById('carneParceladoErro');
        function showErr(msg) {
            if (errEl) {
                errEl.textContent = msg;
                errEl.classList.remove('d-none');
            }
            else
                alert(msg);
        }
        if (!custId) {
            showErr('Cliente nÃ£o informado.');
            return;
        }
        if (!valor || Number(valor) <= 0) {
            showErr('Informe o valor.');
            return;
        }
        if (!venc || Number(venc) < 1 || Number(venc) > 28) {
            showErr('Dia de vencimento deve ser entre 1 e 28.');
            return;
        }
        if (!parcelas || Number(parcelas) < 1) {
            showErr('Informe a quantidade de parcelas.');
            return;
        }
        if (!refMonth) {
            showErr('Informe a competÃªncia inicial.');
            return;
        }
        var payload = {
            customer_id: Number(custId),
            amount: Number(valor),
            due_day: Number(venc),
            installments: Number(parcelas),
            start_ref_month: refMonth,
            plan_code: plano || '100',
            notes: obs || null
        };
        var btn = this;
        btn.disabled = true;
        api('/finance/invoices/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function (data) {
            btn.disabled = false;
            safeHideModal('modalCarneParcelado');
            alert('CarnÃª gerado com sucesso. ' + (data.created || 0) + ' parcela(s) criada(s).');
            // Recarrega a ficha do cliente para atualizar os tÃ­tulos
            if (typeof viewCustomer === 'function') {
                viewCustomer(Number(custId));
            }
        }).catch(function (err) {
            btn.disabled = false;
            showErr(err.message || 'Erro ao gerar carnÃª.');
        });
    });
    // ---- CarnÃªs: Gerar Lote ----
    function openCarneGerarModal() {
        var el = document.getElementById('carneGerarRefMonth');
        if (el && !el.value)
            el.value = new Date().toISOString().slice(0, 7);
        safeShowModal('modalCarneGerar');
    }
    document.getElementById('btnCarneGerarSubmit') && document.getElementById('btnCarneGerarSubmit').addEventListener('click', function () {
        var refMonth = (document.getElementById('carneGerarRefMonth') || {}).value || '';
        var name = (document.getElementById('carneGerarName') || {}).value || '';
        if (!refMonth) {
            alert('Informe a competÃªncia.');
            return;
        }
        this.disabled = true;
        var self = this;
        api('/finance/carne/lots', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref_month: refMonth, name: name || null }) }).then(function (data) {
            self.disabled = false;
            safeHideModal('modalCarneGerar');
            alert('Lote criado com sucesso.\n' + (data.total_customers || 0) + ' cliente(s), ' + (data.total_invoices || 0) + ' fatura(s).');
        }).catch(function (err) { self.disabled = false; alert(err.message); });
    });
    // ---- CarnÃªs: Imprimir Lotes ----
    function openCarneImprimirModal() {
        if (safeShowModal('modalCarneImprimir'))
            loadCarneLotsForPrint();
    }
    function loadCarneLotsForPrint() {
        var out = document.getElementById('outCarneImprimirList');
        if (!out)
            return;
        out.innerHTML = 'Carregando...';
        var month = (document.getElementById('carneImprimirFilterMonth') || {}).value || '';
        var q = '/finance/carne/lots' + (month ? '?ref_month=' + encodeURIComponent(month) : '');
        api(q).then(function (data) {
            var rows = data.rows || [];
            if (!rows.length) {
                out.innerHTML = '<p class="mb-0 text-muted py-4 text-center">Nenhum lote encontrado. Gere um lote em <strong>Gerar Lote</strong>.</p>';
                return;
            }
            var html = '<div class="table-responsive"><table class="table table-sm table-hover"><thead><tr><th>ID</th><th>CompetÃªncia</th><th>Nome</th><th>Clientes</th><th>Faturas</th><th>Status</th><th class="text-end">AÃ§Ãµes</th></tr></thead><tbody>';
            rows.forEach(function (r) {
                html += '<tr><td>' + esc(r.id) + '</td><td>' + esc(r.ref_month) + '</td><td>' + esc(r.name || 'â€”') + '</td><td>' + (r.total_customers || 0) + '</td><td>' + (r.total_invoices || 0) + '</td><td><span class="badge bg-secondary">' + esc(r.status || 'GENERATED') + '</span></td><td class="text-end"><button type="button" class="btn btn-sm btn-primary" data-carne-print-lot="' + r.id + '"><i class="bi bi-printer me-1"></i>Imprimir</button></td></tr>';
            });
            html += '</tbody></table></div>';
            out.innerHTML = html;
            out.querySelectorAll('[data-carne-print-lot]').forEach(function (btn) {
                btn.addEventListener('click', function () { printCarneLot(Number(this.getAttribute('data-carne-print-lot'))); });
            });
        }).catch(function (err) { out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>'; });
    }
    function printCarneLot(lotId) {
        api('/finance/carne/lots/' + lotId + '/print').then(function (data) {
            var lot = data.lot || {};
            var items = data.items || [];
            var refMonth = lot.ref_month || '';
            var win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
            if (!win) {
                alert('Permita pop-ups para abrir a janela de impressÃ£o.');
                return;
            }
            var statusLabel = { PENDING: 'Pendente', PAID: 'Pago', OVERDUE: 'Vencido' };
            var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>CarnÃªs ' + esc(refMonth) + '</title><style>body{font-family:system-ui,sans-serif;margin:1rem;font-size:12px;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ccc;padding:6px;text-align:left;} th{background:#f0f0f0;} .page-break{page-break-after:always;} .carne-block{margin-bottom:1.5rem;} h3{margin:0 0 0.5rem 0;font-size:14px;}</style></head><body>';
            html += '<h1>CarnÃªs â€” CompetÃªncia ' + esc(refMonth) + '</h1>';
            items.forEach(function (it, idx) {
                html += '<div class="carne-block' + (idx > 0 ? ' page-break' : '') + '"><h3>' + esc(it.customer_name) + '</h3><p class="small">Contato: ' + esc(it.whatsapp || 'â€”') + (it.email ? ' | ' + esc(it.email) : '') + '</p><table><thead><tr><th>CompetÃªncia</th><th>Vencimento</th><th>Valor</th><th>Plano</th><th>Status</th></tr></thead><tbody>';
                (it.invoices || []).forEach(function (inv) {
                    html += '<tr><td>' + esc(inv.ref_month) + '</td><td>' + esc(inv.due_date) + '</td><td>R$ ' + (inv.amount != null ? Number(inv.amount).toFixed(2).replace('.', ',') : '0,00') + '</td><td>' + esc(inv.plan_code || '') + '</td><td>' + esc(statusLabel[inv.status] || inv.status || '') + '</td></tr>';
                });
                html += '</tbody></table></div>';
            });
            html += '</body></html>';
            win.document.write(html);
            win.document.close();
            win.focus();
            setTimeout(function () { win.print(); }, 300);
        }).catch(function (err) { alert(err.message); });
    }
    document.getElementById('btnCarneImprimirLoad') && document.getElementById('btnCarneImprimirLoad').addEventListener('click', loadCarneLotsForPrint);
    // ---- CarnÃªs: ConfirmaÃ§Ã£o de Entrega ----
    function openCarneEntregaModal() {
        if (safeShowModal('modalCarneEntrega'))
            loadCarneLotsForEntrega();
    }
    function loadCarneLotsForEntrega() {
        var sel = document.getElementById('carneEntregaLotSelect');
        if (!sel)
            return;
        api('/finance/carne/lots').then(function (data) {
            var rows = data.rows || [];
            sel.innerHTML = '<option value="">â€” Selecione um lote â€”</option>';
            rows.forEach(function (r) {
                sel.innerHTML += '<option value="' + r.id + '">' + esc(r.ref_month) + (r.name ? ' â€” ' + esc(r.name) : '') + ' (' + (r.total_customers || 0) + ' clientes)</option>';
            });
        }).catch(function () { sel.innerHTML = '<option value="">Erro ao carregar</option>'; });
    }
    function loadCarneEntregaLot() {
        var lotId = (document.getElementById('carneEntregaLotSelect') || {}).value;
        var out = document.getElementById('outCarneEntregaItems');
        var info = document.getElementById('carneEntregaLotInfo');
        var actions = document.getElementById('carneEntregaActions');
        if (!lotId) {
            out.innerHTML = 'Selecione um lote e clique em Carregar.';
            info.style.display = 'none';
            if (actions)
                actions.style.display = 'none';
            return;
        }
        out.innerHTML = 'Carregando...';
        info.style.display = 'none';
        api('/finance/carne/lots/' + lotId).then(function (data) {
            info.style.display = 'block';
            info.textContent = 'Lote: ' + (data.ref_month || '') + ' â€” ' + (data.total_customers || 0) + ' cliente(s).';
            if (actions)
                actions.style.display = 'flex';
            var items = data.items || [];
            if (!items.length) {
                out.innerHTML = '<p class="mb-0 text-muted">Nenhum item no lote.</p>';
                return;
            }
            var html = '<div class="table-responsive"><table class="table table-sm table-hover"><thead><tr><th>Cliente</th><th>Contato</th><th>Impresso</th><th>Entregue</th><th>ObservaÃ§Ã£o</th><th class="text-end">AÃ§Ã£o</th></tr></thead><tbody>';
            items.forEach(function (it) {
                var printed = it.printed_at ? '<span class="text-success">' + esc(it.printed_at.slice(0, 10)) + '</span>' : 'â€”';
                var delivered = it.delivered_at ? '<span class="text-success">' + esc(it.delivered_at.slice(0, 10)) + '</span>' : '<span class="text-muted">NÃ£o</span>';
                html += '<tr data-carne-item-id="' + it.id + '"><td>' + esc(it.customer_name) + '</td><td class="small">' + esc(it.whatsapp || 'â€”') + '</td><td>' + printed + '</td><td>' + delivered + '</td><td class="small">' + esc((it.delivery_notes || '').slice(0, 40)) + '</td><td class="text-end">';
                if (!it.delivered_at)
                    html += '<button type="button" class="btn btn-sm btn-success" data-carne-confirm-item="' + it.id + '">Confirmar entrega</button>';
                else
                    html += 'â€”';
                html += '</td></tr>';
            });
            html += '</tbody></table></div>';
            out.innerHTML = html;
            out.querySelectorAll('[data-carne-confirm-item]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var itemId = Number(this.getAttribute('data-carne-confirm-item'));
                    api('/finance/carne/lots/' + lotId + '/items/' + itemId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delivered_at: true }) }).then(function () { loadCarneEntregaLot(); }).catch(function (err) { alert(err.message); });
                });
            });
        }).catch(function (err) { out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>'; });
    }
    document.getElementById('btnCarneEntregaLoadLot') && document.getElementById('btnCarneEntregaLoadLot').addEventListener('click', loadCarneEntregaLot);
    document.getElementById('btnCarneEntregaConfirmAll') && document.getElementById('btnCarneEntregaConfirmAll').addEventListener('click', function () {
        var lotId = (document.getElementById('carneEntregaLotSelect') || {}).value;
        if (!lotId || !confirm('Marcar todos os itens deste lote como entregues?'))
            return;
        api('/finance/carne/lots/' + lotId + '/confirm-delivery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) }).then(function () { loadCarneEntregaLot(); alert('Todos marcados como entregues.'); }).catch(function (err) { alert(err.message); });
    });
    safeOn('btnLoadStand', 'click', function () {
        setLoading('outStand');
        api('/stand').then(function (data) {
            document.getElementById('outStand').innerHTML = renderTable(data.rows, [
                { key: 'created_at', label: 'Data' },
                { key: 'entry_number', label: 'NÃºmero' },
                { key: 'name', label: 'Nome' },
                { key: 'whatsapp', label: 'WhatsApp' },
                { key: 'campaign', label: 'Campanha' }
            ]);
        }).catch(function (err) {
            document.getElementById('outStand').innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    });
    safeOn('btnLoadWinners', 'click', function () {
        setLoading('outWinners');
        api('/winners').then(function (data) {
            document.getElementById('outWinners').innerHTML = renderTable(data.rows, [
                { key: 'created_at', label: 'Data' },
                { key: 'name', label: 'Nome' },
                { key: 'whatsapp', label: 'WhatsApp' },
                { key: 'campaign', label: 'Campanha' },
                { key: 'prize', label: 'PrÃªmio' }
            ]);
        }).catch(function (err) {
            document.getElementById('outWinners').innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    });
    function getClubeConfigFromForm() {
        var hero = {
            badge: (document.getElementById('clube_hero_badge') || {}).value || '',
            title: (document.getElementById('clube_hero_title') || {}).value || '',
            description: (document.getElementById('clube_hero_desc') || {}).value || '',
            ctaText: (document.getElementById('clube_hero_ctaText') || {}).value || '',
            ctaHref: (document.getElementById('clube_hero_ctaHref') || {}).value || ''
        };
        var benefits = {
            sectionTitle: (document.getElementById('clube_benefits_title') || {}).value || '',
            sectionSubtitle: (document.getElementById('clube_benefits_subtitle') || {}).value || '',
            note: (document.getElementById('clube_benefits_note') || {}).value || '',
            items: [0, 1, 2, 3].map(function (i) {
                return {
                    name: (document.getElementById('clube_benefit_name_' + i) || {}).value || '',
                    description: (document.getElementById('clube_benefit_desc_' + i) || {}).value || '',
                    iconColor: (document.getElementById('clube_benefit_color_' + i) || {}).value || 'red'
                };
            })
        };
        var points = {
            sectionTitle: (document.getElementById('clube_points_title') || {}).value || '',
            items: [0, 1, 2, 3].map(function (i) {
                return {
                    label: (document.getElementById('clube_point_label_' + i) || {}).value || '',
                    value: (document.getElementById('clube_point_value_' + i) || {}).value || '',
                    text: (document.getElementById('clube_point_text_' + i) || {}).value || '',
                    icon: (document.getElementById('clube_point_icon_' + i) || {}).value || 'bi-circle'
                };
            })
        };
        var actions = {
            consultTitle: (document.getElementById('clube_actions_consultTitle') || {}).value || '',
            consultDesc: (document.getElementById('clube_actions_consultDesc') || {}).value || '',
            standBadge: (document.getElementById('clube_actions_standBadge') || {}).value || '',
            standTitle: (document.getElementById('clube_actions_standTitle') || {}).value || '',
            standDesc: (document.getElementById('clube_actions_standDesc') || {}).value || '',
            standLinkText: (document.getElementById('clube_actions_standLinkText') || {}).value || '',
            standHref: (document.getElementById('clube_actions_standHref') || {}).value || ''
        };
        var cta = {
            title: (document.getElementById('clube_cta_title') || {}).value || '',
            text: (document.getElementById('clube_cta_text') || {}).value || '',
            buttonText: (document.getElementById('clube_cta_buttonText') || {}).value || '',
            buttonHref: (document.getElementById('clube_cta_buttonHref') || {}).value || ''
        };
        return { hero: hero, benefits: benefits, points: points, actions: actions, cta: cta };
    }
    function renderClubeForm(cfg) {
        var c = cfg || {};
        var h = c.hero || {};
        var b = c.benefits || {};
        var bi = (b.items || []).slice(0, 4);
        while (bi.length < 4)
            bi.push({ name: '', description: '', iconColor: 'red' });
        var p = c.points || {};
        var pi = (p.items || []).slice(0, 4);
        while (pi.length < 4)
            pi.push({ label: '', value: '', text: '', icon: 'bi-circle' });
        var a = c.actions || {};
        var ct = c.cta || {};
        var colorOpts = '<option value="red">Vermelho</option><option value="purple">Roxo</option><option value="blue">Azul</option><option value="green">Verde</option>';
        var html = '<div class="small">';
        html += '<h6 class="text-primary mt-3 mb-2">Hero</h6>';
        html += '<div class="row g-2 mb-2"><div class="col-md-6"><label class="form-label">Badge</label><input type="text" class="form-control form-control-sm" id="clube_hero_badge" value="' + esc(h.badge) + '" /></div>';
        html += '<div class="col-md-6"><label class="form-label">TÃ­tulo</label><input type="text" class="form-control form-control-sm" id="clube_hero_title" value="' + esc(h.title) + '" /></div></div>';
        html += '<div class="mb-2"><label class="form-label">DescriÃ§Ã£o</label><textarea class="form-control form-control-sm" id="clube_hero_desc" rows="2">' + esc(h.description) + '</textarea></div>';
        html += '<div class="row g-2 mb-2"><div class="col-md-6"><label class="form-label">Texto do botÃ£o</label><input type="text" class="form-control form-control-sm" id="clube_hero_ctaText" value="' + esc(h.ctaText) + '" /></div>';
        html += '<div class="col-md-6"><label class="form-label">Link do botÃ£o</label><input type="text" class="form-control form-control-sm" id="clube_hero_ctaHref" value="' + esc(h.ctaHref) + '" placeholder="/assinar.html" /></div></div>';
        html += '<h6 class="text-primary mt-4 mb-2">Vantagens (benefÃ­cios)</h6>';
        html += '<div class="mb-2"><label class="form-label">TÃ­tulo da seÃ§Ã£o</label><input type="text" class="form-control form-control-sm" id="clube_benefits_title" value="' + esc(b.sectionTitle) + '" /></div>';
        html += '<div class="mb-2"><label class="form-label">SubtÃ­tulo</label><input type="text" class="form-control form-control-sm" id="clube_benefits_subtitle" value="' + esc(b.sectionSubtitle) + '" /></div>';
        [0, 1, 2, 3].forEach(function (i) {
            var x = bi[i] || {};
            html += '<div class="border rounded p-2 mb-2"><strong>Item ' + (i + 1) + '</strong>';
            html += '<div class="row g-2"><div class="col-md-4"><input type="text" class="form-control form-control-sm" id="clube_benefit_name_' + i + '" placeholder="Nome (ex: Netflix)" value="' + esc(x.name) + '" /></div>';
            html += '<div class="col-md-4"><select class="form-select form-select-sm" id="clube_benefit_color_' + i + '">' + colorOpts + '</select></div></div>';
            html += '<div class="mt-1"><textarea class="form-control form-control-sm" id="clube_benefit_desc_' + i + '" rows="2" placeholder="DescriÃ§Ã£o">' + esc(x.description) + '</textarea></div></div>';
        });
        html += '<div class="mb-2"><label class="form-label">Nota (rodapÃ©)</label><input type="text" class="form-control form-control-sm" id="clube_benefits_note" value="' + esc(b.note) + '" /></div>';
        html += '<h6 class="text-primary mt-4 mb-2">Como ganhar pontos</h6>';
        html += '<div class="mb-2"><label class="form-label">TÃ­tulo da seÃ§Ã£o</label><input type="text" class="form-control form-control-sm" id="clube_points_title" value="' + esc(p.sectionTitle) + '" /></div>';
        [0, 1, 2, 3].forEach(function (i) {
            var x = pi[i] || {};
            html += '<div class="border rounded p-2 mb-2"><strong>Item ' + (i + 1) + '</strong>';
            html += '<div class="row g-2"><div class="col-md-6"><label class="form-label small">Label</label><input type="text" class="form-control form-control-sm" id="clube_point_label_' + i + '" value="' + esc(x.label) + '" /></div>';
            html += '<div class="col-md-6"><label class="form-label small">Valor</label><input type="text" class="form-control form-control-sm" id="clube_point_value_' + i + '" value="' + esc(x.value) + '" placeholder="+200 pontos" /></div></div>';
            html += '<div class="mt-1"><label class="form-label small">Texto</label><input type="text" class="form-control form-control-sm" id="clube_point_text_' + i + '" value="' + esc(x.text) + '" /></div>';
            html += '<div class="mt-1"><label class="form-label small">Ãcone Bootstrap (ex: bi-qr-code-scan)</label><input type="text" class="form-control form-control-sm" id="clube_point_icon_' + i + '" value="' + esc(x.icon) + '" /></div></div>';
        });
        html += '<h6 class="text-primary mt-4 mb-2">AÃ§Ãµes (consultar saldo + stand)</h6>';
        html += '<div class="mb-2"><label class="form-label">TÃ­tulo consulta</label><input type="text" class="form-control form-control-sm" id="clube_actions_consultTitle" value="' + esc(a.consultTitle) + '" /></div>';
        html += '<div class="mb-2"><label class="form-label">DescriÃ§Ã£o consulta</label><input type="text" class="form-control form-control-sm" id="clube_actions_consultDesc" value="' + esc(a.consultDesc) + '" /></div>';
        html += '<div class="mb-2"><label class="form-label">Badge do stand</label><input type="text" class="form-control form-control-sm" id="clube_actions_standBadge" value="' + esc(a.standBadge) + '" /></div>';
        html += '<div class="mb-2"><label class="form-label">TÃ­tulo stand</label><input type="text" class="form-control form-control-sm" id="clube_actions_standTitle" value="' + esc(a.standTitle) + '" /></div>';
        html += '<div class="mb-2"><label class="form-label">DescriÃ§Ã£o stand</label><textarea class="form-control form-control-sm" id="clube_actions_standDesc" rows="2">' + esc(a.standDesc) + '</textarea></div>';
        html += '<div class="row g-2 mb-2"><div class="col-md-6"><label class="form-label">Texto do link stand</label><input type="text" class="form-control form-control-sm" id="clube_actions_standLinkText" value="' + esc(a.standLinkText) + '" /></div>';
        html += '<div class="col-md-6"><label class="form-label">URL do link stand</label><input type="text" class="form-control form-control-sm" id="clube_actions_standHref" value="' + esc(a.standHref) + '" /></div></div>';
        html += '<h6 class="text-primary mt-4 mb-2">CTA final</h6>';
        html += '<div class="mb-2"><label class="form-label">TÃ­tulo</label><input type="text" class="form-control form-control-sm" id="clube_cta_title" value="' + esc(ct.title) + '" /></div>';
        html += '<div class="mb-2"><label class="form-label">Texto</label><input type="text" class="form-control form-control-sm" id="clube_cta_text" value="' + esc(ct.text) + '" /></div>';
        html += '<div class="row g-2"><div class="col-md-6"><label class="form-label">Texto do botÃ£o</label><input type="text" class="form-control form-control-sm" id="clube_cta_buttonText" value="' + esc(ct.buttonText) + '" /></div>';
        html += '<div class="col-md-6"><label class="form-label">Link do botÃ£o</label><input type="text" class="form-control form-control-sm" id="clube_cta_buttonHref" value="' + esc(ct.buttonHref) + '" /></div></div>';
        html += '</div>';
        return html;
    }
    function loadClubePage() {
        var out = document.getElementById('outClubePage');
        if (!out)
            return;
        setLoading('outClubePage');
        api('/clube-page').then(function (data) {
            if (data.message) {
                out.innerHTML = '<div class="alert alert-warning mb-0">' + esc(data.message) + '</div>';
                return;
            }
            var cfg = data.config || {};
            out.innerHTML = renderClubeForm(cfg);
            [0, 1, 2, 3].forEach(function (i) {
                var sel = document.getElementById('clube_benefit_color_' + i);
                if (sel && (cfg.benefits || {}).items && cfg.benefits.items[i])
                    sel.value = cfg.benefits.items[i].iconColor || 'red';
            });
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    safeOn('btnLoadClubePage', 'click', function () { loadClubePage(); });
    safeOn('btnSaveClubePage', 'click', function () {
        var body = getClubeConfigFromForm();
        api('/clube-page', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: body }) }).then(function () {
            alert('PÃ¡gina do Clube salva.');
        }).catch(function (err) { alert(err.message); });
    });
    // ========== Grupos (roles) ==========
    var permissionsCache = [];
    var rolesCache = [];
    function loadGrupos() {
        var out = document.getElementById('outGrupos');
        if (!out)
            return;
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
        Promise.all([api('/permissions'), api('/roles')]).then(function (results) {
            var permsData = results[0];
            var rolesData = results[1];
            permissionsCache = permsData.permissions || [];
            rolesCache = rolesData.roles || [];
            if (!rolesCache.length) {
                out.innerHTML = '<p class="text-muted mb-0">Nenhum grupo cadastrado. Clique em <strong>Novo grupo</strong> para criar.</p>';
                return;
            }
            var cols = [
                { key: 'name', label: 'Nome' },
                { key: 'is_system', label: 'Sistema', render: function (v) { return v ? '<span class="badge bg-secondary">Sistema</span>' : ''; } },
                { key: 'created_at', label: 'Criado em', render: function (v) { return v ? new Date(v).toLocaleDateString('pt-BR') : 'â€”'; } }
            ];
            var extra = function (r) {
                return '<button type="button" class="btn btn-sm btn-outline-primary" data-grupo-perms data-grupo-id="' + esc(r.id) + '" data-grupo-name="' + esc(r.name || '').replace(/"/g, '&quot;') + '"><i class="bi bi-key me-1"></i>PermissÃµes</button>';
            };
            out.innerHTML = renderTable(rolesCache, cols, extra, 'AÃ§Ãµes');
            document.querySelectorAll('[data-grupo-perms]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    openGrupoPermissoes(this.getAttribute('data-grupo-id'), (this.getAttribute('data-grupo-name') || '').replace(/&quot;/g, '"'));
                });
            });
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    function openGrupoPermissoes(roleId, roleName) {
        document.getElementById('modalGrupoPermNome').textContent = roleName;
        document.getElementById('btnSaveGrupoPermissoes').setAttribute('data-role-id', roleId);
        var out = document.getElementById('outGrupoPermissoes');
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
        api('/roles/' + roleId + '/permissions').then(function (data) {
            var currentCodes = (data.permissions || []).map(function (p) { return p.code; });
            var byPrefix = {};
            permissionsCache.forEach(function (p) {
                if (!p.is_active)
                    return;
                var prefix = (p.code || '').split('.')[0] || 'outros';
                if (!byPrefix[prefix])
                    byPrefix[prefix] = [];
                byPrefix[prefix].push(p);
            });
            var html = '';
            Object.keys(byPrefix).sort().forEach(function (prefix) {
                html += '<div class="col-12"><h6 class="text-primary small text-uppercase mb-2">' + esc(prefix) + '</h6><div class="d-flex flex-wrap gap-2">';
                byPrefix[prefix].forEach(function (p) {
                    var checked = currentCodes.indexOf(p.code) >= 0 ? ' checked' : '';
                    html += '<div class="form-check form-check-inline"><input type="checkbox" class="form-check-input grupo-perm-cb" id="gp_' + esc(p.id) + '" value="' + esc(p.code) + '"' + checked + '><label class="form-check-label small" for="gp_' + esc(p.id) + '">' + esc(p.name || p.code) + '</label></div>';
                });
                html += '</div></div>';
            });
            out.innerHTML = html || '<p class="text-muted mb-0">Nenhuma permissÃ£o disponÃ­vel.</p>';
            safeShowModal('modalGrupoPermissoes');
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    safeOn('btnLoadGrupos', 'click', function () { loadGrupos(); });
    safeOn('btnNewGrupo', 'click', function () {
        document.getElementById('grupoId').value = '';
        document.getElementById('grupoName').value = '';
        document.getElementById('modalGrupoTitle').textContent = 'Novo grupo';
        document.getElementById('grupoFormError').classList.add('d-none');
        safeShowModal('modalGrupo');
    });
    safeOn('btnSaveGrupo', 'click', function () {
        var name = (document.getElementById('grupoName').value || '').trim();
        var errEl = document.getElementById('grupoFormError');
        if (!name || name.length < 2) {
            errEl.textContent = 'Nome deve ter pelo menos 2 caracteres.';
            errEl.classList.remove('d-none');
            return;
        }
        errEl.classList.add('d-none');
        api('/roles', { method: 'POST', body: JSON.stringify({ name: name }) }).then(function () {
            safeHideModal('modalGrupo');
            loadGrupos();
        }).catch(function (err) {
            errEl.textContent = err.message || 'Erro ao salvar.';
            errEl.classList.remove('d-none');
        });
    });
    safeOn('btnSaveGrupoPermissoes', 'click', function () {
        var roleId = this.getAttribute('data-role-id');
        if (!roleId)
            return;
        var codes = [];
        document.querySelectorAll('.grupo-perm-cb:checked').forEach(function (cb) {
            if (cb.value)
                codes.push(cb.value);
        });
        api('/roles/' + roleId + '/permissions', { method: 'PUT', body: JSON.stringify({ permissionCodes: codes }) }).then(function () {
            safeHideModal('modalGrupoPermissoes');
            loadGrupos();
        }).catch(function (err) { alert(err.message); });
    });
    // ========== UsuÃ¡rios ==========
    var usersCache = [];
    function loadUsuarios() {
        var out = document.getElementById('outUsuarios');
        if (!out)
            return;
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
        Promise.all([api('/users'), api('/roles')]).then(function (results) {
            usersCache = results[0].users || [];
            rolesCache = results[1].roles || [];
            if (!usersCache.length) {
                out.innerHTML = '<p class="text-muted mb-0">Nenhum usuÃ¡rio cadastrado. Clique em <strong>Novo usuÃ¡rio</strong> para criar.</p>';
                return;
            }
            var cols = [
                { key: 'name', label: 'Nome' },
                { key: 'email', label: 'Email' },
                { key: 'is_master', label: 'Tipo', render: function (v) { return v ? '<span class="badge bg-warning text-dark">Master</span>' : '<span class="badge bg-secondary">UsuÃ¡rio</span>'; } },
                { key: 'is_active', label: 'Status', render: function (v) { return v ? '<span class="badge bg-success">Ativo</span>' : '<span class="badge bg-secondary">Inativo</span>'; } },
                { key: 'created_at', label: 'Criado em', render: function (v) { return v ? new Date(v).toLocaleDateString('pt-BR') : 'â€”'; } }
            ];
            var extra = function (u) {
                if (u.is_master)
                    return '<span class="text-muted small">â€”</span>';
                return '<button type="button" class="btn btn-sm btn-outline-primary" data-usuario-grupos data-usuario-id="' + esc(u.id) + '" data-usuario-name="' + esc(u.name || '').replace(/"/g, '&quot;') + '"><i class="bi bi-people me-1"></i>Grupos</button>';
            };
            out.innerHTML = renderTable(usersCache, cols, extra, 'AÃ§Ãµes');
            document.querySelectorAll('[data-usuario-grupos]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    openUsuarioGrupos(this.getAttribute('data-usuario-id'), (this.getAttribute('data-usuario-name') || '').replace(/&quot;/g, '"'));
                });
            });
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    function openUsuarioGrupos(userId, userName) {
        document.getElementById('modalUsuarioGruposNome').textContent = userName;
        document.getElementById('btnSaveUsuarioGrupos').setAttribute('data-user-id', userId);
        var out = document.getElementById('outUsuarioGrupos');
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
        Promise.all([api('/users/' + userId + '/roles'), api('/roles')]).then(function (results) {
            var userRoles = results[0].roles || [];
            var allRoles = results[1].roles || [];
            var currentIds = userRoles.map(function (r) { return r.id; });
            var html = '<div class="d-flex flex-wrap gap-2">';
            allRoles.forEach(function (r) {
                var checked = currentIds.indexOf(r.id) >= 0 ? ' checked' : '';
                html += '<div class="form-check"><input type="checkbox" class="form-check-input usuario-grupo-cb" id="ug_' + esc(r.id) + '" value="' + esc(r.id) + '"' + checked + '><label class="form-check-label" for="ug_' + esc(r.id) + '">' + esc(r.name) + '</label></div>';
            });
            html += '</div>';
            out.innerHTML = html || '<p class="text-muted mb-0">Nenhum grupo disponÃ­vel.</p>';
            safeShowModal('modalUsuarioGrupos');
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    safeOn('btnLoadUsuarios', 'click', function () { loadUsuarios(); });
    safeOn('btnNewUsuario', 'click', function () {
        document.getElementById('usuarioId').value = '';
        document.getElementById('usuarioName').value = '';
        document.getElementById('usuarioEmail').value = '';
        document.getElementById('usuarioPassword').value = '';
        document.getElementById('usuarioPasswordWrap').style.display = '';
        document.getElementById('usuarioActive').checked = true;
        document.getElementById('modalUsuarioTitle').textContent = 'Novo usuÃ¡rio';
        document.getElementById('usuarioFormError').classList.add('d-none');
        safeShowModal('modalUsuario');
    });
    safeOn('btnSaveUsuario', 'click', function () {
        var id = document.getElementById('usuarioId').value;
        var name = (document.getElementById('usuarioName').value || '').trim();
        var email = (document.getElementById('usuarioEmail').value || '').trim().toLowerCase();
        var password = document.getElementById('usuarioPassword').value || '';
        var isActive = document.getElementById('usuarioActive').checked;
        var errEl = document.getElementById('usuarioFormError');
        if (!name || name.length < 2) {
            errEl.textContent = 'Nome deve ter pelo menos 2 caracteres.';
            errEl.classList.remove('d-none');
            return;
        }
        if (!email || email.indexOf('@') < 0) {
            errEl.textContent = 'Email invÃ¡lido.';
            errEl.classList.remove('d-none');
            return;
        }
        if (!id && (!password || password.length < 6)) {
            errEl.textContent = 'Senha deve ter pelo menos 6 caracteres.';
            errEl.classList.remove('d-none');
            return;
        }
        errEl.classList.add('d-none');
        var body = { name: name, email: email, isActive: isActive };
        if (!id)
            body.password = password;
        api('/users', { method: 'POST', body: JSON.stringify(body) }).then(function () {
            safeHideModal('modalUsuario');
            loadUsuarios();
        }).catch(function (err) {
            errEl.textContent = err.message || 'Erro ao salvar.';
            errEl.classList.remove('d-none');
        });
    });
    safeOn('btnSaveUsuarioGrupos', 'click', function () {
        var userId = this.getAttribute('data-user-id');
        if (!userId)
            return;
        var roleIds = [];
        document.querySelectorAll('.usuario-grupo-cb:checked').forEach(function (cb) {
            var v = parseInt(cb.value, 10);
            if (!isNaN(v))
                roleIds.push(v);
        });
        api('/users/' + userId + '/roles', { method: 'PUT', body: JSON.stringify({ roleIds: roleIds }) }).then(function () {
            safeHideModal('modalUsuarioGrupos');
            loadUsuarios();
        }).catch(function (err) { alert(err.message); });
    });
    safeOn('btnDraw', 'click', function () {
        var out = document.getElementById('outDraw');
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sorteando...';
        Promise.resolve().then(function () {
            if (!activeCampaign)
                return api('/stats');
            return { activeCampaign: activeCampaign };
        }).then(function (data) {
            if (data.activeCampaign)
                activeCampaign = data.activeCampaign;
            if (!activeCampaign)
                throw new Error('Nenhuma campanha ativa.');
            var prize = document.getElementById('prize').value.trim() || 'PrÃªmio';
            return api('/raffles/' + activeCampaign.id + '/draw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prize: prize }) });
        }).then(function (data) {
            var w = data.winner;
            out.innerHTML = '<div class="alert alert-success mb-0"><strong>Vencedor</strong><br/>' + esc(w.name) + ' â€” ' + esc(w.whatsapp) + '<br/><strong>Campanha</strong> ' + esc(w.campaign) + '<br/><strong>PrÃªmio</strong> ' + esc(w.prize) + '</div>';
            loadStats();
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger mb-0">' + esc(err.message) + '</div>';
        });
    });
    applySidebarPermissions();
    loadStats();
    loadPlans();
})();

