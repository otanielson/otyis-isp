/**
 * Portal do Provedor — Módulo Financeiro (TypeScript)
 * Centro de Contas: Títulos, Cadastros, Carnês, Caixas, etc.
 */

interface FinanceStats {
  pending?: number;
  overdue?: number;
  paid?: number;
  pendingAmount?: number;
  paidAmount?: number;
  overdueAmount?: number;
  totalInMonth?: number;
  countInMonth?: number;
}

interface FinanceInvoice {
  id: number;
  ref_month: string;
  customer_name: string;
  whatsapp?: string;
  due_date: string;
  amount: number;
  plan_code?: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  paid_at?: string;
  notes?: string;
}

interface FinanceInvoicesResponse {
  rows: FinanceInvoice[];
}

interface CaixaMovement {
  id?: number;
  movement_date: string;
  tipo: 'RECEITA' | 'DESPESA';
  amount: number;
  description?: string;
  invoice_id?: number;
}

interface CaixaMovementsResponse {
  rows: CaixaMovement[];
  totalReceita?: number;
  totalDespesa?: number;
  saldo?: number;
}

interface PortalFinanceDeps {
  api: (path: string, opts?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<unknown>;
  esc: (s: unknown) => string;
  formatMoney: (v: unknown) => string;
  formatPhoneShort: (w: string | null | undefined) => string;
  setLoading: (elId: string) => void;
  loadStats: () => void;
}

interface PortalFinanceAPI {
  init: (deps: PortalFinanceDeps) => { loadFinance: () => void; loadCaixaMovements: () => void };
}

function getEl(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function getValue(id: string): string {
  const el = getEl(id) as HTMLInputElement | HTMLSelectElement | undefined;
  return (el && el.value) ? String(el.value) : '';
}

function statusBadge(status: string, esc: (s: unknown) => string): string {
  const classes: Record<string, string> = {
    PENDING: 'warning',
    PAID: 'success',
    OVERDUE: 'danger',
    CANCELLED: 'secondary',
  };
  const labels: Record<string, string> = {
    PENDING: 'Pendente',
    PAID: 'Pago',
    OVERDUE: 'Vencido',
    CANCELLED: 'Cancelado',
  };
  const c = classes[status] ?? 'secondary';
  const l = labels[status] ?? status;
  return `<span class="badge bg-${c} finance-badge">${esc(l)}</span>`;
}

function createFinanceModule(deps: PortalFinanceDeps): { loadFinance: () => void; loadCaixaMovements: () => void } {
  const { api, esc, formatMoney, formatPhoneShort, setLoading, loadStats } = deps;

  function loadFinance(): void {
    const monthEl = getEl('financeMonthFilter') as HTMLInputElement | null;
    if (monthEl && !monthEl.value) {
      monthEl.value = new Date().toISOString().slice(0, 7);
    }
    const month = getValue('financeMonthFilter');
    const statsUrl = '/finance/stats' + (month ? '?ref_month=' + encodeURIComponent(month) : '');
    api(statsUrl)
      .then((data: unknown) => {
        const d = data as FinanceStats;
        const setText = (id: string, text: string): void => {
          const el = getEl(id);
          if (el) el.textContent = text;
        };
        setText('financePendingAmount', formatMoney(d.pendingAmount));
        setText('financePending', ((d.pending ?? 0) + (d.overdue ?? 0)) + ' fatura(s)');
        setText('financePaidAmount', formatMoney(d.paidAmount));
        setText('financePaid', (d.paid ?? 0) + ' fatura(s)');
        setText('financeOverdueAmount', formatMoney(d.overdueAmount ?? 0));
        setText('financeOverdue', (d.overdue ?? 0) + ' fatura(s)');
        if (month && d.totalInMonth != null) {
          setText('financeTotalMonth', formatMoney(d.totalInMonth));
          setText('financeCountMonth', (d.countInMonth ?? 0) + ' fatura(s)');
        } else {
          setText('financeTotalMonth', '—');
          setText('financeCountMonth', '—');
        }
      })
      .catch(() => {
        ['financePendingAmount', 'financePaidAmount', 'financeOverdueAmount', 'financeTotalMonth'].forEach((id) => {
          const el = getEl(id);
          if (el) el.textContent = '—';
        });
        ['financePending', 'financePaid', 'financeOverdue', 'financeCountMonth'].forEach((id) => {
          const el = getEl(id);
          if (el) el.textContent = '—';
        });
      });

    const status = getValue('financeStatusFilter');
    let q = '/finance/invoices';
    const params: string[] = [];
    if (status) params.push('status=' + encodeURIComponent(status));
    if (month) params.push('ref_month=' + encodeURIComponent(month));
    if (params.length) q += '?' + params.join('&');

    const infoEl = getEl('financeFilterInfo');
    if (infoEl) infoEl.textContent = month ? `Faturas da competência ${month}` : 'Todas as faturas';

    setLoading('outFinance');
    api(q)
      .then((data: unknown) => {
        const res = data as FinanceInvoicesResponse;
        const rows = res.rows ?? [];
        const out = getEl('outFinance');
        if (!out) return;

        if (!rows.length) {
          out.innerHTML =
            '<p class="mb-0 text-muted py-4 text-center">Nenhuma fatura encontrada. Ajuste os filtros ou clique em <strong>Gerar faturas</strong> para a competência desejada.</p>';
          return;
        }

        let html =
          '<div class="table-responsive"><table class="table table-sm table-hover"><thead><tr>' +
          '<th>Competência</th><th>Cliente</th><th>Contato</th><th>Vencimento</th><th>Valor</th><th>Plano</th><th>Status</th><th>Data pagamento</th><th class="text-end">Ações</th></tr></thead><tbody>';

        rows.forEach((r: FinanceInvoice) => {
          const paidAt = r.paid_at ? `<span class="cell-paid-at">${esc(r.paid_at)}</span>` : '—';
          html +=
            '<tr><td>' +
            esc(r.ref_month) +
            '</td><td>' +
            esc(r.customer_name) +
            '</td><td class="small">' +
            esc(formatPhoneShort(r.whatsapp)) +
            '</td><td>' +
            esc(r.due_date) +
            '</td><td class="cell-amount">' +
            formatMoney(r.amount) +
            '</td><td>' +
            esc(r.plan_code ?? '') +
            '</td><td>' +
            statusBadge(r.status, esc) +
            '</td><td>' +
            paidAt +
            '</td><td class="text-end finance-actions">';
          if (r.status === 'CANCELLED') {
            html += '<span class="text-muted small">—</span>';
          } else if (r.status === 'PAID') {
            html += `<button type="button" class="btn btn-sm btn-outline-secondary me-1 finance-btn" data-mark-unpaid="${r.id}">Desfazer</button>`;
          } else {
            html +=
              `<button type="button" class="btn btn-sm btn-success me-1 finance-btn" data-mark-paid="${r.id}"><i class="bi bi-check-lg me-1"></i>Quitar</button>` +
              `<button type="button" class="btn btn-sm btn-outline-danger me-1 finance-btn" data-invoice-cancel="${r.id}" title="Desativar">Desativar</button>` +
              `<button type="button" class="btn btn-sm btn-outline-primary finance-btn" data-invoice-edit="${r.id}" data-invoice-due="${esc(r.due_date)}" data-invoice-amount="${esc(String(r.amount))}" data-invoice-plan="${esc(r.plan_code ?? '')}" data-invoice-notes="${esc((r.notes ?? '').toString())}" title="Alterar">Alterar</button>`;
          }
          html += '</td></tr>';
        });
        html += '</tbody></table></div>';
        out.innerHTML = html;

        out.querySelectorAll('[data-mark-paid]').forEach((btn) => {
          btn.addEventListener('click', function (this: HTMLElement) {
            const id = Number(this.getAttribute('data-mark-paid'));
            if (!confirm('Quitar esta fatura? Será lançado no movimento de caixa.')) return;
            api('/finance/invoices/' + id, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paid: true }),
            })
              .then(() => {
                loadFinance();
                loadStats();
              })
              .catch((err: Error) => alert(err.message));
          });
        });
        out.querySelectorAll('[data-mark-unpaid]').forEach((btn) => {
          btn.addEventListener('click', function (this: HTMLElement) {
            const id = Number(this.getAttribute('data-mark-unpaid'));
            api('/finance/invoices/' + id, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paid: false }),
            })
              .then(() => {
                loadFinance();
                loadStats();
              })
              .catch((err: Error) => alert(err.message));
          });
        });
        out.querySelectorAll('[data-invoice-cancel]').forEach((btn) => {
          btn.addEventListener('click', function (this: HTMLElement) {
            const id = Number(this.getAttribute('data-invoice-cancel'));
            if (!confirm('Desativar (cancelar) esta fatura?')) return;
            api('/finance/invoices/' + id, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'CANCELLED' }),
            })
              .then(() => {
                loadFinance();
                loadStats();
              })
              .catch((err: Error) => alert(err.message));
          });
        });
        out.querySelectorAll('[data-invoice-edit]').forEach((btn) => {
          btn.addEventListener('click', function (this: HTMLElement) {
            const id = Number(this.getAttribute('data-invoice-edit'));
            const due = this.getAttribute('data-invoice-due') ?? '';
            const amount = this.getAttribute('data-invoice-amount') ?? '';
            const plan = this.getAttribute('data-invoice-plan') ?? '';
            const notes = this.getAttribute('data-invoice-notes') ?? '';
            openEditInvoiceModal(id, due, amount, plan, notes, () => {
              loadFinance();
              loadStats();
            });
          });
        });
      })
      .catch((err: Error) => {
        const out = getEl('outFinance');
        if (out) out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
      });
  }

  function openEditInvoiceModal(
    invId: number,
    dueDate: string,
    amount: string,
    planCode: string,
    notes: string,
    onSuccess: () => void
  ): void {
    (getEl('editInvoiceId') as HTMLInputElement).value = String(invId);
    (getEl('editInvoiceDueDate') as HTMLInputElement).value = dueDate ? dueDate.slice(0, 10) : '';
    (getEl('editInvoiceAmount') as HTMLInputElement).value = amount != null ? String(Number(amount)) : '';
    (getEl('editInvoicePlanCode') as HTMLInputElement).value = planCode ?? '';
    (getEl('editInvoiceNotes') as HTMLInputElement | HTMLTextAreaElement).value = notes ?? '';
    const modal = getEl('modalEditInvoice');
    if (modal && (window as unknown as { bootstrap?: { Modal: new (el: HTMLElement) => { show: () => void } } }).bootstrap) {
      const Bootstrap = (window as unknown as { bootstrap: { Modal: new (el: HTMLElement) => { show: () => void } } }).bootstrap;
      new Bootstrap.Modal(modal).show();
    }
    const saveBtn = getEl('btnEditInvoiceSave');
    if (saveBtn) {
      saveBtn.onclick = () => {
        const id = (getEl('editInvoiceId') as HTMLInputElement)?.value;
        const due = getValue('editInvoiceDueDate');
        const amt = (getEl('editInvoiceAmount') as HTMLInputElement)?.value;
        const plan = getValue('editInvoicePlanCode');
        const n = (getEl('editInvoiceNotes') as HTMLTextAreaElement)?.value ?? '';
        if (!id) return;
        const payload: Record<string, unknown> = {};
        if (due) payload.due_date = due;
        if (amt !== '' && amt != null) payload.amount = Number(amt);
        if (plan !== undefined) payload.plan_code = plan;
        if (n !== undefined) payload.notes = n || null;
        if (Object.keys(payload).length === 0) {
          alert('Altere algum campo.');
          return;
        }
        api('/finance/invoices/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(() => {
            if (modal && (window as unknown as { bootstrap?: { Modal: { getInstance: (el: HTMLElement) => { hide: () => void } | null } } }).bootstrap) {
              const inst = (window as unknown as { bootstrap: { Modal: { getInstance: (el: HTMLElement) => { hide: () => void } | null } } }).bootstrap.Modal.getInstance(modal);
              if (inst) inst.hide();
            }
            onSuccess();
          })
          .catch((err: Error) => alert(err.message));
      };
    }
  }

  function loadCaixaMovements(): void {
    const out = getEl('outCaixaMovements');
    if (!out) return;
    const from = getValue('caixaDateFrom');
    const to = getValue('caixaDateTo');
    const tipo = getValue('caixaTipoFilter');
    let q = '/finance/caixa/movements?';
    if (from) q += 'date_from=' + encodeURIComponent(from) + '&';
    if (to) q += 'date_to=' + encodeURIComponent(to) + '&';
    if (tipo) q += 'tipo=' + encodeURIComponent(tipo) + '&';
    out.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Carregando...';
    api(q)
      .then((data: unknown) => {
        const res = data as CaixaMovementsResponse;
        const rows = res.rows ?? [];
        const totalReceita = res.totalReceita ?? 0;
        const totalDespesa = res.totalDespesa ?? 0;
        const saldo = res.saldo != null ? res.saldo : totalReceita - totalDespesa;
        const elReceita = getEl('caixaTotalReceita');
        const elDespesa = getEl('caixaTotalDespesa');
        const elSaldo = getEl('caixaSaldo');
        if (elReceita) elReceita.textContent = 'R$ ' + (totalReceita || 0).toFixed(2).replace('.', ',');
        if (elDespesa) elDespesa.textContent = 'R$ ' + (totalDespesa || 0).toFixed(2).replace('.', ',');
        if (elSaldo) {
          elSaldo.textContent = 'R$ ' + (saldo || 0).toFixed(2).replace('.', ',');
          (elSaldo as HTMLElement).style.color = saldo >= 0 ? '' : '#dc2626';
        }
        if (!rows.length) {
          out.innerHTML = '<p class="mb-0 text-muted py-4 text-center">Nenhum lançamento no período.</p>';
          return;
        }
        let html =
          '<div class="table-responsive"><table class="table table-sm table-hover"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Valor</th><th>Fatura</th></tr></thead><tbody>';
        rows.forEach((r: CaixaMovement) => {
          const desc = (r.description ?? '').toString().slice(0, 50);
          const valor = Number(r.amount) || 0;
          const tipoLabel = r.tipo === 'DESPESA' ? 'Despesa' : 'Receita';
          const valorStr = (r.tipo === 'DESPESA' ? '-' : '') + 'R$ ' + Math.abs(valor).toFixed(2).replace('.', ',');
          const inv = r.invoice_id ? '#' + r.invoice_id : '—';
          html +=
            '<tr><td>' +
            esc((r.movement_date ?? '').toString().slice(0, 10)) +
            '</td><td>' +
            esc(tipoLabel) +
            '</td><td>' +
            esc(desc) +
            '</td><td>' +
            valorStr +
            '</td><td>' +
            inv +
            '</td></tr>';
        });
        html += '</tbody></table></div>';
        out.innerHTML = html;
      })
      .catch((err: Error) => {
        out.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc(err.message) + '</div>';
      });
  }

  const financePageMap: Record<string, string> = {
    titulos: 'finance-page-titulos',
    cadastros: 'finance-page-cadastros',
    carnes: 'finance-page-carnes',
    protocolos: 'finance-page-protocolos',
    caixas: 'finance-page-caixas',
    pagar: 'finance-page-pagar',
    receber: 'finance-page-receber',
    declaracoes: 'finance-page-declaracoes',
    acrescimos: 'finance-page-acrescimos',
    cobranca: 'finance-page-cobranca',
    pix: 'finance-page-pix',
  };

  function switchToTitulos(): void {
    openFinancePage('titulos');
  }

  let financeWired = false;
  function openFinancePage(paneId: string): HTMLElement | null {
    const pageId = financePageMap[paneId];
    if (!pageId) return null;
    document.querySelectorAll('.finance-menu-btn').forEach((b) => b.classList.remove('active'));
    const btn = document.querySelector('.finance-menu-btn[data-finance-pane="' + paneId + '"]');
    if (btn) btn.classList.add('active');
    const page = safeShowModal(pageId);
    if (paneId === 'titulos') loadFinance();
    if (paneId === 'caixas') loadCaixaMovements();
    return page;
  }

  function wireFinanceMenu(): void {
    if (financeWired) return;
    financeWired = true;
    document.addEventListener('click', (e: Event) => {
      const ev = e as MouseEvent;
      const target = ev.target as HTMLElement | null;
      const menuBtn = target && target.closest ? target.closest('.finance-menu-btn') : null;
      if (menuBtn && getEl('tab-finance')) {
        const paneId = menuBtn.getAttribute('data-finance-pane');
        if (!paneId) return;
        openFinancePage(paneId);
        return;
      }
      const closeBtn = target && target.closest ? target.closest('.finance-pane-close') : null;
      if (closeBtn && getEl('tab-finance')) {
        ev.preventDefault();
        ev.stopPropagation();
        openFinancePage('titulos');
      }
    }, true);
  }

  wireFinanceMenu();
  function autoOpenDefaultPage(): void {
    const fn = autoOpenDefaultPage as typeof autoOpenDefaultPage & { done?: boolean };
    if (fn.done) return;
    if (!document.getElementById('finance-page-titulos')) return;
    if (!document.getElementById('tab-finance') && !document.getElementById('financeMenuTop')) return;
    fn.done = true;
    openFinancePage('titulos');
  }
  (autoOpenDefaultPage as typeof autoOpenDefaultPage & { done?: boolean }).done = false;
  autoOpenDefaultPage();
  if (!(autoOpenDefaultPage as typeof autoOpenDefaultPage & { done?: boolean }).done && typeof MutationObserver !== 'undefined') {
    const financeObserver = new MutationObserver(() => {
      autoOpenDefaultPage();
      if ((autoOpenDefaultPage as typeof autoOpenDefaultPage & { done?: boolean }).done) {
        financeObserver.disconnect();
      }
    });
    financeObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  getEl('btnLoadFinance')?.addEventListener('click', () => loadFinance());
  getEl('btnGenerateInvoices')?.addEventListener('click', () => {
    const month = getValue('financeMonthFilter') || new Date().toISOString().slice(0, 7);
    if (!confirm('Gerar faturas para ' + month + '? Serão criadas apenas para clientes que ainda não têm fatura neste mês.')) return;
    api('/finance/invoices/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref_month: month }),
    })
      .then((data: unknown) => {
        const d = data as { created?: number; refMonth?: string };
        alert('Criadas ' + (d.created ?? 0) + ' fatura(s) para ' + (d.refMonth ?? month) + '.');
        loadFinance();
        loadStats();
      })
      .catch((err: Error) => alert(err.message));
  });
  getEl('financeStatusFilter')?.addEventListener('change', () => loadFinance());
  getEl('financeMonthFilter')?.addEventListener('change', () => loadFinance());

  getEl('btnCaixaLoad')?.addEventListener('click', loadCaixaMovements);
  getEl('btnCaixaNovo')?.addEventListener('click', () => {
    const d = new Date().toISOString().slice(0, 10);
    const dateEl = getEl('caixaNovoDate') as HTMLInputElement | null;
    if (dateEl) dateEl.value = d;
    const amt = getEl('caixaNovoAmount') as HTMLInputElement;
    const desc = getEl('caixaNovoDescription') as HTMLInputElement | HTMLTextAreaElement;
    if (amt) amt.value = '';
    if (desc) desc.value = '';
    const modal = getEl('modalCaixaNovo');
    if (modal && (window as unknown as { bootstrap?: { Modal: new (el: HTMLElement) => object } }).bootstrap) {
      new ((window as unknown as { bootstrap: { Modal: new (el: HTMLElement) => { show: () => void } } }).bootstrap.Modal)(modal).show();
    }
  });
  getEl('btnCaixaNovoSave')?.addEventListener('click', () => {
    const tipo = getValue('caixaNovoTipo');
    const amount = Number(getValue('caixaNovoAmount'));
    const desc = (getEl('caixaNovoDescription') as HTMLInputElement | HTMLTextAreaElement)?.value ?? null;
    const date = getValue('caixaNovoDate') || new Date().toISOString().slice(0, 10);
    if (!amount || amount <= 0) {
      alert('Informe o valor.');
      return;
    }
    api('/finance/caixa/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, amount, description: desc, movement_date: date }),
    })
      .then(() => {
        const modal = getEl('modalCaixaNovo');
        if (modal && (window as unknown as { bootstrap?: { Modal: { getInstance: (el: HTMLElement) => { hide: () => void } | null } } }).bootstrap) {
          const inst = (window as unknown as { bootstrap: { Modal: { getInstance: (el: HTMLElement) => { hide: () => void } | null } } }).bootstrap.Modal.getInstance(modal);
          if (inst) inst.hide();
        }
        loadCaixaMovements();
      })
      .catch((err: Error) => alert(err.message));
  });

  return { loadFinance, loadCaixaMovements };
}

(function (): void {
  (window as unknown as { PortalFinance: PortalFinanceAPI }).PortalFinance = {
    init: createFinanceModule,
  };
})();
