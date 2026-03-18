"use strict";
/**
 * Portal do Provedor — Modais (TypeScript)
 * Bootstrap via CDN (window.bootstrap). Fallback manual se não houver Bootstrap.
 * Abre ao clicar em [data-bs-toggle="modal"]; expõe safeShowModal/safeHideModal em window.
 * Sem import/export para compilar como script clássico (sem type="module").
 */
// Modais em modo SPA: sem Bootstrap JS, sem travar o body e sem backdrops separados.
function safeShowModal(modalId) {
    const el = document.getElementById(modalId);
    if (!el)
        return null;
    try {
        el.classList.add("show");
        // CSS em dashboard.html trata `.modal.fade.show` como overlay flex full-screen
        el.style.display = "flex";
        el.style.visibility = "visible";
        el.style.zIndex = "1055";
        el.setAttribute("aria-modal", "true");
        el.setAttribute("aria-hidden", "false");
        return el;
    }
    catch {
        return null;
    }
}
function safeHideModal(modalId) {
    const el = document.getElementById(modalId);
    if (!el)
        return;
    if (el.contains(document.activeElement) && document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
    }
    el.classList.remove("show");
    el.style.display = "none";
    el.style.visibility = "hidden";
    el.setAttribute("aria-hidden", "true");
}
// Expor na hora do load para portal-dashboard e outros scripts já usarem
window.safeShowModal = safeShowModal;
window.safeHideModal = safeHideModal;
function initPortalModals() {
    document.addEventListener("click", (e) => {
        const t = e.target;
        const dismissBtn = t && t.closest && t.closest('[data-bs-dismiss="modal"]');
        if (dismissBtn) {
            const modal = dismissBtn.closest && dismissBtn.closest(".modal");
            if (modal && modal.id)
                safeHideModal(modal.id);
            return;
        }
        if (t && t.classList && t.classList.contains("modal") && t.id)
            safeHideModal(t.id);
    }, false);
    document.addEventListener("click", (e) => {
        const btn = e.target?.closest?.('[data-bs-toggle="modal"]') ?? null;
        if (!btn)
            return;
        const target = btn.getAttribute?.("data-bs-target") ?? null;
        if (!target || target.charAt(0) !== "#")
            return;
        const modalId = target.slice(1);
        const modalEl = document.getElementById(modalId);
        if (!modalEl)
            return;
        if (e.target?.tagName === "A" && (e.target?.getAttribute("href") ?? "").trim() === "#")
            e.preventDefault();
        e.stopPropagation();
        e.preventDefault();
        safeShowModal(modalId);
    }, true);
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPortalModals);
}
else {
    initPortalModals();
}
