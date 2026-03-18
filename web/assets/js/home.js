"use strict";
/**
 * Multi Telecom — Comportamentos da página inicial (TypeScript)
 * Animação de números, scroll suave e acessibilidade.
 */
const ROOT = typeof document !== 'undefined' ? document.documentElement : null;
function isHomePage() {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    return path === '/' || path.endsWith('/index.html');
}
/**
 * Anima os valores numéricos do bloco de estatísticas quando entram na viewport.
 */
function initStatsAnimation() {
    const statsSection = document.querySelector('.home-hero__stats');
    if (!statsSection)
        return;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting)
                return;
            const section = entry.target;
            section.querySelectorAll('.home-stats__value').forEach((valueEl) => {
                if (valueEl.dataset.animated === 'true')
                    return;
                valueEl.dataset.animated = 'true';
                animateValue(valueEl);
            });
        });
    }, { threshold: 0.3, rootMargin: '0px' });
    observer.observe(statsSection);
}
function animateValue(el) {
    const text = el.textContent?.trim() ?? '';
    const match = text.match(/^(\d+)(.*)$/);
    if (!match)
        return;
    const suffix = match[2];
    const target = parseInt(match[1], 10);
    const duration = 1200;
    const start = performance.now();
    function step(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 2);
        const current = Math.round(target * eased);
        el.textContent = String(current) + suffix;
        if (progress < 1)
            requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}
/**
 * Scroll suave para âncoras na própria página.
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
        const href = a.getAttribute('href');
        if (!href || href === '#')
            return;
        const id = href.slice(1);
        const target = document.getElementById(id);
        if (!target)
            return;
        a.addEventListener('click', (e) => {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}
/**
 * Reduz movimento para usuários que preferem reduced motion.
 */
function respectReducedMotion() {
    if (!ROOT)
        return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const setPref = () => {
        ROOT.dataset.reducedMotion = mq.matches ? 'true' : 'false';
    };
    setPref();
    mq.addEventListener('change', setPref);
}
function getHomeBasePath() {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 1 &&
        !parts[0].includes('.') &&
        !['admin', 'api', 'portal', 'assets'].includes(parts[0].toLowerCase())) {
        return '/' + parts[0] + '/';
    }
    return '/';
}
function formatPrice(value) {
    return value.toFixed(2).replace('.', ',');
}
/**
 * Carrega planos da API (mesma de /planos.html) e preenche a seção na home.
 */
function initHomePlanos() {
    const grid = document.getElementById('homePlanosGrid');
    if (!grid)
        return;
    const base = getHomeBasePath();
    const baseTrimmed = base !== '/' ? base.replace(/\/$/, '') : '';
    const apiUrl = baseTrimmed + '/api/plans/';
    const assinarBase = baseTrimmed || '';
    fetch(apiUrl)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
        if (!data?.ok || !Array.isArray(data.plans) || data.plans.length === 0) {
            grid.innerHTML =
                '<div class="col-12 text-center py-4 text-muted">Nenhum plano disponível no momento. <a href="' +
                    assinarBase +
                    '/planos.html">Ver planos</a>.</div>';
            return;
        }
        const plans = data.plans;
        updateHeroOffer(plans, assinarBase);
        const html = plans
            .map((p) => {
            const price = p.price != null ? Number(p.price) : 99.9;
            const priceStr = 'R$ ' + formatPrice(price) + ' <span>/mês</span>';
            const isPopular = p.badge === 'popular';
            const cardClass = isPopular ? 'plano-amigo-card plano-amigo-card--popular' : 'plano-amigo-card';
            const badgeHtml = isPopular ? '<span class="plano-amigo-card__badge">Mais escolhido</span>' : '';
            const href = assinarBase + '/assinar.html?plano=' + encodeURIComponent(p.code);
            return ('<div class="col-md-6 col-lg-4 col-xl-3">' +
                '<div class="' +
                cardClass +
                '">' +
                badgeHtml +
                '<span class="plano-amigo-card__speed">' +
                escapeHtml(String(p.speed_display)) +
                '</span>' +
                '<span class="plano-amigo-card__price">' +
                priceStr +
                '</span>' +
                '<a class="plano-amigo-card__cta" href="' +
                escapeHtml(href) +
                '">Eu quero!</a>' +
                '</div></div>');
        })
            .join('');
        grid.innerHTML = html;
    })
        .catch(() => {
        grid.innerHTML =
            '<div class="col-12 text-center py-4 text-muted">Não foi possível carregar os planos. <a href="' +
                assinarBase +
                '/planos.html">Ver planos</a>.</div>';
    });
}
function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}
/**
 * Atualiza o hero (oferta em destaque) com o primeiro plano ou o "Mais escolhido" do banco.
 */
function updateHeroOffer(plans, assinarBase) {
    const featured = plans.find((p) => p.badge === 'popular') ?? plans[0];
    if (!featured)
        return;
    const speedEl = document.getElementById('heroSpeed');
    const unitEl = document.getElementById('heroUnit');
    const priceIntEl = document.getElementById('heroPriceInt');
    const priceDecEl = document.getElementById('heroPriceDec');
    const ctaEl = document.getElementById('heroCtaLink');
    const price = featured.price != null ? Number(featured.price) : 99.9;
    const [intPart, decPart] = formatPrice(price).split(',');
    if (speedEl)
        speedEl.textContent = String(featured.speed_display);
    if (unitEl)
        unitEl.textContent = featured.unit.toLowerCase();
    if (priceIntEl)
        priceIntEl.textContent = intPart;
    if (priceDecEl)
        priceDecEl.textContent = decPart || '00';
    if (ctaEl && 'href' in ctaEl)
        ctaEl.href = assinarBase + '/assinar.html?plano=' + encodeURIComponent(featured.code);
}
function init() {
    if (!isHomePage())
        return;
    respectReducedMotion();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        initStatsAnimation();
    }
    initSmoothScroll();
    initHomePlanos();
}
document.addEventListener('DOMContentLoaded', init);
