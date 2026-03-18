"use strict";
/**
 * Painéis SPA do portal: show/hide de modais e delegação de cliques.
 * Usado por dashboard.html (portal do provedor).
 */
(function () {
    'use strict';
    function showPanel(panelId) {
        const el = document.getElementById(panelId);
        if (!el)
            return null;
        document.querySelectorAll('.modal.fade.show').forEach(function (m) {
            m.classList.remove('show');
            m.style.display = 'none';
            m.setAttribute('aria-hidden', 'true');
        });
        el.classList.add('show');
        el.style.display = 'flex';
        el.style.visibility = 'visible';
        el.style.zIndex = '1040';
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-hidden', 'false');
        document.body.classList.add('spa-panel-open');
        return el;
    }
    function hidePanel(panelId) {
        const el = document.getElementById(panelId);
        if (!el)
            return;
        const active = document.activeElement;
        if (el.contains(active) && active && active.blur)
            active.blur();
        el.classList.remove('show');
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.modal.fade.show'))
            document.body.classList.remove('spa-panel-open');
    }
    window.safeShowModal = showPanel;
    window.safeHideModal = hidePanel;
    function onDocClick(e) {
        const t = e.target;
        if (!t || !t.closest)
            return;
        const dismiss = t.closest('[data-bs-dismiss="modal"]');
        if (dismiss) {
            const modal = dismiss.closest('.modal');
            if (modal && modal.id)
                hidePanel(modal.id);
            return;
        }
        if (t.classList && t.classList.contains('modal') && t.id) {
            hidePanel(t.id);
            return;
        }
        const openBtn = t.closest('[data-bs-toggle="modal"]');
        if (!openBtn)
            return;
        const target = openBtn.getAttribute('data-bs-target');
        if (!target || target.charAt(0) !== '#')
            return;
        const id = target.slice(1);
        if (!document.getElementById(id))
            return;
        e.preventDefault();
        e.stopPropagation();
        showPanel(id);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            document.body.addEventListener('click', onDocClick, true);
        });
    }
    else {
        document.body.addEventListener('click', onDocClick, true);
    }
})();
