/**
 * Painéis SPA do portal: show/hide de modais e delegação de cliques.
 * Usado por dashboard.html (portal do provedor).
 */
(function (): void {
  'use strict';

  function showPanel(panelId: string): HTMLElement | null {
    const el = document.getElementById(panelId);
    if (!el) return null;
    document.querySelectorAll('.modal.fade.show').forEach(function (m) {
      m.classList.remove('show');
      (m as HTMLElement).style.display = 'none';
      m.setAttribute('aria-hidden', 'true');
    });
    el.classList.add('show');
    (el as HTMLElement).style.display = 'flex';
    (el as HTMLElement).style.visibility = 'visible';
    (el as HTMLElement).style.zIndex = '1040';
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('spa-panel-open');
    return el as HTMLElement;
  }

  function hidePanel(panelId: string): void {
    const el = document.getElementById(panelId);
    if (!el) return;
    const active = document.activeElement as HTMLElement | null;
    if (el.contains(active) && active && active.blur) active.blur();
    el.classList.remove('show');
    (el as HTMLElement).style.display = 'none';
    (el as HTMLElement).style.visibility = 'hidden';
    el.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal.fade.show')) document.body.classList.remove('spa-panel-open');
  }

  (window as unknown as { safeShowModal: typeof showPanel }).safeShowModal = showPanel;
  (window as unknown as { safeHideModal: typeof hidePanel }).safeHideModal = hidePanel;

  function onDocClick(e: Event): void {
    const t = (e as MouseEvent).target as Element | null;
    if (!t || !t.closest) return;
    const dismiss = t.closest('[data-bs-dismiss="modal"]');
    if (dismiss) {
      const modal = dismiss.closest('.modal');
      if (modal && modal.id) hidePanel(modal.id);
      return;
    }
    if (t.classList && t.classList.contains('modal') && t.id) {
      hidePanel(t.id);
      return;
    }
    const openBtn = t.closest('[data-bs-toggle="modal"]');
    if (!openBtn) return;
    const target = openBtn.getAttribute('data-bs-target');
    if (!target || target.charAt(0) !== '#') return;
    const id = target.slice(1);
    if (!document.getElementById(id)) return;
    e.preventDefault();
    e.stopPropagation();
    showPanel(id);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      document.body.addEventListener('click', onDocClick, true);
    });
  } else {
    document.body.addEventListener('click', onDocClick, true);
  }
})();
