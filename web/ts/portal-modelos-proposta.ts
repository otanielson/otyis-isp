/**
 * Portal do Provedor — Modelos de Proposta (página dedicada)
 */
/* eslint-disable */
(function (): void {
  const TOKEN_KEY = 'portal_provedor_token';
  const win = window as unknown as { __PORTAL_BASE__?: string; __API_BASE__?: string };

  function getToken(): string {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }

  function redirectLogin(): void {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    window.location.href = (win.__PORTAL_BASE__ || '/portal') + '/';
  }

  if (!getToken()) { redirectLogin(); return; }

  function esc(s: unknown): string {
    return String(s ?? '').replace(/[&<>"']/g, (m: string) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] ?? m));
  }

  function api(path: string, opts?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<Record<string, unknown>> {
    opts = opts ?? {};
    const token = getToken();
    const url = (win.__API_BASE__ != null ? win.__API_BASE__ : '/api/portal') + path;
    const headers: Record<string, string> = opts.headers ?? {};
    headers['Authorization'] = 'Bearer ' + token;
    if (opts.body && typeof opts.body === 'string') headers['Content-Type'] = 'application/json';
    return fetch(url, { method: opts.method ?? 'GET', headers, body: opts.body, credentials: 'same-origin' }).then(function (res: Response) {
      return res.json().catch(() => ({})).then(function (data: Record<string, unknown>) {
        if (res.status === 401) { redirectLogin(); throw new Error('Sessão expirada.'); }
        if (!res.ok) throw new Error((data.message as string) ?? (data.error as string) ?? 'Erro');
        return data;
      });
    });
  }

  function loadList(): void {
    const out = document.getElementById('outList');
    if (!out) return;
    out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
    api('/proposal-templates').then(function (data: Record<string, unknown>) {
      const list = ((data.templates ?? data.rows) as Record<string, unknown>[]) ?? [];
      if (!list.length) {
        out.innerHTML = '<div class="modelo-empty"><i class="bi bi-layout-text-window-reverse d-block"></i><p class="mb-0">Nenhum modelo cadastrado. Use o formulário acima para criar o primeiro.</p></div>';
        return;
      }
      let html = '<div class="table-responsive"><table class="table table-sm table-hover modelo-table"><thead><tr>';
      html += '<th>#</th><th>Nome</th><th>Plano</th><th>Valor</th><th>Validade (dias)</th><th>Ações</th></tr></thead><tbody>';
      list.forEach(function (t: Record<string, unknown>) {
        const amt = t.default_amount != null ? 'R$ ' + Number(t.default_amount).toFixed(2) : '—';
        html += '<tr><td>' + esc(t.id) + '</td><td>' + esc(t.name ?? '') + '</td><td>' + esc(t.plan_code ?? '—') + '</td><td>' + amt + '</td><td>' + esc(t.valid_days != null ? t.valid_days : '15') + '</td>';
        html += '<td><button type="button" class="btn btn-sm btn-outline-primary me-1" data-edit="' + t.id + '">Editar</button>';
        html += '<button type="button" class="btn btn-sm btn-outline-danger" data-del="' + t.id + '">Excluir</button></td></tr>';
      });
      html += '</tbody></table></div>';
      out.innerHTML = html;

      out.querySelectorAll('[data-edit]').forEach(function (btn) {
        btn.addEventListener('click', function (this: HTMLElement) { editModelo(Number(this.getAttribute('data-edit'))); });
      });
      out.querySelectorAll('[data-del]').forEach(function (btn) {
        btn.addEventListener('click', function (this: HTMLElement) { delModelo(Number(this.getAttribute('data-del'))); });
      });
    }).catch(function (err: Error) {
      out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
    });
  }

  function clearForm(): void {
    const id = document.getElementById('modeloId') as HTMLInputElement | null;
    const name = document.getElementById('modeloName') as HTMLInputElement | null;
    const planCode = document.getElementById('modeloPlanCode') as HTMLInputElement | null;
    const amount = document.getElementById('modeloAmount') as HTMLInputElement | null;
    const validDays = document.getElementById('modeloValidDays') as HTMLInputElement | null;
    const desc = document.getElementById('modeloDescription') as HTMLInputElement | null;
    if (id) id.value = ''; if (name) name.value = ''; if (planCode) planCode.value = '';
    if (amount) amount.value = ''; if (validDays) validDays.value = '15'; if (desc) desc.value = '';
  }

  function editModelo(id: number): void {
    api('/proposal-templates').then(function (data: Record<string, unknown>) {
      const list = ((data.templates ?? data.rows) as Record<string, unknown>[]) ?? [];
      const t = list.find((x: Record<string, unknown>) => x.id === id);
      if (!t) { alert('Modelo não encontrado.'); return; }
      const idEl = document.getElementById('modeloId') as HTMLInputElement | null;
      const nameEl = document.getElementById('modeloName') as HTMLInputElement | null;
      const planEl = document.getElementById('modeloPlanCode') as HTMLInputElement | null;
      const amountEl = document.getElementById('modeloAmount') as HTMLInputElement | null;
      const validEl = document.getElementById('modeloValidDays') as HTMLInputElement | null;
      const descEl = document.getElementById('modeloDescription') as HTMLInputElement | null;
      if (idEl) idEl.value = String(t.id);
      if (nameEl) nameEl.value = String(t.name ?? '');
      if (planEl) planEl.value = String(t.plan_code ?? '');
      if (amountEl) amountEl.value = t.default_amount != null ? String(t.default_amount) : '';
      if (validEl) validEl.value = String(t.valid_days ?? 15);
      if (descEl) descEl.value = String(t.description ?? '');
      if (nameEl) nameEl.focus();
    }).catch((err: Error) => alert(err.message));
  }

  function delModelo(id: number): void {
    if (!confirm('Excluir este modelo? Ele ficará inativo e não aparecerá mais na lista.')) return;
    api('/proposal-templates/' + id, { method: 'DELETE' }).then(function () {
      loadList();
      clearForm();
    }).catch((err: Error) => alert(err.message));
  }

  const form = document.getElementById('formModelo');
  if (form) form.addEventListener('submit', function (e: Event) {
    e.preventDefault();
    const idVal = (document.getElementById('modeloId') as HTMLInputElement | null)?.value?.trim() ?? '';
    const name = (document.getElementById('modeloName') as HTMLInputElement | null)?.value?.trim() ?? '';
    const planCode = (document.getElementById('modeloPlanCode') as HTMLInputElement | null)?.value?.trim() || null;
    const amountVal = (document.getElementById('modeloAmount') as HTMLInputElement | null)?.value?.trim() ?? '';
    const validDays = parseInt((document.getElementById('modeloValidDays') as HTMLInputElement | null)?.value ?? '15', 10) || 15;
    const description = (document.getElementById('modeloDescription') as HTMLInputElement | null)?.value?.trim() || null;

    if (!name) { alert('Nome do modelo é obrigatório.'); return; }

    const amount = amountVal ? parseFloat(amountVal.replace(',', '.')) : null;
    const body = { name, plan_code: planCode, default_amount: amount, valid_days: validDays, description };

    const btn = document.getElementById('btnSaveModelo') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvando...'; }

    const done = (): void => {
      loadList();
      clearForm();
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar modelo'; }
    };
    const fail = (err: Error): void => {
      alert(err.message);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar modelo'; }
    };

    if (idVal) {
      api('/proposal-templates/' + idVal, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(done).catch(fail);
    } else {
      api('/proposal-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(done).catch(fail);
    }
  });

  const btnCancel = document.getElementById('btnCancelModelo');
  if (btnCancel) btnCancel.addEventListener('click', clearForm);
  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) btnRefresh.addEventListener('click', loadList);
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) btnLogout.addEventListener('click', function (e: Event) {
    e.preventDefault();
    redirectLogin();
  });

  const base = (win.__PORTAL_BASE__ ?? '/portal').replace(/\/$/, '');
  const siteBase = base.replace(/\/portal\/?$/, '') || '/';
  const navDashboard = document.getElementById('navDashboard');
  const navProposals = document.getElementById('navProposals');
  const linkSite = document.getElementById('linkSite');
  if (navDashboard) (navDashboard as HTMLAnchorElement).href = base + '/dashboard';
  if (navProposals) (navProposals as HTMLAnchorElement).href = base + '/dashboard#proposals';
  if (linkSite) (linkSite as HTMLAnchorElement).href = siteBase;

  loadList();
})();
