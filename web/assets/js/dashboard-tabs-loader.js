"use strict";
/**
 * Carrega fragmentos de abas do dashboard a partir de arquivos em /portal/dashboard/tabs/.
 * Expõe loadTabFragment(tabId) e dispara 'dashboard-tabs-ready' quando a aba inicial está pronta.
 */
(function () {
  "use strict";
  const CONTAINER_ID = "dashboard-tab-content";
  const TABS_BASE = "dashboard/tabs";

  // Usa sempre o base do portal (prefixo /portal), sem depender do pathname atual,
  // para evitar caminhos como /portal/dashboard/dashboard/tabs.
  function getTabsBase() {
    let base = window.__PORTAL_BASE__ || "/portal";
    if (typeof base === "string" && base.endsWith("/")) base = base.slice(0, -1);
    return base + "/" + TABS_BASE;
  }

  function loadTabFragment(tabId) {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return Promise.reject(new Error("Container #" + CONTAINER_ID + " não encontrado"));
    const existing = document.getElementById("tab-" + tabId);
    if (existing) return Promise.resolve();
    const url = getTabsBase() + "/" + tabId + ".html";
    return fetch(url, { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("Tab não encontrada: " + tabId);
        return r.text();
      })
      .then(function (html) {
        if (document.getElementById("tab-" + tabId)) return;
        container.insertAdjacentHTML("beforeend", html.trim());
      });
  }

  window.loadTabFragment = loadTabFragment;

  function onReady() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    // 1) Tenta decidir a aba pela rota "limpa": /portal/clientes, /portal/financeiro, etc.
    const path = (location.pathname || "").toLowerCase();
    const segment = path.split("/").filter(Boolean).pop() || "";
    const routeMap = {
      // Comercial
      dashboard: "overview",
      planos: "plans",
      pedidos: "leads",
      clientes: "customers",
      propostas: "proposals",
      contratos: "contracts",
      // Atendimento & Clube
      suporte: "tickets",
      clube: "clube",
      // Financeiro
      financeiro: "finance",
      fiscal: "fiscal",
      // Operação & Cadastro
      estoque: "estoque",
      sistema: "system",
      administracao: "provider",
      administração: "provider",
      grupos: "grupos",
      usuarios: "usuarios",
      usuários: "usuarios",
    };
    let tab = routeMap[segment] || "";

    // 2) Se não bater por rota, usa o hash (#customers etc.)
    if (!tab) {
      const hash = (location.hash || "").replace(/^#/, "");
      const parts = hash.split("/");
      tab = parts[0] || "";
    }

    // 3) Fallback final: overview
    if (!tab) tab = "overview";

    const valid = [
      "overview",
      "plans",
      "leads",
      "customers",
      "proposals",
      "contracts",
      "tickets",
      "campaigns",
      "stand",
      "winners",
      "draw",
      "finance",
      "fiscal",
      "estoque",
      "system",
      "provider",
      "clube",
      "grupos",
      "usuarios",
    ];
    const initialTab = valid.indexOf(tab) >= 0 ? tab : "overview";

    loadTabFragment(initialTab)
      .then(function () {
        const el = document.getElementById("tab-" + initialTab);
        if (el) el.classList.add("active");
        document.dispatchEvent(new CustomEvent("dashboard-tabs-ready"));
      })
      .catch(function () {
        loadTabFragment("overview")
          .then(function () {
            const el = document.getElementById("tab-overview");
            if (el) el.classList.add("active");
          })
          .catch(function () {});
        document.dispatchEvent(new CustomEvent("dashboard-tabs-ready"));
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();


