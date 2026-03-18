// @ts-nocheck
/**
 * Painel do dono do sistema (standalone) ou Admin do SaaS (multi-tenant).
 * Autenticação: cookie admin_session (login em /admin).
 */
(function() {
  'use strict';

  window.standaloneMode = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function safeAddEvent(el, event, handler) {
    if (el) el.addEventListener(event, handler);
  }

  function getBootstrapModal() {
    return (typeof bootstrap !== 'undefined' && bootstrap.Modal) ? bootstrap.Modal : null;
  }

  function showModal(modalEl) {
    if (!modalEl) return null;
    var Modal = getBootstrapModal();
    if (Modal) {
      var modalInstance = Modal.getOrCreateInstance ? Modal.getOrCreateInstance(modalEl) : new Modal(modalEl);
      modalInstance.show();
      return modalInstance;
    }
    modalEl.classList.add('show');
    modalEl.style.display = 'block';
    document.body.classList.add('modal-open');
    if (!document.querySelector('[data-modal-backdrop="1"]')) {
      var backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop fade show';
      backdrop.setAttribute('data-modal-backdrop', '1');
      document.body.appendChild(backdrop);
    }
    return null;
  }

  function hideModal(modalEl) {
    if (!modalEl) return;
    var Modal = getBootstrapModal();
    if (Modal) {
      var inst = Modal.getInstance ? Modal.getInstance(modalEl) : null;
      if (inst && typeof inst.hide === 'function') {
        inst.hide();
        return;
      }
    }
    modalEl.classList.remove('show');
    modalEl.style.display = 'none';
    document.body.classList.remove('modal-open');
    document.querySelectorAll('[data-modal-backdrop="1"]').forEach(function(el) { el.remove(); });
  }

  function applySaasModeUI() {
    document.querySelectorAll('[data-saas-only]').forEach(function(el) {
      el.classList.remove('d-none');
    });

    var logo = byId('adminSidebarLogo');
    if (logo) logo.innerHTML = '<i class="bi bi-shield-lock"></i> Admin SaaS';

    var navTenants = byId('navTabTenants');
    if (navTenants) navTenants.innerHTML = '<i class="bi bi-building"></i> Provedores (Tenants)';

    var title = byId('adminTopbarTitle');
    if (title) title.textContent = 'Admin do SaaS (multi-tenant)';

    var sub = byId('adminTopbarSubtitle');
    if (sub) sub.textContent = 'Gerenciar provedores e tenants';

    var metricLabel = byId('metricTenantsLabel');
    if (metricLabel) metricLabel.textContent = 'Provedores (tenants)';

    var resumo = byId('overviewResumoText');
    if (resumo) {
      resumo.innerHTML = 'Este painel é o <strong>admin do SaaS</strong>. Aqui você cria e gerencia os <strong>provedores (tenants)</strong>. Cada provedor tem seu próprio Master e equipe, que acessam o <strong>Portal do Provedor</strong> em <a href="/portal" target="_blank">/portal</a> com login por e-mail e senha.';
      if (!byId('overviewResumoExtra')) {
        resumo.insertAdjacentHTML(
          'afterend',
          '<p class="mt-3 mb-0 small text-muted" id="overviewResumoExtra">Use o menu <strong>Provedores (Tenants)</strong> para listar e criar novos provedores.</p>'
        );
      }
    }

    var panelTitle = byId('tenantsPanelTitle');
    if (panelTitle) panelTitle.textContent = 'Provedores (Tenants)';
  }

  window.openTenantDomainModal = function(btn) {
    if (!btn || typeof btn.getAttribute !== 'function') return false;

    var id = btn.getAttribute('data-tenant-id');
    var sub = (btn.getAttribute('data-tenant-subdomain') || '').replace(/&amp;/g, '&');
    var custom = (btn.getAttribute('data-tenant-custom') || '').replace(/&amp;/g, '&');
    var status = btn.getAttribute('data-tenant-status') || 'ACTIVE';

    var editId = byId('editTenantId');
    var editSub = byId('editSubdomain');
    var editCustom = byId('editCustomDomain');
    var editStatus = byId('editTenantStatus');
    var errEl = byId('tenantDomainFormError');
    var modalEl = byId('modalTenantDomain');

    if (!modalEl || !editId || !editSub || !editCustom || !editStatus) return false;

    editId.value = id || '';
    editSub.value = sub;
    editCustom.value = custom;
    editStatus.value = status;
    if (errEl) errEl.classList.add('d-none');

    showModal(modalEl);
    return false;
  };

  var btnNginxSnippetAll = byId('btnNginxSnippetAll');
  safeAddEvent(btnNginxSnippetAll, 'click', function() {
    var modalEl = byId('modalNginxSnippet');
    var preEl = byId('nginxSnippetPre');
    var noteEl = byId('nginxSnippetNote');
    if (!modalEl || !preEl) return;

    preEl.textContent = 'Carregando...';
    if (noteEl) {
      noteEl.classList.add('d-none');
      noteEl.textContent = '';
    }

    api('/nginx-snippet').then(function(data) {
      preEl.textContent = data.snippet || '(Nenhum tenant com sitePort e adminPort provisionados.)';
      if (data.note && noteEl) {
        noteEl.textContent = data.note;
        noteEl.classList.remove('d-none');
      } else if (data.skipped && data.skipped.length && noteEl) {
        noteEl.textContent = 'Omitidos: ' + data.skipped.map(function(s) {
          return s.slug + ' (' + s.reason + ')';
        }).join(', ');
        noteEl.classList.remove('d-none');
      }
      showModal(modalEl);
    }).catch(function(err) {
      preEl.textContent = 'Erro: ' + (err.message || 'não foi possível carregar.');
      showModal(modalEl);
    });
  });

  window.openNginxSnippet = function(tenantId) {
    var modalEl = byId('modalNginxSnippet');
    var preEl = byId('nginxSnippetPre');
    var noteEl = byId('nginxSnippetNote');
    if (!modalEl || !preEl) return false;

    preEl.textContent = 'Carregando...';
    if (noteEl) {
      noteEl.classList.add('d-none');
      noteEl.textContent = '';
    }

    api('/tenants/' + tenantId + '/nginx-snippet').then(function(data) {
      preEl.textContent = data.snippet || '(vazio)';
      if (data.note && noteEl) {
        noteEl.textContent = data.note;
        noteEl.classList.remove('d-none');
      }
      showModal(modalEl);
    }).catch(function(err) {
      preEl.textContent = 'Erro: ' + (err.message || 'não foi possível carregar o snippet.');
      showModal(modalEl);
    });

    return false;
  };

  function statusBadgeClass(status) {
    return status === 'ACTIVE'
      ? 'tenant-modal__badge--active'
      : (status === 'SUSPENDED'
          ? 'tenant-modal__badge--suspended'
          : (status === 'TRIAL'
              ? 'tenant-modal__badge--trial'
              : 'tenant-modal__badge--cancelled'));
  }

  function statusLabel(s) {
    return {
      ACTIVE: 'Ativo',
      SUSPENDED: 'Suspenso',
      TRIAL: 'Trial',
      CANCELLED: 'Cancelado'
    }[s] || s;
  }

  function stackStatusLabel(s) {
    return {
      running: 'Stack ativo',
      provisioning: 'Provisionando',
      pending: 'Pendente',
      error: 'Erro',
      stopped: 'Parado'
    }[s] || (s || '—');
  }

  function stackStatusBadgeClass(s) {
    if (s === 'running') return 'badge bg-success';
    if (s === 'provisioning') return 'badge bg-info text-dark';
    if (s === 'pending') return 'badge bg-secondary';
    if (s === 'error') return 'badge bg-danger';
    if (s === 'stopped') return 'badge bg-warning text-dark';
    return 'badge bg-secondary';
  }

  window.openTenantManage = function(tenantId) {
    var modalEl = byId('modalTenantManage');
    var loadingEl = byId('manageTenantLoading');
    var formEl = byId('manageTenantForm');
    var saveBtn = byId('btnSaveTenantManage');

    if (!modalEl || !loadingEl || !formEl) return false;

    var manageTenantIdEl = byId('manageTenantId');
    if (manageTenantIdEl) manageTenantIdEl.value = tenantId;

    formEl.classList.add('d-none');
    if (saveBtn) saveBtn.classList.add('d-none');
    loadingEl.classList.remove('d-none');

    showModal(modalEl);

    api('/tenants/' + encodeURIComponent(tenantId)).then(function(data) {
      loadingEl.classList.add('d-none');

      var t = data.tenant;
      var users = data.users || [];
      if (!t) {
        formEl.classList.remove('d-none');
        return;
      }

      var manageName = byId('manageName');
      var manageSlug = byId('manageSlug');
      var manageStatus = byId('manageStatus');
      var manageSubdomain = byId('manageSubdomain');
      var manageCustomDomain = byId('manageCustomDomain');

      if (manageName) manageName.value = t.name || '';
      if (manageSlug) manageSlug.value = t.slug || '';
      if (manageStatus) manageStatus.value = t.status || 'ACTIVE';
      if (manageSubdomain) manageSubdomain.value = t.subdomain || '';
      if (manageCustomDomain) manageCustomDomain.value = t.custom_domain || '';

      var nameEl = byId('manageTenantNameDisplay');
      if (nameEl) nameEl.textContent = t.name || t.slug || 'Provedor';

      var badgeEl = byId('manageTenantBadge');
      if (badgeEl) {
        badgeEl.textContent = statusLabel(t.status);
        badgeEl.className = 'tenant-modal__badge ' + statusBadgeClass(t.status);
      }

      var slug = (t.slug || '').toString();
      var origin = window.location.origin;
      var portalPathUrl;
      var sitePathUrl;

      if (window.standaloneMode) {
        portalPathUrl = origin + '/portal/';
        sitePathUrl = origin + '/';
      } else {
        portalPathUrl = slug ? (origin + '/' + slug + '/portal/') : '';
        sitePathUrl = slug ? (origin + '/' + slug + '/') : '';
      }

      var pathInput = byId('managePortalLinkPath');
      if (pathInput) pathInput.value = portalPathUrl || '—';

      var siteLinkEl = byId('manageSiteLinkPath');
      if (siteLinkEl) siteLinkEl.textContent = sitePathUrl || '—';

      var portalLink = byId('manageTenantPortalLink');
      if (portalLink) {
        portalLink.href = t.custom_domain ? ('https://' + t.custom_domain + '/portal/') : (portalPathUrl || '/portal');
        portalLink.title = t.custom_domain ? 'Abrir em ' + t.custom_domain : (portalPathUrl ? 'Abrir portal (por path)' : 'Portal');
      }

      var tbody = byId('manageTenantUsers');
      if (tbody) {
        tbody.innerHTML = users.length ? users.map(function(u) {
          return '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td>' +
            '<td>' + (u.is_master ? '<span class="badge bg-primary">Master</span>' : '—') + '</td>' +
            '<td>' + (u.is_active ? '<span class="text-success">Sim</span>' : 'Não') + '</td></tr>';
        }).join('') : '<tr><td colspan="4" class="text-muted text-center py-3">Nenhum usuário</td></tr>';
      }

      var manageErrEl = byId('manageTenantError');
      if (manageErrEl) manageErrEl.classList.add('d-none');

      formEl.classList.remove('d-none');
      if (saveBtn) saveBtn.classList.remove('d-none');

      var nativeSection = byId('manageStackNativeSection');
      var dockerSection = byId('manageStackDockerSection');
      var logsSection = byId('manageStackLogsSection');

      if (window.standaloneMode) {
        if (nativeSection) nativeSection.classList.remove('d-none');
        if (dockerSection) dockerSection.classList.add('d-none');
        if (logsSection) logsSection.classList.add('d-none');
      } else {
        if (nativeSection) nativeSection.classList.add('d-none');
        if (dockerSection) dockerSection.classList.remove('d-none');
        if (logsSection) logsSection.classList.remove('d-none');
      }

      if (window.standaloneMode) {
        api('/installation-info').then(function(info) {
          var r = info.radius;
          var radiusSecretEl = byId('manageRadiusSecret');
          var radiusHostPortEl = byId('manageRadiusHostPort');
          var radiusNasIpPortEl = byId('manageRadiusNasIpPort');

          if (radiusSecretEl && r && r.secret) {
            radiusSecretEl.value = r.secret;
            radiusSecretEl.dataset.secret = r.secret;
          }

          if (radiusHostPortEl) {
            if (r && r.host) {
              radiusHostPortEl.textContent = r.host + ' (auth ' + (r.port || 1812) + ', acct ' + (r.port ? r.port + 1 : 1813) + ')';
            } else {
              radiusHostPortEl.textContent = 'RADIUS global não configurado (.env: RADIUS_HOST, RADIUS_SECRET).';
            }
          }

          if (radiusNasIpPortEl && r && r.host) {
            radiusNasIpPortEl.textContent = 'NAS → ' + r.host + ' (UDP ' + (r.port || 1812) + ' auth / ' + (r.port ? r.port + 1 : 1813) + ' acct)';
          }
        }).catch(function() {});
      } else {
        api('/tenants/' + encodeURIComponent(tenantId) + '/provisioning').then(function(pdata) {
          var prov = pdata.provisioning || null;
          var pathEl = byId('manageStackPath');
          var statusEl = byId('manageStackStatus');
          var portsEl = byId('manageStackPorts');
          var dbEl = byId('manageStackDb');
          var logEl = byId('manageStackLastLog');
          var radiusSecretEl = byId('manageRadiusSecret');
          var radiusHostPortEl = byId('manageRadiusHostPort');
          var radiusNasIpPortEl = byId('manageRadiusNasIpPort');

          if (!prov) {
            if (pathEl) pathEl.textContent = '—';
            if (statusEl) statusEl.innerHTML = '<span class="badge bg-secondary">Sem stack provisionado</span>';
            if (portsEl) portsEl.textContent = 'Nenhuma porta registrada.';
            if (dbEl) dbEl.textContent = '—';
            if (logEl) logEl.textContent = 'Nunca provisionado.';
            if (radiusSecretEl) {
              radiusSecretEl.value = '—';
              radiusSecretEl.dataset.secret = '';
            }
            if (radiusHostPortEl) radiusHostPortEl.textContent = 'Carregando RADIUS global…';
            if (radiusNasIpPortEl) radiusNasIpPortEl.textContent = '—';

            api('/installation-info').then(function(info) {
              var r = info.radius;
              if (radiusSecretEl && r && r.secret) {
                radiusSecretEl.value = r.secret;
                radiusSecretEl.dataset.secret = r.secret;
              }
              if (radiusHostPortEl) {
                if (r && r.host) {
                  radiusHostPortEl.textContent = r.host + ' (auth ' + (r.port || 1812) + ', acct ' + (r.port ? r.port + 1 : 1813) + ')';
                } else {
                  radiusHostPortEl.textContent = 'RADIUS global não configurado (.env: RADIUS_HOST, RADIUS_SECRET).';
                }
              }
              if (radiusNasIpPortEl && r && r.host) {
                radiusNasIpPortEl.textContent = 'NAS → ' + r.host + ' (UDP ' + (r.port || 1812) + ' auth / ' + (r.port ? r.port + 1 : 1813) + ' acct)';
              }
            }).catch(function() {
              if (radiusHostPortEl) radiusHostPortEl.textContent = 'RADIUS global não configurado ou indisponível.';
            });
            return;
          }

          var ports = prov.ports || {};
          if (pathEl) pathEl.textContent = prov.stackPath || '—';

          if (statusEl) {
            var st = prov.status || 'pending';
            statusEl.innerHTML = '<span class="' + stackStatusBadgeClass(st) + '">' + esc(stackStatusLabel(st)) + '</span>';
          }

          if (portsEl) {
            var parts = [];
            if (ports.sitePort) parts.push('Site/Portal: 127.0.0.1:' + ports.sitePort);
            if (ports.adminPort && ports.adminPort !== ports.sitePort) parts.push('Portal admin: 127.0.0.1:' + ports.adminPort);
            if (ports.pgHostPort) parts.push('Postgres: 127.0.0.1:' + ports.pgHostPort);
            if (ports.radiusAuthPort) parts.push('RADIUS auth (UDP): ' + ports.radiusAuthPort);
            if (ports.radiusAcctPort) parts.push('RADIUS acct (UDP): ' + ports.radiusAcctPort);
            portsEl.textContent = parts.length ? parts.join(' | ') : 'Nenhuma porta registrada.';
          }

          if (dbEl) {
            var dbInfo = [];
            if (prov.dbName) dbInfo.push('DB: ' + prov.dbName);
            if (prov.dbUser) dbInfo.push('User: ' + prov.dbUser);
            if (prov.dbPass) dbInfo.push('Senha definida');
            dbEl.textContent = dbInfo.length ? dbInfo.join(' | ') : 'Não informado.';
          }

          if (logEl) {
            var ts = prov.lastProvisionedAt ? new Date(prov.lastProvisionedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;
            var msg = prov.lastLog || 'Sem mensagens registradas.';
            logEl.textContent = (ts ? ts + ' — ' : '') + msg;
          }

          if (radiusSecretEl) {
            if (prov.radiusSecret) {
              radiusSecretEl.value = prov.radiusSecret;
              radiusSecretEl.dataset.secret = prov.radiusSecret;
            } else {
              radiusSecretEl.value = '—';
              delete radiusSecretEl.dataset.secret;
            }
          }

          if (radiusHostPortEl) {
            if (ports.radiusAuthPort) {
              radiusHostPortEl.textContent = '127.0.0.1:' + ports.radiusAuthPort + ' (auth) / 127.0.0.1:' + (ports.radiusAcctPort || '?') + ' (acct)';
            } else {
              radiusHostPortEl.textContent = 'Sem portas RADIUS registradas neste stack.';
            }
          }

          if (radiusNasIpPortEl) {
            if (ports.radiusAuthPort) {
              radiusNasIpPortEl.textContent = 'NAS → servidor SaaS, porta ' + ports.radiusAuthPort + ' (UDP auth) / ' + (ports.radiusAcctPort || '?') + ' (UDP acct)';
            } else {
              radiusNasIpPortEl.textContent = 'Configure o NAS apontando para o IP do servidor SaaS.';
            }
          }
        }).catch(function() {
          var statusEl = byId('manageStackStatus');
          var logEl = byId('manageStackLastLog');
          if (statusEl) statusEl.innerHTML = '<span class="badge bg-secondary">Indisponível</span>';
          if (logEl) logEl.textContent = 'Não foi possível ler o status do stack.';
        });
      }

      api('/tenants/' + encodeURIComponent(tenantId) + '/nas').then(function(data) {
        var list = data.nas || [];
        var outNas = byId('manageRadiusNasList');
        if (!outNas) return;

        if (!list.length) {
          outNas.innerHTML = '<span class="text-muted">Nenhum NAS cadastrado para este provedor.</span>';
          return;
        }

        var html = '<div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Nome</th><th>IP</th><th>Descrição</th><th>Ativo</th></tr></thead><tbody>';
        list.forEach(function(n) {
          html += '<tr><td>' + esc(n.name) + '</td><td><code>' + esc(n.nas_ip) + '</code></td><td class="small">' + esc(n.description || '—') + '</td><td>' + (n.is_active ? '<span class="badge bg-success">Sim</span>' : '<span class="badge bg-secondary">Não</span>') + '</td></tr>';
        });
        html += '</tbody></table></div>';
        outNas.innerHTML = html;
      }).catch(function() {
        var outNas = byId('manageRadiusNasList');
        if (outNas) outNas.innerHTML = '<span class="text-danger">Não foi possível carregar as NAS deste provedor.</span>';
      });

      api('/tenants/' + encodeURIComponent(tenantId) + '/metrics').then(function(data) {
        var m = data.metrics || {};
        var cEl = byId('metricTenantCustomers');
        var pEl = byId('metricTenantPppoe');
        var bEl = byId('metricTenantBandwidth');
        var rEl = byId('metricTenantRevenue');

        if (cEl) cEl.textContent = m.customersActive != null ? m.customersActive : '—';
        if (pEl) pEl.textContent = m.pppoeOnline != null ? m.pppoeOnline : '—';
        if (bEl) bEl.textContent = m.bandwidthMbps != null ? (m.bandwidthMbps + ' Mbps') : '—';

        if (rEl) {
          if (m.revenueMonth != null) {
            var val = Number(m.revenueMonth) || 0;
            rEl.textContent = 'R$ ' + val.toFixed(2).replace('.', ',');
          } else {
            rEl.textContent = '—';
          }
        }
      }).catch(function() {
        var cEl = byId('metricTenantCustomers');
        var pEl = byId('metricTenantPppoe');
        var bEl = byId('metricTenantBandwidth');
        var rEl = byId('metricTenantRevenue');
        if (cEl) cEl.textContent = '—';
        if (pEl) pEl.textContent = '—';
        if (bEl) bEl.textContent = '—';
        if (rEl) rEl.textContent = '—';
      });
    }).catch(function(err) {
      loadingEl.classList.add('d-none');
      formEl.classList.remove('d-none');
      var errEl = byId('manageTenantError');
      if (errEl) {
        errEl.textContent = err.message || 'Erro ao carregar.';
        errEl.classList.remove('d-none');
      }
      if (saveBtn) saveBtn.classList.add('d-none');
    });

    return false;
  };

  window.openTenantDelete = function(tenantId, tenantName) {
    var modalEl = byId('modalTenantDelete');
    var nameEl = byId('deleteTenantName');
    var hardEl = byId('deleteTenantHard');

    if (!modalEl || !nameEl) return false;

    nameEl.textContent = tenantName || '—';
    if (hardEl) hardEl.checked = false;
    modalEl.dataset.deleteTenantId = String(tenantId);

    showModal(modalEl);
    return false;
  };

  function redirectLogin() {
    window.location.href = '/admin';
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function(m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m];
    });
  }

  function api(path, opts) {
    opts = opts || {};
    var url = '/api/saas' + path;
    var headers = opts.headers || {};

    if (opts.body && typeof opts.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }

    return fetch(url, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body,
      credentials: 'same-origin'
    }).then(function(res) {
      return res.json().catch(function() {
        return {};
      }).then(function(data) {
        if (res.status === 401) {
          redirectLogin();
          throw new Error('Sessão expirada.');
        }
        if (!res.ok) throw new Error(data.error || data.message || 'Erro');
        return data;
      });
    });
  }

  api('/standalone').then(function(data) {
    window.standaloneMode = !!data.standalone;
    if (!window.standaloneMode) applySaasModeUI();
  }).catch(function() {
    window.standaloneMode = false;
    applySaasModeUI();
  });

  function loadStats() {
    api('/tenants').then(function(data) {
      var tenants = data.tenants || [];
      var el = byId('metricTenants');
      if (el) {
        if (window.standaloneMode && tenants.length === 1) {
          el.textContent = (tenants[0].name || 'Provedor').substring(0, 24);
        } else {
          el.textContent = tenants.length;
        }
      }
    }).catch(function() {
      var el = byId('metricTenants');
      if (el) el.textContent = '—';
    });
  }

  var lastProviderInfo = { name: '', slug: '', masterEmail: '' };

  function loadProviderInfo() {
    var placeholder = byId('providerInfoPlaceholder');
    var grid = byId('providerInfoGrid');
    var formEl = byId('providerInfoForm');
    var btnEdit = byId('btnEditProvider');
    var provSection = byId('providerSettingsSection');

    if (!placeholder || !grid) return;

    placeholder.classList.remove('d-none');
    grid.classList.add('d-none');
    if (formEl) formEl.classList.add('d-none');
    if (btnEdit) btnEdit.classList.add('d-none');
    if (provSection) provSection.classList.add('d-none');
    placeholder.textContent = 'Carregando...';

    api('/installation-info').then(function(data) {
      if (!data.tenant) {
        placeholder.textContent = 'Nenhum provedor cadastrado nesta instalação.';
        return;
      }

      lastProviderInfo = {
        name: data.tenant.name || '',
        slug: data.tenant.slug || '',
        masterEmail: data.masterEmail || ''
      };

      placeholder.classList.add('d-none');
      grid.classList.remove('d-none');
      if (formEl) formEl.classList.add('d-none');
      if (btnEdit) btnEdit.classList.remove('d-none');
      if (provSection) provSection.classList.remove('d-none');

      var nameEl = byId('providerInfoName');
      var slugEl = byId('providerInfoSlug');
      var masterEl = byId('providerInfoMasterEmail');
      var portalLinkEl = byId('providerInfoPortalLink');
      var portalUrl = data.portalUrl || (window.location.origin + '/portal/');

      if (nameEl) nameEl.textContent = data.tenant.name || '—';
      if (slugEl) slugEl.textContent = data.tenant.slug || '—';

      if (masterEl) {
        masterEl.textContent = data.masterEmail || '—';
        masterEl.href = data.masterEmail ? 'mailto:' + data.masterEmail : '#';
      }

      if (portalLinkEl) {
        portalLinkEl.href = portalUrl;
        portalLinkEl.textContent = portalUrl;
      }

      var hostEl = byId('providerInfoRadiusHost');
      var portsEl = byId('providerInfoRadiusPorts');
      var secretEl = byId('providerInfoRadiusSecret');

      if (data.radius) {
        if (hostEl) hostEl.textContent = data.radius.host || '—';
        if (portsEl) portsEl.textContent = '(auth ' + (data.radius.port || 1812) + ', acct ' + (data.radius.port ? data.radius.port + 1 : 1813) + ')';
        if (secretEl) secretEl.textContent = data.radius.secret || '—';
        window._providerInfoRadiusSecret = data.radius.secret || '';
      } else {
        if (hostEl) hostEl.textContent = 'Não configurado (RADIUS_HOST e RADIUS_SECRET no .env)';
        if (portsEl) portsEl.textContent = '';
        if (secretEl) secretEl.textContent = '—';
        window._providerInfoRadiusSecret = '';
      }

      var btnCopyPortal = byId('btnCopyPortal');
      var btnCopyRadius = byId('btnCopyRadius');
      if (btnCopyPortal) btnCopyPortal.onclick = function() { copyToClipboard(portalUrl); };
      if (btnCopyRadius) btnCopyRadius.onclick = function() { copyToClipboard(window._providerInfoRadiusSecret || ''); };
    }).catch(function() {
      placeholder.textContent = 'Erro ao carregar informações do provedor.';
    });
  }

  function showProviderEditForm() {
    var grid = byId('providerInfoGrid');
    var formEl = byId('providerInfoForm');
    var nameInput = byId('editProviderName');
    var slugInput = byId('editProviderSlug');
    var emailInput = byId('editProviderMasterEmail');
    var errEl = byId('providerEditError');

    if (!grid || !formEl) return;

    if (nameInput) nameInput.value = lastProviderInfo.name;
    if (slugInput) slugInput.value = lastProviderInfo.slug;
    if (emailInput) emailInput.value = lastProviderInfo.masterEmail;
    if (errEl) {
      errEl.classList.add('d-none');
      errEl.textContent = '';
    }

    grid.classList.add('d-none');
    formEl.classList.remove('d-none');
  }

  function hideProviderEditForm() {
    var grid = byId('providerInfoGrid');
    var formEl = byId('providerInfoForm');
    if (grid) grid.classList.remove('d-none');
    if (formEl) formEl.classList.add('d-none');
  }

  var btnEditProvider = byId('btnEditProvider');
  safeAddEvent(btnEditProvider, 'click', showProviderEditForm);

  var btnCancelEditProvider = byId('btnCancelEditProvider');
  safeAddEvent(btnCancelEditProvider, 'click', hideProviderEditForm);

  var btnSaveProvider = byId('btnSaveProvider');
  safeAddEvent(btnSaveProvider, 'click', function() {
    var nameInput = byId('editProviderName');
    var slugInput = byId('editProviderSlug');
    var emailInput = byId('editProviderMasterEmail');
    var errEl = byId('providerEditError');

    var name = (nameInput && nameInput.value) ? nameInput.value.trim() : '';
    var slug = (slugInput && slugInput.value)
      ? slugInput.value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      : '';
    var masterEmail = (emailInput && emailInput.value) ? emailInput.value.trim().toLowerCase() : '';

    if (errEl) {
      errEl.classList.add('d-none');
      errEl.textContent = '';
    }

    if (!name && !slug && !masterEmail) {
      if (errEl) {
        errEl.textContent = 'Preencha ao menos um campo.';
        errEl.classList.remove('d-none');
      }
      return;
    }

    var payload = {};
    if (name) payload.name = name;
    if (slug) payload.slug = slug;
    if (masterEmail) payload.masterEmail = masterEmail;

    if (Object.keys(payload).length === 0) {
      hideProviderEditForm();
      return;
    }

    btnSaveProvider.disabled = true;
    api('/installation', { method: 'PUT', body: JSON.stringify(payload) }).then(function() {
      loadProviderInfo();
      loadTenants();
      hideProviderEditForm();
    }).catch(function(err) {
      if (errEl) {
        errEl.textContent = err.message || 'Erro ao salvar.';
        errEl.classList.remove('d-none');
      }
    }).finally(function() {
      btnSaveProvider.disabled = false;
    });
  });

  function updateLogoPreview(fieldId) {
    var input = byId(fieldId);
    var previewId = fieldId + 'Preview';
    var wrapId = fieldId + 'PreviewWrap';
    var img = byId(previewId);
    var wrap = byId(wrapId);

    if (!input || !img || !wrap) return;

    var url = (input.value || '').trim();
    if (url) {
      img.src = url;
      img.onerror = function() { wrap.style.display = 'none'; };
      img.onload = function() { wrap.style.display = 'block'; };
      wrap.style.display = 'block';
    } else {
      img.removeAttribute('src');
      wrap.style.display = 'none';
    }
  }

  function doLogoUpload(fileInputId, type, urlInputId) {
    var fileInput = byId(fileInputId);
    var urlInput = byId(urlInputId);

    if (!fileInput || !urlInput || !fileInput.files || !fileInput.files.length) return;

    var file = fileInput.files[0];
    var formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    var btn = byId('btnAdminProvLogoPortalUpload');
    if (type === 'site') btn = byId('btnAdminProvLogoSiteUpload');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    }

    fetch('/api/saas/upload-logo', {
      method: 'POST',
      body: formData,
      credentials: 'same-origin'
    }).then(function(r) {
      return r.json().then(function(data) {
        if (!r.ok) throw new Error(data.message || 'Falha no upload');
        return data;
      });
    }).then(function(data) {
      if (data.url) {
        urlInput.value = data.url;
        updateLogoPreview(urlInputId);
      }
      fileInput.value = '';
    }).catch(function(err) {
      alert(err.message || 'Erro ao enviar logo.');
    }).finally(function() {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-upload me-1"></i> Enviar';
      }
    });
  }

  function loadAdminProviderSettings() {
    var errEl = byId('adminProviderFormError');
    if (errEl) {
      errEl.classList.add('d-none');
      errEl.textContent = '';
    }

    api('/installation-provider').then(function(data) {
      var s = data.settings || {};

      var set = function(id, val) {
        var el = byId(id);
        if (el) el.value = val != null ? val : '';
      };

      set('adminProvFantasyName', s.fantasy_name);
      set('adminProvLegalName', s.legal_name);
      set('adminProvDocument', s.document);
      set('adminProvIE', s.ie);
      set('adminProvIM', s.im);
      set('adminProvWhatsapp', s.whatsapp);
      set('adminProvPhone', s.phone);
      set('adminProvEmail', s.email);
      set('adminProvWebsite', s.website);
      set('adminProvStreet', s.street);
      set('adminProvNumber', s.number);
      set('adminProvComplement', s.complement);
      set('adminProvNeighborhood', s.neighborhood);
      set('adminProvCity', s.city);
      set('adminProvState', s.state);
      set('adminProvZip', s.zip);
      set('adminProvLogoPortal', s.logo_portal);
      set('adminProvLogoSite', s.logo_site);
      set('adminProvLogoReceipt', s.logo_receipt);
      set('adminProvColorPrimary', s.color_primary || '#0d3a5c');
      set('adminProvColorAccent', s.color_accent || '#0b5ed7');
      set('adminProvShortName', s.short_name);
      set('adminProvTimezone', s.timezone);

      updateLogoPreview('adminProvLogoPortal');
      updateLogoPreview('adminProvLogoSite');
    }).catch(function(err) {
      if (errEl) {
        errEl.textContent = err.message || 'Erro ao carregar dados do provedor.';
        errEl.classList.remove('d-none');
      }
    });
  }

  function collectAdminProviderPayload() {
    var get = function(id) {
      var el = byId(id);
      return (el && el.value) ? el.value.trim() : '';
    };

    return {
      fantasy_name: get('adminProvFantasyName') || null,
      legal_name: get('adminProvLegalName') || null,
      document: get('adminProvDocument').replace(/\D/g, '') || null,
      ie: get('adminProvIE') || null,
      im: get('adminProvIM') || null,
      whatsapp: get('adminProvWhatsapp') || null,
      phone: get('adminProvPhone') || null,
      email: get('adminProvEmail') || null,
      website: get('adminProvWebsite') || null,
      street: get('adminProvStreet') || null,
      number: get('adminProvNumber') || null,
      complement: get('adminProvComplement') || null,
      neighborhood: get('adminProvNeighborhood') || null,
      city: get('adminProvCity') || null,
      state: get('adminProvState').toUpperCase() || null,
      zip: get('adminProvZip').replace(/\D/g, '') || null,
      logo_portal: get('adminProvLogoPortal') || null,
      logo_site: get('adminProvLogoSite') || null,
      logo_receipt: get('adminProvLogoReceipt') || null,
      color_primary: get('adminProvColorPrimary') || null,
      color_accent: get('adminProvColorAccent') || null,
      short_name: get('adminProvShortName') || null,
      timezone: get('adminProvTimezone') || null
    };
  }

  safeAddEvent(byId('btnAdminProvLogoPortalUpload'), 'click', function() {
    var input = byId('adminProvLogoPortalFile');
    if (input) input.click();
  });

  safeAddEvent(byId('adminProvLogoPortalFile'), 'change', function() {
    doLogoUpload('adminProvLogoPortalFile', 'portal', 'adminProvLogoPortal');
  });

  safeAddEvent(byId('btnAdminProvLogoSiteUpload'), 'click', function() {
    var input = byId('adminProvLogoSiteFile');
    if (input) input.click();
  });

  safeAddEvent(byId('adminProvLogoSiteFile'), 'change', function() {
    doLogoUpload('adminProvLogoSiteFile', 'site', 'adminProvLogoSite');
  });

  safeAddEvent(byId('adminProvLogoPortal'), 'input', function() {
    updateLogoPreview('adminProvLogoPortal');
  });

  safeAddEvent(byId('adminProvLogoSite'), 'input', function() {
    updateLogoPreview('adminProvLogoSite');
  });

  var btnAdminProviderReload = byId('btnAdminProviderReload');
  safeAddEvent(btnAdminProviderReload, 'click', loadAdminProviderSettings);

  var btnAdminProviderSave = byId('btnAdminProviderSave');
  safeAddEvent(btnAdminProviderSave, 'click', function() {
    var errEl = byId('adminProviderFormError');
    if (errEl) {
      errEl.classList.add('d-none');
      errEl.textContent = '';
    }

    var payload = collectAdminProviderPayload();
    if (!payload.fantasy_name && !payload.legal_name) {
      if (errEl) {
        errEl.textContent = 'Informe pelo menos o nome fantasia ou razão social.';
        errEl.classList.remove('d-none');
      }
      return;
    }

    btnAdminProviderSave.disabled = true;
    api('/installation-provider', { method: 'PUT', body: JSON.stringify(payload) }).then(function() {
      loadAdminProviderSettings();
    }).catch(function(err) {
      if (errEl) {
        errEl.textContent = err.message || 'Erro ao salvar.';
        errEl.classList.remove('d-none');
      }
    }).finally(function() {
      btnAdminProviderSave.disabled = false;
    });
  });

  function copyToClipboard(text) {
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {}).catch(function() {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  var tenantsCache = [];

  function renderTenantsTable(tenants) {
    var out = byId('outTenants');
    var searchEl = byId('tenantsSearch');
    var countEl = byId('tenantsCountText');
    var term = ((searchEl && searchEl.value) || '').trim().toLowerCase();

    var filtered = term ? tenants.filter(function(t) {
      return (t.name && t.name.toLowerCase().indexOf(term) >= 0) ||
             (t.slug && t.slug.toLowerCase().indexOf(term) >= 0);
    }) : tenants;

    if (countEl) {
      countEl.textContent = filtered.length === tenants.length
        ? (filtered.length + ' provedor(es)')
        : (filtered.length + ' de ' + tenants.length);
    }

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
      var statusClass = t.status === 'ACTIVE'
        ? 'bg-success'
        : (t.status === 'SUSPENDED' ? 'bg-warning text-dark' : 'bg-secondary');

      var domain = t.custom_domain
        ? esc(t.custom_domain)
        : (t.subdomain ? '<em>' + esc(t.subdomain) + '</em>' : '—');

      var stackPath = t.stackPath
        ? '<code class="small">' + esc(String(t.stackPath).split(/[/\\]/).pop() || t.stackPath) + '</code>'
        : '—';

      var stackStatus = t.stackStatus;
      var stackBadge = stackStatus === 'running'
        ? '<span class="badge bg-success">Stack ativo</span>'
        : (stackStatus === 'error'
            ? '<span class="badge bg-danger">Erro</span>'
            : (stackStatus
                ? '<span class="badge bg-secondary">' + esc(stackStatus) + '</span>'
                : '—'));

      var provDate = t.lastProvisionedAt
        ? new Date(t.lastProvisionedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
        : '—';

      var stackCell = stackPath !== '—' ? (stackPath + ' ' + stackBadge) : stackBadge;
      var slug = (t.slug || '').toString();

      var containers = slug
        ? '<span class="small" title="pg, portal, site, radius">pg_' + esc(slug) + ', portal_' + esc(slug) + ', site_' + esc(slug) + ', radius_' + esc(slug) + '</span>'
        : '—';

      var actionBtns = '<button type="button" class="btn btn-sm btn-primary me-1" onclick="return window.openTenantManage(' + t.id + ');"><i class="bi bi-gear me-1"></i>Gerenciar</button>';

      if (!window.standaloneMode) {
        actionBtns +=
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-tenant-id="' + t.id + '" data-tenant-subdomain="' + esc(t.subdomain || '') + '" data-tenant-custom="' + esc(t.custom_domain || '') + '" data-tenant-status="' + esc(t.status || '') + '" onclick="return window.openTenantDomainModal(this);" title="Domínio"><i class="bi bi-globe"></i></button>' +
          '<button type="button" class="btn btn-sm btn-outline-secondary" onclick="return window.openNginxSnippet(' + t.id + ');" title="Snippet Nginx (path)"><i class="bi bi-file-code"></i></button>' +
          '<button type="button" class="btn btn-sm btn-outline-danger ms-1" data-action-delete-tenant data-tenant-id="' + t.id + '" data-tenant-name="' + esc(String(t.name || t.slug || '')).replace(/"/g, '&quot;') + '" title="Excluir provedor e stack Docker"><i class="bi bi-trash"></i></button>';
      }

      html += '<tr><td class="fw-semibold">' + esc(t.name) + '</td><td><code class="small">' + esc(t.slug) + '</code></td>' +
        '<td><span class="badge ' + statusClass + '">' + esc(statusLabel(t.status)) + '</span></td>' +
        '<td class="small">' + stackCell + '</td>' +
        '<td class="small text-muted">' + containers + '</td>' +
        '<td class="small">' + domain + '</td><td>' + (t.users_count != null ? t.users_count : '—') + '</td><td class="text-nowrap small">' + esc(provDate) + '</td>' +
        '<td class="text-end">' + actionBtns + '</td></tr>';
    });

    html += '</tbody></table>';
    out.innerHTML = html;
  }

  function loadTenants() {
    var out = byId('outTenants');
    if (!out) return;

    out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Carregando...';
    api('/tenants').then(function(data) {
      tenantsCache = data.tenants || [];
      renderTenantsTable(tenantsCache);
    }).catch(function(err) {
      out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
    });
  }

  safeAddEvent(byId('btnLogout'), 'click', function(e) {
    e.preventDefault();
    fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).finally(function() {
      redirectLogin();
    });
  });

  document.querySelectorAll('[data-tab]').forEach(function(a) {
    a.addEventListener('click', function(e) {
      e.preventDefault();

      var tab = a.getAttribute('data-tab');
      document.querySelectorAll('.admin-sidebar__nav a').forEach(function(n) {
        n.classList.remove('active');
      });
      a.classList.add('active');

      document.querySelectorAll('.admin-tab').forEach(function(t) {
        t.classList.remove('active');
      });

      var target = byId('tab-' + tab);
      if (target) target.classList.add('active');

      if (tab === 'tenants') loadTenants();
      else if (tab === 'overview') {
        loadStats();
        loadProviderInfo();
        loadAdminProviderSettings();
      }
      else if (tab === 'radius') loadRadiusStatus();
      else if (tab === 'nas') {
        loadNasTenantOptions();
        loadNasListForSelected();
      }
    });
  });

  safeAddEvent(byId('btnLoadTenants'), 'click', loadTenants);

  var searchTenantsEl = byId('tenantsSearch');
  safeAddEvent(searchTenantsEl, 'input', function() {
    renderTenantsTable(tenantsCache);
  });

  document.addEventListener('click', function(e) {
    var btn = e.target && e.target.closest && e.target.closest('[data-action-delete-tenant]');
    if (!btn) return;

    e.preventDefault();
    var id = btn.getAttribute('data-tenant-id');
    var name = btn.getAttribute('data-tenant-name') || '—';
    if (id) window.openTenantDelete(parseInt(id, 10), name);
  });

  safeAddEvent(byId('btnConfirmTenantDelete'), 'click', function() {
    var modalEl = byId('modalTenantDelete');
    var id = modalEl && modalEl.dataset.deleteTenantId;
    var hardEl = byId('deleteTenantHard');
    if (!id) return;

    var hard = hardEl && hardEl.checked;
    var btn = this;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Excluindo...';

    api('/tenants/' + encodeURIComponent(id) + (hard ? '?hard=1' : ''), { method: 'DELETE' })
      .then(function(data) {
        hideModal(modalEl);
        loadTenants();
        loadStats();
        if (data.deprovisioning && data.deprovisioning.log && data.deprovisioning.log.length) {
          console.log('[Deprovision]', data.deprovisioning.log.join('\n'));
        }
      })
      .catch(function(err) {
        alert(err.message || 'Erro ao excluir.');
      })
      .finally(function() {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-trash me-1"></i> Excluir';
      });
  });

  var copySlugBtn = byId('btnCopySlug');
  safeAddEvent(copySlugBtn, 'click', function() {
    var slugEl = byId('manageSlug');
    if (!slugEl || !slugEl.value) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(slugEl.value).then(function() {
        copySlugBtn.innerHTML = '<i class="bi bi-check"></i>';
        setTimeout(function() {
          copySlugBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
        }, 1500);
      });
    } else {
      fallbackCopy(slugEl.value);
    }
  });

  var copyRadiusBtn = byId('btnCopyRadiusSecret');
  safeAddEvent(copyRadiusBtn, 'click', function() {
    var secretEl = byId('manageRadiusSecret');
    if (!secretEl || !secretEl.dataset.secret) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(secretEl.dataset.secret).then(function() {
        copyRadiusBtn.innerHTML = '<i class="bi bi-check"></i>';
        setTimeout(function() {
          copyRadiusBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
        }, 1500);
      });
    } else {
      fallbackCopy(secretEl.dataset.secret);
    }
  });

  var radiusTestBtnTenant = byId('btnRadiusTestTenant');
  safeAddEvent(radiusTestBtnTenant, 'click', function() {
    var userEl = byId('manageRadiusUser');
    var passEl = byId('manageRadiusPass');
    var resultEl = byId('manageRadiusTestResult');
    var idEl = byId('manageTenantId');

    if (!userEl || !passEl || !resultEl || !idEl || !idEl.value) return;

    var user = (userEl.value || '').trim();
    var pass = passEl.value || '';

    if (!user) {
      resultEl.innerHTML = '<span class="text-danger">Informe o usuário PPPoE.</span>';
      return;
    }

    resultEl.innerHTML = '<span class="text-muted">Testando...</span>';
    var body = { username: user, password: pass, tenantId: parseInt(idEl.value, 10) };

    api('/radius-test', { method: 'POST', body: JSON.stringify(body) }).then(function(data) {
      if (data.success) {
        resultEl.innerHTML = '<span class="text-success"><i class="bi bi-check-circle"></i> Autenticação OK.</span>';
      } else {
        resultEl.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle"></i> ' + esc(data.message || 'Falha') + '</span>';
      }
    }).catch(function(err) {
      resultEl.innerHTML = '<span class="text-danger">' + esc(err.message || 'Erro ao testar.') + '</span>';
    });
  });

  function getCurrentTenantIdFromManage() {
    var idEl = byId('manageTenantId');
    return idEl && idEl.value ? parseInt(idEl.value, 10) : null;
  }

  function getSelectedLogService() {
    var btn = document.querySelector('[data-log-service].active');
    return btn ? (btn.getAttribute('data-log-service') || 'portal') : 'portal';
  }

  function setSelectedLogService(service) {
    document.querySelectorAll('[data-log-service]').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-log-service') === service);
    });
  }

  function loadTenantLogs() {
    var tenantId = getCurrentTenantIdFromManage();
    var out = byId('manageStackLogs');
    if (!tenantId || !out) return;

    var service = getSelectedLogService();
    out.textContent = 'Carregando logs de ' + service + '...';

    api('/tenants/' + encodeURIComponent(tenantId) + '/logs?service=' + encodeURIComponent(service) + '&tail=100')
      .then(function(data) {
        if (!data.ok) {
          out.textContent = 'Falha ao obter logs: ' + (data.message || 'Erro');
          return;
        }
        var stdout = data.stdout || '';
        var stderr = data.stderr || '';
        var combined = stdout + (stderr ? '\n[stderr]\n' + stderr : '');
        out.textContent = combined || 'Nenhum log retornado para este serviço.';
      })
      .catch(function(err) {
        out.textContent = 'Erro ao carregar logs: ' + (err.message || String(err));
      });
  }

  document.querySelectorAll('[data-log-service]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var svc = this.getAttribute('data-log-service') || 'portal';
      setSelectedLogService(svc);
      loadTenantLogs();
    });
  });

  var reloadLogsBtn = byId('btnReloadLogs');
  safeAddEvent(reloadLogsBtn, 'click', function() {
    loadTenantLogs();
  });

  var restartStackBtn = byId('btnRestartStack');
  safeAddEvent(restartStackBtn, 'click', function() {
    var tenantId = getCurrentTenantIdFromManage();
    if (!tenantId) return;
    if (!confirm('Reiniciar stack (portal, site, RADIUS, Postgres) deste provedor?')) return;

    restartStackBtn.disabled = true;
    restartStackBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Reiniciando...';

    api('/tenants/' + encodeURIComponent(tenantId) + '/stack/restart', { method: 'POST', body: JSON.stringify({}) })
      .then(function(data) {
        alert(data.message || (data.ok ? 'Stack reiniciado.' : 'Falha ao reiniciar.'));
        loadTenantLogs();
      })
      .catch(function(err) {
        alert(err.message || 'Erro ao reiniciar stack.');
      })
      .finally(function() {
        restartStackBtn.disabled = false;
        restartStackBtn.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i> Reiniciar stack';
      });
  });

  var removeStackBtn = byId('btnRemoveStack');
  safeAddEvent(removeStackBtn, 'click', function() {
    var tenantId = getCurrentTenantIdFromManage();
    if (!tenantId) return;
    if (!confirm('Remover apenas o stack Docker deste provedor? O provedor continuará cadastrado, mas sem containers.')) return;

    removeStackBtn.disabled = true;
    removeStackBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Removendo...';

    api('/tenants/' + encodeURIComponent(tenantId) + '/stack/remove', { method: 'POST', body: JSON.stringify({}) })
      .then(function(data) {
        alert(data.message || (data.ok ? 'Stack removido.' : 'Falha ao remover stack.'));
        loadTenantLogs();
      })
      .catch(function(err) {
        alert(err.message || 'Erro ao remover stack.');
      })
      .finally(function() {
        removeStackBtn.disabled = false;
        removeStackBtn.innerHTML = '<i class="bi bi-x-circle me-1"></i> Remover stack';
      });
  });

  var btnCopyPortalLinkPath = byId('btnCopyPortalLinkPath');
  safeAddEvent(btnCopyPortalLinkPath, 'click', function() {
    var input = byId('managePortalLinkPath');
    if (!input || !input.value || input.value === '—') return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(function() {
        var icon = btnCopyPortalLinkPath.querySelector('i');
        if (icon) {
          icon.className = 'bi bi-check';
          setTimeout(function() { icon.className = 'bi bi-clipboard'; }, 1500);
        }
      });
    } else {
      fallbackCopy(input.value);
    }
  });

  var btnCopyNginxSnippet = byId('btnCopyNginxSnippet');
  safeAddEvent(btnCopyNginxSnippet, 'click', function() {
    var preEl = byId('nginxSnippetPre');
    if (!preEl || !preEl.textContent || preEl.textContent === 'Carregando...') return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(preEl.textContent).then(function() {
        var html = btnCopyNginxSnippet.innerHTML;
        btnCopyNginxSnippet.innerHTML = '<i class="bi bi-check me-1"></i>Copiado!';
        setTimeout(function() {
          btnCopyNginxSnippet.innerHTML = html;
        }, 2000);
      });
    } else {
      fallbackCopy(preEl.textContent);
    }
  });

  var openDomainFromManageBtn = byId('btnOpenDomainFromManage');
  safeAddEvent(openDomainFromManageBtn, 'click', function() {
    var idEl = byId('manageTenantId');
    var subEl = byId('manageSubdomain');
    var customEl = byId('manageCustomDomain');
    var statusEl = byId('manageStatus');

    var id = idEl && idEl.value;
    var sub = subEl && subEl.value;
    var custom = customEl && customEl.value;
    var status = statusEl && statusEl.value;

    var fakeBtn = {
      getAttribute: function(k) {
        return {
          'data-tenant-id': id,
          'data-tenant-subdomain': sub || '',
          'data-tenant-custom': custom || '',
          'data-tenant-status': status || ''
        }[k];
      }
    };

    window.openTenantDomainModal(fakeBtn);
  });

  var manageStatusEl = byId('manageStatus');
  var manageBadgeEl = byId('manageTenantBadge');
  safeAddEvent(manageStatusEl, 'change', function() {
    if (manageBadgeEl) {
      manageBadgeEl.textContent = statusLabel(manageStatusEl.value);
      manageBadgeEl.className = 'tenant-modal__badge ' + statusBadgeClass(manageStatusEl.value);
    }
  });

  var modalTenant = null;
  var tenantFormFieldsEl = byId('tenantFormFields');
  var tenantProvisionResultEl = byId('tenantProvisionResult');
  var tenantProvisionLogEl = byId('tenantProvisionLog');
  var tenantProvisionMessageEl = byId('tenantProvisionMessage');
  var tenantProvisionUrlEl = byId('tenantProvisionUrl');
  var modalTenantFooter = byId('modalTenantFooter');
  var btnSaveTenantEl = byId('btnSaveTenant');

  safeAddEvent(byId('btnNewTenant'), 'click', function() {
    var tenantName = byId('tenantName');
    var tenantSlug = byId('tenantSlug');
    var masterName = byId('masterName');
    var masterEmail = byId('masterEmail');
    var masterPassword = byId('masterPassword');
    var tenantFormError = byId('tenantFormError');
    var modalEl = byId('modalTenant');

    if (tenantName) tenantName.value = '';
    if (tenantSlug) tenantSlug.value = '';
    if (masterName) masterName.value = '';
    if (masterEmail) masterEmail.value = '';
    if (masterPassword) masterPassword.value = '';
    if (tenantFormError) tenantFormError.classList.add('d-none');

    if (tenantFormFieldsEl) tenantFormFieldsEl.style.display = '';
    if (tenantProvisionResultEl) tenantProvisionResultEl.classList.add('d-none');

    if (modalTenantFooter) {
      var cancelBtn = modalTenantFooter.querySelector('[data-bs-dismiss="modal"]');
      if (cancelBtn) {
        cancelBtn.textContent = 'Cancelar';
        cancelBtn.style.display = '';
      }
    }

    if (btnSaveTenantEl) btnSaveTenantEl.style.display = '';
    if (!modalEl) return;

    var Modal = getBootstrapModal();
    if (Modal) {
      if (!modalTenant) modalTenant = new Modal(modalEl);
      modalTenant.show();
    } else {
      showModal(modalEl);
    }
  });

  safeAddEvent(byId('btnSaveTenant'), 'click', function() {
    var tenantNameEl = byId('tenantName');
    var tenantSlugEl = byId('tenantSlug');
    var masterNameEl = byId('masterName');
    var masterEmailEl = byId('masterEmail');
    var masterPasswordEl = byId('masterPassword');
    var errEl = byId('tenantFormError');

    var tenantName = (tenantNameEl && tenantNameEl.value || '').trim();
    var slug = (tenantSlugEl && tenantSlugEl.value || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    var masterName = (masterNameEl && masterNameEl.value || '').trim() || tenantName;
    var masterEmail = (masterEmailEl && masterEmailEl.value || '').trim();
    var masterPassword = (masterPasswordEl && masterPasswordEl.value || '');

    if (errEl) errEl.classList.add('d-none');

    if (!tenantName) {
      if (errEl) {
        errEl.textContent = 'Informe o nome do provedor.';
        errEl.classList.remove('d-none');
      }
      return;
    }

    if (!slug || slug.length < 2) {
      if (errEl) {
        errEl.textContent = 'Slug deve ter pelo menos 2 caracteres (ex: provedor-alfa).';
        errEl.classList.remove('d-none');
      }
      return;
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      if (errEl) {
        errEl.textContent = 'Slug só pode conter letras minúsculas, números e hífens.';
        errEl.classList.remove('d-none');
      }
      return;
    }

    if (!masterEmail) {
      if (errEl) {
        errEl.textContent = 'Informe o e-mail do Master.';
        errEl.classList.remove('d-none');
      }
      return;
    }

    if (masterPassword.length < 6) {
      if (errEl) {
        errEl.textContent = 'A senha do Master deve ter no mínimo 6 caracteres.';
        errEl.classList.remove('d-none');
      }
      return;
    }

    var btn = byId('btnSaveTenant');
    if (!btn) return;

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

      if (tenantProvisionLogEl) {
        tenantProvisionLogEl.textContent = logLines.join('\n') || '(nenhum log)';
      }

      if (tenantProvisionMessageEl) {
        tenantProvisionMessageEl.className = 'alert mb-2 ' + (
          prov && prov.success ? 'alert-success' :
          (prov && prov.skipped ? 'alert-warning' : 'alert-danger')
        );

        tenantProvisionMessageEl.textContent = prov
          ? (prov.success
              ? (prov.message || 'Provedor criado. Stack instalado.')
              : (prov.skipped
                  ? 'Provedor criado. ' + (prov.message || '')
                  : (prov.message || 'Erro na instalação.')))
          : 'Provedor criado.';
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
      if (errEl) {
        errEl.textContent = err.message || 'Erro ao criar provedor.';
        errEl.classList.remove('d-none');
      }
      btn.disabled = false;
    });
  });

  var btnSaveDomain = byId('btnSaveTenantDomain');
  safeAddEvent(btnSaveDomain, 'click', function() {
    var editTenantId = byId('editTenantId');
    var editSubdomain = byId('editSubdomain');
    var editCustomDomain = byId('editCustomDomain');
    var editTenantStatus = byId('editTenantStatus');
    var errEl = byId('tenantDomainFormError');

    var id = (editTenantId && editTenantId.value) || '';
    var subdomainRaw = (editSubdomain && editSubdomain.value) || '';
    var customDomainRaw = (editCustomDomain && editCustomDomain.value) || '';
    var status = (editTenantStatus && editTenantStatus.value) || 'ACTIVE';

    var subdomain = subdomainRaw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    var customDomain = customDomainRaw.trim().toLowerCase();

    if (errEl) errEl.classList.add('d-none');

    if (!id) {
      if (errEl) {
        errEl.textContent = 'Provedor não identificado.';
        errEl.classList.remove('d-none');
      }
      return;
    }

    var btn = byId('btnSaveTenantDomain');
    if (!btn) return;

    btn.disabled = true;

    api('/tenants/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({
        subdomain: subdomain || '',
        custom_domain: customDomain || '',
        status: status.trim()
      })
    }).then(function() {
      var modalEl = byId('modalTenantDomain');
      hideModal(modalEl);

      var formEl = byId('manageTenantForm');
      if (formEl && !formEl.classList.contains('d-none')) {
        var mSub = byId('manageSubdomain');
        var mCustom = byId('manageCustomDomain');
        var mStatus = byId('manageStatus');

        if (mSub && editSubdomain) mSub.value = editSubdomain.value || '';
        if (mCustom && editCustomDomain) mCustom.value = editCustomDomain.value || '';
        if (mStatus && editTenantStatus) mStatus.value = editTenantStatus.value || 'ACTIVE';

        if (manageBadgeEl && mStatus) {
          manageBadgeEl.textContent = statusLabel(mStatus.value);
          manageBadgeEl.className = 'tenant-modal__badge ' + statusBadgeClass(mStatus.value);
        }
      }

      loadTenants();
      loadStats();
      btn.disabled = false;
    }).catch(function(err) {
      if (errEl) {
        errEl.textContent = err.message || 'Erro ao salvar.';
        errEl.classList.remove('d-none');
      }
      btn.disabled = false;
    });
  });

  var btnSaveManage = byId('btnSaveTenantManage');
  safeAddEvent(btnSaveManage, 'click', function() {
    var manageTenantId = byId('manageTenantId');
    var manageName = byId('manageName');
    var manageStatus = byId('manageStatus');
    var manageSubdomain = byId('manageSubdomain');
    var manageCustomDomain = byId('manageCustomDomain');
    var errEl = byId('manageTenantError');

    var id = (manageTenantId && manageTenantId.value) || '';
    var name = (manageName && manageName.value) || '';
    var status = (manageStatus && manageStatus.value) || 'ACTIVE';
    var subdomain = (manageSubdomain && manageSubdomain.value) || '';
    var customDomain = (manageCustomDomain && manageCustomDomain.value) || '';

    subdomain = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    customDomain = customDomain.trim().toLowerCase();

    if (errEl) errEl.classList.add('d-none');

    if (!id) {
      if (errEl) {
        errEl.textContent = 'Provedor não identificado.';
        errEl.classList.remove('d-none');
      }
      return;
    }

    var btn = byId('btnSaveTenantManage');
    if (!btn) return;

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
      var modalEl = byId('modalTenantManage');
      hideModal(modalEl);
      loadTenants();
      loadStats();
      btn.disabled = false;
    }).catch(function(err) {
      if (errEl) {
        errEl.textContent = err.message || 'Erro ao salvar.';
        errEl.classList.remove('d-none');
      }
      btn.disabled = false;
    });
  });

  function loadRadiusStatus() {
    var out = byId('outRadiusStatus');
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

      if (!tenants.length) {
        html += '<li class="text-muted">Nenhum</li>';
      } else {
        tenants.forEach(function(t) {
          html += '<li>' + esc(t.tenantName) + ' (' + esc(t.slug) + '): ';
          if (t.configured) {
            html += '<span class="badge bg-success">OK</span> ' + esc(t.host) + ':' + (t.port || 1812) + (t.nasIp ? ' NAS-IP: ' + esc(t.nasIp) : '');
          } else {
            html += '<span class="badge bg-secondary">Não configurado</span>';
          }
          html += '</li>';
        });
      }

      html += '</ul>';
      out.innerHTML = html;

      var sel = byId('radiusTestTenant');
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

  var btnRestart = byId('btnRadiusRestart');
  safeAddEvent(btnRestart, 'click', function() {
    var btn = this;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Reiniciando...';

    api('/radius-restart', { method: 'POST' }).then(function(data) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Reiniciar RADIUS';
      if (data.ok) {
        loadRadiusStatus();
        alert('RADIUS reiniciado com sucesso.');
      } else {
        alert(data.message || 'Falha ao reiniciar.');
      }
    }).catch(function(err) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Reiniciar RADIUS';
      alert(err.message || 'Erro ao reiniciar RADIUS.');
    });
  });

  safeAddEvent(byId('btnRadiusTest'), 'click', function() {
    var tenantSel = byId('radiusTestTenant');
    var tenantId = tenantSel && tenantSel.value ? tenantSel.value : '';
    var user = (byId('radiusTestUser') && byId('radiusTestUser').value) || '';
    var pass = (byId('radiusTestPass') && byId('radiusTestPass').value) || '';
    var resultEl = byId('radiusTestResult');

    if (!user) {
      if (resultEl) resultEl.innerHTML = '<span class="text-danger">Informe o usuário.</span>';
      return;
    }
    if (!resultEl) return;

    resultEl.innerHTML = '<span class="text-muted">Testando...</span>';

    var body = { username: user, password: pass };
    if (tenantId) body.tenantId = parseInt(tenantId, 10);

    api('/radius-test', { method: 'POST', body: JSON.stringify(body) }).then(function(data) {
      if (data.success) {
        resultEl.innerHTML = '<span class="text-success"><i class="bi bi-check-circle"></i> Autenticação OK.</span>';
      } else {
        resultEl.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle"></i> ' + esc(data.message || 'Falha') + '</span>';
      }
    }).catch(function(err) {
      resultEl.innerHTML = '<span class="text-danger">' + esc(err.message) + '</span>';
    });
  });

  function loadNasTenantOptions() {
    var sel = byId('nasTenantSelect');
    var radiusSel = byId('radiusTestTenant');

    api('/tenants').then(function(data) {
      var tenants = data.tenants || [];

      if (sel) {
        sel.innerHTML = '<option value="">Selecione um provedor</option>';
        tenants.forEach(function(t) {
          sel.appendChild(new Option(t.name + ' (' + t.slug + ')', t.id));
        });
      }

      if (radiusSel) {
        radiusSel.innerHTML = '<option value="">Global (.env)</option>';
        tenants.forEach(function(t) {
          radiusSel.appendChild(new Option(t.name + ' (' + t.slug + ')', t.id));
        });
      }
    }).catch(function() {});
  }

  function loadNasListForSelected() {
    var sel = byId('nasTenantSelect');
    var tenantId = sel && sel.value ? sel.value : '';
    var out = byId('outNasList');
    var btnNew = byId('btnNewNas');

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
        return;
      }

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
          var tidEl = byId('nasTenantSelect');
          var tid = tidEl && tidEl.value;
          if (!tid) return;

          var nasId = byId('nasId');
          var nasTenantId = byId('nasTenantId');
          var nasName = byId('nasName');
          var nasIpEl = byId('nasIp');
          var nasDescription = byId('nasDescription');
          var nasActive = byId('nasActive');
          var modalNasTitle = byId('modalNasTitle');
          var nasFormError = byId('nasFormError');
          var modalNas = byId('modalNas');

          if (nasId) nasId.value = id || '';
          if (nasTenantId) nasTenantId.value = tid;
          if (nasName) nasName.value = name;
          if (nasIpEl) nasIpEl.value = nasIp;
          if (nasDescription) nasDescription.value = desc;
          if (nasActive) nasActive.checked = active;
          if (modalNasTitle) modalNasTitle.textContent = 'Editar concentrador';
          if (nasFormError) nasFormError.classList.add('d-none');

          if (modalNas) showModal(modalNas);
        });
      });

      out.querySelectorAll('[data-action-delete-nas]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = this.getAttribute('data-nas-id');
          var tidEl = byId('nasTenantSelect');
          var tid = tidEl && tidEl.value;
          if (!tid || !id || !confirm('Excluir este concentrador?')) return;

          api('/tenants/' + encodeURIComponent(tid) + '/nas/' + id, { method: 'DELETE' })
            .then(function() { loadNasListForSelected(); })
            .catch(function(err) { alert(err.message); });
        });
      });
    }).catch(function(err) {
      out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
    });
  }

  safeAddEvent(byId('nasTenantSelect'), 'change', loadNasListForSelected);

  safeAddEvent(byId('btnNewNas'), 'click', function() {
    var tidEl = byId('nasTenantSelect');
    var tid = tidEl && tidEl.value;
    if (!tid) {
      alert('Selecione um provedor.');
      return;
    }

    var nasId = byId('nasId');
    var nasTenantId = byId('nasTenantId');
    var nasName = byId('nasName');
    var nasIp = byId('nasIp');
    var nasDescription = byId('nasDescription');
    var nasActive = byId('nasActive');
    var modalNasTitle = byId('modalNasTitle');
    var nasFormError = byId('nasFormError');
    var modalNas = byId('modalNas');

    if (nasId) nasId.value = '';
    if (nasTenantId) nasTenantId.value = tid;
    if (nasName) nasName.value = '';
    if (nasIp) nasIp.value = '';
    if (nasDescription) nasDescription.value = '';
    if (nasActive) nasActive.checked = true;
    if (modalNasTitle) modalNasTitle.textContent = 'Novo concentrador';
    if (nasFormError) nasFormError.classList.add('d-none');
    if (modalNas) showModal(modalNas);
  });

  safeAddEvent(byId('btnSaveNas'), 'click', function() {
    var nasId = byId('nasId');
    var nasTenantId = byId('nasTenantId');
    var nasName = byId('nasName');
    var nasIpEl = byId('nasIp');
    var nasDescription = byId('nasDescription');
    var nasActive = byId('nasActive');
    var errEl = byId('nasFormError');
    var modalNas = byId('modalNas');

    var id = nasId && nasId.value;
    var tenantId = nasTenantId && nasTenantId.value;
    var name = (nasName && nasName.value || '').trim();
    var nasIp = (nasIpEl && nasIpEl.value || '').trim();
    var description = (nasDescription && nasDescription.value || '').trim();
    var isActive = !!(nasActive && nasActive.checked);

    if (errEl) errEl.classList.add('d-none');

    if (!name) {
      if (errEl) {
        errEl.textContent = 'Informe o nome.';
        errEl.classList.remove('d-none');
      }
      return;
    }

    if (!nasIp) {
      if (errEl) {
        errEl.textContent = 'Informe o IP do NAS.';
        errEl.classList.remove('d-none');
      }
      return;
    }

    var btn = byId('btnSaveNas');
    if (!btn) return;
    btn.disabled = true;

    if (id) {
      api('/tenants/' + encodeURIComponent(tenantId) + '/nas/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ name: name, nas_ip: nasIp, description: description || null, is_active: isActive })
      }).then(function() {
        hideModal(modalNas);
        loadNasListForSelected();
        btn.disabled = false;
      }).catch(function(err) {
        if (errEl) {
          errEl.textContent = err.message || 'Erro ao salvar.';
          errEl.classList.remove('d-none');
        }
        btn.disabled = false;
      });
    } else {
      api('/tenants/' + encodeURIComponent(tenantId) + '/nas', {
        method: 'POST',
        body: JSON.stringify({ name: name, nas_ip: nasIp, description: description || null, is_active: isActive })
      }).then(function() {
        hideModal(modalNas);
        loadNasListForSelected();
        btn.disabled = false;
      }).catch(function(err) {
        if (errEl) {
          errEl.textContent = err.message || 'Erro ao criar.';
          errEl.classList.remove('d-none');
        }
        btn.disabled = false;
      });
    }
  });

  loadStats();
  loadProviderInfo();
  loadAdminProviderSettings();
})();