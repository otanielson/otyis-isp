"use strict";
/**
 * Portal do Cliente — login, faturas, contrato, chamados
 */
(function () {
    const TOKEN_KEY = 'cliente_portal_token';
    const win = window;
    function esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] ?? m));
    }
    function getToken() {
        try {
            return localStorage.getItem(TOKEN_KEY) || '';
        }
        catch {
            return '';
        }
    }
    function setToken(t) {
        try {
            if (t)
                localStorage.setItem(TOKEN_KEY, t);
            else
                localStorage.removeItem(TOKEN_KEY);
        }
        catch { }
    }
    function api(path, opts) {
        opts = opts ?? {};
        const token = getToken();
        const url = (win.__API_BASE__ != null ? win.__API_BASE__ : '/api/client') + path;
        const headers = opts.headers ?? {};
        if (token)
            headers.Authorization = 'Bearer ' + token;
        if (opts.body && typeof opts.body === 'string')
            headers['Content-Type'] = 'application/json';
        return fetch(url, { method: opts.method ?? 'GET', headers, body: opts.body, credentials: 'same-origin' }).then(function (res) {
            return res.json().catch(() => ({})).then(function (data) {
                if (!res.ok)
                    throw new Error(data.error ?? data.message ?? 'Erro ao comunicar com o servidor');
                return data;
            });
        });
    }
    function show(el) {
        if (el)
            el.style.display = '';
    }
    function hide(el) {
        if (el)
            el.style.display = 'none';
    }
    function initLogin() {
        const form = document.getElementById('clientLoginForm');
        if (!form)
            return;
        const cpfInput = document.getElementById('loginCpfCnpj');
        const waInput = document.getElementById('loginWhatsapp');
        const errorEl = document.getElementById('clientLoginError');
        const btn = document.getElementById('btnClientLogin');
        const txt = document.getElementById('clientLoginText');
        const spin = document.getElementById('clientLoginSpinner');
        function setLoading(isLoading) {
            if (!btn || !txt || !spin)
                return;
            btn.disabled = isLoading;
            txt.classList.toggle('d-none', isLoading);
            spin.classList.toggle('d-none', !isLoading);
        }
        function showError(msg) {
            if (!errorEl)
                return;
            errorEl.textContent = msg;
            errorEl.classList.remove('d-none');
        }
        function clearError() {
            if (!errorEl)
                return;
            errorEl.classList.add('d-none');
        }
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            clearError();
            let cpf = (cpfInput?.value ?? '').replace(/\D/g, '');
            const wa = (waInput?.value ?? '').trim();
            if (!cpf || cpf.length < 11) {
                showError('Informe um CPF/CNPJ válido (somente números).');
                return;
            }
            if (!wa || wa.replace(/\D/g, '').length < 10) {
                showError('Informe um WhatsApp com DDD.');
                return;
            }
            setLoading(true);
            api('/login', { method: 'POST', body: JSON.stringify({ cpfCnpj: cpf, whatsapp: wa }) })
                .then(function (data) {
                setToken(data.token ?? '');
                hide(document.getElementById('clientLoginCard'));
                show(document.getElementById('clientDashboard'));
                loadAll();
            })
                .catch(function (err) {
                setLoading(false);
                showError(err.message || 'Não foi possível entrar. Confira os dados.');
            });
        });
    }
    function renderInvoices(list) {
        const el = document.getElementById('clientInvoicesBody');
        if (!el)
            return;
        if (!list?.length) {
            el.innerHTML = '<p class="text-muted small mb-0">Nenhuma fatura encontrada.</p>';
            return;
        }
        let html = '<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr><th>Referência</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead><tbody>';
        list.forEach(function (inv) {
            const st = inv.status ?? 'PENDING';
            const cls = { PENDING: 'warning', PAID: 'success', OVERDUE: 'danger' }[st] ?? 'secondary';
            const label = { PENDING: 'Pendente', PAID: 'Paga', OVERDUE: 'Vencida' }[st] ?? st;
            html += '<tr><td>' + esc(inv.ref_month ?? '') + '</td><td>' + esc(inv.due_date ?? '') + '</td><td>R$ ' + (Number(inv.amount) || 0).toFixed(2) + '</td><td><span class="badge bg-' + cls + '">' + label + '</span></td></tr>';
        });
        html += '</tbody></table></div>';
        el.innerHTML = html;
    }
    function renderContract(customer, contracts, installation) {
        const el = document.getElementById('clientContractBody');
        if (!el)
            return;
        const ct = contracts?.[0] ?? null;
        const plan = (installation?.plan_code ?? ct?.plan_code ?? customer?.plan_code);
        const due = installation?.due_day ?? ct?.due_day;
        const status = (ct?.status ?? installation?.status);
        const parts = ['<dl class="row small mb-0">'];
        parts.push('<dt class="col-4 col-md-3">Plano</dt><dd class="col-8 col-md-9">' + esc(plan ?? '—') + '</dd>');
        parts.push('<dt class="col-4 col-md-3">Dia vencimento</dt><dd class="col-8 col-md-9">' + esc(due ?? '—') + '</dd>');
        if (ct)
            parts.push('<dt class="col-4 col-md-3">Contrato</dt><dd class="col-8 col-md-9">#' + esc(ct.id) + ' · ' + esc(ct.status ?? '') + '</dd>');
        if (customer?.address_json) {
            let addr = customer.address_json;
            try {
                addr = typeof addr === 'string' ? JSON.parse(addr) : addr;
            }
            catch { }
            if (addr && typeof addr === 'object') {
                const a = addr;
                const line = ((a.logradouro ?? a.rua) ?? '') + (a.numero ? ', ' + a.numero : '') + (a.bairro ? ' - ' + a.bairro : '') + (a.cidade ? ', ' + a.cidade : '');
                if (line)
                    parts.push('<dt class="col-4 col-md-3">Endereço</dt><dd class="col-8 col-md-9">' + esc(line) + '</dd>');
            }
        }
        if (status)
            parts.push('<dt class="col-4 col-md-3">Status</dt><dd class="col-8 col-md-9">' + esc(status) + '</dd>');
        parts.push('</dl>');
        el.innerHTML = parts.join('');
    }
    function renderTickets(list) {
        const el = document.getElementById('clientTicketsBody');
        if (!el)
            return;
        if (!list?.length) {
            el.innerHTML = '<p class="text-muted small mb-0">Nenhum chamado aberto. Quando precisar, clique em "Novo chamado".</p>';
            return;
        }
        let html = '<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr><th>Código</th><th>Assunto</th><th>Status</th><th>Aberto em</th></tr></thead><tbody>';
        list.slice(0, 10).forEach(function (t) {
            const st = t.status ?? 'OPEN';
            const cls = { OPEN: 'warning', IN_PROGRESS: 'info', PENDING: 'secondary', RESOLVED: 'success', CLOSED: 'secondary' }[st] ?? 'secondary';
            html += '<tr><td>#' + esc(t.id) + '</td><td>' + esc(t.subject ?? '') + '</td><td><span class="badge bg-' + cls + '">' + esc(st) + '</span></td><td>' + esc(t.created_at ?? '') + '</td></tr>';
        });
        html += '</tbody></table></div>';
        el.innerHTML = html;
    }
    function loadAll() {
        const dashboard = document.getElementById('clientDashboard');
        const loginCard = document.getElementById('clientLoginCard');
        const token = getToken();
        if (!token) {
            show(loginCard);
            hide(dashboard);
            return;
        }
        hide(loginCard);
        show(dashboard);
        api('/me')
            .then(function (data) {
            const c = (data.customer ?? {});
            const inst = (data.installation ?? null);
            const nameEl = document.getElementById('clientName');
            if (nameEl)
                nameEl.textContent = c.name ?? 'Cliente';
            return Promise.all([
                Promise.resolve({ customer: c, installation: inst }),
                api('/invoices'),
                api('/contracts'),
                api('/tickets'),
            ]);
        })
            .then(function (all) {
            const meta = all[0];
            const inv = all[1];
            const ct = all[2];
            const tk = all[3];
            renderInvoices(inv.rows ?? inv.invoices ?? []);
            renderContract(meta.customer, ct.rows ?? [], meta.installation);
            renderTickets(tk.rows ?? []);
        })
            .catch(function () {
            setToken('');
            loadAll();
        });
    }
    function initLogout() {
        const btn = document.getElementById('btnClientLogout');
        if (!btn)
            return;
        btn.addEventListener('click', function () {
            setToken('');
            hide(document.getElementById('clientDashboard'));
            show(document.getElementById('clientLoginCard'));
        });
    }
    function initNewTicket() {
        const btn = document.getElementById('btnNewClientTicket');
        if (!btn)
            return;
        btn.addEventListener('click', function () {
            const subject = prompt('Descreva resumidamente o problema:');
            if (!subject)
                return;
            const desc = prompt('Conte um pouco mais (opcional):') || '';
            api('/tickets', { method: 'POST', body: JSON.stringify({ subject, description: desc }) })
                .then(function () {
                loadAll();
                alert('Chamado aberto com sucesso. Nossa equipe entrará em contato.');
            })
                .catch(function (err) {
                alert(err.message || 'Não foi possível abrir o chamado.');
            });
        });
    }
    document.addEventListener('DOMContentLoaded', function () {
        initLogin();
        initLogout();
        initNewTicket();
        if (getToken()) {
            hide(document.getElementById('clientLoginCard'));
            show(document.getElementById('clientDashboard'));
            loadAll();
        }
    });
})();
