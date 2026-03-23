/**
 * Portal do Cliente - login, faturas, contrato, conexao e chamados
 */
(function (): void {
  const TOKEN_KEY = 'cliente_portal_token';
  const win = window as unknown as { __API_BASE__?: string };
  const DASHBOARD_PATH = '/cliente/dashboard.html';
  const LOGIN_PATH = '/cliente/index.html';

  function esc(s: unknown): string {
    return String(s ?? '').replace(/[&<>"']/g, (m: string) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] ?? m));
  }

  function getToken(): string {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }

  function setToken(t: string): void {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {}
  }

  function api(path: string, opts?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<Record<string, unknown>> {
    opts = opts ?? {};
    const token = getToken();
    const url = (win.__API_BASE__ != null ? win.__API_BASE__ : '/api/client') + path;
    const headers: Record<string, string> = opts.headers ?? {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (opts.body && typeof opts.body === 'string') headers['Content-Type'] = 'application/json';
    return fetch(url, { method: opts.method ?? 'GET', headers, body: opts.body, credentials: 'same-origin' }).then(function (res: Response) {
      return res.json().catch(() => ({})).then(function (data: Record<string, unknown>) {
        if (!res.ok) throw new Error((data.error as string) ?? (data.message as string) ?? 'Erro ao comunicar com o servidor');
        return data;
      });
    });
  }

  function show(el: HTMLElement | null): void { if (el) el.style.display = ''; }
  function hide(el: HTMLElement | null): void { if (el) el.style.display = 'none'; }
  function isLoginPage(): boolean { return window.location.pathname.endsWith('/cliente/index.html') || window.location.pathname === '/cliente/' || window.location.pathname === '/cliente'; }
  function isDashboardPage(): boolean { return window.location.pathname.endsWith('/cliente/dashboard.html'); }
  function goToDashboard(): void { window.location.href = DASHBOARD_PATH; }
  function goToLogin(): void { window.location.href = LOGIN_PATH; }

  function onlyDigits(v: unknown): string {
    return String(v ?? '').replace(/\D/g, '');
  }

  function formatPhone(v: unknown): string {
    const d = onlyDigits(v);
    if (d.length >= 11) return '(' + d.slice(-11, -9) + ') ' + d.slice(-9, -4) + '-' + d.slice(-4);
    if (d.length >= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return String(v ?? '');
  }

  function formatCpfCnpj(v: unknown): string {
    const d = onlyDigits(v);
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return String(v ?? '');
  }

  function formatMoney(v: unknown): string {
    return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(v: unknown): string {
    const s = String(v ?? '').trim();
    if (!s) return '--';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString('pt-BR');
  }

  function displayValue(v: unknown, fallback = 'Nao informado'): string {
    const s = String(v ?? '').trim();
    return s ? s : fallback;
  }

  function humanizeTechnicalCategory(v: unknown): string {
    const map: Record<string, string> = {
      sem_conexao: 'Sem conexao',
      pppoe: 'PPPoE',
      onu_offline: 'ONU offline',
      sem_sinal_optico: 'Sem sinal optico',
      lentidao: 'Lentidao',
      wifi_ruim: 'Wi-Fi ruim'
    };
    const key = String(v ?? '').trim();
    return map[key] ?? (key ? key.replace(/[_-]+/g, ' ') : 'Nao classificado');
  }

  function humanizeChannel(v: unknown): string {
    const map: Record<string, string> = {
      PORTAL_CLIENTE: 'Portal do cliente',
      WHATSAPP: 'WhatsApp',
      TELEFONE: 'Telefone',
      APP: 'Aplicativo',
      PRESENCIAL: 'Presencial'
    };
    const key = String(v ?? '').trim().toUpperCase();
    return map[key] ?? (key ? key.replace(/[_-]+/g, ' ') : 'Nao informado');
  }

  function renderStatusBadge(text: string, cls: string): string {
    return '<span class="client-portal__status-badge client-portal__status-badge--' + esc(cls) + '">' + esc(text) + '</span>';
  }

  function invoiceStatusLabel(status: string): { label: string; cls: string } {
    const map: Record<string, { label: string; cls: string }> = {
      PENDING: { label: 'Pendente', cls: 'warning' },
      PAID: { label: 'Paga', cls: 'success' },
      OVERDUE: { label: 'Vencida', cls: 'danger' },
      CANCELLED: { label: 'Cancelada', cls: 'secondary' }
    };
    return map[status] ?? { label: status || '?', cls: 'secondary' };
  }

  function ticketStatusLabel(status: string): { label: string; cls: string } {
    const map: Record<string, { label: string; cls: string }> = {
      OPEN: { label: 'Aberto', cls: 'warning' },
      IN_PROGRESS: { label: 'Em atendimento', cls: 'info' },
      PENDING: { label: 'Pendente', cls: 'secondary' },
      WAITING_CUSTOMER: { label: 'Aguardando cliente', cls: 'secondary' },
      EN_ROUTE: { label: 'Em deslocamento', cls: 'primary' },
      RESOLVED: { label: 'Resolvido', cls: 'success' },
      CLOSED: { label: 'Fechado', cls: 'dark' },
      CANCELLED: { label: 'Cancelado', cls: 'danger' }
    };
    return map[status] ?? { label: status || '?', cls: 'secondary' };
  }

  function renderProfile(customer: Record<string, unknown>): void {
    const el = document.getElementById('clientProfileBody');
    if (!el) return;
    el.innerHTML = ''
      + '<div class="client-portal__mini-title">'
      + '<div><span class="client-portal__mini-kicker">Cadastro</span><strong>Seus dados principais</strong></div>'
      + '<span class="client-portal__pill">Cliente ativo</span>'
      + '</div>'
      + '<div class="client-portal__data-list">'
      + '<div class="client-portal__data-row"><span class="client-portal__data-label">Documento</span><span class="client-portal__data-value">' + esc(displayValue(formatCpfCnpj(customer.cpf_cnpj), 'Nao informado')) + '</span></div>'
      + '<div class="client-portal__data-row"><span class="client-portal__data-label">WhatsApp</span><span class="client-portal__data-value">' + esc(displayValue(formatPhone(customer.whatsapp), 'Nao informado')) + '</span></div>'
      + '<div class="client-portal__data-row"><span class="client-portal__data-label">Email</span><span class="client-portal__data-value client-portal__data-value--muted">' + esc(displayValue(customer.email)) + '</span></div>'
      + '</div>';
  }

  function renderConnection(installation: Record<string, unknown> | null): void {
    const el = document.getElementById('clientConnectionBody');
    if (!el) return;
    if (!installation) {
      el.innerHTML = '<div class="client-portal__mini-title"><div><span class="client-portal__mini-kicker">Conexao</span><strong>Status da instalacao</strong></div></div><div class="client-portal__empty">Nenhuma instalacao vinculada ainda.</div>';
      return;
    }
    const statusLabel = displayValue(installation.status, 'Em analise');
    el.innerHTML = ''
      + '<div class="client-portal__mini-title">'
      + '<div><span class="client-portal__mini-kicker">Conexao</span><strong>Status da instalacao</strong></div>'
      + renderStatusBadge(statusLabel, 'info')
      + '</div>'
      + '<div class="client-portal__data-list">'
      + '<div class="client-portal__data-row"><span class="client-portal__data-label">Plano</span><span class="client-portal__data-value">' + esc(displayValue(installation.plan_code)) + '</span></div>'
      + '<div class="client-portal__data-row"><span class="client-portal__data-label">PPPoE</span><span class="client-portal__data-value">' + esc(displayValue(installation.pppoe_user)) + '</span></div>'
      + '<div class="client-portal__data-row"><span class="client-portal__data-label">Vencimento</span><span class="client-portal__data-value">' + esc(installation.due_day ? ('Dia ' + installation.due_day) : 'Nao definido') + '</span></div>'
      + '</div>';
  }

  function renderBillingSummary(invoices: Record<string, unknown>[]): void {
    const el = document.getElementById('clientBillingBody');
    if (!el) return;
    const pending = invoices.filter((i) => String(i.status || '') !== 'PAID');
    const next = pending[0] || invoices[0] || null;
    const dueText = next ? formatDate(next.due_date) : 'Sem cobrancas';
    const amountText = next ? formatMoney(next.amount) : 'R$ 0,00';
    const dueQuick = document.getElementById('clientQuickDue');
    if (dueQuick) dueQuick.textContent = dueText;
    el.innerHTML = ''
      + '<div class="client-portal__mini-title">'
      + '<div><span class="client-portal__mini-kicker">Financeiro</span><strong>Visao das cobrancas</strong></div>'
      + '<span class="client-portal__pill">' + esc(String(pending.length)) + ' em aberto</span>'
      + '</div>'
      + '<div class="client-portal__data-list">'
      + '<div class="client-portal__data-row"><span class="client-portal__data-label">Proxima fatura</span><span class="client-portal__data-value">' + esc(dueText) + '</span></div>'
      + '<div class="client-portal__data-row"><span class="client-portal__data-label">Valor</span><span class="client-portal__data-value">' + esc(amountText) + '</span></div>'
      + '</div>';
  }

  function initLogin(): void {
    const form = document.getElementById('clientLoginForm');
    if (!form) return;
    const cpfInput = document.getElementById('loginCpfCnpj') as HTMLInputElement | null;
    const waInput = document.getElementById('loginWhatsapp') as HTMLInputElement | null;
    const errorEl = document.getElementById('clientLoginError');
    const btn = document.getElementById('btnClientLogin') as HTMLButtonElement | null;
    const txt = document.getElementById('clientLoginText');
    const spin = document.getElementById('clientLoginSpinner');

    function setLoading(isLoading: boolean): void {
      if (!btn || !txt || !spin) return;
      btn.disabled = isLoading;
      txt.classList.toggle('d-none', isLoading);
      spin.classList.toggle('d-none', !isLoading);
    }

    function showError(msg: string): void {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.classList.remove('d-none');
    }

    function clearError(): void {
      if (!errorEl) return;
      errorEl.classList.add('d-none');
    }

    form.addEventListener('submit', function (e: Event) {
      e.preventDefault();
      clearError();
      const cpf = onlyDigits(cpfInput?.value ?? '');
      const wa = waInput?.value ?? '';
      if (!cpf || cpf.length < 11) {
        showError('Informe um CPF/CNPJ valido.');
        return;
      }
      if (!wa || onlyDigits(wa).length < 10) {
        showError('Informe um WhatsApp com DDD.');
        return;
      }
      setLoading(true);
      api('/login', { method: 'POST', body: JSON.stringify({ cpfCnpj: cpf, whatsapp: wa }) })
        .then(function (data: Record<string, unknown>) {
          setToken((data.token as string) ?? '');
          goToDashboard();
        })
        .catch(function (err: Error) {
          setLoading(false);
          showError(err.message || 'Nao foi possivel entrar.');
        });
    });
  }

  function renderInvoices(list: Record<string, unknown>[]): void {
    const el = document.getElementById('clientInvoicesBody');
    if (!el) return;
    if (!list?.length) {
      el.innerHTML = '<div class="client-portal__empty">Nenhuma fatura encontrada.</div>';
      return;
    }
    let html = '<div class="table-responsive"><table class="table table-sm align-middle mb-0 client-portal__table"><thead><tr><th>Referencia</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Obs.</th></tr></thead><tbody>';
    list.forEach(function (inv: Record<string, unknown>) {
      const info = invoiceStatusLabel(String(inv.status || 'PENDING'));
      html += '<tr>'
        + '<td>' + esc(inv.ref_month ?? '') + '</td>'
        + '<td>' + esc(formatDate(inv.due_date ?? '')) + '</td>'
        + '<td>' + esc(formatMoney(inv.amount)) + '</td>'
        + '<td><span class="badge bg-' + info.cls + '">' + esc(info.label) + '</span></td>'
      + '<td class="small text-muted">' + esc(displayValue(inv.notes, 'Sem observacoes')) + '</td>'
      + '</tr>';
    });
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }

  function renderContract(customer: Record<string, unknown> | null, contracts: Record<string, unknown>[], installation: Record<string, unknown> | null): void {
    const el = document.getElementById('clientContractBody');
    if (!el) return;
    const ct = contracts?.[0] ?? null;
    const plan = (installation?.plan_code ?? ct?.plan_code ?? customer?.plan_code) as string | undefined;
    const due = installation?.due_day ?? ct?.due_day;
    const status = (ct?.status ?? installation?.status) as string | undefined;
    const parts: string[] = ['<div class="client-portal__contract-grid">'];
    parts.push('<div class="client-portal__contract-card"><h6>Assinatura atual</h6><div class="client-portal__contract-meta">');
    parts.push('<div><span>Plano</span><strong>' + esc(displayValue(plan)) + '</strong></div>');
    parts.push('<div><span>Dia de vencimento</span><strong>' + esc(due ?? 'Nao definido') + '</strong></div>');
    parts.push('<div><span>Status</span><strong>' + esc(displayValue(status, 'Em configuracao')) + '</strong></div>');
    if (ct) parts.push('<div><span>Contrato</span><strong>#' + esc(ct.id) + '</strong></div>');
    parts.push('</div></div>');
    parts.push('<div class="client-portal__contract-card"><h6>Conexao e vigencia</h6><div class="client-portal__contract-meta">');
    parts.push('<div><span>PPPoE</span><strong>' + esc(displayValue(installation?.pppoe_user)) + '</strong></div>');
    parts.push('<div><span>Inicio</span><strong>' + esc(ct?.starts_at ? formatDate(ct.starts_at) : 'Nao informado') + '</strong></div>');
    if (customer?.address_json) {
      let addr = customer.address_json;
      try { addr = typeof addr === 'string' ? JSON.parse(addr as string) : addr; } catch {}
      if (addr && typeof addr === 'object') {
        const a = addr as Record<string, unknown>;
        const line = ((a.logradouro ?? a.rua) as string ?? '') + (a.numero ? ', ' + a.numero : '') + (a.bairro ? ' - ' + a.bairro : '') + (a.cidade ? ', ' + a.cidade : '');
        if (line) parts.push('<div><span>Endereco</span><strong>' + esc(line) + '</strong></div>');
      }
    }
    parts.push('<div><span>Observacoes</span><strong>' + esc(displayValue(ct?.notes, 'Sem observacoes contratuais')) + '</strong></div>');
    parts.push('</div></div>');
    parts.push('</div>');
    el.innerHTML = parts.join('');
  }

  function renderTickets(list: Record<string, unknown>[]): void {
    const el = document.getElementById('clientTicketsBody');
    if (!el) return;
    if (!list?.length) {
      el.innerHTML = '<div class="client-portal__empty">Nenhum chamado aberto. Quando precisar, clique em "Novo chamado".</div>';
      return;
    }
    let html = '<div class="table-responsive"><table class="table table-sm align-middle mb-0 client-portal__table"><thead><tr><th>Codigo</th><th>Assunto</th><th>Status</th><th>Categoria</th><th>Aberto em</th><th class="text-end">Acoes</th></tr></thead><tbody>';
    list.slice(0, 10).forEach(function (t: Record<string, unknown>) {
      const info = ticketStatusLabel(String(t.status || 'OPEN'));
      const isTrackable = ['OPEN', 'IN_PROGRESS', 'PENDING', 'WAITING_CUSTOMER', 'EN_ROUTE'].includes(String(t.status || '').toUpperCase());
        html += '<tr>'
          + '<td>#' + esc(t.id) + '</td>'
          + '<td><div class="client-portal__ticket-subject"><div class="fw-semibold">' + esc(displayValue(t.subject, 'Chamado sem assunto')) + '</div><div class="client-portal__ticket-note">' + esc(displayValue(t.defect_text, 'Sem descricao detalhada.')) + '</div></div></td>'
          + '<td>' + renderStatusBadge(info.label, info.cls) + '</td>'
          + '<td><span class="client-portal__pill">' + esc(humanizeTechnicalCategory(t.technical_category)) + '</span></td>'
          + '<td>' + esc(formatDate(t.created_at || '')) + '</td>'
          + '<td class="text-end"><div class="client-portal__ticket-actions"><button type="button" class="btn btn-outline-primary btn-sm" data-ticket-open="' + esc(t.id) + '">' + (isTrackable ? 'Acompanhar' : 'Ver') + '</button></div></td>'
          + '</tr>';
    });
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }

  function renderTicketViewer(ticket: Record<string, unknown>): void {
    const viewer = document.getElementById('clientTicketViewer');
    if (!viewer) return;
    const statusInfo = ticketStatusLabel(String(ticket.status || 'OPEN'));
    viewer.innerHTML = ''
      + '<div class="client-portal__ticket-viewer-head">'
      + '<div><div class="client-portal__ticket-viewer-title">Chamado #' + esc(ticket.id) + ' - ' + esc(displayValue(ticket.subject, 'Sem assunto')) + '</div><p class="client-portal__ticket-viewer-copy">Acompanhe o andamento do seu atendimento sem sair do painel.</p></div>'
      + '<button type="button" class="btn btn-outline-secondary btn-sm" id="btnCloseClientTicketViewer">Fechar</button>'
      + '</div>'
      + '<div class="client-portal__ticket-viewer-grid">'
      + '<div class="client-portal__ticket-viewer-item"><span>Status</span><strong>' + renderStatusBadge(statusInfo.label, statusInfo.cls) + '</strong></div>'
      + '<div class="client-portal__ticket-viewer-item"><span>Categoria</span><strong>' + esc(humanizeTechnicalCategory(ticket.technical_category)) + '</strong></div>'
      + '<div class="client-portal__ticket-viewer-item"><span>Canal</span><strong>' + esc(humanizeChannel(ticket.channel)) + '</strong></div>'
      + '<div class="client-portal__ticket-viewer-item"><span>Abertura</span><strong>' + esc(formatDate(ticket.created_at)) + '</strong></div>'
      + '</div>'
      + '<div class="client-portal__ticket-viewer-body">'
      + '<div class="client-portal__ticket-viewer-section"><h6>Defeito constatado</h6><p>' + esc(displayValue(ticket.defect_text, 'Ainda nao foi registrado um diagnostico detalhado.')) + '</p></div>'
      + '<div class="client-portal__ticket-viewer-section"><h6>Andamento / solucao</h6><p>' + esc(displayValue(ticket.solution_text, 'Sua equipe tecnica ainda esta atualizando o andamento deste chamado.')) + '</p></div>'
      + '<div class="client-portal__ticket-viewer-section"><h6>Responsavel</h6><p>' + esc(displayValue(ticket.assigned_to_name, 'Aguardando atribuicao da equipe')) + '</p></div>'
      + '</div>';
    show(viewer as HTMLElement);
    const closeBtn = document.getElementById('btnCloseClientTicketViewer');
    if (closeBtn) closeBtn.addEventListener('click', function () { hide(viewer as HTMLElement); });
  }

  function loadAll(): void {
    const dashboard = document.getElementById('clientDashboard');
    const loginCard = document.getElementById('clientLoginCard');
    const token = getToken();
    if (!token) {
      if (isDashboardPage()) {
        goToLogin();
        return;
      }
      show(loginCard);
      hide(dashboard);
      return;
    }
    if (isLoginPage()) {
      goToDashboard();
      return;
    }
    hide(loginCard);
    show(dashboard);

    api('/me')
      .then(function (data: Record<string, unknown>) {
        const c = (data.customer ?? {}) as Record<string, unknown>;
        const inst = (data.installation ?? null) as Record<string, unknown> | null;
        const nameEl = document.getElementById('clientName');
        const quickStatus = document.getElementById('clientQuickStatus');
        if (nameEl) nameEl.textContent = (c.name as string) ?? 'Cliente';
        if (quickStatus) quickStatus.textContent = displayValue(inst?.status, 'Ativo');
        return Promise.all([
          Promise.resolve({ customer: c, installation: inst }),
          api('/invoices'),
          api('/contracts'),
          api('/tickets'),
        ]);
      })
      .then(function (all: unknown[]) {
        const meta = all[0] as { customer: Record<string, unknown>; installation: Record<string, unknown> | null };
        const inv = all[1] as { rows?: Record<string, unknown>[]; invoices?: Record<string, unknown>[] };
        const ct = all[2] as { rows?: Record<string, unknown>[] };
        const tk = all[3] as { rows?: Record<string, unknown>[] };
        const invoices = inv.rows ?? inv.invoices ?? [];
        renderProfile(meta.customer);
        renderConnection(meta.installation);
        renderBillingSummary(invoices);
        renderInvoices(invoices);
        renderContract(meta.customer, ct.rows ?? [], meta.installation);
        renderTickets(tk.rows ?? []);
      })
      .catch(function () {
        setToken('');
        if (isDashboardPage()) goToLogin();
        else loadAll();
      });
  }

  function initLogout(): void {
    const btn = document.getElementById('btnClientLogout');
    if (!btn) return;
    btn.addEventListener('click', function () {
      setToken('');
      goToLogin();
    });
  }

  function initNewTicket(): void {
    const openBtn = document.getElementById('btnNewClientTicket');
    const wrap = document.getElementById('clientTicketFormWrap');
    const cancelBtn = document.getElementById('btnCancelClientTicket');
    const submitBtn = document.getElementById('btnSubmitClientTicket');
    const subjectEl = document.getElementById('clientTicketSubject') as HTMLInputElement | null;
    const categoryEl = document.getElementById('clientTicketCategory') as HTMLSelectElement | null;
    const descriptionEl = document.getElementById('clientTicketDescription') as HTMLTextAreaElement | null;
    const subjectInput = subjectEl as HTMLInputElement;
    const categoryInput = categoryEl as HTMLSelectElement;
    const descriptionInput = descriptionEl as HTMLTextAreaElement;
    const errorEl = document.getElementById('clientTicketError');
    if (!openBtn || !wrap || !cancelBtn || !submitBtn || !subjectEl || !categoryEl || !descriptionEl) return;

    function resetForm(): void {
      subjectInput.value = '';
      categoryInput.value = '';
      descriptionInput.value = '';
      if (errorEl) {
        errorEl.classList.add('d-none');
        errorEl.textContent = '';
      }
    }

    openBtn.addEventListener('click', function () {
      show(wrap as HTMLElement);
      subjectInput.focus();
    });

    cancelBtn.addEventListener('click', function () {
      resetForm();
      hide(wrap as HTMLElement);
    });

    submitBtn.addEventListener('click', function () {
      if (errorEl) {
        errorEl.classList.add('d-none');
        errorEl.textContent = '';
      }
      const subject = subjectInput.value.trim();
      const description = descriptionInput.value.trim();
      const technicalCategory = categoryInput.value.trim();
      if (!subject) {
        if (errorEl) {
          errorEl.textContent = 'Informe o assunto do chamado.';
          errorEl.classList.remove('d-none');
        }
        return;
      }
      submitBtn.setAttribute('disabled', 'disabled');
      api('/tickets', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          description,
          technical_category: technicalCategory || null,
          channel: 'PORTAL_CLIENTE',
          ticket_type: 'SUPORTE'
        })
      }).then(function () {
        submitBtn.removeAttribute('disabled');
        resetForm();
        hide(wrap as HTMLElement);
        loadAll();
        alert('Chamado aberto com sucesso. Nossa equipe entrara em contato.');
      }).catch(function (err: Error) {
        submitBtn.removeAttribute('disabled');
        if (errorEl) {
          errorEl.textContent = err.message || 'Nao foi possivel abrir o chamado.';
          errorEl.classList.remove('d-none');
        }
      });
    });
  }

  function initTicketViewer(): void {
    document.addEventListener('click', function (event: Event) {
      const target = event.target as HTMLElement | null;
      const trigger = target?.closest('[data-ticket-open]') as HTMLElement | null;
      if (!trigger) return;
      const id = Number(trigger.getAttribute('data-ticket-open') || 0);
      if (!id) return;
      const viewer = document.getElementById('clientTicketViewer');
      if (viewer) {
        viewer.innerHTML = '<div class="client-portal__empty">Carregando acompanhamento do chamado...</div>';
        show(viewer as HTMLElement);
      }
      api('/tickets/' + id)
        .then(function (data: Record<string, unknown>) {
          renderTicketViewer((data.row ?? {}) as Record<string, unknown>);
        })
        .catch(function (err: Error) {
          if (viewer) {
            viewer.innerHTML = '<div class="client-portal__empty">' + esc(err.message || 'Nao foi possivel carregar este chamado.') + '</div>';
            show(viewer as HTMLElement);
          }
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initLogin();
    initLogout();
    initNewTicket();
    initTicketViewer();
    if (isLoginPage() && getToken()) {
      goToDashboard();
      return;
    }
    if (isDashboardPage() && !getToken()) {
      goToLogin();
      return;
    }
    if (isDashboardPage() && getToken()) {
      loadAll();
    }
  });
})();
