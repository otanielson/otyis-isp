/**
 * Admin do SaaS — painel para gerenciar provedores (tenants).
 * Autenticação: cookie admin_session (login em /admin).
 */
(function() {
  // Abre o modal "Gerenciar domínio" (chamado pelo onclick do botão na tabela)
  window.openTenantDomainModal = function(btn) {
    var id = btn.getAttribute('data-tenant-id');
    var sub = (btn.getAttribute('data-tenant-subdomain') || '').replace(/&amp;/g, '&');
    var custom = (btn.getAttribute('data-tenant-custom') || '').replace(/&amp;/g, '&');
    var status = btn.getAttribute('data-tenant-status') || 'ACTIVE';
    var editId = document.getElementById('editTenantId');
    var editSub = document.getElementById('editSubdomain');
    var editCustom = document.getElementById('editCustomDomain');
    var editStatus = document.getElementById('editTenantStatus');
    var errEl = document.getElementById('tenantDomainFormError');
    var modalEl = document.getElementById('modalTenantDomain');
    if (!modalEl || !editId || !editSub || !editCustom || !editStatus) return false;
    editId.value = id || '';
    editSub.value = sub;
    editCustom.value = custom;
    editStatus.value = status;
    if (errEl) errEl.classList.add('d-none');
    var Modal = typeof bootstrap !== 'undefined' && bootstrap.Modal;
    if (Modal) {
      var modalInstance = Modal.getOrCreateInstance ? Modal.getOrCreateInstance(modalEl) : new Modal(modalEl);
      modalInstance.show();
    } else {
      modalEl.classList.add('show');
      modalEl.style.display = 'block';
      document.body.classList.add('modal-open');
      var backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop fade show';
      backdrop.setAttribute('data-modal-backdrop', '1');
      document.body.appendChild(backdrop);
    }
    return false;
  };

  // Snippet Nginx de todos os tenants (um bloco só para colar no Nginx)
  var btnNginxSnippetAll = document.getElementById('btnNginxSnippetAll');
  if (btnNginxSnippetAll) btnNginxSnippetAll.addEventListener('click', function() {
    var modalEl = document.getElementById('modalNginxSnippet');
    var preEl = document.getElementById('nginxSnippetPre');
    var noteEl = document.getElementById('nginxSnippetNote');
    if (!modalEl || !preEl) return;
    preEl.textContent = 'Carregando...';
    if (noteEl) { noteEl.classList.add('d-none'); noteEl.textContent = ''; }
    api('/nginx-snippet').then(function(data) {
      preEl.textContent = data.snippet || '(Nenhum tenant com sitePort e adminPort provisionados.)';
      if (data.note && noteEl) { noteEl.textContent = data.note; noteEl.classList.remove('d-none'); }
      else if (data.skipped && data.skipped.length && noteEl) {
        noteEl.textContent = 'Omitidos: ' + data.skipped.map(function(s) { return s.slug + ' (' + s.reason + ')'; }).join(', ');
        noteEl.classList.remove('d-none');
      }
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        var m = bootstrap.Modal.getOrCreateInstance ? bootstrap.Modal.getOrCreateInstance(modalEl) : new bootstrap.Modal(modalEl);
        m.show();
      }
    }).catch(function(err) {
      preEl.textContent = 'Erro: ' + (err.message || 'não foi possível carregar.');
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        var m = bootstrap.Modal.getOrCreateInstance ? bootstrap.Modal.getOrCreateInstance(modalEl) : new bootstrap.Modal(modalEl);
        m.show();
      }
    });
  });

  // Abre o modal com snippet Nginx para acesso por path (sem DNS)
  window.openNginxSnippet = function(tenantId) {
    var modalEl = document.getElementById('modalNginxSnippet');
    var preEl = document.getElementById('nginxSnippetPre');
    var noteEl = document.getElementById('nginxSnippetNote');
    if (!modalEl || !preEl) return false;
    preEl.textContent = 'Carregando...';
    if (noteEl) { noteEl.classList.add('d-none'); noteEl.textContent = ''; }
    api('/tenants/' + tenantId + '/nginx-snippet').then(function(data) {
      preEl.textContent = data.snippet || '(vazio)';
      if (data.note && noteEl) { noteEl.textContent = data.note; noteEl.classList.remove('d-none'); }
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        var m = bootstrap.Modal.getOrCreateInstance ? bootstrap.Modal.getOrCreateInstance(modalEl) : new bootstrap.Modal(modalEl);
        m.show();
      }
    }).catch(function(err) {
      preEl.textContent = 'Erro: ' + (err.message || 'não foi possível carregar o snippet.');
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        var m = bootstrap.Modal.getOrCreateInstance ? bootstrap.Modal.getOrCreateInstance(modalEl) : new bootstrap.Modal(modalEl);
        m.show();
      }
    });
    return false;
  };

  function statusBadgeClass(status) {
    return status === 'ACTIVE' ? 'tenant-modal__badge--active' : (status === 'SUSPENDED' ? 'tenant-modal__badge--suspended' : (status === 'TRIAL' ? 'tenant-modal__badge--trial' : 'tenant-modal__badge--cancelled'));
  }

  function statusLabel(s) {
    return { ACTIVE: 'Ativo', SUSPENDED: 'Suspenso', TRIAL: 'Trial', CANCELLED: 'Cancelado' }[s] || s;
  }

  // Abre o modal "Gerenciar cliente": carrega detalhes do tenant e lista de usuários
  window.openTenantManage = function(tenantId) {
    var modalEl = document.getElementById('modalTenantManage');
    var loadingEl = document.getElementById('manageTenantLoading');
    var formEl = document.getElementById('manageTenantForm');
    var saveBtn = document.getElementById('btnSaveTenantManage');
    if (!modalEl || !loadingEl || !formEl) return false;
    document.getElementById('manageTenantId').value = tenantId;
    formEl.classList.add('d-none');
    if (saveBtn) saveBtn.classList.add('d-none');
    loadingEl.classList.remove('d-none');
    var Modal = typeof bootstrap !== 'undefined' && bootstrap.Modal;
    var modalInstance = Modal && (Modal.getOrCreateInstance ? Modal.getOrCreateInstance(modalEl) : new Modal(modalEl));
    if (modalInstance) modalInstance.show();

    api('/tenants/' + encodeURIComponent(tenantId)).then(function(data) {
      loadingEl.classList.add('d-none');
      var t = data.tenant;
      var users = data.users || [];
      if (!t) { formEl.classList.remove('d-none'); return; }
      document.getElementById('manageName').value = t.name || '';
      document.getElementById('manageSlug').value = t.slug || '';
      document.getElementById('manageStatus').value = t.status || 'ACTIVE';
      document.getElementById('manageSubdomain').value = t.subdomain || '';
      document.getElementById('manageCustomDomain').value = t.custom_domain || '';
      var nameEl = document.getElementById('manageTenantNameDisplay');
      if (nameEl) nameEl.textContent = t.name || t.slug || 'Provedor';
      var badgeEl = document.getElementById('manageTenantBadge');
      if (badgeEl) {
        badgeEl.textContent = statusLabel(t.status);
        badgeEl.className = 'tenant-modal__badge ' + statusBadgeClass(t.status);
      }
      var slug = (t.slug || '').toString();
      var origin = window.location.origin;
      var portalPathUrl = slug ? (origin + '/' + slug + '/portal/') : '';
      var sitePathUrl = slug ? (origin + '/' + slug + '/') : '';
      var pathInput = document.getElementById('managePortalLinkPath');
      if (pathInput) { pathInput.value = portalPathUrl || '—'; }
      var siteLinkEl = document.getElementById('manageSiteLinkPath');
      if (siteLinkEl) siteLinkEl.textContent = sitePathUrl || '—';
      var portalLink = document.getElementById('manageTenantPortalLink');
      if (portalLink) {
        portalLink.href = t.custom_domain ? ('https://' + t.custom_domain + '/portal/') : (portalPathUrl || '/portal');
        portalLink.title = t.custom_domain ? 'Abrir em ' + t.custom_domain : (portalPathUrl ? 'Abrir portal (por path)' : 'Portal');
      }
      var tbody = document.getElementById('manageTenantUsers');
      if (tbody) {
        tbody.innerHTML = users.length ? users.map(function(u) {
          return '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td>' +
            '<td>' + (u.is_master ? '<span class="badge bg-primary">Master</span>' : '—') + '</td>' +
            '<td>' + (u.is_active ? '<span class="text-success">Sim</span>' : 'Não') + '</td></tr>';
        }).join('') : '<tr><td colspan="4" class="text-muted text-center py-3">Nenhum usuário</td></tr>';
      }
      document.getElementById('manageTenantError').classList.add('d-none');
      formEl.classList.remove('d-none');
      if (saveBtn) saveBtn.classList.remove('d-none');
    }).catch(function(err) {
      loadingEl.classList.add('d-none');
      formEl.classList.remove('d-none');
      var errEl = document.getElementById('manageTenantError');
      if (errEl) { errEl.textContent = err.message || 'Erro ao carregar.'; errEl.classList.remove('d-none'); }
      if (saveBtn) saveBtn.classList.add('d-none');
    });
    return false;
  };

  window.openTenantDelete = function(tenantId, tenantName) {
    var modalEl = document.getElementById('modalTenantDelete');
    var nameEl = document.getElementById('deleteTenantName');
    var hardEl = document.getElementById('deleteTenantHard');
    if (!modalEl || !nameEl) return false;
    nameEl.textContent = tenantName || '—';
    if (hardEl) hardEl.checked = false;
    modalEl.dataset.deleteTenantId = String(tenantId);
    var Modal = typeof bootstrap !== 'undefined' && bootstrap.Modal;
    var modalInstance = Modal && (Modal.getOrCreateInstance ? Modal.getOrCreateInstance(modalEl) : new Modal(modalEl));
    if (modalInstance) modalInstance.show();
    return false;
  };

  function redirectLogin() {
    window.location.href = '/admin';
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function api(path, opts) {
    opts = opts || {};
    var url = '/api/saas' + path;
    var headers = opts.headers || {};
    if (opts.body && typeof opts.body === 'string') headers['Content-Type'] = 'application/json';
    return fetch(url, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body,
      credentials: 'same-origin'
    }).then(function(res) {
      return res.json().catch(function() { return {}; }).then(function(data) {
        if (res.status === 401) { redirectLogin(); throw new Error('Sessão expirada.'); }
        if (!res.ok) throw new Error(data.error || data.message || 'Erro');
        return data;
      });
    });
  }

  function loadStats() {
    api('/tenants').then(function(data) {
      var tenants = data.tenants || [];
      var el = document.getElementById('metricTenants');
      if (el) el.textContent = tenants.length;
    }).catch(function() {
      var el = document.getElementById('metricTenants');
      if (el) el.textContent = '—';
    });
  }

  var tenantsCache = [];

  function renderTenantsTable(tenants) {
    var out = document.getElementById('outTenants');
    var searchEl = document.getElementById('tenantsSearch');
    var countEl = document.getElementById('tenantsCountText');
    var term = (searchEl && searchEl.value || '').trim().toLowerCase();
    var filtered = term ? tenants.filter(function(t) {
      return (t.name && t.name.toLowerCase().indexOf(term) >= 0) || (t.slug && t.slug.toLowerCase().indexOf(term) >= 0);
    }) : tenants;
    if (countEl) countEl.textContent = filtered.length === tenants.length ? filtered.length + ' provedor(es)' : filtered.length + ' de ' + tenants.length;
    if (!out) return;
    if (!filtered.length) {
      if (!tenants.length) {
        out.innerHTML = '<div class="saas-tenants__empty"><i class="bi bi-building"></i><p class="mb-1 fw-semibold">Nenhum provedor cadastrado</p><p class="small mb-0">Clique em <strong>Novo provedor</strong> para criar o primeiro.</p></div>';
      } else {
        out.innerHTML = '<div class="saas-tenants__empty"><i class="bi bi-search"></i><p class="mb-1 fw-semibold">Nenhum resultado</p><p class="small mb-0">Tente outro termo na busca.</p></div>';
      }
      return;
    }
    var html = '<table class="table table-sm table-hover saas-tenants__table"><thead><tr>' +
      '<th>Nome</th><th>Slug</th><th>Status</th><th>Stack</th><th>Containers</th><th>Domínio</th><th>Usuários</th><th>Provisionado</th><th style="width:1%"></th>' +
      '</tr></thead><tbody>';
    filtered.forEach(function(t) {
      var created = t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : '—';
      var statusClass = t.status === 'ACTIVE' ? 'bg-success' : (t.status === 'SUSPENDED' ? 'bg-warning text-dark' : 'bg-secondary');
      var domain = t.custom_domain ? esc(t.custom_domain) : (t.subdomain ? '<em>' + esc(t.subdomain) + '</em>' : '—');
      var stackPath = t.stackPath ? '<code class="small">' + esc(String(t.stackPath).split(/[/\\]/).pop() || t.stackPath) + '</code>' : '—';
      var stackStatus = t.stackStatus;
      var stackBadge = stackStatus === 'running' ? '<span class="badge bg-success">Stack ativo</span>' : (stackStatus === 'error' ? '<span class="badge bg-danger">Erro</span>' : (stackStatus ? '<span class="badge bg-secondary">' + esc(stackStatus) + '</span>' : '—'));
      var provDate = t.lastProvisionedAt ? new Date(t.lastProvisionedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
      var stackCell = stackPath !== '—' ? stackPath + ' ' + stackBadge : stackBadge;
      var slug = (t.slug || '').toString();
      var containers = slug ? '<span class="small" title="pg, portal, site, radius">pg_' + esc(slug) + ', portal_' + esc(slug) + ', site_' + esc(slug) + ', radius_' + esc(slug) + '</span>' : '—';
      html += '<tr><td class="fw-semibold">' + esc(t.name) + '</td><td><code class="small">' + esc(t.slug) + '</code></td>' +
        '<td><span class="badge ' + statusClass + '">' + esc(statusLabel(t.status)) + '</span></td>' +
        '<td class="small">' + stackCell + '</td>' +
        '<td class="small text-muted">' + containers + '</td>' +
        '<td class="small">' + domain + '</td><td>' + (t.users_count != null ? t.users_count : '—') + '</td><td class="text-nowrap small">' + esc(provDate) + '</td>' +
        '<td class="text-end"><button type="button" class="btn btn-sm btn-primary me-1" onclick="return window.openTenantManage(' + t.id + ');"><i class="bi bi-gear me-1"></i>Gerenciar</button>' +
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-tenant-id="' + t.id + '" data-tenant-subdomain="' + esc(t.subdomain || '') + '" data-tenant-custom="' + esc(t.custom_domain || '') + '" data-tenant-status="' + esc(t.status || '') + '" onclick="return window.openTenantDomainModal(this);" title="Domínio"><i class="bi bi-globe"></i></button>' +
        '<button type="button" class="btn btn-sm btn-outline-secondary" onclick="return window.openNginxSnippet(' + t.id + ');" title="Snippet Nginx (path)"><i class="bi bi-file-code"></i></button>' +
        '<button type="button" class="btn btn-sm btn-outline-danger ms-1" data-action-delete-tenant data-tenant-id="' + t.id + '" data-tenant-name="' + esc(String(t.name || t.slug || '')).replace(/"/g, '&quot;') + '" title="Excluir provedor e stack Docker"><i class="bi bi-trash"></i></button></td></tr>';
    });
    html += '</tbody></table>';
    out.innerHTML = html;
  }

  function loadTenants() {
    var out = document.getElementById('outTenants');
    if (!out) return;
    out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Carregando...';
    api('/tenants').then(function(data) {
      tenantsCache = data.tenants || [];
      renderTenantsTable(tenantsCache);
    }).catch(function(err) {
      out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
    });
  }

  document.getElementById('btnLogout').addEventListener('click', function(e) {
    e.preventDefault();
    fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).finally(function() {
      redirectLogin();
    });
  });

  document.querySelectorAll('[data-tab]').forEach(function(a) {
    a.addEventListener('click', function(e) {
      e.preventDefault();
      var tab = a.getAttribute('data-tab');
      document.querySelectorAll('.admin-sidebar__nav a').forEach(function(n) { n.classList.remove('active'); });
      a.classList.add('active');
      document.querySelectorAll('.admin-tab').forEach(function(t) { t.classList.remove('active'); });
      var target = document.getElementById('tab-' + tab);
      if (target) target.classList.add('active');
      if (tab === 'tenants') loadTenants();
      else if (tab === 'overview') loadStats();
      else if (tab === 'radius') loadRadiusStatus();
      else if (tab === 'nas') { loadNasTenantOptions(); loadNasListForSelected(); }
    });
  });

  document.getElementById('btnLoadTenants').addEventListener('click', loadTenants);

  var searchTenantsEl = document.getElementById('tenantsSearch');
  if (searchTenantsEl) searchTenantsEl.addEventListener('input', function() { renderTenantsTable(tenantsCache); });

  document.addEventListener('click', function(e) {
    var btn = e.target && e.target.closest && e.target.closest('[data-action-delete-tenant]');
    if (!btn) return;
    e.preventDefault();
    var id = btn.getAttribute('data-tenant-id');
    var name = btn.getAttribute('data-tenant-name') || '—';
    if (id) window.openTenantDelete(parseInt(id, 10), name);
  });

  document.getElementById('btnConfirmTenantDelete').addEventListener('click', function() {
    var modalEl = document.getElementById('modalTenantDelete');
    var id = modalEl && modalEl.dataset.deleteTenantId;
    var hardEl = document.getElementById('deleteTenantHard');
    if (!id) return;
    var hard = hardEl && hardEl.checked;
    var btn = this;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Excluindo...';
    api('/tenants/' + encodeURIComponent(id) + (hard ? '?hard=1' : ''), { method: 'DELETE' })
      .then(function(data) {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
          var m = bootstrap.Modal.getInstance(modalEl);
          if (m) m.hide();
        }
        loadTenants();
        loadStats();
        if (data.deprovisioning && data.deprovisioning.log && data.deprovisioning.log.length) {
          console.log('[Deprovision]', data.deprovisioning.log.join('\n'));
        }
      })
      .catch(function(err) { alert(err.message || 'Erro ao excluir.'); })
      .finally(function() {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-trash me-1"></i> Excluir';
      });
  });

  var copySlugBtn = document.getElementById('btnCopySlug');
  if (copySlugBtn) copySlugBtn.addEventListener('click', function() {
    var slugEl = document.getElementById('manageSlug');
    if (!slugEl || !slugEl.value) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(slugEl.value).then(function() {
        copySlugBtn.innerHTML = '<i class="bi bi-check"></i>';
        setTimeout(function() { copySlugBtn.innerHTML = '<i class="bi bi-clipboard"></i>'; }, 1500);
      });
    }
  });

  var btnCopyPortalLinkPath = document.getElementById('btnCopyPortalLinkPath');
  if (btnCopyPortalLinkPath) btnCopyPortalLinkPath.addEventListener('click', function() {
    var input = document.getElementById('managePortalLinkPath');
    if (!input || !input.value || input.value === '—') return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(function() {
        var icon = btnCopyPortalLinkPath.querySelector('i');
        if (icon) { icon.className = 'bi bi-check'; setTimeout(function() { icon.className = 'bi bi-clipboard'; }, 1500); }
      });
    }
  });

  var btnCopyNginxSnippet = document.getElementById('btnCopyNginxSnippet');
  if (btnCopyNginxSnippet) btnCopyNginxSnippet.addEventListener('click', function() {
    var preEl = document.getElementById('nginxSnippetPre');
    if (!preEl || !preEl.textContent || preEl.textContent === 'Carregando...') return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(preEl.textContent).then(function() {
        var html = btnCopyNginxSnippet.innerHTML;
        btnCopyNginxSnippet.innerHTML = '<i class="bi bi-check me-1"></i>Copiado!';
        setTimeout(function() { btnCopyNginxSnippet.innerHTML = html; }, 2000);
      });
    }
  });

  var openDomainFromManageBtn = document.getElementById('btnOpenDomainFromManage');
  if (openDomainFromManageBtn) openDomainFromManageBtn.addEventListener('click', function() {
    var id = document.getElementById('manageTenantId') && document.getElementById('manageTenantId').value;
    var sub = document.getElementById('manageSubdomain') && document.getElementById('manageSubdomain').value;
    var custom = document.getElementById('manageCustomDomain') && document.getElementById('manageCustomDomain').value;
    var status = document.getElementById('manageStatus') && document.getElementById('manageStatus').value;
    var fakeBtn = { getAttribute: function(k) { return { 'data-tenant-id': id, 'data-tenant-subdomain': sub || '', 'data-tenant-custom': custom || '', 'data-tenant-status': status || '' }[k]; } };
    window.openTenantDomainModal(fakeBtn);
  });

  var manageStatusEl = document.getElementById('manageStatus');
  var manageBadgeEl = document.getElementById('manageTenantBadge');
  if (manageStatusEl && manageBadgeEl) manageStatusEl.addEventListener('change', function() {
    manageBadgeEl.textContent = statusLabel(manageStatusEl.value);
    manageBadgeEl.className = 'tenant-modal__badge ' + statusBadgeClass(manageStatusEl.value);
  });

  var modalTenant = null;
  var tenantFormFieldsEl = document.getElementById('tenantFormFields');
  var tenantProvisionResultEl = document.getElementById('tenantProvisionResult');
  var tenantProvisionLogEl = document.getElementById('tenantProvisionLog');
  var tenantProvisionMessageEl = document.getElementById('tenantProvisionMessage');
  var tenantProvisionUrlEl = document.getElementById('tenantProvisionUrl');
  var modalTenantFooter = document.getElementById('modalTenantFooter');
  var btnSaveTenantEl = document.getElementById('btnSaveTenant');

  document.getElementById('btnNewTenant').addEventListener('click', function() {
    document.getElementById('tenantName').value = '';
    document.getElementById('tenantSlug').value = '';
    document.getElementById('masterName').value = '';
    document.getElementById('masterEmail').value = '';
    document.getElementById('masterPassword').value = '';
    document.getElementById('tenantFormError').classList.add('d-none');
    if (tenantFormFieldsEl) tenantFormFieldsEl.style.display = '';
    if (tenantProvisionResultEl) tenantProvisionResultEl.classList.add('d-none');
    if (modalTenantFooter) {
      var cancelBtn = modalTenantFooter.querySelector('[data-bs-dismiss="modal"]');
      if (cancelBtn) { cancelBtn.textContent = 'Cancelar'; cancelBtn.style.display = ''; }
    }
    if (btnSaveTenantEl) btnSaveTenantEl.style.display = '';
    if (!modalTenant) modalTenant = new bootstrap.Modal(document.getElementById('modalTenant'));
    modalTenant.show();
  });

  document.getElementById('btnSaveTenant').addEventListener('click', function() {
    var tenantName = (document.getElementById('tenantName').value || '').trim();
    var slug = (document.getElementById('tenantSlug').value || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    var masterName = (document.getElementById('masterName').value || '').trim() || tenantName;
    var masterEmail = (document.getElementById('masterEmail').value || '').trim();
    var masterPassword = (document.getElementById('masterPassword').value || '');

    var errEl = document.getElementById('tenantFormError');
    errEl.classList.add('d-none');
    if (!tenantName) { errEl.textContent = 'Informe o nome do provedor.'; errEl.classList.remove('d-none'); return; }
    if (!slug || slug.length < 2) { errEl.textContent = 'Slug deve ter pelo menos 2 caracteres (ex: provedor-alfa).'; errEl.classList.remove('d-none'); return; }
    if (!/^[a-z0-9-]+$/.test(slug)) { errEl.textContent = 'Slug só pode conter letras minúsculas, números e hífens.'; errEl.classList.remove('d-none'); return; }
    if (!masterEmail) { errEl.textContent = 'Informe o e-mail do Master.'; errEl.classList.remove('d-none'); return; }
    if (masterPassword.length < 6) { errEl.textContent = 'A senha do Master deve ter no mínimo 6 caracteres.'; errEl.classList.remove('d-none'); return; }

    var btn = document.getElementById('btnSaveTenant');
    btn.disabled = true;
    api('/tenants', {
      method: 'POST',
      body: JSON.stringify({
        tenantName: tenantName,
        slug: slug,
        masterName: masterName,
        masterEmail: masterEmail,
        masterPassword: masterPassword
      })
    }).then(function(data) {
      loadTenants();
      loadStats();
      btn.disabled = false;
      var prov = data.provisioning;
      var logLines = (prov && Array.isArray(prov.log)) ? prov.log : [];
      if (tenantProvisionLogEl) tenantProvisionLogEl.textContent = logLines.join('\n') || '(nenhum log)';
      if (tenantProvisionMessageEl) {
        tenantProvisionMessageEl.className = 'alert mb-2 ' + (prov && prov.success ? 'alert-success' : (prov && prov.skipped ? 'alert-warning' : 'alert-danger'));
        tenantProvisionMessageEl.textContent = prov ? (prov.success ? (prov.message || 'Provedor criado. Stack instalado.') : (prov.skipped ? 'Provedor criado. ' + (prov.message || '') : (prov.message || 'Erro na instalação.'))) : 'Provedor criado.';
      }
      if (tenantProvisionUrlEl) {
        if (prov && prov.portalUrl) {
          tenantProvisionUrlEl.innerHTML = 'Acesso ao portal: <a href="' + esc(prov.portalUrl) + '" target="_blank" rel="noopener">' + esc(prov.portalUrl) + '</a>';
          tenantProvisionUrlEl.classList.remove('d-none');
        } else {
          tenantProvisionUrlEl.textContent = '';
          tenantProvisionUrlEl.classList.add('d-none');
        }
      }
      if (tenantProvisionResultEl) tenantProvisionResultEl.classList.remove('d-none');
      if (tenantFormFieldsEl) tenantFormFieldsEl.style.display = 'none';
      if (modalTenantFooter) {
        var cancelBtn = modalTenantFooter.querySelector('[data-bs-dismiss="modal"]');
        if (cancelBtn) cancelBtn.textContent = 'Fechar';
      }
      if (btnSaveTenantEl) btnSaveTenantEl.style.display = 'none';
    }).catch(function(err) {
      errEl.textContent = err.message || 'Erro ao criar provedor.';
      errEl.classList.remove('d-none');
      btn.disabled = false;
    });
  });

  var btnSaveDomain = document.getElementById('btnSaveTenantDomain');
  if (btnSaveDomain) {
    btnSaveDomain.addEventListener('click', function() {
      var id = (document.getElementById('editTenantId') && document.getElementById('editTenantId').value) || '';
      var subdomainRaw = (document.getElementById('editSubdomain') && document.getElementById('editSubdomain').value) || '';
      var customDomainRaw = (document.getElementById('editCustomDomain') && document.getElementById('editCustomDomain').value) || '';
      var status = (document.getElementById('editTenantStatus') && document.getElementById('editTenantStatus').value) || 'ACTIVE';
      var subdomain = subdomainRaw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      var customDomain = customDomainRaw.trim().toLowerCase();

      var errEl = document.getElementById('tenantDomainFormError');
      if (errEl) errEl.classList.add('d-none');

      if (!id) {
        if (errEl) { errEl.textContent = 'Provedor não identificado.'; errEl.classList.remove('d-none'); }
        return;
      }
      var btn = document.getElementById('btnSaveTenantDomain');
      btn.disabled = true;
      api('/tenants/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify({
          subdomain: subdomain || '',
          custom_domain: customDomain || '',
          status: status.trim()
        })
      }).then(function() {
        var modalEl = document.getElementById('modalTenantDomain');
        if (modalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
          var inst = bootstrap.Modal.getInstance(modalEl);
          if (inst && typeof inst.hide === 'function') inst.hide();
        }
        var formEl = document.getElementById('manageTenantForm');
        if (formEl && !formEl.classList.contains('d-none')) {
          var mSub = document.getElementById('manageSubdomain');
          var mCustom = document.getElementById('manageCustomDomain');
          var mStatus = document.getElementById('manageStatus');
          if (mSub) mSub.value = document.getElementById('editSubdomain').value || '';
          if (mCustom) mCustom.value = document.getElementById('editCustomDomain').value || '';
          if (mStatus) mStatus.value = document.getElementById('editTenantStatus').value || 'ACTIVE';
          if (manageBadgeEl) { manageBadgeEl.textContent = statusLabel(mStatus.value); manageBadgeEl.className = 'tenant-modal__badge ' + statusBadgeClass(mStatus.value); }
        }
        loadTenants();
        loadStats();
        btn.disabled = false;
      }).catch(function(err) {
        if (errEl) { errEl.textContent = err.message || 'Erro ao salvar.'; errEl.classList.remove('d-none'); }
        btn.disabled = false;
      });
    });
  }

  var btnSaveManage = document.getElementById('btnSaveTenantManage');
  if (btnSaveManage) {
    btnSaveManage.addEventListener('click', function() {
      var id = (document.getElementById('manageTenantId') && document.getElementById('manageTenantId').value) || '';
      var name = (document.getElementById('manageName') && document.getElementById('manageName').value) || '';
      var status = (document.getElementById('manageStatus') && document.getElementById('manageStatus').value) || 'ACTIVE';
      var subdomain = (document.getElementById('manageSubdomain') && document.getElementById('manageSubdomain').value) || '';
      var customDomain = (document.getElementById('manageCustomDomain') && document.getElementById('manageCustomDomain').value) || '';
      subdomain = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      customDomain = customDomain.trim().toLowerCase();
      var errEl = document.getElementById('manageTenantError');
      if (errEl) errEl.classList.add('d-none');
      if (!id) {
        if (errEl) { errEl.textContent = 'Provedor não identificado.'; errEl.classList.remove('d-none'); }
        return;
      }
      var btn = document.getElementById('btnSaveTenantManage');
      btn.disabled = true;
      api('/tenants/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          status: status.trim(),
          subdomain: subdomain || '',
          custom_domain: customDomain || ''
        })
      }).then(function() {
        var modalEl = document.getElementById('modalTenantManage');
        if (modalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
          var inst = bootstrap.Modal.getInstance(modalEl);
          if (inst && typeof inst.hide === 'function') inst.hide();
        }
        loadTenants();
        loadStats();
        btn.disabled = false;
      }).catch(function(err) {
        if (errEl) { errEl.textContent = err.message || 'Erro ao salvar.'; errEl.classList.remove('d-none'); }
        btn.disabled = false;
      });
    });
  }

  // ---- RADIUS ----
  function loadRadiusStatus() {
    var out = document.getElementById('outRadiusStatus');
    if (!out) return;
    out.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Carregando...';
    api('/radius-status').then(function(data) {
      var g = data.global || {};
      var tenants = data.tenants || [];
      var html = '<p class="mb-2"><strong>RADIUS global (.env):</strong> ';
      if (g.configured) {
        html += '<span class="badge bg-success">Configurado</span> ' + esc(g.host) + ':' + (g.port || 1812);
        if (g.nasIp) html += ' &nbsp; NAS-IP: <code>' + esc(g.nasIp) + '</code>';
      } else {
        html += '<span class="badge bg-secondary">Não configurado</span> ' + (g.message || '');
      }
      html += '</p><p class="mb-0 small text-muted">Provedores com RADIUS em config_json:</p><ul class="list-unstyled small mt-1">';
      if (!tenants.length) html += '<li class="text-muted">Nenhum</li>';
      else tenants.forEach(function(t) {
        html += '<li>' + esc(t.tenantName) + ' (' + esc(t.slug) + '): ';
        if (t.configured) html += '<span class="badge bg-success">OK</span> ' + esc(t.host) + ':' + (t.port || 1812) + (t.nasIp ? ' NAS-IP: ' + esc(t.nasIp) : '');
        else html += '<span class="badge bg-secondary">Não configurado</span>';
        html += '</li>';
      });
      html += '</ul>';
      out.innerHTML = html;
      var sel = document.getElementById('radiusTestTenant');
      if (sel && sel.options.length <= 1) {
        sel.innerHTML = '<option value="">Global (.env)</option>';
        tenants.forEach(function(t) {
          if (t.configured) sel.appendChild(new Option(t.tenantName + ' (' + t.slug + ')', t.tenantId));
        });
      }
    }).catch(function(err) {
      out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
    });
  }

  document.getElementById('btnRadiusTest').addEventListener('click', function() {
    var tenantSel = document.getElementById('radiusTestTenant');
    var tenantId = tenantSel && tenantSel.value ? tenantSel.value : '';
    var user = (document.getElementById('radiusTestUser') && document.getElementById('radiusTestUser').value) || '';
    var pass = (document.getElementById('radiusTestPass') && document.getElementById('radiusTestPass').value) || '';
    var resultEl = document.getElementById('radiusTestResult');
    if (!user) { if (resultEl) { resultEl.innerHTML = '<span class="text-danger">Informe o usuário.</span>'; } return; }
    if (!resultEl) return;
    resultEl.innerHTML = '<span class="text-muted">Testando...</span>';
    var body = { username: user, password: pass };
    if (tenantId) body.tenantId = parseInt(tenantId, 10);
    api('/radius-test', { method: 'POST', body: JSON.stringify(body) }).then(function(data) {
      if (data.success) resultEl.innerHTML = '<span class="text-success"><i class="bi bi-check-circle"></i> Autenticação OK.</span>';
      else resultEl.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle"></i> ' + esc(data.message || 'Falha') + '</span>';
    }).catch(function(err) {
      resultEl.innerHTML = '<span class="text-danger">' + esc(err.message) + '</span>';
    });
  });

  // ---- Concentradores (NAS) ----
  function loadNasTenantOptions() {
    var sel = document.getElementById('nasTenantSelect');
    var radiusSel = document.getElementById('radiusTestTenant');
    if (!sel || sel.options.length > 1) return;
    api('/tenants').then(function(data) {
      var tenants = data.tenants || [];
      sel.innerHTML = '<option value="">Selecione um provedor</option>';
      tenants.forEach(function(t) {
        sel.appendChild(new Option(t.name + ' (' + t.slug + ')', t.id));
      });
      if (radiusSel && radiusSel.options.length <= 1) {
        radiusSel.innerHTML = '<option value="">Global (.env)</option>';
        tenants.forEach(function(t) { radiusSel.appendChild(new Option(t.name + ' (' + t.slug + ')', t.id)); });
      }
    }).catch(function() {});
  }

  function loadNasListForSelected() {
    var sel = document.getElementById('nasTenantSelect');
    var tenantId = sel && sel.value ? sel.value : '';
    var out = document.getElementById('outNasList');
    var btnNew = document.getElementById('btnNewNas');
    if (!out) return;
    if (!tenantId) {
      out.innerHTML = 'Selecione um provedor para listar os concentradores.';
      if (btnNew) btnNew.classList.add('d-none');
      return;
    }
    out.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Carregando...';
    if (btnNew) btnNew.classList.remove('d-none');
    api('/tenants/' + encodeURIComponent(tenantId) + '/nas').then(function(data) {
      var list = data.nas || [];
      if (!list.length) {
        out.innerHTML = '<p class="text-muted mb-0">Nenhum concentrador. Clique em <strong>Novo concentrador</strong>.</p>';
      } else {
        var html = '<div class="table-responsive"><table class="table table-sm admin-table"><thead><tr><th>Nome</th><th>IP</th><th>Descrição</th><th>Ativo</th><th></th></tr></thead><tbody>';
        list.forEach(function(n) {
          var desc = (n.description || '').replace(/"/g, '&quot;');
          html += '<tr><td>' + esc(n.name) + '</td><td><code>' + esc(n.nas_ip) + '</code></td><td class="small">' + esc(n.description || '—') + '</td><td>' + (n.is_active ? '<span class="badge bg-success">Sim</span>' : '<span class="badge bg-secondary">Não</span>') + '</td><td><button type="button" class="btn btn-sm btn-outline-secondary me-1" data-nas-id="' + n.id + '" data-nas-name="' + esc(n.name).replace(/"/g, '&quot;') + '" data-nas-ip="' + esc(n.nas_ip).replace(/"/g, '&quot;') + '" data-nas-desc="' + desc + '" data-nas-active="' + (n.is_active ? '1' : '0') + '" data-action-edit-nas>Editar</button><button type="button" class="btn btn-sm btn-outline-danger" data-nas-id="' + n.id + '" data-action-delete-nas>Excluir</button></td></tr>';
        });
        html += '</tbody></table></div>';
        out.innerHTML = html;
        out.querySelectorAll('[data-action-edit-nas]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var id = this.getAttribute('data-nas-id');
            var name = (this.getAttribute('data-nas-name') || '').replace(/&quot;/g, '"');
            var nasIp = (this.getAttribute('data-nas-ip') || '').replace(/&quot;/g, '"');
            var desc = (this.getAttribute('data-nas-desc') || '').replace(/&quot;/g, '"');
            var active = this.getAttribute('data-nas-active') === '1';
            var tid = document.getElementById('nasTenantSelect').value;
            if (!tid) return;
            document.getElementById('nasId').value = id || '';
            document.getElementById('nasTenantId').value = tid;
            document.getElementById('nasName').value = name;
            document.getElementById('nasIp').value = nasIp;
            document.getElementById('nasDescription').value = desc;
            document.getElementById('nasActive').checked = active;
            document.getElementById('modalNasTitle').textContent = 'Editar concentrador';
            document.getElementById('nasFormError').classList.add('d-none');
            var Modal = typeof bootstrap !== 'undefined' && bootstrap.Modal;
            if (Modal) Modal.getOrCreateInstance(document.getElementById('modalNas')).show();
          });
        });
        out.querySelectorAll('[data-action-delete-nas]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var id = this.getAttribute('data-nas-id');
            var tid = document.getElementById('nasTenantSelect').value;
            if (!tid || !id || !confirm('Excluir este concentrador?')) return;
            api('/tenants/' + encodeURIComponent(tid) + '/nas/' + id, { method: 'DELETE' }).then(function() { loadNasListForSelected(); }).catch(function(err) { alert(err.message); });
          });
        });
      }
    }).catch(function(err) {
      out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
    });
  }

  document.getElementById('nasTenantSelect').addEventListener('change', loadNasListForSelected);

  document.getElementById('btnNewNas').addEventListener('click', function() {
    var tid = document.getElementById('nasTenantSelect').value;
    if (!tid) { alert('Selecione um provedor.'); return; }
    document.getElementById('nasId').value = '';
    document.getElementById('nasTenantId').value = tid;
    document.getElementById('nasName').value = '';
    document.getElementById('nasIp').value = '';
    document.getElementById('nasDescription').value = '';
    document.getElementById('nasActive').checked = true;
    document.getElementById('modalNasTitle').textContent = 'Novo concentrador';
    document.getElementById('nasFormError').classList.add('d-none');
    var Modal = typeof bootstrap !== 'undefined' && bootstrap.Modal;
    if (Modal) Modal.getOrCreateInstance(document.getElementById('modalNas')).show();
  });

  document.getElementById('btnSaveNas').addEventListener('click', function() {
    var id = document.getElementById('nasId').value;
    var tenantId = document.getElementById('nasTenantId').value;
    var name = (document.getElementById('nasName').value || '').trim();
    var nasIp = (document.getElementById('nasIp').value || '').trim();
    var description = (document.getElementById('nasDescription').value || '').trim();
    var isActive = document.getElementById('nasActive').checked;
    var errEl = document.getElementById('nasFormError');
    errEl.classList.add('d-none');
    if (!name) { errEl.textContent = 'Informe o nome.'; errEl.classList.remove('d-none'); return; }
    if (!nasIp) { errEl.textContent = 'Informe o IP do NAS.'; errEl.classList.remove('d-none'); return; }
    var btn = document.getElementById('btnSaveNas');
    btn.disabled = true;
    if (id) {
      api('/tenants/' + encodeURIComponent(tenantId) + '/nas/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ name: name, nas_ip: nasIp, description: description || null, is_active: isActive })
      }).then(function() {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) bootstrap.Modal.getInstance(document.getElementById('modalNas')).hide();
        loadNasListForSelected();
        btn.disabled = false;
      }).catch(function(err) {
        errEl.textContent = err.message || 'Erro ao salvar.'; errEl.classList.remove('d-none');
        btn.disabled = false;
      });
    } else {
      api('/tenants/' + encodeURIComponent(tenantId) + '/nas', {
        method: 'POST',
        body: JSON.stringify({ name: name, nas_ip: nasIp, description: description || null, is_active: isActive })
      }).then(function() {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) bootstrap.Modal.getInstance(document.getElementById('modalNas')).hide();
        loadNasListForSelected();
        btn.disabled = false;
      }).catch(function(err) {
        errEl.textContent = err.message || 'Erro ao criar.'; errEl.classList.remove('d-none');
        btn.disabled = false;
      });
    }
  });

  loadStats();
})();
