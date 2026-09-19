import { getCleanBase } from "@lib/baseUrl";
import { escapeHtml } from "@lib/sanitize";
import type { BuscadorUser } from "./types";
import { openEditModal } from "./editUserModal";
import { openTerminalModal, netUserCache, pendingLegajoFetches } from "./terminalModal";
import { openTicketModal } from "./ticketModal";
import {
  resolveUserLicense,
  formatLicenseTooltipHtml,
  type ResolvedUserLicense,
} from "@lib/groupDescriptions";

const cleanBase = getCleanBase();
export const userLicenseCache = new Map<string, ResolvedUserLicense>();

export function updateCardLicenseElement(
  cardOrFragment: Element | DocumentFragment,
  licenseInfo: ResolvedUserLicense,
): void {
  const licBtn = cardOrFragment.querySelector(
    ".user-card-licencia-btn",
  ) as HTMLElement | null;
  const licTooltipContent = cardOrFragment.querySelector(
    ".user-card-licencia-tooltip-content",
  ) as HTMLElement | null;

  const copyVal = licenseInfo.sigla !== "-" ? licenseInfo.sigla : "";

  if (licBtn) {
    licBtn.setAttribute("data-copy-value", copyVal);
    licBtn.setAttribute("data-copy-label-default", licenseInfo.sigla);
    licBtn.setAttribute("aria-label", `Copiar licencia: ${licenseInfo.sigla}`);
    const labelSpan = licBtn.querySelector("[data-copy-label]");
    if (labelSpan) labelSpan.textContent = licenseInfo.sigla;
  }

  if (licTooltipContent) {
    licTooltipContent.innerHTML = formatLicenseTooltipHtml(licenseInfo);
  }
}

const avatarColors = [
  "bg-blue-500 text-white",
  "bg-purple-500 text-white",
  "bg-emerald-500 text-white",
  "bg-amber-500 text-white",
  "bg-rose-500 text-white",
  "bg-indigo-500 text-white",
];

export function highlightText(text: string, query: string): string {
  const safeText = escapeHtml(text || "");
  if (!query || !query.trim()) return safeText;

  const queriesToTry = [query.trim()];

  if (query.includes("@")) {
    const parts = query.split("@");
    if (parts[0].trim()) {
      queriesToTry.push(parts[0].trim());
    }
  }

  const cleanDni = query.replace(/[.\-\s]/g, "");
  if (/^\d+$/.test(cleanDni) && cleanDni.length > 0) {
    queriesToTry.push(cleanDni);
  }

  queriesToTry.sort((a, b) => b.length - a.length);
  const uniqueQueries = [...new Set(queriesToTry)];

  let highlighted = safeText;
  for (const q of uniqueQueries) {
    if (!q) continue;
    const escaped = q.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regexNoHtml = new RegExp(`(${escaped})(?![^<>]*>)`, "gi");
    highlighted = highlighted.replace(
      regexNoHtml,
      '<mark class="bg-amber-200/70 dark:bg-amber-500/30 text-amber-950 dark:text-amber-100 px-0.5 rounded-xs font-semibold">$1</mark>',
    );
  }

  return highlighted;
}

export function getAvatarColor(name: string): string {
  let hash = 0;
  const safeName = name || "Usuario";
  for (let i = 0; i < safeName.length; i++) {
    hash = safeName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export function fetchLegajoForUser(username: string): void {
  const key = (username || "").toLowerCase();
  if (!key || netUserCache.has(key) || pendingLegajoFetches.has(key)) return;
  pendingLegajoFetches.add(key);

  const resultsGrid = document.getElementById("results-grid");

  fetch(`${cleanBase}api/usuarios/net-user?username=${encodeURIComponent(key)}`)
    .then((res) => res.json())
    .then((data) => {
      pendingLegajoFetches.delete(key);
      const legajoVal =
        data.status === "success" && data.employee_number
          ? data.employee_number
          : "-";
      netUserCache.set(key, legajoVal);

      const licenseInfo =
        data.status === "success"
          ? resolveUserLicense(data.groups || [])
          : resolveUserLicense([]);
      userLicenseCache.set(key, licenseInfo);

      const card = resultsGrid?.querySelector(
        `[data-user-card-username="${CSS.escape(key)}"]`,
      );
      if (card) {
        const btn = card.querySelector(
          ".user-card-legajo-btn",
        ) as HTMLElement | null;
        if (btn) {
          btn.setAttribute("data-copy-value", legajoVal);
          btn.setAttribute("data-copy-label-default", legajoVal);
          btn.setAttribute("aria-label", `Copiar: ${legajoVal}`);
          const labelSpan = btn.querySelector("[data-copy-label]");
          if (labelSpan) labelSpan.textContent = legajoVal;
        }

        updateCardLicenseElement(card, licenseInfo);
      }
    })
    .catch(() => {
      pendingLegajoFetches.delete(key);
      netUserCache.set(key, "-");
      const emptyLicense = resolveUserLicense([]);
      userLicenseCache.set(key, emptyLicense);

      const card = resultsGrid?.querySelector(
        `[data-user-card-username="${CSS.escape(key)}"]`,
      );
      if (card) {
        updateCardLicenseElement(card, emptyLicense);
      }
    });
}

export function displayResults(users: BuscadorUser[], query: string = ""): void {
  const resultsGrid = document.getElementById("results-grid");
  const cardTemplate = document.getElementById(
    "user-card-template",
  ) as HTMLTemplateElement | null;
  const resultsCount = document.getElementById("results-count");
  const emptyState = document.getElementById("empty-state");
  const clearSearchBtn = document.getElementById("clear-search");

  if (!resultsGrid || !cardTemplate) return;

  resultsGrid.innerHTML = "";
  if (resultsCount) resultsCount.textContent = String(users.length);

  if (users.length === 0) {
    resultsGrid.classList.add("hidden");
    resultsGrid.classList.remove("grid");
    emptyState?.classList.remove("hidden");
    emptyState?.classList.add("flex");

    const emptyIconSearch = document.getElementById("empty-state-icon-search");
    const emptyIconNotfound = document.getElementById("empty-state-icon-notfound");
    const emptyTitle = document.getElementById("empty-state-title");
    const emptyDesc = document.getElementById("empty-state-desc");
    const glow1 = document.getElementById("empty-state-icon-glow-1");
    const glow2 = document.getElementById("empty-state-icon-glow-2");

    if (!query.trim()) {
      emptyIconSearch?.classList.remove("hidden");
      emptyIconNotfound?.classList.add("hidden");

      glow1?.classList.replace("bg-error/10", "bg-primary/10");
      glow1?.classList.replace(
        "group-hover:bg-error/20",
        "group-hover:bg-primary/20",
      );
      glow2?.classList.replace("bg-error/10", "bg-secondary/15");

      if (emptyTitle) emptyTitle.textContent = "Comienza tu búsqueda";
      if (emptyDesc) {
        emptyDesc.textContent =
          "Encuentra usuarios rápidamente ingresando su nombre, apellido o DNI.";
      }
      clearSearchBtn?.classList.add("hidden");
      clearSearchBtn?.classList.remove("flex");
    } else {
      emptyIconSearch?.classList.add("hidden");
      emptyIconNotfound?.classList.remove("hidden");

      glow1?.classList.replace("bg-primary/10", "bg-error/10");
      glow1?.classList.replace(
        "group-hover:bg-primary/20",
        "group-hover:bg-error/20",
      );
      glow2?.classList.replace("bg-secondary/15", "bg-error/10");

      if (emptyTitle) emptyTitle.textContent = "No se encontraron usuarios";
      if (emptyDesc) {
        emptyDesc.textContent = `No hay coincidencias para "${query.trim()}". Intenta con otros términos.`;
      }
      clearSearchBtn?.classList.remove("hidden");
      clearSearchBtn?.classList.add("flex");
    }
    return;
  }

  resultsGrid.classList.remove("hidden");
  resultsGrid.classList.add("grid");
  emptyState?.classList.add("hidden");
  emptyState?.classList.remove("flex");

  const fragment = document.createDocumentFragment();

  users.forEach((user) => {
    const clone = cardTemplate.content.cloneNode(true) as DocumentFragment;
    const nombreEl = clone.querySelector("[data-user-nombre]");

    if (nombreEl) {
      nombreEl.innerHTML = user.nombre
        ? highlightText(user.nombre, query)
        : "Sin Nombre";
    }

    const updateCardCopyButton = (
      btnSelector: string,
      value: string | null | undefined,
      highlightQuery: string = "",
    ) => {
      const btn = clone.querySelector(btnSelector) as HTMLElement | null;
      if (btn) {
        const val = value || "";
        btn.setAttribute("data-copy-value", val);
        btn.setAttribute("data-copy-label-default", val || "-");
        btn.setAttribute("aria-label", `Copiar: ${val || "-"}`);

        const labelSpan = btn.querySelector(
          "[data-copy-label]",
        ) as HTMLElement | null;
        if (labelSpan) {
          if (highlightQuery && val) {
            labelSpan.innerHTML = highlightText(val, highlightQuery);
          } else {
            labelSpan.textContent = val || "-";
          }
        }
      }
    };

    const cardEl = clone.querySelector(".card") as HTMLElement | null;
    const usernameKey = (user.usuario || "").toLowerCase();
    if (cardEl && usernameKey) {
      cardEl.setAttribute("data-user-card-username", usernameKey);
    }

    updateCardCopyButton(".user-card-username-btn", user.usuario, query);
    updateCardCopyButton(".user-card-dni-btn", user.dni, query);
    updateCardCopyButton(".user-card-interno-btn", user.interno);
    updateCardCopyButton(".user-card-telefono-btn", user.telefono);
    updateCardCopyButton(".user-card-email-btn", user.email, query);

    if (usernameKey) {
      if (netUserCache.has(usernameKey)) {
        updateCardCopyButton(
          ".user-card-legajo-btn",
          netUserCache.get(usernameKey) || "-",
        );
        const lic =
          userLicenseCache.get(usernameKey) || resolveUserLicense([]);
        updateCardLicenseElement(clone, lic);
      } else {
        updateCardCopyButton(".user-card-legajo-btn", "...");
        updateCardCopyButton(".user-card-licencia-btn", "...");
        const tooltipContent = clone.querySelector(".user-card-licencia-tooltip-content");
        if (tooltipContent) {
          tooltipContent.innerHTML = `
            <div class="flex items-center gap-2">
              <span class="loading loading-spinner loading-xs text-primary"></span>
              <span class="text-xs font-medium">Consultando Active Directory...</span>
            </div>
          `.trim();
        }
        fetchLegajoForUser(usernameKey);
      }
    } else {
      updateCardCopyButton(".user-card-legajo-btn", "-");
      updateCardLicenseElement(clone, resolveUserLicense([]));
    }

    const sucursales = user.sucursales || [];
    const sucursal = user.sucursal;
    const sucursalNombre = user.sucursalNombre;

    const sucursalBtn = clone.querySelector(".user-card-sucursal-btn");
    const wrap = clone.querySelector(".user-card-sucursal-wrap");
    if (sucursalBtn && wrap) {
      if (sucursales.length > 1) {
        for (const s of sucursales) {
          const text = s.name ? `${s.code} — ${s.name}` : s.code;
          const btn = sucursalBtn.cloneNode(true) as HTMLElement;
          btn.setAttribute("data-copy-value", s.code);
          btn.setAttribute("data-copy-label-default", text);
          btn.setAttribute("aria-label", `Copiar NIS ${s.code}`);
          const label = btn.querySelector("[data-copy-label]");
          if (label) label.textContent = text;
          wrap.appendChild(btn);
        }
        sucursalBtn.remove();
      } else if (sucursales.length === 1) {
        const s = sucursales[0];
        const text = s.name ? `${s.code} — ${s.name}` : s.code;
        sucursalBtn.setAttribute("data-copy-value", s.code);
        sucursalBtn.setAttribute("data-copy-label-default", text);
        sucursalBtn.setAttribute("aria-label", `Copiar NIS ${s.code}`);
        sucursalBtn.classList.add("w-full", "max-w-full", "justify-between");
        const label = sucursalBtn.querySelector("[data-copy-label]");
        if (label) label.textContent = text;
      } else if (sucursal) {
        const valorCompleto = sucursalNombre
          ? `${sucursal} — ${sucursalNombre}`
          : sucursal;
        sucursalBtn.setAttribute("data-copy-value", valorCompleto);
        sucursalBtn.setAttribute("data-copy-label-default", valorCompleto);
        sucursalBtn.setAttribute("aria-label", `Copiar: ${valorCompleto}`);
        sucursalBtn.classList.add("w-full", "max-w-full", "justify-between");
        const label = sucursalBtn.querySelector("[data-copy-label]");
        if (label) label.textContent = valorCompleto;
      } else {
        const parentRow = sucursalBtn.closest(".flex.flex-col");
        if (parentRow) parentRow.classList.add("hidden");
      }
    }

    const safeNombre = user.nombre || "U";
    const initials = safeNombre
      .split(" ")
      .filter((n: string) => n)
      .map((n: string) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
    const initialsEl = clone.querySelector("[data-user-initials]");
    if (initialsEl) initialsEl.textContent = initials || "??";
    const avatarBg = clone.querySelector(
      "[data-user-avatar-bg]",
    ) as HTMLElement | null;
    if (avatarBg) {
      const colorClass = getAvatarColor(safeNombre);
      colorClass.split(" ").forEach((cls) => avatarBg.classList.add(cls));
    }

    const invgateBadge = clone.querySelector(
      "[data-invgate-badge]",
    ) as HTMLElement | null;
    if (invgateBadge) {
      if (user.invgateExists) {
        invgateBadge.textContent = "En InvGate";
        invgateBadge.className =
          "badge badge-sm badge-soft bg-success/10 text-success font-semibold";
      } else {
        invgateBadge.textContent = "No en InvGate";
        invgateBadge.className =
          "badge badge-sm badge-soft bg-base-300/50 text-base-content/50 font-semibold";
      }
    }

    const editBtn = clone.querySelector(
      "[data-edit-user-btn]",
    ) as HTMLElement | null;
    if (editBtn) {
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditModal(user);
      });
    }

    const netUserBtn = clone.querySelector(
      "[data-net-user-btn]",
    ) as HTMLElement | null;
    if (netUserBtn && user.usuario) {
      netUserBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openTerminalModal(user.usuario, !!user.invgateExists);
      });
    } else if (netUserBtn) {
      netUserBtn.classList.add("hidden");
    }

    const createTicketBtn = clone.querySelector(
      "[data-invgate-create-ticket-btn]",
    ) as HTMLElement | null;
    if (createTicketBtn) {
      if (user.invgateExists) {
        createTicketBtn.classList.add("hidden");
      } else {
        createTicketBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openTicketModal(user);
        });
      }
    }

    fragment.appendChild(clone);
  });

  resultsGrid.appendChild(fragment);
}
