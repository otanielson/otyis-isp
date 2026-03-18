"use strict";
/**
 * Personalização do site com dados do provedor (nome, etc.)
 * Busca /api/site/config e aplica em elementos .provider-name, .provider-fantasy-name, etc.
 */
const DEFAULT_NAME = 'Multi Telecom';
function getApiBase() {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 1 &&
        !parts[0].includes('.') &&
        !['admin', 'api', 'portal', 'assets'].includes(parts[0].toLowerCase())) {
        return '/' + parts[0];
    }
    return '';
}
function applyConfig(config) {
    const displayName = config.fantasyName || config.name || DEFAULT_NAME;
    const shortName = config.shortName || displayName;
    document.querySelectorAll('.provider-name').forEach((el) => {
        el.textContent = displayName;
    });
    document.querySelectorAll('.provider-fantasy-name').forEach((el) => {
        el.textContent = displayName;
    });
    document.querySelectorAll('.provider-short-name').forEach((el) => {
        el.textContent = shortName;
    });
    if (document.title && (config.fantasyName || config.name)) {
        document.title = document.title.replace(new RegExp(DEFAULT_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), displayName);
    }
}
function run() {
    const base = getApiBase();
    fetch(`${base}/api/site/config`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
        if (data && data.ok) {
            window.__PROVIDER_CONFIG__ = data;
            applyConfig(data);
        }
    })
        .catch(() => { });
}
function observeAndApply() {
    run();
    const observer = new MutationObserver(() => {
        const config = window.__PROVIDER_CONFIG__;
        if (config)
            applyConfig(config);
        else
            run();
    });
    const header = document.getElementById('inc-header');
    const footer = document.getElementById('inc-footer');
    if (header)
        observer.observe(header, { childList: true, subtree: true });
    if (footer)
        observer.observe(footer, { childList: true, subtree: true });
}
document.addEventListener('DOMContentLoaded', observeAndApply);
