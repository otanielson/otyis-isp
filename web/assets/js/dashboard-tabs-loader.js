"use strict";
/* eslint-disable */
// @ts-nocheck
/**
 * Carrega fragmentos de abas do dashboard a partir de arquivos em /portal/dashboard/tabs/.
 * Exponibiliza loadTabFragment(tabId) e resolve a aba inicial a partir da rota atual.
 */
(function () {
    "use strict";
    var CONTAINER_ID = "dashboard-tab-content";
    var TABS_BASE = "dashboard/tabs";
    function getTabsBase() {
        var base = window.__PORTAL_BASE__ || "/portal";
        if (typeof base === "string" && base.endsWith("/")) {
            base = base.slice(0, -1);
        }
        return base + "/" + TABS_BASE;
    }
    function routeSegmentToTab(segment) {
        var routeMap = {
            dashboard: "overview",
            planos: "plans",
            pedidos: "leads",
            clientes: "customers",
            propostas: "proposals",
            contratos: "contracts",
            suporte: "tickets",
            clube: "clube",
            financeiro: "finance",
            fiscal: "fiscal",
            estoque: "estoque",
            sistema: "system",
            administracao: "provider",
            "administração": "provider",
            grupos: "grupos",
            usuarios: "usuarios",
            "usuários": "usuarios"
        };
        return routeMap[(segment || "").toLowerCase()] || "overview";
    }
    function loadTabFragment(tabId) {
        var container = document.getElementById(CONTAINER_ID);
        if (!container) {
            return Promise.reject(new Error("Container #" + CONTAINER_ID + " não encontrado"));
        }
        if (document.getElementById("tab-" + tabId)) {
            return Promise.resolve();
        }
        var url = getTabsBase() + "/" + tabId + ".html";
        return fetch(url, { credentials: "same-origin" })
            .then(function (response) {
            if (!response.ok) {
                throw new Error("Tab não encontrada: " + tabId);
            }
            return response.text();
        })
            .then(function (html) {
            if (document.getElementById("tab-" + tabId)) {
                return;
            }
            container.insertAdjacentHTML("beforeend", html.trim());
        });
    }
    window.loadTabFragment = loadTabFragment;
    function resolveInitialTab() {
        var parts = (location.pathname || "").toLowerCase().split("/").filter(Boolean);
        var segment = parts[1] || "dashboard";
        return routeSegmentToTab(segment);
    }
    function onReady() {
        var container = document.getElementById(CONTAINER_ID);
        if (!container) {
            return;
        }
        var initialTab = resolveInitialTab();
        loadTabFragment(initialTab)
            .then(function () {
            var el = document.getElementById("tab-" + initialTab);
            if (el) {
                el.classList.add("active");
            }
            document.dispatchEvent(new CustomEvent("dashboard-tabs-ready"));
        })
            .catch(function () {
            loadTabFragment("overview")
                .then(function () {
                var el = document.getElementById("tab-overview");
                if (el) {
                    el.classList.add("active");
                }
            })
                .catch(function () { });
            document.dispatchEvent(new CustomEvent("dashboard-tabs-ready"));
        });
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", onReady);
    }
    else {
        onReady();
    }
})();
