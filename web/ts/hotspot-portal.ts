(function () {
  type HotspotTemplate = {
    id: number;
    tenant_id?: number;
    name: string;
    slug: string;
    description?: string | null;
    auth_type: string;
    portal_enabled?: boolean;
    radius_enabled?: boolean;
    free_minutes?: number;
    otp_enabled?: boolean;
    payment_required?: boolean;
    payment_amount?: number | null;
    requires_phone?: boolean;
    bind_mac?: boolean;
    session_timeout_minutes?: number;
    redirect_url?: string | null;
    config_json?: Record<string, unknown>;
    pix_plans?: Array<{ id?: number; name: string; price: number; duration_minutes: number }>;
  };

  type PublicTemplateResponse = {
    ok: boolean;
    tenant_slug?: string | null;
    template: HotspotTemplate;
  };

  type PixChargeResponse = {
    session_key?: string | null;
    pix_qrcode?: string | null;
    pix_copia_cola?: string | null;
  };

  type HotspotSessionResponse = {
    ok: boolean;
    session: {
      session_key?: string | null;
      auth_mode?: string | null;
      status?: string | null;
      amount?: number;
      duration_minutes?: number;
      txid?: string | null;
      pix_qrcode?: string | null;
      pix_copia_cola?: string | null;
      expires_at?: string | null;
      redirect_url?: string | null;
      paid_at?: string | null;
      released_at?: string | null;
      released_username?: string | null;
      released_password?: string | null;
      release_ready?: boolean;
      gateway_name?: string | null;
      environment?: string | null;
      expired?: boolean;
      username?: string | null;
      password?: string | null;
      phone?: string | null;
      voucher_code?: string | null;
      radius_username?: string | null;
      radius_validated?: boolean;
    };
  };

  let currentTemplate: HotspotTemplate | null = null;
  let currentTenantSlug: string | null = null;
  let currentPlanId: number | null = null;
  let currentSessionKey: string | null = null;
  let currentOtpSessionKey: string | null = null;
  let currentAuthType = '';
  let statusPollTimer: number | null = null;
  let redirectTarget = '/';

  function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
  }

  function esc(value: unknown): string {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function api<T>(url: string, options?: RequestInit): Promise<T> {
    return fetch(url, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
      ...options,
    }).then(async (res) => {
      const text = await res.text();
      let data: unknown = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text };
      }
      if (!res.ok) throw new Error((data as { message?: string }).message || `Erro ${res.status}`);
      return data as T;
    });
  }

  function parseRoute(): { tenantSlug: string | null; templateSlug: string | null } {
    const parts = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (!parts.length || parts[0] !== 'hotspot') return { tenantSlug: null, templateSlug: null };
    if (parts.length >= 3) return { tenantSlug: parts[1], templateSlug: parts[2] };
    if (parts.length === 2) return { tenantSlug: parts[1], templateSlug: null };
    const query = new URLSearchParams(window.location.search);
    return { tenantSlug: query.get('tenant'), templateSlug: query.get('template') };
  }

  function normalizeDigits(value: unknown): string {
    return String(value || '').replace(/\D/g, '');
  }

  function setError(message: string | null): void {
    const el = byId('hotspotError');
    if (!el) return;
    if (!message) {
      el.classList.add('d-none');
      el.textContent = '';
      return;
    }
    el.textContent = message;
    el.classList.remove('d-none');
  }

  function money(value: unknown): string {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function fieldVisible(id: string, visible: boolean): void {
    byId(id)?.classList.toggle('d-none', !visible);
  }

  function routeApiBase(): string {
    const route = parseRoute();
    return route.tenantSlug ? '/api/hotspot/' + encodeURIComponent(route.tenantSlug) : '/api/hotspot';
  }

  function goToConnected(sessionKey: string, tenantSlug: string | null): void {
    const params = new URLSearchParams({ session: sessionKey });
    if (tenantSlug) params.set('tenant', tenantSlug);
    window.location.href = '/hotspot/conectado?' + params.toString();
  }

  function updateHero(template: HotspotTemplate, tenantSlug: string | null): void {
    currentAuthType = String(template.auth_type || '').toLowerCase();
    const cfg = template.config_json || {};
    const logoUrl = String(cfg.logo_url || '');
    const authBadge = byId('hotspotAuthBadge');
    const titleEl = byId('hotspotTitle');
    const descriptionEl = byId('hotspotDescription');
    const brand = byId('hotspotBrand');
    const stats = byId('hotspotStats');
    const highlights = byId('hotspotHighlights');

    if (authBadge) {
      authBadge.textContent = (
        currentAuthType === 'temporary_pix' ? 'Freemium + Pix'
        : currentAuthType === 'pix' ? 'Pix'
        : currentAuthType === 'phone' ? 'Telefone + OTP'
        : currentAuthType === 'voucher' ? 'Voucher'
        : currentAuthType === 'radius' ? 'RADIUS'
        : currentAuthType
      ).toUpperCase();
    }
    if (titleEl) titleEl.textContent = template.name || 'Acesso Wi-Fi';
    if (descriptionEl) descriptionEl.textContent = template.description || 'Acesse a internet do provedor com segurança e liberação automática.';
    if (brand) {
      brand.innerHTML = (logoUrl
        ? '<img class="hotspot-brand__logo" src="' + esc(logoUrl) + '" alt="Logo">'
        : '<span class="hotspot-brand__fallback">WI</span>')
        + '<div><div class="hotspot-eyebrow">' + esc(tenantSlug || 'Portal captivo') + '</div><div class="hotspot-auth-badge">' + esc((authBadge && authBadge.textContent) || '') + '</div></div>';
    }
    if (stats) {
      stats.innerHTML = ''
        + '<div class="hotspot-stat"><span>Modelo</span><strong>' + esc(template.slug || '-') + '</strong></div>'
        + '<div class="hotspot-stat"><span>Sessão</span><strong>' + esc(template.session_timeout_minutes || 0) + ' min</strong></div>'
        + '<div class="hotspot-stat"><span>Fluxo</span><strong>' + esc((currentAuthType === 'pix' || currentAuthType === 'temporary_pix') ? 'Pagamento online' : 'Validação direta') + '</strong></div>';
    }
    if (highlights) {
      const features = Array.isArray(cfg.features) ? cfg.features : [];
      const ideal = Array.isArray(cfg.ideal_for) ? cfg.ideal_for : [];
      const rows = ([] as string[]).concat(features as string[], ideal as string[]).slice(0, 4);
      highlights.innerHTML = rows.length
        ? rows.map(function (item, index) {
            return '<div class="hotspot-list__item"><span class="hotspot-list__bullet">' + (index + 1) + '</span><div><strong>' + esc(item) + '</strong><div class="text-muted small">Fluxo pronto para o dispositivo do cliente.</div></div></div>';
          }).join('')
        : '<div class="hotspot-list__item"><span class="hotspot-list__bullet">1</span><div><strong>Portal ativo</strong><div class="text-muted small">Modelo carregado e pronto para autenticação.</div></div></div>';
    }
  }

  function updateFlow(template: HotspotTemplate): void {
    const flowEl = byId('hotspotFlow');
    if (!flowEl) return;
    const cfg = template.config_json || {};
    const steps = Array.isArray(cfg.flow_steps) ? cfg.flow_steps : [];
    const fallback = currentAuthType === 'pix' || currentAuthType === 'temporary_pix'
      ? ['Cliente escolhe o plano', 'Sistema gera cobrança Pix', 'EFI confirma o pagamento', 'Hotspot libera o acesso automaticamente']
      : currentAuthType === 'voucher'
      ? ['Cliente informa o voucher', 'O portal valida o código', 'A sessão é liberada', 'O dispositivo segue para a navegação']
      : currentAuthType === 'phone'
      ? ['Cliente informa o telefone', 'O sistema gera OTP', 'O visitante valida o código', 'O hotspot libera a navegação']
      : ['Cliente informa usuário e senha', 'O portal valida no RADIUS', 'A sessão é registrada', 'O hotspot segue para a navegação'];
    const list = (steps.length ? steps : fallback).slice(0, 8);
    flowEl.innerHTML = list.map(function (item, index) {
      return '<div class="hotspot-list__item"><span class="hotspot-list__bullet">' + (index + 1) + '</span><div><strong>' + esc(item) + '</strong></div></div>';
    }).join('');
  }

  function updatePlanChoices(template: HotspotTemplate): void {
    const plansEl = byId('hotspotPlanChoices');
    const emptyEl = byId('hotspotPlanEmpty');
    if (!plansEl || !emptyEl) return;
    const plans = Array.isArray(template.pix_plans) ? template.pix_plans : [];
    if (!(currentAuthType === 'pix' || currentAuthType === 'temporary_pix')) {
      plansEl.innerHTML = '';
      emptyEl.classList.remove('d-none');
      emptyEl.textContent = 'Este modelo usa autenticação direta sem cobrança Pix.';
      return;
    }
    if (!plans.length) {
      plansEl.innerHTML = '';
      emptyEl.classList.remove('d-none');
      emptyEl.textContent = 'Nenhum plano Pix ativo foi configurado para este modelo.';
      return;
    }
    emptyEl.classList.add('d-none');
    if (!currentPlanId) currentPlanId = Number(plans[0].id || 0) || null;
    plansEl.innerHTML = plans.map(function (plan) {
      const planId = Number(plan.id || 0);
      return '<button type="button" class="hotspot-plan-choice ' + (currentPlanId === planId ? 'active' : '') + '" data-hotspot-plan="' + planId + '">'
        + '<span>' + esc(plan.name) + '</span>'
        + '<strong>' + money(plan.price) + '</strong>'
        + '<div class="small text-muted mt-1">' + esc(plan.duration_minutes) + ' minutos liberados</div>'
        + '</button>';
    }).join('');
  }

  function updateAuthUi(): void {
    fieldVisible('hotspotFieldNameWrap', currentAuthType === 'pix' || currentAuthType === 'temporary_pix');
    fieldVisible('hotspotFieldPhoneWrap', currentAuthType === 'pix' || currentAuthType === 'temporary_pix' || currentAuthType === 'phone');
    fieldVisible('hotspotFieldDocumentWrap', currentAuthType === 'pix' || currentAuthType === 'temporary_pix');
    fieldVisible('hotspotFieldUserWrap', currentAuthType === 'radius');
    fieldVisible('hotspotFieldPassWrap', currentAuthType === 'radius');
    fieldVisible('hotspotFieldVoucherWrap', currentAuthType === 'voucher');
    fieldVisible('hotspotFieldOtpWrap', currentAuthType === 'phone' && !!currentOtpSessionKey);
    fieldVisible('hotspotFieldDescriptionWrap', currentAuthType === 'pix' || currentAuthType === 'temporary_pix');
    fieldVisible('hotspotOtpHint', currentAuthType === 'phone');
    byId('hotspotPixPanel')?.classList.toggle('d-none', !(currentAuthType === 'pix' || currentAuthType === 'temporary_pix'));

    const primary = byId<HTMLButtonElement>('btnHotspotPrimaryAction');
    const secondary = byId<HTMLButtonElement>('btnHotspotSecondaryAction');
    if (primary) {
      primary.textContent =
        currentAuthType === 'pix' || currentAuthType === 'temporary_pix' ? 'Gerar Pix'
        : currentAuthType === 'voucher' ? 'Validar voucher'
        : currentAuthType === 'radius' ? 'Entrar com RADIUS'
        : currentAuthType === 'phone' ? (currentOtpSessionKey ? 'Validar código OTP' : 'Continuar')
        : 'Continuar';
    }
    if (secondary) {
      secondary.classList.toggle('d-none', currentAuthType !== 'phone');
      secondary.textContent = currentOtpSessionKey ? 'Solicitar novo OTP' : 'Solicitar OTP';
    }
  }

  function applySessionState(data: HotspotSessionResponse['session']): void {
    const pixWrap = byId('hotspotQrWrap');
    const pixImg = byId<HTMLImageElement>('hotspotQrImage');
    const pixCode = byId('hotspotPixCode');
    const statusText = byId('hotspotPixStatusText');
    const success = byId('hotspotSuccessPanel');
    const relUser = byId('hotspotReleasedUser');
    const relPass = byId('hotspotReleasedPass');

    if (pixWrap && pixImg && data.pix_qrcode) {
      pixImg.src = data.pix_qrcode;
      pixWrap.classList.remove('d-none');
    }
    if (pixCode) {
      if (data.pix_copia_cola) {
        pixCode.textContent = data.pix_copia_cola;
        pixCode.classList.remove('d-none');
      } else {
        pixCode.classList.add('d-none');
      }
    }
    if (statusText) {
      if (data.expired) statusText.textContent = 'A cobrança Pix expirou antes da confirmação.';
      else if (data.release_ready) statusText.textContent = 'Pagamento confirmado e acesso liberado.';
      else if (data.paid_at) statusText.textContent = 'Pagamento confirmado. Finalizando a liberação do hotspot...';
      else statusText.textContent = 'Aguardando o pagamento Pix para liberar a navegação.';
    }
    if (data.release_ready && success && relUser && relPass) {
      relUser.textContent = data.released_username || data.username || '---';
      relPass.textContent = data.released_password || data.password || '---';
      success.classList.remove('d-none');
      window.setTimeout(function () {
        goToConnected(currentSessionKey || '', currentTenantSlug);
      }, 900);
      return;
    }
    if (data.expired) {
      const retry = encodeURIComponent(window.location.pathname + window.location.search);
      window.setTimeout(function () {
        window.location.href = '/hotspot/expirado?session=' + encodeURIComponent(currentSessionKey || '') + '&retry=' + retry;
      }, 1200);
    }
  }

  function stopStatusPolling(): void {
    if (statusPollTimer != null) {
      window.clearInterval(statusPollTimer);
      statusPollTimer = null;
    }
  }

  function startStatusPolling(): void {
    stopStatusPolling();
    if (!currentSessionKey) return;
    statusPollTimer = window.setInterval(function () {
      refreshSessionStatus(false);
    }, 5000);
  }

  function refreshSessionStatus(showError: boolean): void {
    if (!currentSessionKey) return;
    const url = routeApiBase() + '/sessions/' + encodeURIComponent(currentSessionKey) + '/status';
    api<HotspotSessionResponse>(url).then(function (data) {
      applySessionState(data.session || {});
      if (data.session && (data.session.release_ready || data.session.expired)) stopStatusPolling();
    }).catch(function (err) {
      if (showError) setError(err.message || 'Não foi possível consultar a sessão do hotspot.');
    });
  }

  function authPayload(): Record<string, unknown> {
    return {
      redirect_url: redirectTarget,
      mac_address: byId<HTMLInputElement>('hotspotMacAddress')?.value || '',
      ip_address: '',
      phone: byId<HTMLInputElement>('hotspotPayerPhone')?.value || '',
    };
  }

  function handlePixSubmit(event: Event): void {
    event.preventDefault();
    if (!currentTemplate) return;
    setError(null);
    const btn = byId<HTMLButtonElement>('btnHotspotPrimaryAction');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Gerando Pix...';
    }
    const payload: Record<string, unknown> = {
      plan_id: currentPlanId,
      payer_name: byId<HTMLInputElement>('hotspotPayerName')?.value || '',
      payer_phone: byId<HTMLInputElement>('hotspotPayerPhone')?.value || '',
      payer_document: byId<HTMLInputElement>('hotspotPayerDocument')?.value || '',
      mac_address: byId<HTMLInputElement>('hotspotMacAddress')?.value || '',
      description: byId<HTMLInputElement>('hotspotChargeDescription')?.value || currentTemplate.name,
      redirect_url: redirectTarget,
    };
    api<PixChargeResponse>(routeApiBase() + '/templates/' + encodeURIComponent(currentTemplate.slug) + '/pix/charges', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(function (data) {
      currentSessionKey = data.session_key || null;
      applySessionState({
        pix_qrcode: data.pix_qrcode || null,
        pix_copia_cola: data.pix_copia_cola || null,
        release_ready: false,
      });
      startStatusPolling();
    }).catch(function (err) {
      setError(err.message || 'Não foi possível gerar a cobrança Pix.');
    }).finally(function () {
      updateAuthUi();
      if (btn) btn.disabled = false;
    });
  }

  function handleVoucherSubmit(event: Event): void {
    event.preventDefault();
    if (!currentTemplate) return;
    setError(null);
    api<HotspotSessionResponse>(routeApiBase() + '/templates/' + encodeURIComponent(currentTemplate.slug) + '/voucher/login', {
      method: 'POST',
      body: JSON.stringify({
        ...authPayload(),
        voucher_code: byId<HTMLInputElement>('hotspotVoucherCode')?.value || '',
      }),
    }).then(function (data) {
      currentSessionKey = data.session?.session_key || null;
      goToConnected(currentSessionKey || '', currentTenantSlug);
    }).catch(function (err) {
      setError(err.message || 'Não foi possível validar o voucher.');
    });
  }

  function handleRadiusSubmit(event: Event): void {
    event.preventDefault();
    if (!currentTemplate) return;
    setError(null);
    api<HotspotSessionResponse>(routeApiBase() + '/templates/' + encodeURIComponent(currentTemplate.slug) + '/radius/login', {
      method: 'POST',
      body: JSON.stringify({
        ...authPayload(),
        username: byId<HTMLInputElement>('hotspotRadiusUsername')?.value || '',
        password: byId<HTMLInputElement>('hotspotRadiusPassword')?.value || '',
      }),
    }).then(function (data) {
      currentSessionKey = data.session?.session_key || null;
      goToConnected(currentSessionKey || '', currentTenantSlug);
    }).catch(function (err) {
      setError(err.message || 'Não foi possível autenticar no RADIUS.');
    });
  }

  function requestOtp(): void {
    if (!currentTemplate) return;
    setError(null);
    api<{ session_key?: string | null; debug_code?: string | null; message?: string }>(
      routeApiBase() + '/templates/' + encodeURIComponent(currentTemplate.slug) + '/phone/request-otp',
      {
        method: 'POST',
        body: JSON.stringify({
          ...authPayload(),
          phone: byId<HTMLInputElement>('hotspotPayerPhone')?.value || '',
        }),
      }
    ).then(function (data) {
      currentOtpSessionKey = data.session_key || null;
      updateAuthUi();
      setError(data.debug_code
        ? ((data.message || 'OTP gerado.') + ' Código de homologação: ' + data.debug_code)
        : (data.message || 'OTP enviado.'));
    }).catch(function (err) {
      setError(err.message || 'Não foi possível gerar o OTP.');
    });
  }

  function handlePhoneSubmit(event: Event): void {
    event.preventDefault();
    if (!currentTemplate) return;
    if (!currentOtpSessionKey) {
      requestOtp();
      return;
    }
    setError(null);
    api<HotspotSessionResponse>(routeApiBase() + '/templates/' + encodeURIComponent(currentTemplate.slug) + '/phone/verify-otp', {
      method: 'POST',
      body: JSON.stringify({
        ...authPayload(),
        session_key: currentOtpSessionKey,
        code: normalizeDigits(byId<HTMLInputElement>('hotspotOtpCode')?.value || ''),
      }),
    }).then(function (data) {
      currentSessionKey = data.session?.session_key || null;
      goToConnected(currentSessionKey || '', currentTenantSlug);
    }).catch(function (err) {
      setError(err.message || 'Não foi possível validar o OTP.');
    });
  }

  function bindEvents(): void {
    document.addEventListener('click', function (event) {
      const target = event.target as HTMLElement | null;
      const planBtn = target && target.closest ? target.closest('[data-hotspot-plan]') as HTMLElement | null : null;
      if (planBtn) {
        currentPlanId = Number(planBtn.getAttribute('data-hotspot-plan') || 0) || null;
        updatePlanChoices(currentTemplate as HotspotTemplate);
      }
    });

    byId('hotspotAuthForm')?.addEventListener('submit', function (event) {
      if (currentAuthType === 'pix' || currentAuthType === 'temporary_pix') handlePixSubmit(event);
      else if (currentAuthType === 'voucher') handleVoucherSubmit(event);
      else if (currentAuthType === 'radius') handleRadiusSubmit(event);
      else if (currentAuthType === 'phone') handlePhoneSubmit(event);
      else {
        event.preventDefault();
        setError('Modelo carregado com sucesso.');
      }
    });

    byId('btnHotspotSecondaryAction')?.addEventListener('click', function () {
      requestOtp();
    });

    byId('btnHotspotCopyPix')?.addEventListener('click', function () {
      const value = byId('hotspotPixCode')?.textContent || '';
      if (!value) return;
      navigator.clipboard.writeText(value).then(function () {
        const btn = byId<HTMLButtonElement>('btnHotspotCopyPix');
        if (!btn) return;
        const prev = btn.textContent;
        btn.textContent = 'Pix copiado';
        window.setTimeout(function () {
          btn.textContent = prev || 'Copiar Pix';
        }, 1600);
      }).catch(function () {});
    });

    byId('btnHotspotRefreshStatus')?.addEventListener('click', function () {
      refreshSessionStatus(true);
    });
  }

  function loadTemplate(): void {
    const route = parseRoute();
    const endpoint = route.templateSlug
      ? (route.tenantSlug
          ? '/api/hotspot/' + encodeURIComponent(route.tenantSlug) + '/templates/' + encodeURIComponent(route.templateSlug)
          : '/api/hotspot/templates/' + encodeURIComponent(route.templateSlug))
      : (route.tenantSlug
          ? '/api/hotspot/' + encodeURIComponent(route.tenantSlug) + '/default-template'
          : '/api/hotspot/default-template');

    api<PublicTemplateResponse>(endpoint).then(function (data) {
      currentTemplate = data.template;
      currentTenantSlug = data.tenant_slug || route.tenantSlug || null;
      redirectTarget = data.template && data.template.redirect_url ? data.template.redirect_url : '/';
      updateHero(data.template, currentTenantSlug);
      updateFlow(data.template);
      updatePlanChoices(data.template);
      updateAuthUi();
    }).catch(function (err) {
      setError(err.message || 'Não foi possível carregar o modelo do hotspot.');
    });
  }

  bindEvents();
  loadTemplate();
})();
