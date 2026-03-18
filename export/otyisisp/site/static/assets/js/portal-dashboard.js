/**
 * Portal do Provedor — Dashboard (mesmo conteúdo do admin, API com JWT)
 */
(function() {
  var TOKEN_KEY = 'portal_provedor_token';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function redirectLogin() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    window.location.href = '/portal';
  }

  if (!getToken()) { redirectLogin(); return; }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function api(path, opts) {
    opts = opts || {};
    var token = getToken();
    var url = '/api/portal' + path;
    var headers = opts.headers || {};
    headers['Authorization'] = 'Bearer ' + token;
    if (opts.body && typeof opts.body === 'string') headers['Content-Type'] = 'application/json';
    return fetch(url, { method: opts.method || 'GET', headers: headers, body: opts.body, credentials: 'same-origin' }).then(function(res) {
      return res.json().catch(function() { return {}; }).then(function(data) {
        if (res.status === 401) { redirectLogin(); throw new Error('Sessão expirada.'); }
        if (!res.ok) throw new Error(data.message || data.error || 'Erro');
        return data;
      });
    });
  }

  function renderTable(rows, cols, extra, extraHeader) {
    if (!rows || !rows.length) return '<p class="mb-0 text-muted">Nenhum registro.</p>';
    var thead = cols.map(function(c) { return '<th>' + esc(c.label) + '</th>'; }).join('');
    if (extraHeader) thead += '<th>' + esc(extraHeader) + '</th>';
    var tbody = rows.map(function(r) {
      var cells = cols.map(function(c) {
        var val = r[c.key];
        if (c.render) val = c.render(val, r);
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

  function loadStats() {
    api('/stats').then(function(data) {
      document.getElementById('metricLeads').textContent = data.leadCount ?? '—';
      document.getElementById('metricStand').textContent = data.standCount ?? '—';
      document.getElementById('metricWinners').textContent = data.winnerCount ?? '—';
      document.getElementById('metricCustomers').textContent = data.customerCount ?? '—';
      document.getElementById('metricPlans').textContent = data.plansCount ?? '—';
      document.getElementById('metricCampaign').textContent = data.activeCampaign ? data.activeCampaign.name : '—';
      activeCampaign = data.activeCampaign;
    }).catch(function() {
      ['metricLeads','metricStand','metricWinners','metricCustomers','metricPlans','metricCampaign'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.textContent = '—';
      });
    });
    api('/finance/stats').then(function(data) {
      var el = document.getElementById('metricFinancePending');
      if (el) el.textContent = (data.pending || 0) + (data.overdue || 0);
    }).catch(function() {
      var el = document.getElementById('metricFinancePending');
      if (el) el.textContent = '—';
    });
  }

  function setLoading(elId) {
    var el = document.getElementById(elId);
    if (el) el.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
  }

  document.getElementById('btnLogout').addEventListener('click', function(e) {
    e.preventDefault();
    redirectLogin();
  });

  /** Ativa a aba pelo id e atualiza a URL (hash). Dispara carregamento de dados quando necessário. */
  function switchToTab(tab) {
    if (!tab) tab = 'overview';
    document.querySelectorAll('.admin-sidebar__nav a').forEach(function(n) { n.classList.remove('active'); });
    var navLink = document.querySelector('.admin-sidebar__nav a[data-tab="' + tab + '"]');
    if (navLink) navLink.classList.add('active');
    document.querySelectorAll('.admin-tab').forEach(function(t) { t.classList.remove('active'); });
    var target = document.getElementById('tab-' + tab);
    if (target) target.classList.add('active');
    if (tab === 'leads') document.getElementById('btnLoadLeads').click();
    else if (tab === 'stand') document.getElementById('btnLoadStand').click();
    else if (tab === 'winners') document.getElementById('btnLoadWinners').click();
    else if (tab === 'plans') loadPlans();
    else if (tab === 'customers') document.getElementById('btnLoadCustomers').click();
    else if (tab === 'campaigns') loadCampaigns();
    else if (tab === 'finance') loadFinance();
    else if (tab === 'clube') loadClubePage();
    else if (tab === 'nas') loadNas();
  }

  /** Lê o hash (#overview, #plans, etc.) e ativa a aba correspondente. */
  function applyHash() {
    var hash = (location.hash || '').replace(/^#/, '') || 'overview';
    var valid = ['overview','plans','leads','customers','nas','campaigns','stand','winners','draw','finance','clube'].indexOf(hash) >= 0;
    switchToTab(valid ? hash : 'overview');
  }

  window.addEventListener('hashchange', applyHash);
  applyHash(); // ao carregar a página, abrir a aba do hash (ou overview)

  document.querySelectorAll('[data-tab]').forEach(function(a) {
    a.addEventListener('click', function(e) {
      e.preventDefault();
      var tab = this.getAttribute('data-tab');
      location.hash = tab;
      switchToTab(tab);
    });
  });

  function loadNas() {
    var out = document.getElementById('outNasList');
    if (!out) return;
    out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
    api('/nas').then(function(data) {
      var list = data.nas || [];
      if (!list.length) {
        out.innerHTML = '<p class="text-muted mb-0">Nenhum concentrador cadastrado. Clique em <strong>Cadastrar concentrador</strong> para adicionar.</p>';
        return;
      }
      var thead = '<tr><th>Nome</th><th>IP</th><th>Descrição</th><th>Ativo</th><th class="text-end">Ações</th></tr>';
      var tbody = list.map(function(n) {
        var desc = (n.description || '—').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        return '<tr><td>' + esc(n.name) + '</td><td><code>' + esc(n.nas_ip) + '</code></td><td class="small">' + desc + '</td><td>' + (n.is_active ? '<span class="badge bg-success">Sim</span>' : '<span class="badge bg-secondary">Não</span>') + '</td><td class="text-end"><button type="button" class="btn btn-sm btn-outline-secondary me-1" data-nas-edit data-nas-id="' + esc(n.id) + '" data-nas-name="' + esc(String(n.name || '')).replace(/"/g, '&quot;') + '" data-nas-ip="' + esc(String(n.nas_ip || '')).replace(/"/g, '&quot;') + '" data-nas-desc="' + desc + '" data-nas-active="' + (n.is_active ? '1' : '0') + '">Editar</button><button type="button" class="btn btn-sm btn-outline-danger" data-nas-delete data-nas-id="' + esc(n.id) + '">Excluir</button></td></tr>';
      }).join('');
      out.innerHTML = '<div class="table-responsive"><table class="table table-sm table-hover admin-table"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div>';
      document.querySelectorAll('[data-nas-edit]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          document.getElementById('nasId').value = this.getAttribute('data-nas-id') || '';
          document.getElementById('nasName').value = (this.getAttribute('data-nas-name') || '').replace(/&quot;/g, '"');
          document.getElementById('nasIp').value = (this.getAttribute('data-nas-ip') || '').replace(/&quot;/g, '"');
          document.getElementById('nasDescription').value = (this.getAttribute('data-nas-desc') || '').replace(/&quot;/g, '"');
          document.getElementById('nasActive').checked = this.getAttribute('data-nas-active') === '1';
          document.getElementById('modalNasTitle').textContent = 'Editar concentrador';
          document.getElementById('nasFormError').classList.add('d-none');
          new bootstrap.Modal(document.getElementById('modalNas')).show();
        });
      });
      document.querySelectorAll('[data-nas-delete]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = this.getAttribute('data-nas-id');
          if (!id || !confirm('Excluir este concentrador?')) return;
          api('/nas/' + id, { method: 'DELETE' }).then(function() { loadNas(); }).catch(function(err) { alert(err.message); });
        });
      });
    }).catch(function(err) {
      out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
    });
  }

  document.getElementById('btnLoadNas').addEventListener('click', function() { loadNas(); });

  document.getElementById('btnNewNas').addEventListener('click', function() {
    document.getElementById('nasId').value = '';
    document.getElementById('nasName').value = '';
    document.getElementById('nasIp').value = '';
    document.getElementById('nasDescription').value = '';
    document.getElementById('nasActive').checked = true;
    document.getElementById('modalNasTitle').textContent = 'Novo concentrador';
    document.getElementById('nasFormError').classList.add('d-none');
    new bootstrap.Modal(document.getElementById('modalNas')).show();
  });

  document.getElementById('btnSaveNas').addEventListener('click', function() {
    var id = document.getElementById('nasId').value;
    var name = (document.getElementById('nasName').value || '').trim();
    var nasIp = (document.getElementById('nasIp').value || '').trim();
    var description = (document.getElementById('nasDescription').value || '').trim();
    var isActive = document.getElementById('nasActive').checked;
    var errEl = document.getElementById('nasFormError');
    if (!name) { errEl.textContent = 'Informe o nome.'; errEl.classList.remove('d-none'); return; }
    if (!nasIp) { errEl.textContent = 'Informe o IP do NAS.'; errEl.classList.remove('d-none'); return; }
    errEl.classList.add('d-none');
    var btn = document.getElementById('btnSaveNas');
    var origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvando...';
    var done = function() {
      btn.disabled = false;
      btn.innerHTML = origHtml;
      bootstrap.Modal.getInstance(document.getElementById('modalNas')).hide();
      loadNas();
    };
    if (id) {
      api('/nas/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, nas_ip: nasIp, description: description || null, is_active: isActive })
      }).then(done).catch(function(err) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
        errEl.textContent = err.message || 'Erro ao salvar.';
        errEl.classList.remove('d-none');
      });
    } else {
      api('/nas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, nas_ip: nasIp, description: description || null, is_active: isActive })
      }).then(done).catch(function(err) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
        errEl.textContent = err.message || 'Erro ao salvar.';
        errEl.classList.remove('d-none');
      });
    }
  });

  function loadPlans() {
    setLoading('outPlans');
    api('/plans').then(function(data) {
      var plans = data.plans || [];
      plansCache = plans;
      if (!plans.length) {
        document.getElementById('outPlans').innerHTML = '<p class="text-muted mb-0">Nenhum plano. Execute <code>sql/plans.sql</code> ou adicione um plano.</p>';
        return;
      }
      var html = renderTable(plans, [
        { key: 'code', label: 'Código' },
        { key: 'speed_display', label: 'Velocidade' },
        { key: 'unit', label: 'Unidade' },
        { key: 'tagline', label: 'Tagline' },
        { key: 'badge', label: 'Destaque', render: function(v) { return v ? (v === 'popular' ? 'Mais escolhido' : 'Top') : '—'; } },
      ], function(r) {
        return '<button type="button" class="btn btn-sm btn-outline-secondary" data-edit-plan="' + r.id + '">Editar</button>';
      }, 'Ações');
      document.getElementById('outPlans').innerHTML = html;
      document.querySelectorAll('[data-edit-plan]').forEach(function(btn) {
        btn.addEventListener('click', function() { openPlanModal(Number(this.getAttribute('data-edit-plan'))); });
      });
    }).catch(function(err) {
      document.getElementById('outPlans').innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
    });
  }

  function openPlanModal(id) {
    document.getElementById('modalPlanTitle').textContent = id ? 'Editar plano' : 'Novo plano';
    document.getElementById('planId').value = id || '';
    if (id) {
      var p = plansCache.find(function(x) { return x.id == id; });
      if (p) {
          document.getElementById('planCode').value = p.code || '';
          document.getElementById('planSpeedDisplay').value = p.speed_display || '';
          document.getElementById('planUnit').value = p.unit || 'Mega';
          document.getElementById('planTagline').value = p.tagline || '';
          var fs = p.features_json;
          document.getElementById('planFeatures').value = Array.isArray(fs) ? fs.join('\n') : (typeof fs === 'string' ? (function(){ try { return JSON.parse(fs).join('\n'); } catch(e){ return fs; } })() : '');
          document.getElementById('planBadge').value = p.badge || '';
          document.getElementById('planPrice').value = p.price != null ? p.price : '';
        }
    } else {
      document.getElementById('planCode').value = '';
      document.getElementById('planSpeedDisplay').value = '';
      document.getElementById('planUnit').value = 'Mega';
      document.getElementById('planTagline').value = '';
      document.getElementById('planFeatures').value = '';
      document.getElementById('planBadge').value = '';
      document.getElementById('planPrice').value = '';
    }
    new bootstrap.Modal(document.getElementById('modalPlan')).show();
  }

  document.getElementById('btnAddPlan').addEventListener('click', function() { openPlanModal(null); });

  document.getElementById('btnSavePlan').addEventListener('click', function() {
    var id = document.getElementById('planId').value;
    var code = document.getElementById('planCode').value.trim();
    var speedDisplay = document.getElementById('planSpeedDisplay').value.trim() || code;
    var unit = document.getElementById('planUnit').value;
    var tagline = document.getElementById('planTagline').value.trim();
    var featuresText = document.getElementById('planFeatures').value.trim();
    var features = featuresText ? featuresText.split('\n').map(function(s) { return s.trim(); }).filter(Boolean) : [];
    var badge = document.getElementById('planBadge').value;

    if (!code) { alert('Código obrigatório'); return; }

    var priceVal = document.getElementById('planPrice').value.trim();
    var body = { code: code, speed_display: speedDisplay, unit: unit, tagline: tagline, features_json: features, badge: badge };
    if (priceVal) body.price = parseFloat(priceVal);
    var p = id ? api('/plans/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) : api('/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    p.then(function() {
      bootstrap.Modal.getInstance(document.getElementById('modalPlan')).hide();
      loadPlans();
      loadStats();
    }).catch(function(err) { alert(err.message); });
  });

  document.getElementById('btnLoadLeads').addEventListener('click', function() {
    setLoading('outLeads');
    api('/leads').then(function(data) {
      var statusBadge = function(v) {
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
      ], function(r) {
        return '<button type="button" class="btn btn-sm btn-outline-secondary" data-view-lead="' + r.id + '">Ver</button>';
      }, 'Ações');
      document.querySelectorAll('[data-view-lead]').forEach(function(btn) {
        btn.addEventListener('click', function() { viewLead(Number(this.getAttribute('data-view-lead'))); });
      });
    }).catch(function(err) {
      document.getElementById('outLeads').innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
    });
  });

  function viewLead(id) {
    currentLeadId = id;
    api('/leads/' + id).then(function(data) {
      var l = data.lead;
      var raw = l.raw_payload_json;
      try { raw = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) {}
      var addr = l.address_json;
      try { addr = typeof addr === 'string' ? JSON.parse(addr) : addr; } catch(e) {}
      var html = '<dl class="row small mb-0">' +
        '<dt class="col-sm-3">Protocolo</dt><dd class="col-sm-9">' + esc(l.protocol) + '</dd>' +
        '<dt class="col-sm-3">Plano</dt><dd class="col-sm-9">' + esc(l.plan_code) + '</dd>' +
        '<dt class="col-sm-3">Cliente</dt><dd class="col-sm-9">' + esc(l.customer_name) + '</dd>' +
        '<dt class="col-sm-3">CPF/CNPJ</dt><dd class="col-sm-9">' + esc(l.cpf_cnpj) + '</dd>' +
        '<dt class="col-sm-3">WhatsApp</dt><dd class="col-sm-9">' + esc(l.whatsapp) + '</dd>' +
        '<dt class="col-sm-3">Email</dt><dd class="col-sm-9">' + esc(l.email || '—') + '</dd>' +
        '<dt class="col-sm-3">Vencimento</dt><dd class="col-sm-9">' + esc(l.vencimento) + '</dd>' +
        '<dt class="col-sm-3">Status</dt><dd class="col-sm-9">' + esc(l.status) + '</dd>' +
        '<dt class="col-sm-3">Data</dt><dd class="col-sm-9">' + esc(l.created_at) + '</dd>';
      if (addr && typeof addr === 'object') {
        html += '<dt class="col-sm-3">Endereço</dt><dd class="col-sm-9">' + esc(JSON.stringify(addr, null, 2)) + '</dd>';
      }
      html += '</dl>';
      if (l.notes) html += '<p class="mt-2"><strong>Observações:</strong> ' + esc(l.notes) + '</p>';
      document.getElementById('modalLeadBody').innerHTML = html;
      document.getElementById('leadStatusSelect').value = l.status || 'NEW';
      new bootstrap.Modal(document.getElementById('modalLead')).show();
    }).catch(function(err) { alert(err.message); });
  }

  document.getElementById('btnSaveLeadStatus').addEventListener('click', function() {
    if (!currentLeadId) return;
    var status = document.getElementById('leadStatusSelect').value;
    api('/leads/' + currentLeadId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: status }) }).then(function() {
      bootstrap.Modal.getInstance(document.getElementById('modalLead')).hide();
      document.getElementById('btnLoadLeads').click();
      loadStats();
    }).catch(function(err) { alert(err.message); });
  });

  var customersCache = [];

  function formatPhone(w) {
    if (!w) return '—';
    var d = String(w).replace(/\D/g, '');
    if (d.length >= 11) return '(' + d.slice(-11, -9) + ') ' + d.slice(-9, -4) + '-' + d.slice(-4);
    if (d.length >= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return w;
  }

  function formatCpfCnpj(v) {
    if (!v) return '—';
    var d = String(v).replace(/\D/g, '');
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
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
    var thead = '<tr><th>Código</th><th>Nome</th><th>CPF/CNPJ</th><th>Telefone</th><th>Email</th><th>Plano</th><th>Status</th><th>Pontos</th><th class="text-end">Ações</th></tr>';
    var tbody = rows.map(function(r) {
      return '<tr>' +
        '<td><span class="cell-code">#' + esc(r.id) + '</span></td>' +
        '<td><span class="cell-name">' + esc(r.name || '—') + '</span></td>' +
        '<td>' + esc(formatCpfCnpj(r.cpf_cnpj)) + '</td>' +
        '<td>' + esc(formatPhone(r.whatsapp)) + '</td>' +
        '<td>' + esc(r.email || '—') + '</td>' +
        '<td>' + esc(r.plan_code || '—') + '</td>' +
        '<td>' + statusBadge(r.active) + '</td>' +
        '<td>' + esc(r.points_balance ?? 0) + '</td>' +
        '<td class="text-end"><div class="btn-group btn-group-sm"><button type="button" class="btn btn-outline-secondary btn-action" data-view-customer="' + r.id + '"><i class="bi bi-eye me-1"></i>Ver ficha</button><button type="button" class="btn btn-outline-primary btn-action" data-edit-customer="' + r.id + '"><i class="bi bi-pencil me-1"></i>Editar</button></div></td>' +
        '</tr>';
    }).join('');
    return '<div class="table-responsive"><table class="table isp-cadastro__table"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div>';
  }

  var currentInstallationId = null;

  function viewCustomer(id) {
    currentCustomerId = id;
    var c = customersCache.find(function(x) { return x.id == id; });
    document.getElementById('modalCustomerBody').innerHTML = '<p class="mb-0"><span class="spinner-border spinner-border-sm me-2"></span>Carregando...</p>';
    new bootstrap.Modal(document.getElementById('modalCustomer')).show();
    api('/customers/' + id).then(function(data) {
      var cust = data.customer || {};
      var inst = data.installation || null;
      var invoices = data.invoices || [];
      currentInstallationId = inst && inst.id ? inst.id : null;

      var html = '<div class="ficha-section">' +
        '<div class="ficha-section__title"><i class="bi bi-person-vcard"></i> Dados cadastrais</div>' +
        '<dl class="row ficha-dl mb-0">' +
        '<dt class="col-sm-3 col-md-2">Código</dt><dd class="col-sm-9 col-md-4"><code>#' + esc(cust.id) + '</code></dd>' +
        '<dt class="col-sm-3 col-md-2">Nome</dt><dd class="col-sm-9 col-md-4">' + esc(cust.name || '—') + '</dd>' +
        '<dt class="col-sm-3 col-md-2">CPF/CNPJ</dt><dd class="col-sm-9 col-md-4">' + esc(formatCpfCnpj(cust.cpf_cnpj)) + '</dd>' +
        '<dt class="col-sm-3 col-md-2">WhatsApp</dt><dd class="col-sm-9 col-md-4">' + esc(formatPhone(cust.whatsapp)) + '</dd>' +
        '<dt class="col-sm-3 col-md-2">Email</dt><dd class="col-sm-9 col-md-4">' + esc(cust.email || '—') + '</dd>' +
        '<dt class="col-sm-3 col-md-2">Plano</dt><dd class="col-sm-9 col-md-4">' + esc(cust.plan_code || inst?.plan_code || '—') + '</dd>' +
        '<dt class="col-sm-3 col-md-2">Status</dt><dd class="col-sm-9 col-md-4">' + statusBadge(cust.active) + '</dd>' +
        '<dt class="col-sm-3 col-md-2">Pontos (Clube)</dt><dd class="col-sm-9 col-md-4">' + esc(cust.points_balance ?? 0) + ' pts</dd>' +
        '<dt class="col-sm-3 col-md-2">Nível</dt><dd class="col-sm-9 col-md-4">' + esc(cust.tier || 'BRONZE') + '</dd>' +
        '<dt class="col-sm-3 col-md-2">Cadastro</dt><dd class="col-sm-9 col-md-4">' + esc(cust.created_at || '—') + '</dd>' +
        '</dl></div>';

      html += '<div class="ficha-section">' +
        '<div class="ficha-section__title"><i class="bi bi-wifi"></i> Dados de acesso (PPPoE)</div>';
      if (inst) {
        var user = inst.pppoe_user || '—';
        var pass = inst.pppoe_password ? '••••••••' : '—';
        html += '<dl class="row ficha-dl mb-0">' +
          '<dt class="col-sm-3 col-md-2">Usuário</dt><dd class="col-sm-9 col-md-10"><code id="dispPppoeUser">' + esc(user) + '</code> <button type="button" class="btn btn-sm btn-outline-secondary ms-2" data-copy-pppoe-user="' + esc(inst.pppoe_user || '') + '"><i class="bi bi-clipboard me-1"></i>Copiar</button></dd>' +
          '<dt class="col-sm-3 col-md-2">Senha</dt><dd class="col-sm-9 col-md-10"><code id="dispPppoePass">' + pass + '</code> <button type="button" class="btn btn-sm btn-outline-secondary ms-2" data-reveal-pppoe data-pass="' + esc(inst.pppoe_password || '') + '">Revelar</button>';
        if (currentInstallationId) html += ' <button type="button" class="btn btn-sm btn-outline-primary ms-1" id="btnEditPppoe"><i class="bi bi-pencil me-1"></i>Editar acesso</button>';
        html += '</dd></dl>';
      } else {
        html += '<p class="text-muted small mb-0">Sem instalação cadastrada. Marque o pedido como Instalado para gerar usuário e senha PPPoE.</p>';
      }
      html += '</div>';

      html += '<div class="ficha-section">' +
        '<div class="ficha-section__title"><i class="bi bi-currency-dollar"></i> Financeiro</div>';
      if (invoices.length) {
        html += '<div class="table-responsive"><table class="table ficha-table"><thead><tr><th>Referência</th><th>Vencimento</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>';
        invoices.forEach(function(inv) {
          var st = inv.status || 'PENDING';
          var stClass = { PENDING: 'warning', PAID: 'success', OVERDUE: 'danger' }[st] || 'secondary';
          var stLabel = { PENDING: 'Pendente', PAID: 'Pago', OVERDUE: 'Vencido' }[st] || st;
          html += '<tr><td>' + esc(inv.ref_month) + '</td><td>' + esc(inv.due_date) + '</td><td>R$ ' + (Number(inv.amount) || 0).toFixed(2) + '</td><td><span class="badge bg-' + stClass + '">' + stLabel + '</span></td><td class="text-end">';
          if (st !== 'PAID') html += '<button type="button" class="btn btn-sm btn-success" data-mark-paid-inv="' + inv.id + '">Marcar pago</button>';
          html += '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else {
        html += '<p class="text-muted small mb-0">Nenhuma fatura. Gere faturas em Financeiro.</p>';
      }
      html += '</div>';

      document.getElementById('modalCustomerBody').innerHTML = html;
      var btnToggle = document.getElementById('btnToggleCustomer');
      var isActive = cust.active !== 0 && cust.active !== '0' && cust.active !== false;
      btnToggle.innerHTML = isActive ? '<i class="bi bi-pause-circle"></i> Desativar' : '<i class="bi bi-play-circle"></i> Reativar';
      btnToggle.className = isActive ? 'btn btn-warning btn-sm' : 'btn btn-success btn-sm';

      document.querySelectorAll('[data-copy-pppoe-user]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var u = this.getAttribute('data-copy-pppoe-user');
          if (u && navigator.clipboard) {
            navigator.clipboard.writeText(u).then(function() {
              var label = btn.querySelector('.btn-label');
              var icon = btn.innerHTML;
              btn.innerHTML = '<span class="btn-label">Copiado!</span>';
              btn.classList.add('btn-success'); btn.classList.remove('btn-outline-secondary');
              setTimeout(function() { btn.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copiar'; btn.classList.remove('btn-success'); btn.classList.add('btn-outline-secondary'); }, 2000);
            });
          }
        });
      });
      document.querySelectorAll('[data-reveal-pppoe]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var disp = document.getElementById('dispPppoePass');
          if (disp) {
            if (this.getAttribute('data-reveal-pppoe') != null) {
              disp.textContent = this.getAttribute('data-pass') || '—';
              this.textContent = 'Ocultar';
              this.removeAttribute('data-reveal-pppoe');
              this.setAttribute('data-hide-pppoe', '1');
            } else {
              disp.textContent = '••••••••';
              this.textContent = 'Revelar';
              this.removeAttribute('data-hide-pppoe');
              this.setAttribute('data-reveal-pppoe', '1');
            }
          }
        });
      });
      document.querySelectorAll('[data-mark-paid-inv]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var invId = Number(this.getAttribute('data-mark-paid-inv'));
          api('/finance/invoices/' + invId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paid: true }) }).then(function() { viewCustomer(id); loadStats(); });
        });
      });
      if (document.getElementById('btnEditPppoe')) {
        document.getElementById('btnEditPppoe').onclick = function() { openEditPppoe(currentInstallationId, inst); };
      }
    }).catch(function(err) {
      document.getElementById('modalCustomerBody').innerHTML = '<div class="alert alert-danger mb-0">' + esc(err.message) + '</div>';
    });
  }

  function openEditPppoe(instId, inst) {
    if (!instId || !inst) return;
    var user = prompt('Usuário PPPoE:', inst.pppoe_user || '');
    if (user === null) return;
    var pass = prompt('Senha PPPoE (deixe em branco para não alterar):', '');
    var body = { pppoe_user: user ? user.trim() : null };
    if (pass !== null && pass !== '') body.pppoe_password = pass;
    api('/installations/' + instId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function() {
      if (currentCustomerId) viewCustomer(currentCustomerId);
    }).catch(function(err) { alert(err.message); });
  }

  function parseAddressJson(addr) {
    if (!addr) return {};
    try {
      return typeof addr === 'string' ? JSON.parse(addr) : addr;
    } catch (e) { return {}; }
  }

  function openEditCustomer(id) {
    currentCustomerId = id;
    bootstrap.Modal.getInstance(document.getElementById('modalCustomer')) && bootstrap.Modal.getInstance(document.getElementById('modalCustomer')).hide();
    document.getElementById('modalEditCustomer').querySelector('.modal-title').innerHTML = '<i class="bi bi-pencil-square me-2"></i>Editar Cliente';
    var readonlyRow = document.getElementById('editCustomerReadonlyRow');
    if (readonlyRow) readonlyRow.style.display = '';
    var whatsappInput = document.getElementById('editCustomerWhatsapp');
    if (whatsappInput) {
      whatsappInput.setAttribute('readonly', 'readonly');
      whatsappInput.setAttribute('disabled', 'disabled');
      whatsappInput.placeholder = '';
    }
    var hint = document.getElementById('editWhatsappHint');
    if (hint) hint.textContent = 'Identificador único — não editável';
    document.getElementById('editCustomerId').value = id;
    document.getElementById('editInstallationId').value = '';
    var saveBtn = document.getElementById('btnSaveCustomer');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Carregando...'; }
    var modal = new bootstrap.Modal(document.getElementById('modalEditCustomer'));
    modal.show();

    Promise.all([api('/customers/' + id), api('/plans')]).then(function(results) {
      var data = results[0];
      var plansData = results[1];
      var cust = data.customer || {};
      var inst = data.installation || null;
      var plans = Array.isArray(plansData) ? plansData : (plansData.plans || plansData.rows || []);

      document.getElementById('editInstallationId').value = inst && inst.id ? inst.id : '';
      document.getElementById('editCustomerCode').value = '#' + (cust.id || id);
      document.getElementById('editCustomerCreated').value = cust.created_at || '—';
      var ptsEl = document.getElementById('editCustomerPointsTier');
      if (ptsEl) ptsEl.value = (cust.points_balance ?? 0) + ' pts · ' + (cust.tier || 'BRONZE');
      document.getElementById('editCustomerName').value = cust.name || '';
      var cpfRaw = cust.cpf_cnpj ? String(cust.cpf_cnpj).replace(/\D/g, '') : '';
      document.getElementById('editCustomerCpf').value = cpfRaw ? formatCpfCnpj(cpfRaw) : '';
      document.getElementById('editCustomerWhatsapp').value = formatPhone(cust.whatsapp) || '';
      document.getElementById('editCustomerEmail').value = cust.email || '';
      document.getElementById('editCustomerActive').value = (cust.active === 0 || cust.active === '0') ? '0' : '1';

      var planSelect = document.getElementById('editInstallationPlan');
      if (planSelect) {
        planSelect.innerHTML = '<option value="">— Selecione —</option>';
        plans.forEach(function(p) {
          var code = p.code != null ? p.code : p.id;
          var label = (p.speed_display || code) + (p.unit ? ' ' + p.unit : '') + (p.tagline ? ' — ' + p.tagline : '');
          planSelect.appendChild(new Option(label, code, false, !!(inst && (inst.plan_code === code || inst.plan_code == code))));
        });
        if (!inst && cust.plan_code) {
          var codeStr = String(cust.plan_code);
          for (var i = 0; i < planSelect.options.length; i++) {
            if (planSelect.options[i].value === codeStr) { planSelect.selectedIndex = i; break; }
          }
        }
      }

      var instSection = document.getElementById('editInstallationSection');
      var pppoeSection = document.getElementById('editPppoeSection');
      if (inst) {
        if (instSection) instSection.style.display = '';
        if (pppoeSection) pppoeSection.style.display = '';
        document.getElementById('editInstallationDueDay').value = inst.due_day != null ? inst.due_day : 10;
        document.getElementById('editInstallationOnt').value = inst.ont_serial || '';
        document.getElementById('editInstallationCto').value = inst.cto_code || '';
        document.getElementById('editInstallationNotes').value = inst.notes || '';
        document.getElementById('editPppoeUser').value = inst.pppoe_user || '';
        document.getElementById('editPppoePassword').value = '';
        var addr = parseAddressJson(inst.address_json);
        document.getElementById('editAddrStreet').value = addr.logradouro || addr.rua || '';
        document.getElementById('editAddrNumber').value = addr.numero || '';
        document.getElementById('editAddrComplement').value = addr.complemento || '';
        document.getElementById('editAddrNeighborhood').value = addr.bairro || '';
        document.getElementById('editAddrCity').value = addr.cidade || '';
        document.getElementById('editAddrState').value = addr.uf || addr.estado || '';
        document.getElementById('editAddrZip').value = addr.cep || '';
      } else {
        if (instSection) instSection.style.display = 'none';
        if (pppoeSection) pppoeSection.style.display = 'none';
      }
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar tudo'; }
    }).catch(function(err) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar tudo'; }
      alert(err.message || 'Erro ao carregar cliente.');
    });
  }

  function bindCustomerActions() {
    document.querySelectorAll('[data-view-customer]').forEach(function(btn) {
      btn.addEventListener('click', function() { viewCustomer(Number(this.getAttribute('data-view-customer'))); });
    });
    document.querySelectorAll('[data-edit-customer]').forEach(function(btn) {
      btn.addEventListener('click', function() { openEditCustomer(Number(this.getAttribute('data-edit-customer'))); });
    });
  }

  function filterCustomers(rows, q) {
    if (!q || !q.trim()) return rows;
    var lower = q.trim().toLowerCase();
    return rows.filter(function(r) {
      return (r.name && r.name.toLowerCase().indexOf(lower) >= 0) ||
        (r.whatsapp && String(r.whatsapp).indexOf(lower) >= 0) ||
        (r.email && r.email.toLowerCase().indexOf(lower) >= 0) ||
        (r.cpf_cnpj && String(r.cpf_cnpj).replace(/\D/g, '').indexOf(lower.replace(/\D/g, '')) >= 0);
    });
  }

  function filterCustomersByStatus(rows, statusVal) {
    if (!statusVal || statusVal === '') return rows;
    var active = statusVal === '1';
    return rows.filter(function(r) {
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
    var activeCount = customersCache.filter(function(r) { return r.active !== 0 && r.active !== '0' && r.active !== false; }).length;
    var inactiveCount = customersCache.length - activeCount;
    var activeEl = document.getElementById('customersActiveCount');
    var inactiveEl = document.getElementById('customersInactiveCount');
    if (activeEl) activeEl.textContent = activeCount;
    if (inactiveEl) inactiveEl.textContent = inactiveCount;
    bindCustomerActions();
  }

  document.getElementById('btnLoadCustomers').addEventListener('click', function() {
    setLoading('outCustomers');
    api('/customers').then(function(data) {
      customersCache = data.rows || [];
      updateCustomersUI();
    }).catch(function(err) {
      document.getElementById('outCustomers').innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
    });
  });

  document.getElementById('btnEditCustomer').addEventListener('click', function() {
    if (currentCustomerId) openEditCustomer(currentCustomerId);
  });

  function openNewCustomer() {
    currentCustomerId = null;
    document.getElementById('editCustomerId').value = '';
    document.getElementById('editInstallationId').value = '';
    document.getElementById('modalEditCustomer').querySelector('.modal-title').innerHTML = '<i class="bi bi-person-plus-fill me-2"></i>Cadastrar cliente';
    var readonlyRow = document.getElementById('editCustomerReadonlyRow');
    if (readonlyRow) readonlyRow.style.display = 'none';
    var whatsappInput = document.getElementById('editCustomerWhatsapp');
    if (whatsappInput) {
      whatsappInput.removeAttribute('readonly');
      whatsappInput.removeAttribute('disabled');
      whatsappInput.placeholder = 'DDD + número (ex: 11999999999)';
    }
    var hint = document.getElementById('editWhatsappHint');
    if (hint) hint.textContent = 'Obrigatório; use só números com DDD (ex: 11999999999)';
    document.getElementById('editCustomerName').value = '';
    document.getElementById('editCustomerCpf').value = '';
    document.getElementById('editCustomerWhatsapp').value = '';
    document.getElementById('editCustomerEmail').value = '';
    document.getElementById('editCustomerActive').value = '1';
    document.getElementById('editInstallationDueDay').value = '10';
    document.getElementById('editInstallationPlan').value = '';
    document.getElementById('editInstallationOnt').value = '';
    document.getElementById('editInstallationCto').value = '';
    document.getElementById('editInstallationNotes').value = '';
    document.getElementById('editAddrStreet').value = '';
    document.getElementById('editAddrNumber').value = '';
    document.getElementById('editAddrComplement').value = '';
    document.getElementById('editAddrNeighborhood').value = '';
    document.getElementById('editAddrCity').value = '';
    document.getElementById('editAddrState').value = '';
    document.getElementById('editAddrZip').value = '';
    document.getElementById('editPppoeUser').value = '';
    document.getElementById('editPppoePassword').value = '';
    var instSection = document.getElementById('editInstallationSection');
    var pppoeSection = document.getElementById('editPppoeSection');
    if (instSection) instSection.style.display = '';
    if (pppoeSection) pppoeSection.style.display = '';
    var planSelect = document.getElementById('editInstallationPlan');
    if (planSelect && planSelect.options.length <= 1) {
      api('/plans').then(function(data) {
        var plans = data.plans || [];
        planSelect.innerHTML = '<option value="">— Selecione —</option>';
        plans.forEach(function(p) {
          var code = p.code != null ? p.code : p.id;
          var label = (p.speed_display || code) + (p.unit ? ' ' + p.unit : '') + (p.tagline ? ' — ' + p.tagline : '');
          planSelect.appendChild(new Option(label, code, false, false));
        });
      });
    }
    new bootstrap.Modal(document.getElementById('modalEditCustomer')).show();
  }

  document.getElementById('btnNewCustomer').addEventListener('click', openNewCustomer);

  document.getElementById('btnSaveCustomer').addEventListener('click', function() {
    var id = document.getElementById('editCustomerId').value;
    var name = document.getElementById('editCustomerName').value.trim();
    var whatsappRaw = (document.getElementById('editCustomerWhatsapp').value || '').trim();
    var email = document.getElementById('editCustomerEmail').value.trim() || null;
    var cpfVal = (document.getElementById('editCustomerCpf').value || '').replace(/\D/g, '');
    var active = document.getElementById('editCustomerActive').value === '1';

    if (!name) { alert('Nome é obrigatório.'); return; }

    if (!id) {
      if (!whatsappRaw || whatsappRaw.replace(/\D/g, '').length < 10) {
        alert('WhatsApp é obrigatório (mínimo 10 dígitos com DDD).');
        return;
      }
      var body = { name: name, whatsapp: whatsappRaw, email: email, active: active };
      if (cpfVal) body.cpf_cnpj = cpfVal;
      var planCode = (document.getElementById('editInstallationPlan') || {}).value || '';
      var dueDay = parseInt((document.getElementById('editInstallationDueDay') || {}).value, 10) || 10;
      dueDay = Math.min(28, Math.max(1, dueDay));
      var addr = {
        logradouro: (document.getElementById('editAddrStreet') || {}).value || '',
        numero: (document.getElementById('editAddrNumber') || {}).value || '',
        complemento: (document.getElementById('editAddrComplement') || {}).value || '',
        bairro: (document.getElementById('editAddrNeighborhood') || {}).value || '',
        cidade: (document.getElementById('editAddrCity') || {}).value || '',
        uf: (document.getElementById('editAddrState') || {}).value || '',
        cep: (document.getElementById('editAddrZip') || {}).value || ''
      };
      var hasAddr = Object.keys(addr).some(function(k) { return addr[k]; });
      if (planCode || hasAddr || (document.getElementById('editPppoeUser') || {}).value.trim()) {
        body.installation = {
          plan_code: planCode || '100',
          due_day: dueDay,
          address_json: addr,
          ont_serial: (document.getElementById('editInstallationOnt') || {}).value || null,
          cto_code: (document.getElementById('editInstallationCto') || {}).value || null,
          notes: (document.getElementById('editInstallationNotes') || {}).value || null,
          pppoe_user: (document.getElementById('editPppoeUser') || {}).value.trim() || null
        };
        var pppoePass = (document.getElementById('editPppoePassword') || {}).value;
        if (pppoePass && pppoePass.trim()) body.installation.pppoe_password = pppoePass.trim();
      }
      api('/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function() {
          bootstrap.Modal.getInstance(document.getElementById('modalEditCustomer')).hide();
          document.getElementById('btnLoadCustomers').click();
          loadStats();
          alert('Cliente cadastrado com sucesso.');
        })
        .catch(function(err) { alert(err.message); });
      return;
    }

    var customerPayload = { name: name || null, email: email, active: active };
    if (cpfVal) customerPayload.cpf_cnpj = cpfVal;

    var instIdEl = document.getElementById('editInstallationId');
    var instId = instIdEl && instIdEl.value ? instIdEl.value : null;
    var instPayload = null;
    if (instId) {
      var planCode = (document.getElementById('editInstallationPlan') || {}).value || '';
      var dueDay = parseInt((document.getElementById('editInstallationDueDay') || {}).value, 10) || 10;
      dueDay = Math.min(28, Math.max(1, dueDay));
      var addr = {
        logradouro: (document.getElementById('editAddrStreet') || {}).value || '',
        numero: (document.getElementById('editAddrNumber') || {}).value || '',
        complemento: (document.getElementById('editAddrComplement') || {}).value || '',
        bairro: (document.getElementById('editAddrNeighborhood') || {}).value || '',
        cidade: (document.getElementById('editAddrCity') || {}).value || '',
        uf: (document.getElementById('editAddrState') || {}).value || '',
        cep: (document.getElementById('editAddrZip') || {}).value || ''
      };
      instPayload = {
        plan_code: planCode || '100',
        due_day: dueDay,
        address_json: addr,
        ont_serial: (document.getElementById('editInstallationOnt') || {}).value || null,
        cto_code: (document.getElementById('editInstallationCto') || {}).value || null,
        notes: (document.getElementById('editInstallationNotes') || {}).value || null,
        pppoe_user: (document.getElementById('editPppoeUser') || {}).value.trim() || null
      };
      var pppoePass = (document.getElementById('editPppoePassword') || {}).value;
      if (pppoePass && pppoePass.trim()) instPayload.pppoe_password = pppoePass.trim();
    }

    var done = function() {
      bootstrap.Modal.getInstance(document.getElementById('modalEditCustomer')).hide();
      bootstrap.Modal.getInstance(document.getElementById('modalCustomer')) && bootstrap.Modal.getInstance(document.getElementById('modalCustomer')).hide();
      document.getElementById('btnLoadCustomers').click();
      loadStats();
    };
    api('/customers/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(customerPayload) })
      .then(function() {
        if (instId && instPayload && Object.keys(instPayload).length) {
          return api('/installations/' + instId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(instPayload) });
        }
      })
      .then(done)
      .catch(function(err) { alert(err.message); });
  });

  document.getElementById('btnToggleCustomer').addEventListener('click', function() {
    if (!currentCustomerId) return;
    var c = customersCache.find(function(x) { return x.id == currentCustomerId; });
    if (!c) return;
    var isActive = c.active !== 0 && c.active !== '0' && c.active !== false;
    var newActive = !isActive;
    api('/customers/' + currentCustomerId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: newActive }) }).then(function() {
      c.active = newActive ? 1 : 0;
      bootstrap.Modal.getInstance(document.getElementById('modalCustomer')).hide();
      document.getElementById('btnLoadCustomers').click();
      loadStats();
    }).catch(function(err) { alert(err.message); });
  });

  function onCustomersFilterChange() {
    updateCustomersUI();
  }

  var searchEl = document.getElementById('customersSearch');
  if (searchEl) searchEl.addEventListener('input', onCustomersFilterChange);
  var statusFilterEl = document.getElementById('customersStatusFilter');
  if (statusFilterEl) statusFilterEl.addEventListener('change', onCustomersFilterChange);

  function loadCampaigns() {
    setLoading('outCampaigns');
    api('/campaigns').then(function(data) {
      var campaigns = data.campaigns || [];
      document.getElementById('outCampaigns').innerHTML = renderTable(campaigns, [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Nome' },
        { key: 'status', label: 'Status' },
        { key: 'created_at', label: 'Criada em' },
      ]);
    }).catch(function(err) {
      document.getElementById('outCampaigns').innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
    });
  }

  document.getElementById('btnAddCampaign').addEventListener('click', function() {
    var name = prompt('Nome da campanha:');
    if (!name || !name.trim()) return;
    api('/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) }).then(function() {
      loadCampaigns();
      loadStats();
    }).catch(function(err) { alert(err.message); });
  });

  function formatMoney(v) {
    return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatPhoneShort(w) {
    if (!w) return '—';
    var d = String(w).replace(/\D/g, '');
    if (d.length >= 11) return d.slice(-11, -9) + ' ' + d.slice(-9, -4) + '-' + d.slice(-4);
    return w;
  }

  function loadFinance() {
    var monthEl = document.getElementById('financeMonthFilter');
    if (monthEl && !monthEl.value) monthEl.value = new Date().toISOString().slice(0, 7);
    var month = (document.getElementById('financeMonthFilter') || {}).value || '';
    var statsUrl = '/finance/stats' + (month ? '?ref_month=' + encodeURIComponent(month) : '');
    api(statsUrl).then(function(data) {
      document.getElementById('financePendingAmount').textContent = formatMoney(data.pendingAmount);
      document.getElementById('financePending').textContent = (data.pending || 0) + (data.overdue || 0) + ' fatura(s)';
      document.getElementById('financePaidAmount').textContent = formatMoney(data.paidAmount);
      document.getElementById('financePaid').textContent = (data.paid || 0) + ' fatura(s)';
      document.getElementById('financeOverdueAmount').textContent = formatMoney(data.overdueAmount || 0);
      document.getElementById('financeOverdue').textContent = (data.overdue || 0) + ' fatura(s)';
      if (month && data.totalInMonth != null) {
        document.getElementById('financeTotalMonth').textContent = formatMoney(data.totalInMonth);
        document.getElementById('financeCountMonth').textContent = (data.countInMonth || 0) + ' fatura(s)';
      } else {
        document.getElementById('financeTotalMonth').textContent = '—';
        document.getElementById('financeCountMonth').textContent = '—';
      }
    }).catch(function() {
      ['financePendingAmount','financePaidAmount','financeOverdueAmount','financeTotalMonth'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.textContent = '—';
      });
      ['financePending','financePaid','financeOverdue','financeCountMonth'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.textContent = '—';
      });
    });
    var status = (document.getElementById('financeStatusFilter') || {}).value || '';
    var q = '/finance/invoices';
    var params = [];
    if (status) params.push('status=' + encodeURIComponent(status));
    if (month) params.push('ref_month=' + encodeURIComponent(month));
    if (params.length) q += '?' + params.join('&');
    var infoEl = document.getElementById('financeFilterInfo');
    if (infoEl) infoEl.textContent = month ? 'Faturas da competência ' + month : 'Todas as faturas';
    setLoading('outFinance');
    api(q).then(function(data) {
      var rows = data.rows || [];
      if (!rows.length) {
        document.getElementById('outFinance').innerHTML = '<p class="mb-0 text-muted py-4 text-center">Nenhuma fatura encontrada. Ajuste os filtros ou clique em <strong>Gerar faturas</strong> para a competência desejada.</p>';
        return;
      }
      var statusBadge = function(s) {
        var c = { PENDING: 'warning', PAID: 'success', OVERDUE: 'danger' }[s] || 'secondary';
        var l = { PENDING: 'Pendente', PAID: 'Pago', OVERDUE: 'Vencido' }[s] || s;
        return '<span class="badge bg-' + c + '">' + l + '</span>';
      };
      var html = '<div class="table-responsive"><table class="table table-sm table-hover"><thead><tr>' +
        '<th>Competência</th><th>Cliente</th><th>Contato</th><th>Vencimento</th><th>Valor</th><th>Plano</th><th>Status</th><th>Data pagamento</th><th class="text-end">Ações</th></tr></thead><tbody>';
      rows.forEach(function(r) {
        var paidAt = r.paid_at ? ('<span class="cell-paid-at">' + esc(r.paid_at) + '</span>') : '—';
        html += '<tr><td>' + esc(r.ref_month) + '</td><td>' + esc(r.customer_name) + '</td><td class="small">' + esc(formatPhoneShort(r.whatsapp)) + '</td>' +
          '<td>' + esc(r.due_date) + '</td><td class="cell-amount">' + formatMoney(r.amount) + '</td><td>' + esc(r.plan_code) + '</td>' +
          '<td>' + statusBadge(r.status) + '</td><td>' + paidAt + '</td><td class="text-end">';
        if (r.status !== 'PAID') {
          html += '<button type="button" class="btn btn-sm btn-success" data-mark-paid="' + r.id + '"><i class="bi bi-check-lg me-1"></i>Marcar pago</button>';
        } else {
          html += '<button type="button" class="btn btn-sm btn-outline-secondary" data-mark-unpaid="' + r.id + '">Desfazer</button>';
        }
        html += '</td></tr>';
      });
      html += '</tbody></table></div>';
      document.getElementById('outFinance').innerHTML = html;
      document.querySelectorAll('[data-mark-paid]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = Number(this.getAttribute('data-mark-paid'));
          api('/finance/invoices/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paid: true }) }).then(function() {
            loadFinance();
            loadStats();
          }).catch(function(err) { alert(err.message); });
        });
      });
      document.querySelectorAll('[data-mark-unpaid]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = Number(this.getAttribute('data-mark-unpaid'));
          api('/finance/invoices/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paid: false }) }).then(function() {
            loadFinance();
            loadStats();
          }).catch(function(err) { alert(err.message); });
        });
      });
    }).catch(function(err) {
      document.getElementById('outFinance').innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
    });
  }

  document.getElementById('btnLoadFinance').addEventListener('click', function() { loadFinance(); });
  document.getElementById('btnGenerateInvoices').addEventListener('click', function() {
    var month = (document.getElementById('financeMonthFilter') || {}).value || new Date().toISOString().slice(0, 7);
    if (!confirm('Gerar faturas para ' + month + '? Serão criadas apenas para clientes que ainda não têm fatura neste mês.')) return;
    api('/finance/invoices/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref_month: month }) }).then(function(data) {
      alert('Criadas ' + (data.created || 0) + ' fatura(s) para ' + (data.refMonth || month) + '.');
      loadFinance();
      loadStats();
    }).catch(function(err) { alert(err.message); });
  });
  document.getElementById('financeStatusFilter').addEventListener('change', function() { loadFinance(); });
  document.getElementById('financeMonthFilter').addEventListener('change', function() { loadFinance(); });

  document.getElementById('btnLoadStand').addEventListener('click', function() {
    setLoading('outStand');
    api('/stand').then(function(data) {
      document.getElementById('outStand').innerHTML = renderTable(data.rows, [
        { key: 'created_at', label: 'Data' },
        { key: 'entry_number', label: 'Número' },
        { key: 'name', label: 'Nome' },
        { key: 'whatsapp', label: 'WhatsApp' },
        { key: 'campaign', label: 'Campanha' }
      ]);
    }).catch(function(err) {
      document.getElementById('outStand').innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
    });
  });

  document.getElementById('btnLoadWinners').addEventListener('click', function() {
    setLoading('outWinners');
    api('/winners').then(function(data) {
      document.getElementById('outWinners').innerHTML = renderTable(data.rows, [
        { key: 'created_at', label: 'Data' },
        { key: 'name', label: 'Nome' },
        { key: 'whatsapp', label: 'WhatsApp' },
        { key: 'campaign', label: 'Campanha' },
        { key: 'prize', label: 'Prêmio' }
      ]);
    }).catch(function(err) {
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
      items: [0,1,2,3].map(function(i) {
        return {
          name: (document.getElementById('clube_benefit_name_' + i) || {}).value || '',
          description: (document.getElementById('clube_benefit_desc_' + i) || {}).value || '',
          iconColor: (document.getElementById('clube_benefit_color_' + i) || {}).value || 'red'
        };
      })
    };
    var points = {
      sectionTitle: (document.getElementById('clube_points_title') || {}).value || '',
      items: [0,1,2,3].map(function(i) {
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
    while (bi.length < 4) bi.push({ name: '', description: '', iconColor: 'red' });
    var p = c.points || {};
    var pi = (p.items || []).slice(0, 4);
    while (pi.length < 4) pi.push({ label: '', value: '', text: '', icon: 'bi-circle' });
    var a = c.actions || {};
    var ct = c.cta || {};
    var colorOpts = '<option value="red">Vermelho</option><option value="purple">Roxo</option><option value="blue">Azul</option><option value="green">Verde</option>';
    var html = '<div class="small">';
    html += '<h6 class="text-primary mt-3 mb-2">Hero</h6>';
    html += '<div class="row g-2 mb-2"><div class="col-md-6"><label class="form-label">Badge</label><input type="text" class="form-control form-control-sm" id="clube_hero_badge" value="' + esc(h.badge) + '" /></div>';
    html += '<div class="col-md-6"><label class="form-label">Título</label><input type="text" class="form-control form-control-sm" id="clube_hero_title" value="' + esc(h.title) + '" /></div></div>';
    html += '<div class="mb-2"><label class="form-label">Descrição</label><textarea class="form-control form-control-sm" id="clube_hero_desc" rows="2">' + esc(h.description) + '</textarea></div>';
    html += '<div class="row g-2 mb-2"><div class="col-md-6"><label class="form-label">Texto do botão</label><input type="text" class="form-control form-control-sm" id="clube_hero_ctaText" value="' + esc(h.ctaText) + '" /></div>';
    html += '<div class="col-md-6"><label class="form-label">Link do botão</label><input type="text" class="form-control form-control-sm" id="clube_hero_ctaHref" value="' + esc(h.ctaHref) + '" placeholder="/assinar.html" /></div></div>';

    html += '<h6 class="text-primary mt-4 mb-2">Vantagens (benefícios)</h6>';
    html += '<div class="mb-2"><label class="form-label">Título da seção</label><input type="text" class="form-control form-control-sm" id="clube_benefits_title" value="' + esc(b.sectionTitle) + '" /></div>';
    html += '<div class="mb-2"><label class="form-label">Subtítulo</label><input type="text" class="form-control form-control-sm" id="clube_benefits_subtitle" value="' + esc(b.sectionSubtitle) + '" /></div>';
    [0,1,2,3].forEach(function(i) {
      var x = bi[i] || {};
      html += '<div class="border rounded p-2 mb-2"><strong>Item ' + (i+1) + '</strong>';
      html += '<div class="row g-2"><div class="col-md-4"><input type="text" class="form-control form-control-sm" id="clube_benefit_name_' + i + '" placeholder="Nome (ex: Netflix)" value="' + esc(x.name) + '" /></div>';
      html += '<div class="col-md-4"><select class="form-select form-select-sm" id="clube_benefit_color_' + i + '">' + colorOpts + '</select></div></div>';
      html += '<div class="mt-1"><textarea class="form-control form-control-sm" id="clube_benefit_desc_' + i + '" rows="2" placeholder="Descrição">' + esc(x.description) + '</textarea></div></div>';
    });
    html += '<div class="mb-2"><label class="form-label">Nota (rodapé)</label><input type="text" class="form-control form-control-sm" id="clube_benefits_note" value="' + esc(b.note) + '" /></div>';

    html += '<h6 class="text-primary mt-4 mb-2">Como ganhar pontos</h6>';
    html += '<div class="mb-2"><label class="form-label">Título da seção</label><input type="text" class="form-control form-control-sm" id="clube_points_title" value="' + esc(p.sectionTitle) + '" /></div>';
    [0,1,2,3].forEach(function(i) {
      var x = pi[i] || {};
      html += '<div class="border rounded p-2 mb-2"><strong>Item ' + (i+1) + '</strong>';
      html += '<div class="row g-2"><div class="col-md-6"><label class="form-label small">Label</label><input type="text" class="form-control form-control-sm" id="clube_point_label_' + i + '" value="' + esc(x.label) + '" /></div>';
      html += '<div class="col-md-6"><label class="form-label small">Valor</label><input type="text" class="form-control form-control-sm" id="clube_point_value_' + i + '" value="' + esc(x.value) + '" placeholder="+200 pontos" /></div></div>';
      html += '<div class="mt-1"><label class="form-label small">Texto</label><input type="text" class="form-control form-control-sm" id="clube_point_text_' + i + '" value="' + esc(x.text) + '" /></div>';
      html += '<div class="mt-1"><label class="form-label small">Ícone Bootstrap (ex: bi-qr-code-scan)</label><input type="text" class="form-control form-control-sm" id="clube_point_icon_' + i + '" value="' + esc(x.icon) + '" /></div></div>';
    });

    html += '<h6 class="text-primary mt-4 mb-2">Ações (consultar saldo + stand)</h6>';
    html += '<div class="mb-2"><label class="form-label">Título consulta</label><input type="text" class="form-control form-control-sm" id="clube_actions_consultTitle" value="' + esc(a.consultTitle) + '" /></div>';
    html += '<div class="mb-2"><label class="form-label">Descrição consulta</label><input type="text" class="form-control form-control-sm" id="clube_actions_consultDesc" value="' + esc(a.consultDesc) + '" /></div>';
    html += '<div class="mb-2"><label class="form-label">Badge do stand</label><input type="text" class="form-control form-control-sm" id="clube_actions_standBadge" value="' + esc(a.standBadge) + '" /></div>';
    html += '<div class="mb-2"><label class="form-label">Título stand</label><input type="text" class="form-control form-control-sm" id="clube_actions_standTitle" value="' + esc(a.standTitle) + '" /></div>';
    html += '<div class="mb-2"><label class="form-label">Descrição stand</label><textarea class="form-control form-control-sm" id="clube_actions_standDesc" rows="2">' + esc(a.standDesc) + '</textarea></div>';
    html += '<div class="row g-2 mb-2"><div class="col-md-6"><label class="form-label">Texto do link stand</label><input type="text" class="form-control form-control-sm" id="clube_actions_standLinkText" value="' + esc(a.standLinkText) + '" /></div>';
    html += '<div class="col-md-6"><label class="form-label">URL do link stand</label><input type="text" class="form-control form-control-sm" id="clube_actions_standHref" value="' + esc(a.standHref) + '" /></div></div>';

    html += '<h6 class="text-primary mt-4 mb-2">CTA final</h6>';
    html += '<div class="mb-2"><label class="form-label">Título</label><input type="text" class="form-control form-control-sm" id="clube_cta_title" value="' + esc(ct.title) + '" /></div>';
    html += '<div class="mb-2"><label class="form-label">Texto</label><input type="text" class="form-control form-control-sm" id="clube_cta_text" value="' + esc(ct.text) + '" /></div>';
    html += '<div class="row g-2"><div class="col-md-6"><label class="form-label">Texto do botão</label><input type="text" class="form-control form-control-sm" id="clube_cta_buttonText" value="' + esc(ct.buttonText) + '" /></div>';
    html += '<div class="col-md-6"><label class="form-label">Link do botão</label><input type="text" class="form-control form-control-sm" id="clube_cta_buttonHref" value="' + esc(ct.buttonHref) + '" /></div></div>';
    html += '</div>';
    return html;
  }

  function loadClubePage() {
    var out = document.getElementById('outClubePage');
    if (!out) return;
    setLoading('outClubePage');
    api('/clube-page').then(function(data) {
      if (data.message) {
        out.innerHTML = '<div class="alert alert-warning mb-0">' + esc(data.message) + '</div>';
        return;
      }
      var cfg = data.config || {};
      out.innerHTML = renderClubeForm(cfg);
      [0,1,2,3].forEach(function(i) {
        var sel = document.getElementById('clube_benefit_color_' + i);
        if (sel && (cfg.benefits || {}).items && cfg.benefits.items[i]) sel.value = cfg.benefits.items[i].iconColor || 'red';
      });
    }).catch(function(err) {
      out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
    });
  }

  document.getElementById('btnLoadClubePage').addEventListener('click', function() { loadClubePage(); });
  document.getElementById('btnSaveClubePage').addEventListener('click', function() {
    var body = getClubeConfigFromForm();
    api('/clube-page', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: body }) }).then(function() {
      alert('Página do Clube salva.');
    }).catch(function(err) { alert(err.message); });
  });

  document.getElementById('btnDraw').addEventListener('click', function() {
    var out = document.getElementById('outDraw');
    out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sorteando...';
    Promise.resolve().then(function() {
      if (!activeCampaign) return api('/stats');
      return { activeCampaign: activeCampaign };
    }).then(function(data) {
      if (data.activeCampaign) activeCampaign = data.activeCampaign;
      if (!activeCampaign) throw new Error('Nenhuma campanha ativa.');
      var prize = document.getElementById('prize').value.trim() || 'Prêmio';
      return api('/raffles/' + activeCampaign.id + '/draw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prize: prize }) });
    }).then(function(data) {
      var w = data.winner;
      out.innerHTML = '<div class="alert alert-success mb-0"><strong>Vencedor</strong><br/>' + esc(w.name) + ' — ' + esc(w.whatsapp) + '<br/><strong>Campanha</strong> ' + esc(w.campaign) + '<br/><strong>Prêmio</strong> ' + esc(w.prize) + '</div>';
      loadStats();
    }).catch(function(err) {
      out.innerHTML = '<div class="alert alert-danger mb-0">' + esc(err.message) + '</div>';
    });
  });

  loadStats();
  loadPlans();
})();
