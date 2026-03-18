/**
 * Inclui partials HTML nos placeholders (header/footer).
 * Usa BASE_PATH do data attribute ou window.__BASE_PATH__ para path-based routing.
 */
(function() {
  var BASE = (typeof window.__BASE_PATH__ !== 'undefined' ? window.__BASE_PATH__ : '') || '';

  async function include(id, url) {
    var el = document.getElementById(id);
    if (!el) return;
    var fullUrl = BASE + (url.startsWith('/') ? url.slice(1) : url);
    var res = await fetch(fullUrl);
    if (!res.ok) return;
    el.innerHTML = await res.text();
  }

  document.addEventListener('DOMContentLoaded', function() {
    include('inc-header', '/partials/header.html');
    include('inc-footer', '/partials/footer.html');
  });
})();
