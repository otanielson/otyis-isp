/**
 * Inclui partials HTML nos placeholders (header/footer).
 * @param {string} id - ID do elemento que receberá o conteúdo
 * @param {string} url - URL do partial (ex: /partials/header.html)
 * @returns {Promise<void>}
 */
async function include(id, url) {
  const el = document.getElementById(id);
  if (!el) return;
  const res = await fetch(url);
  if (!res.ok) return;
  el.innerHTML = await res.text();
}

document.addEventListener('DOMContentLoaded', () => {
  include('inc-header', '/partials/header.html');
  include('inc-footer', '/partials/footer.html');
});
