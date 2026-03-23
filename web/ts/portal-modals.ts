/**
 * Portal do Provedor — Modais (TypeScript)
 * Bootstrap via CDN (window.bootstrap). Fallback manual se não houver Bootstrap.
 * Abre ao clicar em [data-bs-toggle="modal"]; expõe safeShowModal/safeHideModal em window.
 * Sem import/export para compilar como script clássico (sem type="module").
 */

// Modais em modo SPA: sem Bootstrap JS, sem travar o body e sem backdrops separados.
type PortalWindowWithSections = Window & { __portalPageSectionStack?: string[] };

function getPageSectionStack(): string[] {
  const sharedWindow = window as PortalWindowWithSections;
  return sharedWindow.__portalPageSectionStack || (sharedWindow.__portalPageSectionStack = []);
}

function getActivePageSectionId(): string | null {
  const active = document.querySelector('[data-page-section="true"].show') as HTMLElement | null;
  return active ? active.id : null;
}

function safeShowModal(modalId: string): HTMLElement | null {
  const el = document.getElementById(modalId) as HTMLElement | null;
  if (!el) return null;
  try {
    const isPageSection = el.getAttribute("data-page-section") === "true";
    if (isPageSection) {
      const activeId = getActivePageSectionId();
      if (activeId && activeId !== modalId) {
        getPageSectionStack().push(activeId);
      }
      document.querySelectorAll('[data-page-section="true"]').forEach((section) => {
        if (section === el) return;
        const sectionEl = section as HTMLElement;
        sectionEl.classList.remove("show");
        sectionEl.style.display = "none";
        sectionEl.style.visibility = "hidden";
        sectionEl.classList.add("d-none");
        sectionEl.setAttribute("aria-hidden", "true");
      });
    }
    el.classList.add("show");
    el.style.display = isPageSection ? "block" : "flex";
    el.style.visibility = "visible";
    el.style.zIndex = isPageSection ? "1" : "1055";
    el.classList.remove("d-none");
    if (!isPageSection) {
      el.setAttribute("aria-modal", "true");
    }
    el.setAttribute("aria-hidden", "false");
    return el;
  } catch {
    return null;
  }
}

function safeHideModal(modalId: string): void {
  const el = document.getElementById(modalId) as HTMLElement | null;
  if (!el) return;
  if (el.contains(document.activeElement) && document.activeElement && typeof (document.activeElement as HTMLElement).blur === "function") {
    (document.activeElement as HTMLElement).blur();
  }
  const isPageSection = el.getAttribute("data-page-section") === "true";
  el.classList.remove("show");
  el.style.display = "none";
  el.style.visibility = "hidden";
  if (isPageSection) {
    el.classList.add("d-none");
    const previousId = getPageSectionStack().pop();
    if (previousId) {
      const previous = document.getElementById(previousId) as HTMLElement | null;
      if (previous) {
        safeShowModal(previousId);
        return;
      }
    }
  }
  el.setAttribute("aria-hidden", "true");
}

// Expor na hora do load para portal-dashboard e outros scripts já usarem
(window as unknown as Record<string, unknown>).safeShowModal = safeShowModal;
(window as unknown as Record<string, unknown>).safeHideModal = safeHideModal;

function initPortalModals(): void {
  document.addEventListener(
    "click",
    (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const dismissBtn = t && t.closest && t.closest('[data-bs-dismiss="modal"]');
      if (dismissBtn) {
        const modal = (dismissBtn as HTMLElement).closest && (dismissBtn as HTMLElement).closest(".modal");
        if (modal && modal.id) safeHideModal(modal.id);
        return;
      }
      if (t && t.classList && t.classList.contains("modal") && t.id) safeHideModal(t.id);
    },
    false
  );

  document.addEventListener(
    "click",
    (e: MouseEvent) => {
      const btn = (e.target as HTMLElement)?.closest?.('[data-bs-toggle="modal"]') ?? null;
      if (!btn) return;
      const target = btn.getAttribute?.("data-bs-target") ?? null;
      if (!target || target.charAt(0) !== "#") return;
      const modalId = target.slice(1);
      const modalEl = document.getElementById(modalId);
      if (!modalEl) return;
      if ((e.target as HTMLElement)?.tagName === "A" && ((e.target as HTMLElement)?.getAttribute("href") ?? "").trim() === "#") e.preventDefault();
      e.stopPropagation();
      e.preventDefault();
      safeShowModal(modalId);
    },
    true
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPortalModals);
} else {
  initPortalModals();
}
