/**
 * Multi Portal — scripts do site (tipado via JSDoc para melhor DX)
 * @typedef {HTMLElement} NavAnchor
 */

/**
 * @param {string} id
 * @returns {HTMLElement | null}
 */
function qs(id) {
  return document.getElementById(id);
}

/**
 * Marca o item ativo no menu conforme o pathname atual.
 * @returns {void}
 */
function setActiveNav() {
  const path = location.pathname.replace(/\/$/, '') || '/';
  /** @type {NodeListOf<HTMLAnchorElement>} */
  const links = document.querySelectorAll('[data-nav]');
  links.forEach((a) => {
    const href = a.getAttribute('href')?.replace(/\/$/, '') || '/';
    const isActive =
      href === path || (path !== '/' && href !== '/' && path.startsWith(href));
    a.classList.toggle('active', !!isActive);
  });
}

document.addEventListener('DOMContentLoaded', setActiveNav);
