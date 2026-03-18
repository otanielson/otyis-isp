"use strict";
/**
 * Multi Telecom — Scripts globais do site (TypeScript)
 * Navegação ativa e utilitários.
 */
function qs(id) {
    return document.getElementById(id);
}
/**
 * Marca o item ativo no menu conforme o pathname atual.
 */
function setActiveNav() {
    const path = location.pathname.replace(/\/$/, '') || '/';
    const links = document.querySelectorAll('[data-nav]');
    links.forEach((a) => {
        const href = a.getAttribute('href')?.replace(/\/$/, '') || '/';
        const isActive = href === path ||
            (path !== '/' && href !== '/' && path.startsWith(href));
        a.classList.toggle('active', !!isActive);
    });
}
document.addEventListener('DOMContentLoaded', setActiveNav);
