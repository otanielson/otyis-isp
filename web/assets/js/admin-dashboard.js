"use strict";
// @ts-nocheck
/**
 * Painel do dono do sistema (standalone) ou Admin do SaaS (multi-tenant).
 * Autenticação: cookie admin_session (login em /admin).
 */
(function () {
    'use strict';
    window.standaloneMode = true;
    function byId(id) {
        return document.getElementById(id);
    }
    function safeAddEvent(el, event, handler) {
        if (el)
            el.addEventListener(event, handler);
    }
    function getBootstrapModal() {
        return (typeof bootstrap !== 'undefined' && bootstrap.Modal) ? bootstrap.Modal : null;
    }
    function showModal(modalEl) {
        if (!modalEl)
            return null;
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
        if (!modalEl)
            return;
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
        document.querySelectorAll('[data-modal-backdrop="1"]').forEach(function (el) { el.remove(); });
    }
    function applySaasModeUI() {
        document.querySelectorAll('[data-saas-only]').forEach(function (el) {
            el.classList.remove('d-none');
        });
        var logo = byId('adminSidebarLogo');
        if (logo)
            logo.innerHTML = '<i class="bi bi-shield-lock"></i> Admin SaaS';
        var navTenants = byId('navTabTenants');
        if (navTenants)
            navTenants.innerHTML = '<i class="bi bi-building"></i> Provedores (Tenants)';
        var title = byId('adminTopbarTitle');
        if (title)
            title.textContent = 'Admin do SaaS (multi-tenant)';
        var sub = byId('adminTopbarSubtitle');
        if (sub)
            sub.textContent = 'Gerenciar provedores e tenants';
        var metricLabel = byId('metricTenantsLabel');
        if (metricLabel)
            metricLabel.textContent = 'Provedores (tenants)';
        var resumo = byId('overviewResumoText');
        if (resumo) {
            resumo.innerHTML = 'Este painel é o <strong>admin do SaaS</strong>. Aqui você cria e gerencia os <strong>provedores (tenants)</strong>. Cada provedor tem seu próprio Master e equipe, que acessam o <strong>Portal do Provedor</strong> em <a href="/portal" target="_blank">/portal</a> com login por e-mail e senha.';
            if (!byId('overviewResumoExtra')) {
                resumo.insertAdjacentHTML('afterend', '<p class="mt-3 mb-0 small text-muted" id="overviewResumoExtra">Use o menu <strong>Provedores (Tenants)</strong> para listar e criar novos provedores.</p>');
            }
        }
        var panelTitle = byId('tenantsPanelTitle');
        if (panelTitle)
            panelTitle.textContent = 'Provedores (Tenants)';
    }
    window.openTenantDomainModal = function (btn) {
        if (!btn || typeof btn.getAttribute !== 'function')
            return false;
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
        if (!modalEl || !editId || !editSub || !editCustom || !editStatus)
            return false;
        editId.value = id || '';
        editSub.value = sub;
        editCustom.value = custom;
        editStatus.value = status;
        if (errEl)
            errEl.classList.add('d-none');
        showModal(modalEl);
        return false;
    };
    var btnNginxSnippetAll = byId('btnNginxSnippetAll');
    safeAddEvent(btnNginxSnippetAll, 'click', function () {
        var modalEl = byId('modalNginxSnippet');
        var preEl = byId('nginxSnippetPre');
        var noteEl = byId('nginxSnippetNote');
        if (!modalEl || !preEl)
            return;
        preEl.textContent = 'Carregando...';
        if (noteEl) {
            noteEl.classList.add('d-none');
            noteEl.textContent = '';
        }
        api('/nginx-snippet').then(function (data) {
            preEl.textContent = data.snippet || '(Nenhum tenant com sitePort e adminPort provisionados.)';
            if (data.note && noteEl) {
                noteEl.textContent = data.note;
                noteEl.classList.remove('d-none');
            }
            else if (data.skipped && data.skipped.length && noteEl) {
                noteEl.textContent = 'Omitidos: ' + data.skipped.map(function (s) {
                    return s.slug + ' (' + s.reason + ')';
                }).join(', ');
                noteEl.classList.remove('d-none');
            }
            showModal(modalEl);
        }).catch(function (err) {
            preEl.textContent = 'Erro: ' + (err.message || 'não foi possível carregar.');
            showModal(modalEl);
        });
    });
    window.openNginxSnippet = function (tenantId) {
        var modalEl = byId('modalNginxSnippet');
        var preEl = byId('nginxSnippetPre');
        var noteEl = byId('nginxSnippetNote');
        if (!modalEl || !preEl)
            return false;
        preEl.textContent = 'Carregando...';
        if (noteEl) {
            noteEl.classList.add('d-none');
            noteEl.textContent = '';
        }
        api('/tenants/' + tenantId + '/nginx-snippet').then(function (data) {
            preEl.textContent = data.snippet || '(vazio)';
            if (data.note && noteEl) {
                noteEl.textContent = data.note;
                noteEl.classList.remove('d-none');
            }
            showModal(modalEl);
        }).catch(function (err) {
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
        if (s === 'running')
            return 'badge bg-success';
        if (s === 'provisioning')
            return 'badge bg-info text-dark';
        if (s === 'pending')
            return 'badge bg-secondary';
        if (s === 'error')
            return 'badge bg-danger';
        if (s === 'stopped')
            return 'badge bg-warning text-dark';
        return 'badge bg-secondary';
    }
    window.openTenantManage = function (tenantId) {
        var modalEl = byId('modalTenantManage');
        var loadingEl = byId('manageTenantLoading');
        var formEl = byId('manageTenantForm');
        var saveBtn = byId('btnSaveTenantManage');
        if (!modalEl || !loadingEl || !formEl)
            return false;
        var manageTenantIdEl = byId('manageTenantId');
        if (manageTenantIdEl)
            manageTenantIdEl.value = tenantId;
        formEl.classList.add('d-none');
        if (saveBtn)
            saveBtn.classList.add('d-none');
        loadingEl.classList.remove('d-none');
        showModal(modalEl);
        api('/tenants/' + encodeURIComponent(tenantId)).then(function (data) {
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
            if (manageName)
                manageName.value = t.name || '';
            if (manageSlug)
                manageSlug.value = t.slug || '';
            if (manageStatus)
                manageStatus.value = t.status || 'ACTIVE';
            if (manageSubdomain)
                manageSubdomain.value = t.subdomain || '';
            if (manageCustomDomain)
                manageCustomDomain.value = t.custom_domain || '';
            var nameEl = byId('manageTenantNameDisplay');
            if (nameEl)
                nameEl.textContent = t.name || t.slug || 'Provedor';
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
            }
            else {
                portalPathUrl = slug ? (origin + '/' + slug + '/portal/') : '';
                sitePathUrl = slug ? (origin + '/' + slug + '/') : '';
            }
            var pathInput = byId('managePortalLinkPath');
            if (pathInput)
                pathInput.value = portalPathUrl || '—';
            var siteLinkEl = byId('manageSiteLinkPath');
            if (siteLinkEl)
                siteLinkEl.textContent = sitePathUrl || '—';
            var portalLink = byId('manageTenantPortalLink');
            if (portalLink) {
                portalLink.href = t.custom_domain ? ('https://' + t.custom_domain + '/portal/') : (portalPathUrl || '/portal');
                portalLink.title = t.custom_domain ? 'Abrir em ' + t.custom_domain : (portalPathUrl ? 'Abrir portal (por path)' : 'Portal');
            }
            var tbody = byId('manageTenantUsers');
            if (tbody) {
                tbody.innerHTML = users.length ? users.map(function (u) {
                    return '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td>' +
                        '<td>' + (u.is_master ? '<span class="badge bg-primary">Master</span>' : '—') + '</td>' +
                        '<td>' + (u.is_active ? '<span class="text-success">Sim</span>' : 'Não') + '</td></tr>';
                }).join('') : '<tr><td colspan="4" class="text-muted text-center py-3">Nenhum usuário</td></tr>';
            }
            var manageErrEl = byId('manageTenantError');
            if (manageErrEl)
                manageErrEl.classList.add('d-none');
            formEl.classList.remove('d-none');
            if (saveBtn)
                saveBtn.classList.remove('d-none');
            var nativeSection = byId('manageStackNativeSection');
            var dockerSection = byId('manageStackDockerSection');
            var logsSection = byId('manageStackLogsSection');
            if (window.standaloneMode) {
                if (nativeSection)
                    nativeSection.classList.remove('d-none');
                if (dockerSection)
                    dockerSection.classList.add('d-none');
                if (logsSection)
                    logsSection.classList.add('d-none');
            }
            else {
                if (nativeSection)
                    nativeSection.classList.add('d-none');
                if (dockerSection)
                    dockerSection.classList.remove('d-none');
                if (logsSection)
                    logsSection.classList.remove('d-none');
            }
            if (window.standaloneMode) {
                api('/installation-info').then(function (info) {
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
                        }
                        else {
                            radiusHostPortEl.textContent = 'RADIUS global não configurado (.env: RADIUS_HOST, RADIUS_SECRET).';
                        }
                    }
                    if (radiusNasIpPortEl && r && r.host) {
                        radiusNasIpPortEl.textContent = 'NAS → ' + r.host + ' (UDP ' + (r.port || 1812) + ' auth / ' + (r.port ? r.port + 1 : 1813) + ' acct)';
                    }
                }).catch(function () { });
            }
            else {
                api('/tenants/' + encodeURIComponent(tenantId) + '/provisioning').then(function (pdata) {
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
                        if (pathEl)
                            pathEl.textContent = '—';
                        if (statusEl)
                            statusEl.innerHTML = '<span class="badge bg-secondary">Sem stack provisionado</span>';
                        if (portsEl)
                            portsEl.textContent = 'Nenhuma porta registrada.';
                        if (dbEl)
                            dbEl.textContent = '—';
                        if (logEl)
                            logEl.textContent = 'Nunca provisionado.';
                        if (radiusSecretEl) {
                            radiusSecretEl.value = '—';
                            radiusSecretEl.dataset.secret = '';
                        }
                        if (radiusHostPortEl)
                            radiusHostPortEl.textContent = 'Carregando RADIUS global…';
                        if (radiusNasIpPortEl)
                            radiusNasIpPortEl.textContent = '—';
                        api('/installation-info').then(function (info) {
                            var r = info.radius;
                            if (radiusSecretEl && r && r.secret) {
                                radiusSecretEl.value = r.secret;
                                radiusSecretEl.dataset.secret = r.secret;
                            }
                            if (radiusHostPortEl) {
                                if (r && r.host) {
                                    radiusHostPortEl.textContent = r.host + ' (auth ' + (r.port || 1812) + ', acct ' + (r.port ? r.port + 1 : 1813) + ')';
                                }
                                else {
                                    radiusHostPortEl.textContent = 'RADIUS global não configurado (.env: RADIUS_HOST, RADIUS_SECRET).';
                                }
                            }
                            if (radiusNasIpPortEl && r && r.host) {
                                radiusNasIpPortEl.textContent = 'NAS → ' + r.host + ' (UDP ' + (r.port || 1812) + ' auth / ' + (r.port ? r.port + 1 : 1813) + ' acct)';
                            }
                        }).catch(function () {
                            if (radiusHostPortEl)
                                radiusHostPortEl.textContent = 'RADIUS global não configurado ou indisponível.';
                        });
                        return;
                    }
                    var ports = prov.ports || {};
                    if (pathEl)
                        pathEl.textContent = prov.stackPath || '—';
                    if (statusEl) {
                        var st = prov.status || 'pending';
                        statusEl.innerHTML = '<span class="' + stackStatusBadgeClass(st) + '">' + esc(stackStatusLabel(st)) + '</span>';
                    }
                    if (portsEl) {
                        var parts = [];
                        if (ports.sitePort)
                            parts.push('Site/Portal: 127.0.0.1:' + ports.sitePort);
                        if (ports.adminPort && ports.adminPort !== ports.sitePort)
                            parts.push('Portal admin: 127.0.0.1:' + ports.adminPort);
                        if (ports.pgHostPort)
                            parts.push('Postgres: 127.0.0.1:' + ports.pgHostPort);
                        if (ports.radiusAuthPort)
                            parts.push('RADIUS auth (UDP): ' + ports.radiusAuthPort);
                        if (ports.radiusAcctPort)
                            parts.push('RADIUS acct (UDP): ' + ports.radiusAcctPort);
                        portsEl.textContent = parts.length ? parts.join(' | ') : 'Nenhuma porta registrada.';
                    }
                    if (dbEl) {
                        var dbInfo = [];
                        if (prov.dbName)
                            dbInfo.push('DB: ' + prov.dbName);
                        if (prov.dbUser)
                            dbInfo.push('User: ' + prov.dbUser);
                        if (prov.dbPass)
                            dbInfo.push('Senha definida');
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
                        }
                        else {
                            radiusSecretEl.value = '—';
                            delete radiusSecretEl.dataset.secret;
                        }
                    }
                    if (radiusHostPortEl) {
                        if (ports.radiusAuthPort) {
                            radiusHostPortEl.textContent = '127.0.0.1:' + ports.radiusAuthPort + ' (auth) / 127.0.0.1:' + (ports.radiusAcctPort || '?') + ' (acct)';
                        }
                        else {
                            radiusHostPortEl.textContent = 'Sem portas RADIUS registradas neste stack.';
                        }
                    }
                    if (radiusNasIpPortEl) {
                        if (ports.radiusAuthPort) {
                            radiusNasIpPortEl.textContent = 'NAS → servidor SaaS, porta ' + ports.radiusAuthPort + ' (UDP auth) / ' + (ports.radiusAcctPort || '?') + ' (UDP acct)';
                        }
                        else {
                            radiusNasIpPortEl.textContent = 'Configure o NAS apontando para o IP do servidor SaaS.';
                        }
                    }
                }).catch(function () {
                    var statusEl = byId('manageStackStatus');
                    var logEl = byId('manageStackLastLog');
                    if (statusEl)
                        statusEl.innerHTML = '<span class="badge bg-secondary">Indisponível</span>';
                    if (logEl)
                        logEl.textContent = 'Não foi possível ler o status do stack.';
                });
            }
            api('/tenants/' + encodeURIComponent(tenantId) + '/nas').then(function (data) {
                var list = data.nas || [];
                var outNas = byId('manageRadiusNasList');
                if (!outNas)
                    return;
                if (!list.length) {
                    outNas.innerHTML = '<span class="text-muted">Nenhum NAS cadastrado para este provedor.</span>';
                    return;
                }
                var html = '<div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Nome</th><th>IP</th><th>Descrição</th><th>Ativo</th></tr></thead><tbody>';
                list.forEach(function (n) {
                    html += '<tr><td>' + esc(n.name) + '</td><td><code>' + esc(n.nas_ip) + '</code></td><td class="small">' + esc(n.description || '—') + '</td><td>' + (n.is_active ? '<span class="badge bg-success">Sim</span>' : '<span class="badge bg-secondary">Não</span>') + '</td></tr>';
                });
                html += '</tbody></table></div>';
                outNas.innerHTML = html;
            }).catch(function () {
                var outNas = byId('manageRadiusNasList');
                if (outNas)
                    outNas.innerHTML = '<span class="text-danger">Não foi possível carregar as NAS deste provedor.</span>';
            });
            api('/tenants/' + encodeURIComponent(tenantId) + '/metrics').then(function (data) {
                var m = data.metrics || {};
                var cEl = byId('metricTenantCustomers');
                var pEl = byId('metricTenantPppoe');
                var bEl = byId('metricTenantBandwidth');
                var rEl = byId('metricTenantRevenue');
                if (cEl)
                    cEl.textContent = m.customersActive != null ? m.customersActive : '—';
                if (pEl)
                    pEl.textContent = m.pppoeOnline != null ? m.pppoeOnline : '—';
                if (bEl)
                    bEl.textContent = m.bandwidthMbps != null ? (m.bandwidthMbps + ' Mbps') : '—';
                if (rEl) {
                    if (m.revenueMonth != null) {
                        var val = Number(m.revenueMonth) || 0;
                        rEl.textContent = 'R$ ' + val.toFixed(2).replace('.', ',');
                    }
                    else {
                        rEl.textContent = '—';
                    }
                }
            }).catch(function () {
                var cEl = byId('metricTenantCustomers');
                var pEl = byId('metricTenantPppoe');
                var bEl = byId('metricTenantBandwidth');
                var rEl = byId('metricTenantRevenue');
                if (cEl)
                    cEl.textContent = '—';
                if (pEl)
                    pEl.textContent = '—';
                if (bEl)
                    bEl.textContent = '—';
                if (rEl)
                    rEl.textContent = '—';
            });
        }).catch(function (err) {
            loadingEl.classList.add('d-none');
            formEl.classList.remove('d-none');
            var errEl = byId('manageTenantError');
            if (errEl) {
                errEl.textContent = err.message || 'Erro ao carregar.';
                errEl.classList.remove('d-none');
            }
            if (saveBtn)
                saveBtn.classList.add('d-none');
        });
        return false;
    };
    window.openTenantDelete = function (tenantId, tenantName) {
        var modalEl = byId('modalTenantDelete');
        var nameEl = byId('deleteTenantName');
        var hardEl = byId('deleteTenantHard');
        if (!modalEl || !nameEl)
            return false;
        nameEl.textContent = tenantName || '—';
        if (hardEl)
            hardEl.checked = false;
        modalEl.dataset.deleteTenantId = String(tenantId);
        showModal(modalEl);
        return false;
    };
    function redirectLogin() {
        window.location.href = '/admin';
    }
    function esc(s) {
        return String(s || '').replace(/[&<>"']/g, function (m) {
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
        }).then(function (res) {
            return res.json().catch(function () {
                return {};
            }).then(function (data) {
                if (res.status === 401) {
                    redirectLogin();
                    throw new Error('Sessão expirada.');
                }
                if (!res.ok)
                    throw new Error(data.error || data.message || 'Erro');
                return data;
            });
        });
    }
    api('/standalone').then(function (data) {
        window.standaloneMode = !!data.standalone;
        if (!window.standaloneMode)
            applySaasModeUI();
    }).catch(function () {
        window.standaloneMode = false;
        applySaasModeUI();
    });
    function loadStats() {
        api('/tenants').then(function (data) {
            var tenants = data.tenants || [];
            var el = byId('metricTenants');
            if (el) {
                if (window.standaloneMode && tenants.length === 1) {
                    el.textContent = (tenants[0].name || 'Provedor').substring(0, 24);
                }
                else {
                    el.textContent = tenants.length;
                }
            }
        }).catch(function () {
            var el = byId('metricTenants');
            if (el)
                el.textContent = '—';
        });
    }
    var lastProviderInfo = { name: '', slug: '', masterEmail: '' };
    function loadProviderInfo() {
        var placeholder = byId('providerInfoPlaceholder');
        var grid = byId('providerInfoGrid');
        var formEl = byId('providerInfoForm');
        var btnEdit = byId('btnEditProvider');
        var provSection = byId('providerSettingsSection');
        if (!placeholder || !grid)
            return;
        placeholder.classList.remove('d-none');
        grid.classList.add('d-none');
        if (formEl)
            formEl.classList.add('d-none');
        if (btnEdit)
            btnEdit.classList.add('d-none');
        if (provSection)
            provSection.classList.add('d-none');
        placeholder.textContent = 'Carregando...';
        api('/installation-info').then(function (data) {
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
            if (formEl)
                formEl.classList.add('d-none');
            if (btnEdit)
                btnEdit.classList.remove('d-none');
            if (provSection)
                provSection.classList.remove('d-none');
            var nameEl = byId('providerInfoName');
            var slugEl = byId('providerInfoSlug');
            var masterEl = byId('providerInfoMasterEmail');
            var portalLinkEl = byId('providerInfoPortalLink');
            var portalUrl = data.portalUrl || (window.location.origin + '/portal/');
            if (nameEl)
                nameEl.textContent = data.tenant.name || '—';
            if (slugEl)
                slugEl.textContent = data.tenant.slug || '—';
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
                if (hostEl)
                    hostEl.textContent = data.radius.host || '—';
                if (portsEl)
                    portsEl.textContent = '(auth ' + (data.radius.port || 1812) + ', acct ' + (data.radius.port ? data.radius.port + 1 : 1813) + ')';
                if (secretEl)
                    secretEl.textContent = data.radius.secret || '—';
                window._providerInfoRadiusSecret = data.radius.secret || '';
            }
            else {
                if (hostEl)
                    hostEl.textContent = 'Não configurado (RADIUS_HOST e RADIUS_SECRET no .env)';
                if (portsEl)
                    portsEl.textContent = '';
                if (secretEl)
                    secretEl.textContent = '—';
                window._providerInfoRadiusSecret = '';
            }
            var btnCopyPortal = byId('btnCopyPortal');
            var btnCopyRadius = byId('btnCopyRadius');
            if (btnCopyPortal)
                btnCopyPortal.onclick = function () { copyToClipboard(portalUrl); };
            if (btnCopyRadius)
                btnCopyRadius.onclick = function () { copyToClipboard(window._providerInfoRadiusSecret || ''); };
        }).catch(function () {
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
        if (!grid || !formEl)
            return;
        if (nameInput)
            nameInput.value = lastProviderInfo.name;
        if (slugInput)
            slugInput.value = lastProviderInfo.slug;
        if (emailInput)
            emailInput.value = lastProviderInfo.masterEmail;
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
        if (grid)
            grid.classList.remove('d-none');
        if (formEl)
            formEl.classList.add('d-none');
    }
    var btnEditProvider = byId('btnEditProvider');
    safeAddEvent(btnEditProvider, 'click', showProviderEditForm);
    var btnCancelEditProvider = byId('btnCancelEditProvider');
    safeAddEvent(btnCancelEditProvider, 'click', hideProviderEditForm);
    var btnSaveProvider = byId('btnSaveProvider');
    safeAddEvent(btnSaveProvider, 'click', function () {
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
        if (name)
            payload.name = name;
        if (slug)
            payload.slug = slug;
        if (masterEmail)
            payload.masterEmail = masterEmail;
        if (Object.keys(payload).length === 0) {
            hideProviderEditForm();
            return;
        }
        btnSaveProvider.disabled = true;
        api('/installation', { method: 'PUT', body: JSON.stringify(payload) }).then(function () {
            loadProviderInfo();
            loadTenants();
            hideProviderEditForm();
        }).catch(function (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Erro ao salvar.';
                errEl.classList.remove('d-none');
            }
        }).finally(function () {
            btnSaveProvider.disabled = false;
        });
    });
    function updateLogoPreview(fieldId) {
        var input = byId(fieldId);
        var previewId = fieldId + 'Preview';
        var wrapId = fieldId + 'PreviewWrap';
        var img = byId(previewId);
        var wrap = byId(wrapId);
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
    function doLogoUpload(fileInputId, type, urlInputId) {
        var fileInput = byId(fileInputId);
        var urlInput = byId(urlInputId);
        if (!fileInput || !urlInput || !fileInput.files || !fileInput.files.length)
            return;
        var file = fileInput.files[0];
        var formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);
        var btn = byId('btnAdminProvLogoPortalUpload');
        if (type === 'site')
            btn = byId('btnAdminProvLogoSiteUpload');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        }
        fetch('/api/saas/upload-logo', {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        }).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok)
                    throw new Error(data.message || 'Falha no upload');
                return data;
            });
        }).then(function (data) {
            if (data.url) {
                urlInput.value = data.url;
                updateLogoPreview(urlInputId);
            }
            fileInput.value = '';
        }).catch(function (err) {
            alert(err.message || 'Erro ao enviar logo.');
        }).finally(function () {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-upload me-1"></i> Enviar';
            }
        });
    }
    function doHotspotCertUpload(fileInputId, targetInputId, buttonId) {
        var fileInput = byId(fileInputId);
        var targetInput = byId(targetInputId);
        var btn = byId(buttonId);
        var errEl = byId('wifiModelsError');
        if (!fileInput || !targetInput || !fileInput.files || !fileInput.files.length)
            return;
        var file = fileInput.files[0];
        var formData = new FormData();
        formData.append('file', file);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        }
        fetch('/api/admin/upload-hotspot-cert', {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        }).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok)
                    throw new Error(data.message || 'Falha no upload');
                return data;
            });
        }).then(function (data) {
            targetInput.value = data.absolute_path || data.relative_path || '';
            fileInput.value = '';
            if (errEl)
                errEl.classList.add('d-none');
            renderWifiPreviewFromEditor();
        }).catch(function (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Falha no upload do certificado.';
                errEl.classList.remove('d-none');
            }
        }).finally(function () {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Enviar';
            }
        });
    }
    function loadAdminProviderSettings() {
        var errEl = byId('adminProviderFormError');
        if (errEl) {
            errEl.classList.add('d-none');
            errEl.textContent = '';
        }
        api('/installation-provider').then(function (data) {
            var s = data.settings || {};
            var set = function (id, val) {
                var el = byId(id);
                if (el)
                    el.value = val != null ? val : '';
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
        }).catch(function (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Erro ao carregar dados do provedor.';
                errEl.classList.remove('d-none');
            }
        });
    }
    function collectAdminProviderPayload() {
        var get = function (id) {
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
    safeAddEvent(byId('btnAdminProvLogoPortalUpload'), 'click', function () {
        var input = byId('adminProvLogoPortalFile');
        if (input)
            input.click();
    });
    safeAddEvent(byId('adminProvLogoPortalFile'), 'change', function () {
        doLogoUpload('adminProvLogoPortalFile', 'portal', 'adminProvLogoPortal');
    });
    safeAddEvent(byId('btnAdminProvLogoSiteUpload'), 'click', function () {
        var input = byId('adminProvLogoSiteFile');
        if (input)
            input.click();
    });
    safeAddEvent(byId('adminProvLogoSiteFile'), 'change', function () {
        doLogoUpload('adminProvLogoSiteFile', 'site', 'adminProvLogoSite');
    });
    safeAddEvent(byId('adminProvLogoPortal'), 'input', function () {
        updateLogoPreview('adminProvLogoPortal');
    });
    safeAddEvent(byId('adminProvLogoSite'), 'input', function () {
        updateLogoPreview('adminProvLogoSite');
    });
    var btnAdminProviderReload = byId('btnAdminProviderReload');
    safeAddEvent(btnAdminProviderReload, 'click', loadAdminProviderSettings);
    var btnAdminProviderSave = byId('btnAdminProviderSave');
    safeAddEvent(btnAdminProviderSave, 'click', function () {
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
        api('/installation-provider', { method: 'PUT', body: JSON.stringify(payload) }).then(function () {
            loadAdminProviderSettings();
        }).catch(function (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Erro ao salvar.';
                errEl.classList.remove('d-none');
            }
        }).finally(function () {
            btnAdminProviderSave.disabled = false;
        });
    });
    function copyToClipboard(text) {
        if (!text)
            return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { }).catch(function () {
                fallbackCopy(text);
            });
        }
        else {
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
        try {
            document.execCommand('copy');
        }
        catch (e) { }
        document.body.removeChild(ta);
    }
    var tenantsCache = [];
    function renderTenantsTable(tenants) {
        var out = byId('outTenants');
        var searchEl = byId('tenantsSearch');
        var countEl = byId('tenantsCountText');
        var term = ((searchEl && searchEl.value) || '').trim().toLowerCase();
        var filtered = term ? tenants.filter(function (t) {
            return (t.name && t.name.toLowerCase().indexOf(term) >= 0) ||
                (t.slug && t.slug.toLowerCase().indexOf(term) >= 0);
        }) : tenants;
        if (countEl) {
            countEl.textContent = filtered.length === tenants.length
                ? (filtered.length + ' provedor(es)')
                : (filtered.length + ' de ' + tenants.length);
        }
        if (!out)
            return;
        if (!filtered.length) {
            if (!tenants.length) {
                out.innerHTML = '<div class="saas-tenants__empty"><i class="bi bi-building"></i><p class="mb-1 fw-semibold">Nenhum provedor cadastrado</p><p class="small mb-0">Clique em <strong>Novo provedor</strong> para criar o primeiro.</p></div>';
            }
            else {
                out.innerHTML = '<div class="saas-tenants__empty"><i class="bi bi-search"></i><p class="mb-1 fw-semibold">Nenhum resultado</p><p class="small mb-0">Tente outro termo na busca.</p></div>';
            }
            return;
        }
        var html = '<table class="table table-sm table-hover saas-tenants__table"><thead><tr>' +
            '<th>Nome</th><th>Slug</th><th>Status</th><th>Stack</th><th>Containers</th><th>Domínio</th><th>Usuários</th><th>Provisionado</th><th style="width:1%"></th>' +
            '</tr></thead><tbody>';
        filtered.forEach(function (t) {
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
        if (!out)
            return;
        out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Carregando...';
        api('/tenants').then(function (data) {
            tenantsCache = data.tenants || [];
            renderTenantsTable(tenantsCache);
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    safeAddEvent(byId('btnLogout'), 'click', function (e) {
        e.preventDefault();
        fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).finally(function () {
            redirectLogin();
        });
    });
    document.querySelectorAll('[data-tab]').forEach(function (a) {
        a.addEventListener('click', function (e) {
            e.preventDefault();
            var tab = a.getAttribute('data-tab');
            document.querySelectorAll('.admin-sidebar__nav a').forEach(function (n) {
                n.classList.remove('active');
            });
            a.classList.add('active');
            document.querySelectorAll('.admin-tab').forEach(function (t) {
                t.classList.remove('active');
            });
            var target = byId('tab-' + tab);
            if (target)
                target.classList.add('active');
            if (tab === 'tenants')
                loadTenants();
            else if (tab === 'overview') {
                loadStats();
                loadProviderInfo();
                loadAdminProviderSettings();
            }
            else if (tab === 'radius')
                loadRadiusStatus();
            else if (tab === 'wifi-models')
                loadWifiModels();
            else if (tab === 'nas') {
                loadNasTenantOptions();
                loadNasListForSelected();
            }
        });
    });
    safeAddEvent(byId('btnLoadTenants'), 'click', loadTenants);
    var searchTenantsEl = byId('tenantsSearch');
    safeAddEvent(searchTenantsEl, 'input', function () {
        renderTenantsTable(tenantsCache);
    });
    document.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('[data-action-delete-tenant]');
        if (!btn)
            return;
        e.preventDefault();
        var id = btn.getAttribute('data-tenant-id');
        var name = btn.getAttribute('data-tenant-name') || '—';
        if (id)
            window.openTenantDelete(parseInt(id, 10), name);
    });
    safeAddEvent(byId('btnConfirmTenantDelete'), 'click', function () {
        var modalEl = byId('modalTenantDelete');
        var id = modalEl && modalEl.dataset.deleteTenantId;
        var hardEl = byId('deleteTenantHard');
        if (!id)
            return;
        var hard = hardEl && hardEl.checked;
        var btn = this;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Excluindo...';
        api('/tenants/' + encodeURIComponent(id) + (hard ? '?hard=1' : ''), { method: 'DELETE' })
            .then(function (data) {
            hideModal(modalEl);
            loadTenants();
            loadStats();
            if (data.deprovisioning && data.deprovisioning.log && data.deprovisioning.log.length) {
                console.log('[Deprovision]', data.deprovisioning.log.join('\n'));
            }
        })
            .catch(function (err) {
            alert(err.message || 'Erro ao excluir.');
        })
            .finally(function () {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-trash me-1"></i> Excluir';
        });
    });
    var copySlugBtn = byId('btnCopySlug');
    safeAddEvent(copySlugBtn, 'click', function () {
        var slugEl = byId('manageSlug');
        if (!slugEl || !slugEl.value)
            return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(slugEl.value).then(function () {
                copySlugBtn.innerHTML = '<i class="bi bi-check"></i>';
                setTimeout(function () {
                    copySlugBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
                }, 1500);
            });
        }
        else {
            fallbackCopy(slugEl.value);
        }
    });
    var copyRadiusBtn = byId('btnCopyRadiusSecret');
    safeAddEvent(copyRadiusBtn, 'click', function () {
        var secretEl = byId('manageRadiusSecret');
        if (!secretEl || !secretEl.dataset.secret)
            return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(secretEl.dataset.secret).then(function () {
                copyRadiusBtn.innerHTML = '<i class="bi bi-check"></i>';
                setTimeout(function () {
                    copyRadiusBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
                }, 1500);
            });
        }
        else {
            fallbackCopy(secretEl.dataset.secret);
        }
    });
    var radiusTestBtnTenant = byId('btnRadiusTestTenant');
    safeAddEvent(radiusTestBtnTenant, 'click', function () {
        var userEl = byId('manageRadiusUser');
        var passEl = byId('manageRadiusPass');
        var resultEl = byId('manageRadiusTestResult');
        var idEl = byId('manageTenantId');
        if (!userEl || !passEl || !resultEl || !idEl || !idEl.value)
            return;
        var user = (userEl.value || '').trim();
        var pass = passEl.value || '';
        if (!user) {
            resultEl.innerHTML = '<span class="text-danger">Informe o usuário PPPoE.</span>';
            return;
        }
        resultEl.innerHTML = '<span class="text-muted">Testando...</span>';
        var body = { username: user, password: pass, tenantId: parseInt(idEl.value, 10) };
        api('/radius-test', { method: 'POST', body: JSON.stringify(body) }).then(function (data) {
            if (data.success) {
                resultEl.innerHTML = '<span class="text-success"><i class="bi bi-check-circle"></i> Autenticação OK.</span>';
            }
            else {
                resultEl.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle"></i> ' + esc(data.message || 'Falha') + '</span>';
            }
        }).catch(function (err) {
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
        document.querySelectorAll('[data-log-service]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-log-service') === service);
        });
    }
    function loadTenantLogs() {
        var tenantId = getCurrentTenantIdFromManage();
        var out = byId('manageStackLogs');
        if (!tenantId || !out)
            return;
        var service = getSelectedLogService();
        out.textContent = 'Carregando logs de ' + service + '...';
        api('/tenants/' + encodeURIComponent(tenantId) + '/logs?service=' + encodeURIComponent(service) + '&tail=100')
            .then(function (data) {
            if (!data.ok) {
                out.textContent = 'Falha ao obter logs: ' + (data.message || 'Erro');
                return;
            }
            var stdout = data.stdout || '';
            var stderr = data.stderr || '';
            var combined = stdout + (stderr ? '\n[stderr]\n' + stderr : '');
            out.textContent = combined || 'Nenhum log retornado para este serviço.';
        })
            .catch(function (err) {
            out.textContent = 'Erro ao carregar logs: ' + (err.message || String(err));
        });
    }
    document.querySelectorAll('[data-log-service]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var svc = this.getAttribute('data-log-service') || 'portal';
            setSelectedLogService(svc);
            loadTenantLogs();
        });
    });
    var reloadLogsBtn = byId('btnReloadLogs');
    safeAddEvent(reloadLogsBtn, 'click', function () {
        loadTenantLogs();
    });
    var restartStackBtn = byId('btnRestartStack');
    safeAddEvent(restartStackBtn, 'click', function () {
        var tenantId = getCurrentTenantIdFromManage();
        if (!tenantId)
            return;
        if (!confirm('Reiniciar stack (portal, site, RADIUS, Postgres) deste provedor?'))
            return;
        restartStackBtn.disabled = true;
        restartStackBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Reiniciando...';
        api('/tenants/' + encodeURIComponent(tenantId) + '/stack/restart', { method: 'POST', body: JSON.stringify({}) })
            .then(function (data) {
            alert(data.message || (data.ok ? 'Stack reiniciado.' : 'Falha ao reiniciar.'));
            loadTenantLogs();
        })
            .catch(function (err) {
            alert(err.message || 'Erro ao reiniciar stack.');
        })
            .finally(function () {
            restartStackBtn.disabled = false;
            restartStackBtn.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i> Reiniciar stack';
        });
    });
    var removeStackBtn = byId('btnRemoveStack');
    safeAddEvent(removeStackBtn, 'click', function () {
        var tenantId = getCurrentTenantIdFromManage();
        if (!tenantId)
            return;
        if (!confirm('Remover apenas o stack Docker deste provedor? O provedor continuará cadastrado, mas sem containers.'))
            return;
        removeStackBtn.disabled = true;
        removeStackBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Removendo...';
        api('/tenants/' + encodeURIComponent(tenantId) + '/stack/remove', { method: 'POST', body: JSON.stringify({}) })
            .then(function (data) {
            alert(data.message || (data.ok ? 'Stack removido.' : 'Falha ao remover stack.'));
            loadTenantLogs();
        })
            .catch(function (err) {
            alert(err.message || 'Erro ao remover stack.');
        })
            .finally(function () {
            removeStackBtn.disabled = false;
            removeStackBtn.innerHTML = '<i class="bi bi-x-circle me-1"></i> Remover stack';
        });
    });
    var btnCopyPortalLinkPath = byId('btnCopyPortalLinkPath');
    safeAddEvent(btnCopyPortalLinkPath, 'click', function () {
        var input = byId('managePortalLinkPath');
        if (!input || !input.value || input.value === '—')
            return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(input.value).then(function () {
                var icon = btnCopyPortalLinkPath.querySelector('i');
                if (icon) {
                    icon.className = 'bi bi-check';
                    setTimeout(function () { icon.className = 'bi bi-clipboard'; }, 1500);
                }
            });
        }
        else {
            fallbackCopy(input.value);
        }
    });
    var btnCopyNginxSnippet = byId('btnCopyNginxSnippet');
    safeAddEvent(btnCopyNginxSnippet, 'click', function () {
        var preEl = byId('nginxSnippetPre');
        if (!preEl || !preEl.textContent || preEl.textContent === 'Carregando...')
            return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(preEl.textContent).then(function () {
                var html = btnCopyNginxSnippet.innerHTML;
                btnCopyNginxSnippet.innerHTML = '<i class="bi bi-check me-1"></i>Copiado!';
                setTimeout(function () {
                    btnCopyNginxSnippet.innerHTML = html;
                }, 2000);
            });
        }
        else {
            fallbackCopy(preEl.textContent);
        }
    });
    var openDomainFromManageBtn = byId('btnOpenDomainFromManage');
    safeAddEvent(openDomainFromManageBtn, 'click', function () {
        var idEl = byId('manageTenantId');
        var subEl = byId('manageSubdomain');
        var customEl = byId('manageCustomDomain');
        var statusEl = byId('manageStatus');
        var id = idEl && idEl.value;
        var sub = subEl && subEl.value;
        var custom = customEl && customEl.value;
        var status = statusEl && statusEl.value;
        var fakeBtn = {
            getAttribute: function (k) {
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
    safeAddEvent(manageStatusEl, 'change', function () {
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
    safeAddEvent(byId('btnNewTenant'), 'click', function () {
        var tenantName = byId('tenantName');
        var tenantSlug = byId('tenantSlug');
        var masterName = byId('masterName');
        var masterEmail = byId('masterEmail');
        var masterPassword = byId('masterPassword');
        var tenantFormError = byId('tenantFormError');
        var modalEl = byId('modalTenant');
        if (tenantName)
            tenantName.value = '';
        if (tenantSlug)
            tenantSlug.value = '';
        if (masterName)
            masterName.value = '';
        if (masterEmail)
            masterEmail.value = '';
        if (masterPassword)
            masterPassword.value = '';
        if (tenantFormError)
            tenantFormError.classList.add('d-none');
        if (tenantFormFieldsEl)
            tenantFormFieldsEl.style.display = '';
        if (tenantProvisionResultEl)
            tenantProvisionResultEl.classList.add('d-none');
        if (modalTenantFooter) {
            var cancelBtn = modalTenantFooter.querySelector('[data-bs-dismiss="modal"]');
            if (cancelBtn) {
                cancelBtn.textContent = 'Cancelar';
                cancelBtn.style.display = '';
            }
        }
        if (btnSaveTenantEl)
            btnSaveTenantEl.style.display = '';
        if (!modalEl)
            return;
        var Modal = getBootstrapModal();
        if (Modal) {
            if (!modalTenant)
                modalTenant = new Modal(modalEl);
            modalTenant.show();
        }
        else {
            showModal(modalEl);
        }
    });
    safeAddEvent(byId('btnSaveTenant'), 'click', function () {
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
        if (errEl)
            errEl.classList.add('d-none');
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
        if (!btn)
            return;
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
        }).then(function (data) {
            loadTenants();
            loadStats();
            btn.disabled = false;
            var prov = data.provisioning;
            var logLines = (prov && Array.isArray(prov.log)) ? prov.log : [];
            if (tenantProvisionLogEl) {
                tenantProvisionLogEl.textContent = logLines.join('\n') || '(nenhum log)';
            }
            if (tenantProvisionMessageEl) {
                tenantProvisionMessageEl.className = 'alert mb-2 ' + (prov && prov.success ? 'alert-success' :
                    (prov && prov.skipped ? 'alert-warning' : 'alert-danger'));
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
                }
                else {
                    tenantProvisionUrlEl.textContent = '';
                    tenantProvisionUrlEl.classList.add('d-none');
                }
            }
            if (tenantProvisionResultEl)
                tenantProvisionResultEl.classList.remove('d-none');
            if (tenantFormFieldsEl)
                tenantFormFieldsEl.style.display = 'none';
            if (modalTenantFooter) {
                var cancelBtn = modalTenantFooter.querySelector('[data-bs-dismiss="modal"]');
                if (cancelBtn)
                    cancelBtn.textContent = 'Fechar';
            }
            if (btnSaveTenantEl)
                btnSaveTenantEl.style.display = 'none';
        }).catch(function (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Erro ao criar provedor.';
                errEl.classList.remove('d-none');
            }
            btn.disabled = false;
        });
    });
    var btnSaveDomain = byId('btnSaveTenantDomain');
    safeAddEvent(btnSaveDomain, 'click', function () {
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
        if (errEl)
            errEl.classList.add('d-none');
        if (!id) {
            if (errEl) {
                errEl.textContent = 'Provedor não identificado.';
                errEl.classList.remove('d-none');
            }
            return;
        }
        var btn = byId('btnSaveTenantDomain');
        if (!btn)
            return;
        btn.disabled = true;
        api('/tenants/' + encodeURIComponent(id), {
            method: 'PATCH',
            body: JSON.stringify({
                subdomain: subdomain || '',
                custom_domain: customDomain || '',
                status: status.trim()
            })
        }).then(function () {
            var modalEl = byId('modalTenantDomain');
            hideModal(modalEl);
            var formEl = byId('manageTenantForm');
            if (formEl && !formEl.classList.contains('d-none')) {
                var mSub = byId('manageSubdomain');
                var mCustom = byId('manageCustomDomain');
                var mStatus = byId('manageStatus');
                if (mSub && editSubdomain)
                    mSub.value = editSubdomain.value || '';
                if (mCustom && editCustomDomain)
                    mCustom.value = editCustomDomain.value || '';
                if (mStatus && editTenantStatus)
                    mStatus.value = editTenantStatus.value || 'ACTIVE';
                if (manageBadgeEl && mStatus) {
                    manageBadgeEl.textContent = statusLabel(mStatus.value);
                    manageBadgeEl.className = 'tenant-modal__badge ' + statusBadgeClass(mStatus.value);
                }
            }
            loadTenants();
            loadStats();
            btn.disabled = false;
        }).catch(function (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Erro ao salvar.';
                errEl.classList.remove('d-none');
            }
            btn.disabled = false;
        });
    });
    var btnSaveManage = byId('btnSaveTenantManage');
    safeAddEvent(btnSaveManage, 'click', function () {
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
        if (errEl)
            errEl.classList.add('d-none');
        if (!id) {
            if (errEl) {
                errEl.textContent = 'Provedor não identificado.';
                errEl.classList.remove('d-none');
            }
            return;
        }
        var btn = byId('btnSaveTenantManage');
        if (!btn)
            return;
        btn.disabled = true;
        api('/tenants/' + encodeURIComponent(id), {
            method: 'PATCH',
            body: JSON.stringify({
                name: name.trim(),
                status: status.trim(),
                subdomain: subdomain || '',
                custom_domain: customDomain || ''
            })
        }).then(function () {
            var modalEl = byId('modalTenantManage');
            hideModal(modalEl);
            loadTenants();
            loadStats();
            btn.disabled = false;
        }).catch(function (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Erro ao salvar.';
                errEl.classList.remove('d-none');
            }
            btn.disabled = false;
        });
    });
    function loadRadiusStatus() {
        var out = byId('outRadiusStatus');
        if (!out)
            return;
        out.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Carregando...';
        api('/radius-status').then(function (data) {
            var g = data.global || {};
            var tenants = data.tenants || [];
            var html = '<p class="mb-2"><strong>RADIUS global (.env):</strong> ';
            if (g.configured) {
                html += '<span class="badge bg-success">Configurado</span> ' + esc(g.host) + ':' + (g.port || 1812);
                if (g.nasIp)
                    html += ' &nbsp; NAS-IP: <code>' + esc(g.nasIp) + '</code>';
            }
            else {
                html += '<span class="badge bg-secondary">Não configurado</span> ' + (g.message || '');
            }
            html += '</p><p class="mb-0 small text-muted">Provedores com RADIUS em config_json:</p><ul class="list-unstyled small mt-1">';
            if (!tenants.length) {
                html += '<li class="text-muted">Nenhum</li>';
            }
            else {
                tenants.forEach(function (t) {
                    html += '<li>' + esc(t.tenantName) + ' (' + esc(t.slug) + '): ';
                    if (t.configured) {
                        html += '<span class="badge bg-success">OK</span> ' + esc(t.host) + ':' + (t.port || 1812) + (t.nasIp ? ' NAS-IP: ' + esc(t.nasIp) : '');
                    }
                    else {
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
                tenants.forEach(function (t) {
                    if (t.configured)
                        sel.appendChild(new Option(t.tenantName + ' (' + t.slug + ')', t.tenantId));
                });
            }
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    var btnRestart = byId('btnRadiusRestart');
    safeAddEvent(btnRestart, 'click', function () {
        var btn = this;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Reiniciando...';
        api('/radius-restart', { method: 'POST' }).then(function (data) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Reiniciar RADIUS';
            if (data.ok) {
                loadRadiusStatus();
                alert('RADIUS reiniciado com sucesso.');
            }
            else {
                alert(data.message || 'Falha ao reiniciar.');
            }
        }).catch(function (err) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Reiniciar RADIUS';
            alert(err.message || 'Erro ao reiniciar RADIUS.');
        });
    });
    safeAddEvent(byId('btnRadiusTest'), 'click', function () {
        var tenantSel = byId('radiusTestTenant');
        var tenantId = tenantSel && tenantSel.value ? tenantSel.value : '';
        var user = (byId('radiusTestUser') && byId('radiusTestUser').value) || '';
        var pass = (byId('radiusTestPass') && byId('radiusTestPass').value) || '';
        var resultEl = byId('radiusTestResult');
        if (!user) {
            if (resultEl)
                resultEl.innerHTML = '<span class="text-danger">Informe o usuário.</span>';
            return;
        }
        if (!resultEl)
            return;
        resultEl.innerHTML = '<span class="text-muted">Testando...</span>';
        var body = { username: user, password: pass };
        if (tenantId)
            body.tenantId = parseInt(tenantId, 10);
        api('/radius-test', { method: 'POST', body: JSON.stringify(body) }).then(function (data) {
            if (data.success) {
                resultEl.innerHTML = '<span class="text-success"><i class="bi bi-check-circle"></i> Autenticação OK.</span>';
            }
            else {
                resultEl.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle"></i> ' + esc(data.message || 'Falha') + '</span>';
            }
        }).catch(function (err) {
            resultEl.innerHTML = '<span class="text-danger">' + esc(err.message) + '</span>';
        });
    });
    var wifiModelsCache = [];
    var wifiModelLastGeneratedFileName = 'mikrotik-hotspot.rsc';
    function splitLines(value) {
        return String(value || '').split(/\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean);
    }
    function renderWifiModelRscWarnings(messages) {
        var out = byId('wifiModelMikrotikWarnings');
        if (!out)
            return;
        if (!Array.isArray(messages) || !messages.length) {
            out.innerHTML = '';
            return;
        }
        out.innerHTML = messages.map(function (message) {
            return '<div class="alert alert-warning py-2 mb-2 small">' + esc(message) + '</div>';
        }).join('');
    }
    function readWifiPixPlans() {
        return splitLines((byId('wifiModelPixPlans') && byId('wifiModelPixPlans').value) || '').map(function (line) {
            var parts = line.split('|');
            return {
                name: (parts[0] || '').trim(),
                price: Number(parts[1] || 0),
                duration_minutes: Number(parts[2] || 60),
                active: true
            };
        }).filter(function (plan) { return plan.name; });
    }
    function refreshWifiRuntimeInfo() {
        var origin = window.location.origin || '';
        var slug = ((byId('wifiModelSlug') && byId('wifiModelSlug').value) || '').trim();
        var tenantSlug = 'tico';
        var certPath = ((byId('wifiModelHotspotCertPath') && byId('wifiModelHotspotCertPath').value) || '').trim();
        var portalUrl = ((byId('wifiModelMikrotikPortalUrl') && byId('wifiModelMikrotikPortalUrl').value) || '').trim();
        var runtimePortalUrl = portalUrl || (slug ? (origin + '/hotspot/' + tenantSlug + '/' + slug) : '');
        var runtimeWalledGarden = splitLines((byId('wifiModelMikrotikWalledGarden') && byId('wifiModelMikrotikWalledGarden').value) || '').join(', ');
        function setValue(id, value) {
            if (byId(id))
                byId(id).value = value || '';
        }
        setValue('wifiModelRuntimePortalUrl', runtimePortalUrl);
        setValue('wifiModelRuntimeWebhookUrl', slug ? (origin + '/api/hotspot/efi/webhook/' + tenantSlug + '/' + slug + '/pix') : '');
        setValue('wifiModelRuntimePixApi', slug ? ('POST ' + origin + '/api/hotspot/' + tenantSlug + '/templates/' + slug + '/pix/charges') : '');
        setValue('wifiModelRuntimeRadiusApi', slug ? ('POST ' + origin + '/api/hotspot/' + tenantSlug + '/templates/' + slug + '/radius/login') : '');
        setValue('wifiModelRuntimeVoucherApi', slug ? ('POST ' + origin + '/api/hotspot/' + tenantSlug + '/templates/' + slug + '/voucher/login') : '');
        setValue('wifiModelRuntimeOtpApi', slug ? ('POST ' + origin + '/api/hotspot/' + tenantSlug + '/templates/' + slug + '/phone/request-otp') : '');
        setValue('wifiModelRuntimeConnectedUrl', origin + '/hotspot/conectado?tenant=' + tenantSlug + '&session={session_key}');
        setValue('wifiModelRuntimeCertInfo', certPath ? ('Configurado em: ' + certPath) : 'Nenhum certificado enviado');
        setValue('wifiModelRuntimeMikrotikApi', slug ? ('GET ' + origin + '/api/portal/wifi/mikrotik-config?template_id={id}&portal_url=' + encodeURIComponent(runtimePortalUrl)) : '');
        setValue('wifiModelRuntimeWalledGarden', runtimeWalledGarden || 'Sem extras configurados');
    }
    function renderWifiPreviewFromEditor() {
        var preview = byId('wifiModelPreview');
        if (!preview)
            return;
        refreshWifiRuntimeInfo();
        var authType = (byId('wifiModelAuthType') && byId('wifiModelAuthType').value) || '';
        var authLabel = authType === 'phone' ? 'Telefone'
            : authType === 'radius' ? 'RADIUS'
                : authType === 'temporary_pix' ? 'Freemium + Pix'
                    : authType === 'pix' ? 'Pix'
                        : authType === 'voucher' ? 'Voucher'
                            : authType === 'social' ? 'Login social'
                                : authType === 'custom_portal' ? 'Portal customizado'
                                    : authType === 'simple_login' ? 'Login básico'
                                        : authType;
        var idealFor = splitLines((byId('wifiModelIdealFor') && byId('wifiModelIdealFor').value) || '');
        var features = splitLines((byId('wifiModelFeatures') && byId('wifiModelFeatures').value) || '');
        var flowSteps = splitLines((byId('wifiModelFlowSteps') && byId('wifiModelFlowSteps').value) || '');
        var technologies = splitLines((byId('wifiModelTechnologies') && byId('wifiModelTechnologies').value) || '');
        var pixPlans = readWifiPixPlans();
        var extras = splitLines((byId('wifiModelExtras') && byId('wifiModelExtras').value) || '');
        var logoUrl = (byId('wifiModelLogoUrl') && byId('wifiModelLogoUrl').value) || '';
        var isPixMode = authType === 'pix' || authType === 'temporary_pix';
        var paymentGatewayLabel = (byId('wifiModelHotspotGatewayName') && byId('wifiModelHotspotGatewayName').value) || (isPixMode ? 'EFI Hotspot' : '');
        var paymentGatewayType = (byId('wifiModelHotspotGatewayType') && byId('wifiModelHotspotGatewayType').value) || (isPixMode ? 'efi' : '');
        var paymentPixKey = (byId('wifiModelHotspotPixKey') && byId('wifiModelHotspotPixKey').value) || (isPixMode ? 'SUA_CHAVE_PIX_EFI' : '');
        var paymentClientId = ((byId('wifiModelHotspotClientId') && byId('wifiModelHotspotClientId').value) || '').trim();
        var paymentCertPath = ((byId('wifiModelHotspotCertPath') && byId('wifiModelHotspotCertPath').value) || '').trim();
        var paymentWebhookUrl = ((byId('wifiModelHotspotWebhookUrl') && byId('wifiModelHotspotWebhookUrl').value) || '').trim();
        var paymentSandbox = !!(byId('wifiModelHotspotSandbox') && byId('wifiModelHotspotSandbox').checked);
        var radiusHost = ((byId('wifiModelHotspotRadiusHost') && byId('wifiModelHotspotRadiusHost').value) || '').trim();
        var radiusPort = ((byId('wifiModelHotspotRadiusPort') && byId('wifiModelHotspotRadiusPort').value) || '').trim();
        var radiusSecret = ((byId('wifiModelHotspotRadiusSecret') && byId('wifiModelHotspotRadiusSecret').value) || '').trim();
        var radiusNasIp = ((byId('wifiModelHotspotRadiusNasIp') && byId('wifiModelHotspotRadiusNasIp').value) || '').trim();
        var primaryCta = authType === 'phone' ? 'Entrar com telefone'
            : authType === 'radius' ? 'Entrar com usuario'
                : authType === 'temporary_pix' ? 'Continuar e pagar'
                    : authType === 'pix' ? 'Gerar Pix'
                        : authType === 'voucher' ? 'Validar voucher'
                            : authType === 'social' ? 'Continuar com login social'
                                : authType === 'custom_portal' ? 'Abrir portal'
                                    : 'Conectar';
        var secondaryLine = authType === 'phone' ? 'Informe seu numero para liberar o acesso'
            : authType === 'radius' ? 'Use o mesmo usuario do provedor'
                : authType === 'temporary_pix' ? 'Use um tempo gratis e depois libere com Pix'
                    : authType === 'pix' ? 'Escolha um plano e pague instantaneamente'
                        : authType === 'voucher' ? 'Digite o codigo entregue ao visitante'
                            : authType === 'social' ? 'Conecte em segundos com um clique'
                                : authType === 'custom_portal' ? 'Experiencia visual personalizada para a sua marca'
                                    : 'Acesso simples ao hotspot';
        var deviceFields = authType === 'phone'
            ? '<label>Numero de telefone</label><div class="wifi-device-preview__input">(94) 98403-5121</div><div class="wifi-device-preview__helper">Codigo por WhatsApp ou SMS</div>'
            : authType === 'radius'
                ? '<label>Usuario RADIUS</label><div class="wifi-device-preview__input">cliente@provedor</div><label class="mt-2">Senha</label><div class="wifi-device-preview__input">••••••••</div>'
                : authType === 'voucher'
                    ? '<label>Voucher</label><div class="wifi-device-preview__input">EVENTO-2026-ABC123</div><div class="wifi-device-preview__helper">Acesso por tempo ou franquia</div>'
                    : authType === 'social'
                        ? '<div class="wifi-device-preview__socials"><span>Google</span><span>Facebook</span><span>WhatsApp</span></div>'
                        : authType === 'temporary_pix' || authType === 'pix'
                            ? '<div class="wifi-device-preview__plans">' + (pixPlans.length ? pixPlans.slice(0, 3).map(function (plan) {
                                return '<div class="wifi-device-preview__plan"><strong>' + esc(plan.name) + '</strong><span>R$ ' + Number(plan.price || 0).toFixed(2).replace('.', ',') + '</span><small>' + esc(plan.duration_minutes || 0) + ' min</small></div>';
                            }).join('') : '<div class="wifi-device-preview__plan"><strong>Pix 1 Hora</strong><span>R$ 2,00</span><small>60 min</small></div>') + '</div>'
                            : '<label>Acesso</label><div class="wifi-device-preview__input">Continuar para navegar</div>';
        var modernHtml = '<div class="wifi-model-preview">'
            + '<div class="wifi-model-preview__hero">'
            + '<div>'
            + '<div class="wifi-model-preview__eyebrow">Visao do modelo</div>'
            + '<div class="wifi-model-preview__title">' + esc((byId('wifiModelName') && byId('wifiModelName').value) || 'Modelo') + '</div>'
            + '<div class="wifi-model-preview__desc">' + esc((byId('wifiModelDescription') && byId('wifiModelDescription').value) || 'Sem descricao') + '</div>'
            + '</div>'
            + ((byId('wifiModelIsDefault') && byId('wifiModelIsDefault').checked) ? '<span class="badge bg-success">Padrao</span>' : '<span class="badge bg-secondary">Preview</span>')
            + '</div>'
            + '<div class="wifi-model-preview__device-grid">'
            + '<div class="wifi-device-preview">'
            + '<div class="wifi-device-preview__frame">'
            + '<div class="wifi-device-preview__notch"></div>'
            + '<div class="wifi-device-preview__screen">'
            + '<div class="wifi-device-preview__status"><span>09:41</span><span>Wi-Fi</span></div>'
            + '<div class="wifi-device-preview__brand">' + (logoUrl ? '<img src="' + esc(logoUrl) + '" alt="Logo da empresa" class="wifi-device-preview__logo">' : '<span class="wifi-device-preview__brand-text">Wi-Fi do Provedor</span>') + '</div>'
            + '<div class="wifi-device-preview__headline">' + esc((byId('wifiModelName') && byId('wifiModelName').value) || 'Acesso Wi-Fi') + '</div>'
            + '<div class="wifi-device-preview__subline">' + esc(secondaryLine) + '</div>'
            + '<div class="wifi-device-preview__pill">' + esc(authLabel || 'Autenticacao') + '</div>'
            + '<div class="wifi-device-preview__body">' + deviceFields + '</div>'
            + '<button type="button" class="wifi-device-preview__cta">' + esc(primaryCta) + '</button>'
            + '<div class="wifi-device-preview__footer">Portal captivo exibido no dispositivo do cliente</div>'
            + '</div>'
            + '</div>'
            + '</div>'
            + '<div class="wifi-model-preview__specs">'
            + '<div class="wifi-model-preview__badges">'
            + '<span class="badge text-bg-primary">' + esc(authLabel || 'Autenticacao') + '</span>'
            + ((byId('wifiModelPortalEnabled') && byId('wifiModelPortalEnabled').checked) ? '<span class="badge text-bg-light border">Portal captivo</span>' : '')
            + ((byId('wifiModelRadiusEnabled') && byId('wifiModelRadiusEnabled').checked) ? '<span class="badge text-bg-light border">RADIUS</span>' : '')
            + ((byId('wifiModelRequiresPhone') && byId('wifiModelRequiresPhone').checked) ? '<span class="badge text-bg-light border">Telefone</span>' : '')
            + ((byId('wifiModelPaymentRequired') && byId('wifiModelPaymentRequired').checked) ? '<span class="badge text-bg-light border">Pagamento</span>' : '')
            + ((byId('wifiModelBindMac') && byId('wifiModelBindMac').checked) ? '<span class="badge text-bg-light border">Bind MAC</span>' : '')
            + '</div>'
            + '<div class="wifi-model-preview__metrics">'
            + '<div class="wifi-model-preview__metric"><span>Tempo gratis</span><strong>' + esc((byId('wifiModelFreeMinutes') && byId('wifiModelFreeMinutes').value) || 0) + ' min</strong></div>'
            + '<div class="wifi-model-preview__metric"><span>Sessao</span><strong>' + esc((byId('wifiModelSessionTimeout') && byId('wifiModelSessionTimeout').value) || 0) + ' min</strong></div>'
            + '<div class="wifi-model-preview__metric"><span>Redirect</span><strong>' + esc((byId('wifiModelRedirectUrl') && byId('wifiModelRedirectUrl').value) || '-') + '</strong></div>'
            + '</div>'
            + '</div>'
            + '</div>';
        function renderModernList(title, items) {
            if (!items.length)
                return '';
            return '<div class="wifi-model-preview__block"><div class="wifi-model-preview__block-title">' + esc(title) + '</div><ul class="wifi-model-preview__list">' + items.map(function (item) {
                return '<li class="mb-1">' + esc(item) + '</li>';
            }).join('') + '</ul></div>';
        }
        modernHtml += renderModernList('Uso ideal', idealFor);
        modernHtml += renderModernList('Recursos', features);
        modernHtml += renderModernList('Fluxo operacional', flowSteps);
        modernHtml += renderModernList('Tecnologias', technologies);
        modernHtml += renderModernList('Gateway hotspot', [
            paymentGatewayLabel,
            paymentGatewayType ? ('Tipo: ' + paymentGatewayType) : '',
            paymentPixKey ? ('Chave: ' + paymentPixKey) : '',
            paymentClientId ? ('Client ID: ' + paymentClientId) : '',
            paymentCertPath ? 'Certificado carregado' : '',
            paymentWebhookUrl ? ('Webhook: ' + paymentWebhookUrl) : '',
            isPixMode ? ('Ambiente: ' + (paymentSandbox ? 'Sandbox' : 'Produção')) : ''
        ].filter(Boolean));
        modernHtml += renderModernList('RADIUS do hotspot', [
            radiusHost ? ('Host: ' + radiusHost) : '',
            radiusPort ? ('Porta: ' + radiusPort) : '',
            radiusNasIp ? ('NAS IP: ' + radiusNasIp) : '',
            radiusSecret ? 'Secret configurado' : ''
        ].filter(Boolean));
        modernHtml += renderModernList('Extras comerciais', extras);
        if (pixPlans.length) {
            modernHtml += '<div class="wifi-model-preview__block"><div class="wifi-model-preview__block-title">Planos Pix</div><div class="wifi-model-preview__pix-grid">';
            pixPlans.forEach(function (plan) {
                modernHtml += '<div class="wifi-model-preview__pix-card"><strong>' + esc(plan.name) + '</strong><span>R$ ' + Number(plan.price || 0).toFixed(2).replace('.', ',') + '</span><small>' + esc(plan.duration_minutes || 0) + ' min</small></div>';
            });
            modernHtml += '</div></div>';
        }
        modernHtml += '</div>';
        preview.innerHTML = modernHtml;
        return;
        var html = '<div class="border rounded-4 p-3 bg-white shadow-sm">'
            + '<div class="d-flex justify-content-between align-items-start gap-2 mb-2">'
            + '<div><div class="small text-muted text-uppercase mb-1">Modelo</div><div class="fw-bold">' + esc((byId('wifiModelName') && byId('wifiModelName').value) || 'Modelo') + '</div></div>'
            + ((byId('wifiModelIsDefault') && byId('wifiModelIsDefault').checked) ? '<span class="badge bg-success">Padrão</span>' : '<span class="badge bg-secondary">Preview</span>')
            + '</div>'
            + '<div class="small text-muted mb-3">' + esc((byId('wifiModelDescription') && byId('wifiModelDescription').value) || 'Sem descrição') + '</div>'
            + '<div class="d-flex flex-wrap gap-2 mb-3">'
            + '<span class="badge text-bg-primary">' + esc(authLabel || 'Autenticação') + '</span>'
            + ((byId('wifiModelPortalEnabled') && byId('wifiModelPortalEnabled').checked) ? '<span class="badge text-bg-light border">Portal captivo</span>' : '')
            + ((byId('wifiModelRadiusEnabled') && byId('wifiModelRadiusEnabled').checked) ? '<span class="badge text-bg-light border">RADIUS</span>' : '')
            + ((byId('wifiModelRequiresPhone') && byId('wifiModelRequiresPhone').checked) ? '<span class="badge text-bg-light border">Telefone</span>' : '')
            + ((byId('wifiModelPaymentRequired') && byId('wifiModelPaymentRequired').checked) ? '<span class="badge text-bg-light border">Pagamento</span>' : '')
            + ((byId('wifiModelBindMac') && byId('wifiModelBindMac').checked) ? '<span class="badge text-bg-light border">Bind MAC</span>' : '')
            + '</div>'
            + '<div class="small mb-3">'
            + '<div class="mb-1"><strong>Tempo grátis:</strong> ' + esc((byId('wifiModelFreeMinutes') && byId('wifiModelFreeMinutes').value) || 0) + ' min</div>'
            + '<div class="mb-1"><strong>Sessão:</strong> ' + esc((byId('wifiModelSessionTimeout') && byId('wifiModelSessionTimeout').value) || 0) + ' min</div>'
            + '<div><strong>Redirect:</strong> ' + esc((byId('wifiModelRedirectUrl') && byId('wifiModelRedirectUrl').value) || '—') + '</div>'
            + '</div>';
        function renderList(title, items) {
            if (!items.length)
                return '';
            return '<div class="mt-3"><div class="small text-muted text-uppercase mb-2">' + esc(title) + '</div><ul class="small ps-3 mb-0">' + items.map(function (item) {
                return '<li class="mb-1">' + esc(item) + '</li>';
            }).join('') + '</ul></div>';
        }
        html += renderList('Uso ideal', idealFor);
        html += renderList('Recursos', features);
        html += renderList('Fluxo operacional', flowSteps);
        html += renderList('Tecnologias', technologies);
        if (pixPlans.length) {
            html += '<div class="mt-3"><div class="small text-muted text-uppercase mb-2">Planos Pix</div><div class="d-flex flex-wrap gap-2">';
            pixPlans.forEach(function (plan) {
                html += '<span class="badge text-bg-light border">' + esc(plan.name) + ' · R$ ' + Number(plan.price || 0).toFixed(2).replace('.', ',') + ' · ' + esc(plan.duration_minutes || 0) + ' min</span>';
            });
            html += '</div></div>';
        }
        html += '</div>';
        preview.innerHTML = html;
    }
    function fillWifiModelEditor(row) {
        var cfg = row && row.config_json && typeof row.config_json === 'object' ? row.config_json : {};
        var pixPlans = Array.isArray(row && row.pix_plans) ? row.pix_plans : [];
        if (byId('wifiModelId'))
            byId('wifiModelId').value = row.id || '';
        if (byId('wifiModelName'))
            byId('wifiModelName').value = row.name || '';
        if (byId('wifiModelSlug'))
            byId('wifiModelSlug').value = row.slug || '';
        if (byId('wifiModelAuthType'))
            byId('wifiModelAuthType').value = row.auth_type || '';
        if (byId('wifiModelRedirectUrl'))
            byId('wifiModelRedirectUrl').value = row.redirect_url || '';
        if (byId('wifiModelLogoUrl'))
            byId('wifiModelLogoUrl').value = cfg.logo_url || '';
        if (byId('wifiModelHotspotGatewayName'))
            byId('wifiModelHotspotGatewayName').value = cfg.hotspot_gateway_name || '';
        if (byId('wifiModelHotspotGatewayType'))
            byId('wifiModelHotspotGatewayType').value = cfg.hotspot_gateway_type || '';
        if (byId('wifiModelHotspotPixKey'))
            byId('wifiModelHotspotPixKey').value = cfg.hotspot_pix_key || '';
        if (byId('wifiModelHotspotWebhookUrl'))
            byId('wifiModelHotspotWebhookUrl').value = cfg.hotspot_webhook_url || '';
        if (byId('wifiModelHotspotClientId'))
            byId('wifiModelHotspotClientId').value = cfg.hotspot_gateway_client_id || '';
        if (byId('wifiModelHotspotClientSecret'))
            byId('wifiModelHotspotClientSecret').value = cfg.hotspot_gateway_client_secret || '';
        if (byId('wifiModelHotspotCertPath'))
            byId('wifiModelHotspotCertPath').value = cfg.hotspot_gateway_certificate_path || '';
        if (byId('wifiModelHotspotCertKeyPath'))
            byId('wifiModelHotspotCertKeyPath').value = cfg.hotspot_gateway_certificate_key_path || '';
        if (byId('wifiModelHotspotCertPassphrase'))
            byId('wifiModelHotspotCertPassphrase').value = cfg.hotspot_gateway_certificate_passphrase || '';
        if (byId('wifiModelHotspotWebhookSecret'))
            byId('wifiModelHotspotWebhookSecret').value = cfg.hotspot_webhook_secret || '';
        if (byId('wifiModelHotspotBaseUrl'))
            byId('wifiModelHotspotBaseUrl').value = cfg.hotspot_gateway_base_url || '';
        if (byId('wifiModelHotspotSandbox'))
            byId('wifiModelHotspotSandbox').checked = !!cfg.hotspot_gateway_sandbox;
        if (byId('wifiModelHotspotRadiusHost'))
            byId('wifiModelHotspotRadiusHost').value = cfg.hotspot_radius_host || '';
        if (byId('wifiModelHotspotRadiusPort'))
            byId('wifiModelHotspotRadiusPort').value = cfg.hotspot_radius_port || 1812;
        if (byId('wifiModelHotspotRadiusSecret'))
            byId('wifiModelHotspotRadiusSecret').value = cfg.hotspot_radius_secret || '';
        if (byId('wifiModelHotspotRadiusNasIp'))
            byId('wifiModelHotspotRadiusNasIp').value = cfg.hotspot_radius_nas_ip || '';
        if (byId('wifiModelMikrotikPortalUrl'))
            byId('wifiModelMikrotikPortalUrl').value = cfg.mikrotik_portal_url || '';
        if (byId('wifiModelMikrotikDnsName'))
            byId('wifiModelMikrotikDnsName').value = cfg.mikrotik_dns_name || '';
        if (byId('wifiModelMikrotikInterface'))
            byId('wifiModelMikrotikInterface').value = cfg.mikrotik_interface || '';
        if (byId('wifiModelMikrotikBridge'))
            byId('wifiModelMikrotikBridge').value = cfg.mikrotik_bridge || '';
        if (byId('wifiModelMikrotikSsid'))
            byId('wifiModelMikrotikSsid').value = cfg.mikrotik_ssid || '';
        if (byId('wifiModelMikrotikHotspotAddress'))
            byId('wifiModelMikrotikHotspotAddress').value = cfg.mikrotik_hotspot_address || '';
        if (byId('wifiModelMikrotikHotspotMask'))
            byId('wifiModelMikrotikHotspotMask').value = cfg.mikrotik_hotspot_mask || 24;
        if (byId('wifiModelMikrotikCoaPort'))
            byId('wifiModelMikrotikCoaPort').value = cfg.mikrotik_coa_port || 3799;
        if (byId('wifiModelMikrotikPoolStart'))
            byId('wifiModelMikrotikPoolStart').value = cfg.mikrotik_pool_start || '';
        if (byId('wifiModelMikrotikPoolEnd'))
            byId('wifiModelMikrotikPoolEnd').value = cfg.mikrotik_pool_end || '';
        if (byId('wifiModelMikrotikPaymentHost'))
            byId('wifiModelMikrotikPaymentHost').value = cfg.mikrotik_payment_host || '';
        if (byId('wifiModelMikrotikWalledGarden'))
            byId('wifiModelMikrotikWalledGarden').value = Array.isArray(cfg.mikrotik_walled_garden) ? cfg.mikrotik_walled_garden.join('\n') : '';
        if (byId('wifiModelDescription'))
            byId('wifiModelDescription').value = row.description || '';
        if (byId('wifiModelFreeMinutes'))
            byId('wifiModelFreeMinutes').value = row.free_minutes || 0;
        if (byId('wifiModelSessionTimeout'))
            byId('wifiModelSessionTimeout').value = row.session_timeout_minutes || 0;
        if (byId('wifiModelPaymentAmount'))
            byId('wifiModelPaymentAmount').value = row.payment_amount != null ? row.payment_amount : '';
        if (byId('wifiModelPortalEnabled'))
            byId('wifiModelPortalEnabled').checked = !!row.portal_enabled;
        if (byId('wifiModelRadiusEnabled'))
            byId('wifiModelRadiusEnabled').checked = !!row.radius_enabled;
        if (byId('wifiModelRequiresPhone'))
            byId('wifiModelRequiresPhone').checked = !!row.requires_phone;
        if (byId('wifiModelPaymentRequired'))
            byId('wifiModelPaymentRequired').checked = !!row.payment_required;
        if (byId('wifiModelBindMac'))
            byId('wifiModelBindMac').checked = !!row.bind_mac;
        if (byId('wifiModelIsDefault'))
            byId('wifiModelIsDefault').checked = !!row.is_default;
        if (byId('wifiModelIdealFor'))
            byId('wifiModelIdealFor').value = Array.isArray(cfg.ideal_for) ? cfg.ideal_for.join('\n') : '';
        if (byId('wifiModelFeatures'))
            byId('wifiModelFeatures').value = Array.isArray(cfg.features) ? cfg.features.join('\n') : '';
        if (byId('wifiModelFlowSteps'))
            byId('wifiModelFlowSteps').value = Array.isArray(cfg.flow_steps) ? cfg.flow_steps.join('\n') : '';
        if (byId('wifiModelTechnologies'))
            byId('wifiModelTechnologies').value = Array.isArray(cfg.technologies) ? cfg.technologies.join('\n') : '';
        var extras = []
            .concat(Array.isArray(cfg.gateways_supported) ? cfg.gateways_supported : [])
            .concat(Array.isArray(cfg.ctas) ? cfg.ctas : [])
            .concat(Array.isArray(cfg.limitations) ? cfg.limitations : []);
        if (byId('wifiModelExtras'))
            byId('wifiModelExtras').value = extras.join('\n');
        if (byId('wifiModelPixPlans'))
            byId('wifiModelPixPlans').value = pixPlans.map(function (plan) {
                return [plan.name || '', plan.price || 0, plan.duration_minutes || 60].join('|');
            }).join('\n');
        if (byId('wifiModelEditorTitle'))
            byId('wifiModelEditorTitle').textContent = row.name || 'Modelo';
        if (byId('wifiModelEditorBadge'))
            byId('wifiModelEditorBadge').textContent = row.is_default ? 'Modelo padrão' : 'Modelo editável';
        if (byId('wifiModelsError'))
            byId('wifiModelsError').classList.add('d-none');
        renderWifiPreviewFromEditor();
    }
    function renderWifiModelsList(rows) {
        var out = byId('outWifiModels');
        if (!out)
            return;
        if (!rows || !rows.length) {
            out.innerHTML = '<div class="text-muted">Nenhum modelo encontrado.</div>';
            return;
        }
        var modernHtml = '<div class="wifi-models-list">';
        rows.forEach(function (row) {
            modernHtml += '<button type="button" class="wifi-model-card" data-wifi-model-edit="' + esc(row.id) + '">'
                + '<div class="wifi-model-card__top">'
                + '<div><div class="wifi-model-card__title">' + esc(row.name || 'Modelo') + '</div><div class="wifi-model-card__meta">' + esc(row.slug || '') + ' · ' + esc(row.auth_type || '') + '</div></div>'
                + '<div class="text-end">' + (row.is_default ? '<span class="badge bg-success mb-1">Padrao</span>' : '<span class="badge bg-secondary">Modelo</span>') + '</div>'
                + '</div>'
                + '<div class="wifi-model-card__desc">' + esc(row.description || 'Modelo pronto para configurar a jornada de acesso Wi-Fi.') + '</div>'
                + '<div class="wifi-model-card__flags">'
                + (row.portal_enabled ? '<span class="badge text-bg-light border">Portal</span>' : '')
                + (row.radius_enabled ? '<span class="badge text-bg-light border">RADIUS</span>' : '')
                + (row.requires_phone ? '<span class="badge text-bg-light border">Telefone</span>' : '')
                + (row.payment_required ? '<span class="badge text-bg-light border">Pix/Pagamento</span>' : '')
                + '</div></button>';
        });
        modernHtml += '</div>';
        out.innerHTML = modernHtml;
        return;
        var html = '<div class="list-group">';
        rows.forEach(function (row) {
            html += '<button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-start" data-wifi-model-edit="' + esc(row.id) + '">'
                + '<div><div class="fw-semibold">' + esc(row.name || 'Modelo') + '</div><div class="small text-muted">' + esc(row.slug || '') + ' · ' + esc(row.auth_type || '') + '</div></div>'
                + '<div class="text-end">' + (row.is_default ? '<span class="badge bg-success mb-1">Padrão</span>' : '<span class="badge bg-secondary">Modelo</span>') + '</div></button>';
        });
        html += '</div>';
        out.innerHTML = html;
    }
    function loadWifiModels(selectedId) {
        var out = byId('outWifiModels');
        if (out)
            out.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Carregando...';
        api('/wifi-templates').then(function (data) {
            wifiModelsCache = data.rows || [];
            renderWifiModelsList(wifiModelsCache);
            if (wifiModelsCache.length) {
                var preferred = Number(selectedId || 0);
                var selected = preferred ? wifiModelsCache.find(function (item) { return Number(item.id) === preferred; }) : null;
                fillWifiModelEditor(selected || wifiModelsCache[0]);
            }
        }).catch(function (err) {
            if (out)
                out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message || 'Erro ao carregar modelos.') + '</div>';
        });
    }
    function loadWifiModelMikrotikConfig() {
        var id = Number((byId('wifiModelId') && byId('wifiModelId').value) || 0);
        var output = byId('wifiModelMikrotikOutput');
        var summary = byId('wifiModelMikrotikSummary');
        if (!id) {
            if (summary)
                summary.innerHTML = '<div class="alert alert-warning py-2 mb-0">Selecione um modelo para gerar o script.</div>';
            if (output)
                output.textContent = '# Selecione um modelo Wi-Fi';
            renderWifiModelRscWarnings([]);
            return;
        }
        if (summary)
            summary.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Gerando .rsc...';
        if (output)
            output.textContent = '# Gerando script...';
        renderWifiModelRscWarnings([]);
        api('/wifi-templates/' + id + '/mikrotik-config').then(function (data) {
            wifiModelLastGeneratedFileName = data.file_name || 'mikrotik-hotspot.rsc';
            if (output)
                output.textContent = data.script || '# Nenhum script gerado';
            if (summary) {
                var items = Array.isArray(data.summary) ? data.summary : [];
                summary.innerHTML = items.length
                    ? '<div class="small text-muted mb-2">Resumo do modelo</div><ul class="small ps-3 mb-0">' + items.map(function (item) { return '<li class="mb-1">' + esc(item) + '</li>'; }).join('') + '</ul>'
                    : 'Script gerado com sucesso.';
            }
            renderWifiModelRscWarnings(Array.isArray(data.warnings) ? data.warnings : []);
        }).catch(function (err) {
            if (summary)
                summary.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message || 'Não foi possível gerar o .rsc.') + '</div>';
            if (output)
                output.textContent = '# Falha ao gerar script';
            renderWifiModelRscWarnings([]);
        });
    }
    function copyWifiModelMikrotikConfig() {
        var output = byId('wifiModelMikrotikOutput');
        var text = output ? String(output.textContent || '') : '';
        if (!text.trim() || text.indexOf('# Falha') === 0 || text.indexOf('# Gerando') === 0) {
            alert('Gere o .rsc antes de copiar.');
            return;
        }
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text).then(function () {
                alert('Script copiado.');
            }).catch(function () {
                alert('Não foi possível copiar automaticamente.');
            });
            return;
        }
        alert('Copie manualmente o script exibido.');
    }
    function downloadWifiModelMikrotikConfig() {
        var output = byId('wifiModelMikrotikOutput');
        var text = output ? String(output.textContent || '') : '';
        if (!text.trim() || text.indexOf('# Falha') === 0 || text.indexOf('# Gerando') === 0) {
            alert('Gere o .rsc antes de baixar.');
            return;
        }
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = wifiModelLastGeneratedFileName || 'mikrotik-hotspot.rsc';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    function saveWifiModel() {
        var id = Number((byId('wifiModelId') && byId('wifiModelId').value) || 0);
        var errEl = byId('wifiModelsError');
        if (!id) {
            if (errEl) {
                errEl.textContent = 'Selecione um modelo para editar.';
                errEl.classList.remove('d-none');
            }
            return;
        }
        var extras = splitLines((byId('wifiModelExtras') && byId('wifiModelExtras').value) || '');
        var authType = (byId('wifiModelAuthType') && byId('wifiModelAuthType').value) || '';
        var isPixMode = authType === 'pix' || authType === 'temporary_pix';
        var hotspotGatewayName = ((byId('wifiModelHotspotGatewayName') && byId('wifiModelHotspotGatewayName').value) || '').trim() || (isPixMode ? 'EFI Hotspot' : '');
        var hotspotGatewayType = ((byId('wifiModelHotspotGatewayType') && byId('wifiModelHotspotGatewayType').value) || '').trim() || (isPixMode ? 'efi' : '');
        var hotspotPixKey = ((byId('wifiModelHotspotPixKey') && byId('wifiModelHotspotPixKey').value) || '').trim() || (isPixMode ? 'SUA_CHAVE_PIX_EFI' : '');
        var hotspotWebhookUrl = ((byId('wifiModelHotspotWebhookUrl') && byId('wifiModelHotspotWebhookUrl').value) || '').trim() || (isPixMode ? 'https://api.seudominio.com/hotspot/pix/efi/webhook' : '');
        var hotspotClientId = ((byId('wifiModelHotspotClientId') && byId('wifiModelHotspotClientId').value) || '').trim();
        var hotspotClientSecret = ((byId('wifiModelHotspotClientSecret') && byId('wifiModelHotspotClientSecret').value) || '').trim();
        var hotspotCertPath = ((byId('wifiModelHotspotCertPath') && byId('wifiModelHotspotCertPath').value) || '').trim();
        var hotspotCertKeyPath = ((byId('wifiModelHotspotCertKeyPath') && byId('wifiModelHotspotCertKeyPath').value) || '').trim();
        var hotspotCertPassphrase = ((byId('wifiModelHotspotCertPassphrase') && byId('wifiModelHotspotCertPassphrase').value) || '').trim();
        var hotspotWebhookSecret = ((byId('wifiModelHotspotWebhookSecret') && byId('wifiModelHotspotWebhookSecret').value) || '').trim();
        var hotspotBaseUrl = ((byId('wifiModelHotspotBaseUrl') && byId('wifiModelHotspotBaseUrl').value) || '').trim();
        var hotspotSandbox = !!(byId('wifiModelHotspotSandbox') && byId('wifiModelHotspotSandbox').checked);
        var hotspotRadiusHost = ((byId('wifiModelHotspotRadiusHost') && byId('wifiModelHotspotRadiusHost').value) || '').trim();
        var hotspotRadiusPort = ((byId('wifiModelHotspotRadiusPort') && byId('wifiModelHotspotRadiusPort').value) || '').trim();
        var hotspotRadiusSecret = ((byId('wifiModelHotspotRadiusSecret') && byId('wifiModelHotspotRadiusSecret').value) || '').trim();
        var hotspotRadiusNasIp = ((byId('wifiModelHotspotRadiusNasIp') && byId('wifiModelHotspotRadiusNasIp').value) || '').trim();
        var mikrotikPortalUrl = ((byId('wifiModelMikrotikPortalUrl') && byId('wifiModelMikrotikPortalUrl').value) || '').trim();
        var mikrotikDnsName = ((byId('wifiModelMikrotikDnsName') && byId('wifiModelMikrotikDnsName').value) || '').trim();
        var mikrotikInterface = ((byId('wifiModelMikrotikInterface') && byId('wifiModelMikrotikInterface').value) || '').trim();
        var mikrotikBridge = ((byId('wifiModelMikrotikBridge') && byId('wifiModelMikrotikBridge').value) || '').trim();
        var mikrotikSsid = ((byId('wifiModelMikrotikSsid') && byId('wifiModelMikrotikSsid').value) || '').trim();
        var mikrotikHotspotAddress = ((byId('wifiModelMikrotikHotspotAddress') && byId('wifiModelMikrotikHotspotAddress').value) || '').trim();
        var mikrotikHotspotMask = ((byId('wifiModelMikrotikHotspotMask') && byId('wifiModelMikrotikHotspotMask').value) || '').trim();
        var mikrotikCoaPort = ((byId('wifiModelMikrotikCoaPort') && byId('wifiModelMikrotikCoaPort').value) || '').trim();
        var mikrotikPoolStart = ((byId('wifiModelMikrotikPoolStart') && byId('wifiModelMikrotikPoolStart').value) || '').trim();
        var mikrotikPoolEnd = ((byId('wifiModelMikrotikPoolEnd') && byId('wifiModelMikrotikPoolEnd').value) || '').trim();
        var mikrotikPaymentHost = ((byId('wifiModelMikrotikPaymentHost') && byId('wifiModelMikrotikPaymentHost').value) || '').trim();
        var mikrotikWalledGarden = splitLines((byId('wifiModelMikrotikWalledGarden') && byId('wifiModelMikrotikWalledGarden').value) || '');
        var body = {
            name: (byId('wifiModelName') && byId('wifiModelName').value) || '',
            slug: (byId('wifiModelSlug') && byId('wifiModelSlug').value) || '',
            auth_type: authType,
            redirect_url: (byId('wifiModelRedirectUrl') && byId('wifiModelRedirectUrl').value) || '',
            description: (byId('wifiModelDescription') && byId('wifiModelDescription').value) || '',
            free_minutes: Number((byId('wifiModelFreeMinutes') && byId('wifiModelFreeMinutes').value) || 0),
            session_timeout_minutes: Number((byId('wifiModelSessionTimeout') && byId('wifiModelSessionTimeout').value) || 0),
            payment_amount: (byId('wifiModelPaymentAmount') && byId('wifiModelPaymentAmount').value) || null,
            portal_enabled: !!(byId('wifiModelPortalEnabled') && byId('wifiModelPortalEnabled').checked),
            radius_enabled: !!(byId('wifiModelRadiusEnabled') && byId('wifiModelRadiusEnabled').checked),
            requires_phone: !!(byId('wifiModelRequiresPhone') && byId('wifiModelRequiresPhone').checked),
            payment_required: !!(byId('wifiModelPaymentRequired') && byId('wifiModelPaymentRequired').checked),
            bind_mac: !!(byId('wifiModelBindMac') && byId('wifiModelBindMac').checked),
            is_default: !!(byId('wifiModelIsDefault') && byId('wifiModelIsDefault').checked),
            is_active: true,
            config_json: {
                logo_url: (byId('wifiModelLogoUrl') && byId('wifiModelLogoUrl').value) || '',
                hotspot_gateway_name: hotspotGatewayName,
                hotspot_gateway_type: hotspotGatewayType,
                hotspot_pix_key: hotspotPixKey,
                hotspot_webhook_url: hotspotWebhookUrl,
                hotspot_gateway_client_id: hotspotClientId,
                hotspot_gateway_client_secret: hotspotClientSecret,
                hotspot_gateway_certificate_path: hotspotCertPath,
                hotspot_gateway_certificate_key_path: hotspotCertKeyPath,
                hotspot_gateway_certificate_passphrase: hotspotCertPassphrase,
                hotspot_webhook_secret: hotspotWebhookSecret,
                hotspot_gateway_base_url: hotspotBaseUrl,
                hotspot_gateway_sandbox: hotspotSandbox,
                hotspot_radius_host: hotspotRadiusHost,
                hotspot_radius_port: hotspotRadiusPort ? Number(hotspotRadiusPort) : null,
                hotspot_radius_secret: hotspotRadiusSecret,
                hotspot_radius_nas_ip: hotspotRadiusNasIp,
                mikrotik_portal_url: mikrotikPortalUrl,
                mikrotik_dns_name: mikrotikDnsName,
                mikrotik_interface: mikrotikInterface,
                mikrotik_bridge: mikrotikBridge,
                mikrotik_ssid: mikrotikSsid,
                mikrotik_hotspot_address: mikrotikHotspotAddress,
                mikrotik_hotspot_mask: mikrotikHotspotMask ? Number(mikrotikHotspotMask) : null,
                mikrotik_coa_port: mikrotikCoaPort ? Number(mikrotikCoaPort) : null,
                mikrotik_pool_start: mikrotikPoolStart,
                mikrotik_pool_end: mikrotikPoolEnd,
                mikrotik_payment_host: mikrotikPaymentHost,
                mikrotik_walled_garden: mikrotikWalledGarden,
                ideal_for: splitLines((byId('wifiModelIdealFor') && byId('wifiModelIdealFor').value) || ''),
                features: splitLines((byId('wifiModelFeatures') && byId('wifiModelFeatures').value) || ''),
                flow_steps: splitLines((byId('wifiModelFlowSteps') && byId('wifiModelFlowSteps').value) || ''),
                technologies: splitLines((byId('wifiModelTechnologies') && byId('wifiModelTechnologies').value) || ''),
                gateways_supported: extras,
                ctas: extras,
                limitations: extras
            },
            pix_plans: readWifiPixPlans()
        };
        api('/wifi-templates/' + id, { method: 'PUT', body: JSON.stringify(body) }).then(function () {
            loadWifiModels(id);
            alert('Modelo salvo com sucesso.');
        }).catch(function (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Erro ao salvar o modelo.';
                errEl.classList.remove('d-none');
            }
        });
    }
    function setWifiModelDefault() {
        var id = Number((byId('wifiModelId') && byId('wifiModelId').value) || 0);
        var errEl = byId('wifiModelsError');
        if (!id) {
            if (errEl) {
                errEl.textContent = 'Selecione um modelo para definir como padrão.';
                errEl.classList.remove('d-none');
            }
            return;
        }
        api('/wifi-templates/' + id + '/default', { method: 'POST' }).then(function () {
            if (byId('wifiModelIsDefault'))
                byId('wifiModelIsDefault').checked = true;
            loadWifiModels(id);
            alert('Modelo definido como padrão.');
        }).catch(function (err) {
            if (errEl) {
                errEl.textContent = err.message || 'Erro ao definir o modelo padrão.';
                errEl.classList.remove('d-none');
            }
        });
    }
    document.addEventListener('click', function (event) {
        var btn = event.target && event.target.closest ? event.target.closest('[data-wifi-model-edit]') : null;
        if (!btn)
            return;
        var id = Number(btn.getAttribute('data-wifi-model-edit') || 0);
        var found = wifiModelsCache.find(function (item) { return Number(item.id) === id; });
        if (found)
            fillWifiModelEditor(found);
    });
    safeAddEvent(byId('btnLoadWifiModels'), 'click', loadWifiModels);
    safeAddEvent(byId('btnSaveWifiModel'), 'click', saveWifiModel);
    safeAddEvent(byId('btnSetWifiModelDefault'), 'click', setWifiModelDefault);
    safeAddEvent(byId('btnGenerateWifiModelRsc'), 'click', loadWifiModelMikrotikConfig);
    safeAddEvent(byId('btnCopyWifiModelRsc'), 'click', copyWifiModelMikrotikConfig);
    safeAddEvent(byId('btnDownloadWifiModelRsc'), 'click', downloadWifiModelMikrotikConfig);
    [
        'wifiModelName',
        'wifiModelSlug',
        'wifiModelAuthType',
        'wifiModelRedirectUrl',
        'wifiModelLogoUrl',
        'wifiModelHotspotGatewayName',
        'wifiModelHotspotGatewayType',
        'wifiModelHotspotPixKey',
        'wifiModelHotspotWebhookUrl',
        'wifiModelHotspotClientId',
        'wifiModelHotspotClientSecret',
        'wifiModelHotspotCertPath',
        'wifiModelHotspotCertKeyPath',
        'wifiModelHotspotCertPassphrase',
        'wifiModelHotspotWebhookSecret',
        'wifiModelHotspotBaseUrl',
        'wifiModelHotspotRadiusHost',
        'wifiModelHotspotRadiusPort',
        'wifiModelHotspotRadiusSecret',
        'wifiModelHotspotRadiusNasIp',
        'wifiModelMikrotikPortalUrl',
        'wifiModelMikrotikDnsName',
        'wifiModelMikrotikInterface',
        'wifiModelMikrotikBridge',
        'wifiModelMikrotikSsid',
        'wifiModelMikrotikHotspotAddress',
        'wifiModelMikrotikHotspotMask',
        'wifiModelMikrotikCoaPort',
        'wifiModelMikrotikPoolStart',
        'wifiModelMikrotikPoolEnd',
        'wifiModelMikrotikPaymentHost',
        'wifiModelMikrotikWalledGarden',
        'wifiModelDescription',
        'wifiModelFreeMinutes',
        'wifiModelSessionTimeout',
        'wifiModelPaymentAmount',
        'wifiModelIdealFor',
        'wifiModelFeatures',
        'wifiModelFlowSteps',
        'wifiModelTechnologies',
        'wifiModelExtras',
        'wifiModelPixPlans'
    ].forEach(function (id) {
        safeAddEvent(byId(id), 'input', renderWifiPreviewFromEditor);
    });
    [
        'wifiModelPortalEnabled',
        'wifiModelRadiusEnabled',
        'wifiModelRequiresPhone',
        'wifiModelPaymentRequired',
        'wifiModelBindMac',
        'wifiModelIsDefault',
        'wifiModelHotspotSandbox'
    ].forEach(function (id) {
        safeAddEvent(byId(id), 'change', renderWifiPreviewFromEditor);
    });
    safeAddEvent(byId('btnWifiUploadCert'), 'click', function () {
        doHotspotCertUpload('wifiModelHotspotCertUpload', 'wifiModelHotspotCertPath', 'btnWifiUploadCert');
    });
    safeAddEvent(byId('btnWifiUploadKey'), 'click', function () {
        doHotspotCertUpload('wifiModelHotspotKeyUpload', 'wifiModelHotspotCertKeyPath', 'btnWifiUploadKey');
    });
    function loadNasTenantOptions() {
        var sel = byId('nasTenantSelect');
        var radiusSel = byId('radiusTestTenant');
        api('/tenants').then(function (data) {
            var tenants = data.tenants || [];
            if (sel) {
                sel.innerHTML = '<option value="">Selecione um provedor</option>';
                tenants.forEach(function (t) {
                    sel.appendChild(new Option(t.name + ' (' + t.slug + ')', t.id));
                });
            }
            if (radiusSel) {
                radiusSel.innerHTML = '<option value="">Global (.env)</option>';
                tenants.forEach(function (t) {
                    radiusSel.appendChild(new Option(t.name + ' (' + t.slug + ')', t.id));
                });
            }
        }).catch(function () { });
    }
    function loadNasListForSelected() {
        var sel = byId('nasTenantSelect');
        var tenantId = sel && sel.value ? sel.value : '';
        var out = byId('outNasList');
        var btnNew = byId('btnNewNas');
        if (!out)
            return;
        if (!tenantId) {
            out.innerHTML = 'Selecione um provedor para listar os concentradores.';
            if (btnNew)
                btnNew.classList.add('d-none');
            return;
        }
        out.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Carregando...';
        if (btnNew)
            btnNew.classList.remove('d-none');
        api('/tenants/' + encodeURIComponent(tenantId) + '/nas').then(function (data) {
            var list = data.nas || [];
            if (!list.length) {
                out.innerHTML = '<p class="text-muted mb-0">Nenhum concentrador. Clique em <strong>Novo concentrador</strong>.</p>';
                return;
            }
            var html = '<div class="table-responsive"><table class="table table-sm admin-table"><thead><tr><th>Nome</th><th>IP</th><th>Descrição</th><th>Ativo</th><th></th></tr></thead><tbody>';
            list.forEach(function (n) {
                var desc = (n.description || '').replace(/"/g, '&quot;');
                html += '<tr><td>' + esc(n.name) + '</td><td><code>' + esc(n.nas_ip) + '</code></td><td class="small">' + esc(n.description || '—') + '</td><td>' + (n.is_active ? '<span class="badge bg-success">Sim</span>' : '<span class="badge bg-secondary">Não</span>') + '</td><td><button type="button" class="btn btn-sm btn-outline-secondary me-1" data-nas-id="' + n.id + '" data-nas-name="' + esc(n.name).replace(/"/g, '&quot;') + '" data-nas-ip="' + esc(n.nas_ip).replace(/"/g, '&quot;') + '" data-nas-desc="' + desc + '" data-nas-active="' + (n.is_active ? '1' : '0') + '" data-action-edit-nas>Editar</button><button type="button" class="btn btn-sm btn-outline-danger" data-nas-id="' + n.id + '" data-action-delete-nas>Excluir</button></td></tr>';
            });
            html += '</tbody></table></div>';
            out.innerHTML = html;
            out.querySelectorAll('[data-action-edit-nas]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = this.getAttribute('data-nas-id');
                    var name = (this.getAttribute('data-nas-name') || '').replace(/&quot;/g, '"');
                    var nasIp = (this.getAttribute('data-nas-ip') || '').replace(/&quot;/g, '"');
                    var desc = (this.getAttribute('data-nas-desc') || '').replace(/&quot;/g, '"');
                    var active = this.getAttribute('data-nas-active') === '1';
                    var tidEl = byId('nasTenantSelect');
                    var tid = tidEl && tidEl.value;
                    if (!tid)
                        return;
                    var nasId = byId('nasId');
                    var nasTenantId = byId('nasTenantId');
                    var nasName = byId('nasName');
                    var nasIpEl = byId('nasIp');
                    var nasDescription = byId('nasDescription');
                    var nasActive = byId('nasActive');
                    var modalNasTitle = byId('modalNasTitle');
                    var nasFormError = byId('nasFormError');
                    var modalNas = byId('modalNas');
                    if (nasId)
                        nasId.value = id || '';
                    if (nasTenantId)
                        nasTenantId.value = tid;
                    if (nasName)
                        nasName.value = name;
                    if (nasIpEl)
                        nasIpEl.value = nasIp;
                    if (nasDescription)
                        nasDescription.value = desc;
                    if (nasActive)
                        nasActive.checked = active;
                    if (modalNasTitle)
                        modalNasTitle.textContent = 'Editar concentrador';
                    if (nasFormError)
                        nasFormError.classList.add('d-none');
                    if (modalNas)
                        showModal(modalNas);
                });
            });
            out.querySelectorAll('[data-action-delete-nas]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = this.getAttribute('data-nas-id');
                    var tidEl = byId('nasTenantSelect');
                    var tid = tidEl && tidEl.value;
                    if (!tid || !id || !confirm('Excluir este concentrador?'))
                        return;
                    api('/tenants/' + encodeURIComponent(tid) + '/nas/' + id, { method: 'DELETE' })
                        .then(function () { loadNasListForSelected(); })
                        .catch(function (err) { alert(err.message); });
                });
            });
        }).catch(function (err) {
            out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
        });
    }
    safeAddEvent(byId('nasTenantSelect'), 'change', loadNasListForSelected);
    safeAddEvent(byId('btnNewNas'), 'click', function () {
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
        if (nasId)
            nasId.value = '';
        if (nasTenantId)
            nasTenantId.value = tid;
        if (nasName)
            nasName.value = '';
        if (nasIp)
            nasIp.value = '';
        if (nasDescription)
            nasDescription.value = '';
        if (nasActive)
            nasActive.checked = true;
        if (modalNasTitle)
            modalNasTitle.textContent = 'Novo concentrador';
        if (nasFormError)
            nasFormError.classList.add('d-none');
        if (modalNas)
            showModal(modalNas);
    });
    safeAddEvent(byId('btnSaveNas'), 'click', function () {
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
        if (errEl)
            errEl.classList.add('d-none');
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
        if (!btn)
            return;
        btn.disabled = true;
        if (id) {
            api('/tenants/' + encodeURIComponent(tenantId) + '/nas/' + id, {
                method: 'PATCH',
                body: JSON.stringify({ name: name, nas_ip: nasIp, description: description || null, is_active: isActive })
            }).then(function () {
                hideModal(modalNas);
                loadNasListForSelected();
                btn.disabled = false;
            }).catch(function (err) {
                if (errEl) {
                    errEl.textContent = err.message || 'Erro ao salvar.';
                    errEl.classList.remove('d-none');
                }
                btn.disabled = false;
            });
        }
        else {
            api('/tenants/' + encodeURIComponent(tenantId) + '/nas', {
                method: 'POST',
                body: JSON.stringify({ name: name, nas_ip: nasIp, description: description || null, is_active: isActive })
            }).then(function () {
                hideModal(modalNas);
                loadNasListForSelected();
                btn.disabled = false;
            }).catch(function (err) {
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
