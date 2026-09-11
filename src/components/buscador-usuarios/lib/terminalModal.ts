import { showToast } from "@lib/toastClient";
import { getLicensesForGroup, formatSingleLicenseTooltipHtml } from "@lib/groupDescriptions";
import { getCleanBase } from "@lib/baseUrl";
import { escapeHtml } from "@lib/sanitize";

const cleanBase = getCleanBase();

export const netUserCache = new Map<string, string>();
export const pendingLegajoFetches = new Set<string>();

let currentLdapGroups: string[] = [];
let currentSelectedCategory = "all";
let currentViewMode = "grid";
let currentUsername = "";
let invgateLoaded = false;
let currentInvgateUsername = "";
let onSearchUserCallback: ((query: string) => void) | null = null;

export function cloneCopyIcon(value: string, label: string): HTMLElement | null {
  const copyIconTemplate = document.getElementById(
    "copy-icon-template",
  ) as HTMLTemplateElement | null;
  const btn = copyIconTemplate?.content.firstElementChild?.cloneNode(
    true,
  ) as HTMLElement | null;
  if (!btn) return null;
  btn.setAttribute("data-copy-value", value);
  btn.setAttribute("data-copy-label-default", label);
  btn.setAttribute("aria-label", label);
  return btn;
}

export function updatePanelFades(scrollEl: Element | null): void {
  if (!scrollEl) return;
  const topFade = document.getElementById("panel-fade-top");
  const bottomFade = document.getElementById("panel-fade-bottom");
  if (!topFade || !bottomFade) return;
  const hasOverflow = scrollEl.scrollHeight > scrollEl.clientHeight + 4;
  const atBottom =
    scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 4;
  const atTop = scrollEl.scrollTop <= 4;
  topFade.classList.toggle("opacity-0", !hasOverflow || atTop);
  bottomFade.classList.toggle("opacity-0", !hasOverflow || atBottom);
}

export function getGroupCategory(groupName: string): {
  key: string;
  label: string;
  colorClass: string;
  icon: string;
} {
  const name = groupName.toLowerCase();
  if (
    name.includes("admin") ||
    name.includes("adm_") ||
    name.includes("security") ||
    name.includes("seguridad") ||
    name.includes("domain admins") ||
    name.includes("administradores")
  ) {
    return {
      key: "seguridad",
      label: "Seguridad",
      colorClass: "border-error/20 bg-error/10 text-error hover:bg-error/20",
      icon: `<svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="m20.42 6.11l-7.97-4c-.28-.14-.62-.14-.9 0l-7.97 4c-.31.15-.51.45-.55.79c-.01.11-.96 10.77 8.55 15.01a.98.98 0 0 0 .82 0C21.91 17.66 20.97 7 20.95 6.9a.98.98 0 0 0-.55-.79Z"/></svg>`,
    };
  }
  if (
    name.includes("mail") ||
    name.includes("correo") ||
    name.includes("lista") ||
    name.includes("distribution") ||
    name.includes("dl_") ||
    name.includes("difusion") ||
    name.includes("difusión")
  ) {
    return {
      key: "correo",
      label: "Correo",
      colorClass:
        "border-success/20 bg-success/10 text-success hover:bg-success/20",
      icon: `<svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v.25l10 7.5l10-7.5V6c0-1.1-.9-2-2-2"/><path d="M12 16c-.21 0-.42-.07-.6-.2L2 8.75V18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8.75l-9.4 7.05c-.18.13-.39.2-.6.2"/></svg>`,
    };
  }
  if (
    name.includes("sistemas") ||
    name.includes("mda") ||
    name.includes("soporte") ||
    name.includes("ti_") ||
    name.includes("helpdesk") ||
    name.includes("tecnologia") ||
    name.includes("tecnología")
  ) {
    return {
      key: "sistemas",
      label: "Sistemas",
      colorClass: "border-info/20 bg-info/10 text-info hover:bg-info/20",
      icon: `<svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M22 4.5c0-.83-.67-1.5-1.5-1.5h-17C2.67 3 2 3.67 2 4.5V14h20zM3.5 18H11v2H8v2h8v-2h-3v-2h7.5c.83 0 1.5-.67 1.5-1.5V15H2v1.5c0 .83.67 1.5 1.5 1.5"/></svg>`,
    };
  }
  return {
    key: "otros",
    label: "Otros",
    colorClass:
      "border-base-300 bg-base-100/60 text-base-content/80 hover:bg-base-200/60",
    icon: `<svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`,
  };
}

function highlightGroupText(groupName: string, query: string): string {
  const safeName = escapeHtml(groupName || "");
  if (!query || !query.trim()) return safeName;
  const escaped = query.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  return safeName.replace(
    regex,
    '<mark class="bg-amber-200/70 dark:bg-amber-500/30 text-amber-950 dark:text-amber-100 px-0.5 rounded-xs font-semibold">$1</mark>',
  );
}

function updateCategoryCounts(groupsList: string[]): void {
  let countAll = groupsList.length;
  let countSeguridad = 0;
  let countCorreo = 0;
  let countSistemas = 0;
  let countOtros = 0;

  groupsList.forEach((group) => {
    const cat = getGroupCategory(group).key;
    if (cat === "seguridad") countSeguridad++;
    else if (cat === "correo") countCorreo++;
    else if (cat === "sistemas") countSistemas++;
    else countOtros++;
  });

  const countAllEl = document.getElementById("count-all");
  const countSeguridadEl = document.getElementById("count-seguridad");
  const countCorreoEl = document.getElementById("count-correo");
  const countSistemasEl = document.getElementById("count-sistemas");
  const countOtrosEl = document.getElementById("count-otros");

  if (countAllEl) countAllEl.textContent = String(countAll);
  if (countSeguridadEl) countSeguridadEl.textContent = String(countSeguridad);
  if (countCorreoEl) countCorreoEl.textContent = String(countCorreo);
  if (countSistemasEl) countSistemasEl.textContent = String(countSistemas);
  if (countOtrosEl) countOtrosEl.textContent = String(countOtros);
}

function renderGroups(
  groupsList: string[],
  filterText: string = "",
  category: string = "all",
): void {
  const terminalGroupsList = document.getElementById("terminal-groups-list");
  if (!terminalGroupsList) return;
  terminalGroupsList.innerHTML = "";

  if (currentViewMode === "grid") {
    terminalGroupsList.className =
      "flex-1 min-h-0 bg-base-200/30 border border-base-300 p-3 rounded-lg overflow-y-auto scrollbar-hide transition-all grid grid-cols-2 gap-1.5 content-start auto-rows-max";
  } else {
    terminalGroupsList.className =
      "flex-1 min-h-0 bg-base-200/30 border border-base-300 p-3 rounded-lg overflow-y-auto scrollbar-hide transition-all flex flex-col gap-1.5 content-start";
  }

  const filtered = groupsList.filter((group) => {
    const matchesSearch = group
      .toLowerCase()
      .includes(filterText.toLowerCase());
    if (!matchesSearch) return false;

    if (category === "all") return true;
    const cat = getGroupCategory(group).key;
    return cat === category;
  });

  if (filtered.length === 0) {
    terminalGroupsList.innerHTML = `<div class="text-base-content/50 text-center py-8 text-xs font-sans col-span-full">No se encontraron grupos${filterText ? " que coincidan" : ""}</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((group, index) => {
    const categoryInfo = getGroupCategory(group);
    const licenses = getLicensesForGroup(group);
    const item = document.createElement("div");
    item.className = `flex items-center justify-between gap-2.5 px-3 h-11 rounded-lg border transition-all font-sans relative group ${categoryInfo.colorClass}`;

    const licensePlacement = "tooltip-top";
    const licenseIcons = Array.isArray(licenses)
      ? licenses
          .map(
            (lic) => `
          <div class="tooltip z-50 ${licensePlacement}">
            <div class="tooltip-content text-left p-3 w-72 max-w-xs shadow-xl border border-neutral-content/15 bg-neutral text-neutral-content rounded-box text-xs">
              ${formatSingleLicenseTooltipHtml(lic)}
            </div>
            <button type="button" class="btn btn-ghost btn-xs p-0.5 shrink-0 cursor-pointer" aria-label="Información de licencia ${escapeHtml(lic.name)}">
              <svg class="size-3.5 text-base-content/50 hover:text-info" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c5.51 0 10-4.49 10-10S17.51 2 12 2S2 6.49 2 12s4.49 10 10 10M11 7h2v2h-2zm0 4h2v6h-2z"/></svg>
            </button>
          </div>`,
          )
          .join("")
      : "";

    item.innerHTML = `
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <span class="size-4 shrink-0 select-none flex items-center justify-center">${categoryInfo.icon}</span>
          <span class="font-semibold truncate text-small select-all text-base-content" title="${escapeHtml(group)}">${highlightGroupText(group, filterText)}</span>
          ${licenseIcons}
        </div>
      `;
    const copyBtn = cloneCopyIcon(group, "Copiar grupo");
    if (copyBtn) item.appendChild(copyBtn);
    fragment.appendChild(item);
  });
  terminalGroupsList.appendChild(fragment);
}

function setInvText(
  el: HTMLElement | null,
  value: unknown,
  copyBtn: HTMLElement | null,
): void {
  const has = value != null && value !== "";
  const text = has ? String(value) : "No especificado";
  if (el) el.textContent = text;
  if (copyBtn) {
    copyBtn.setAttribute("data-copy-value", has ? String(value) : "");
  }
}

function renderInvChips(
  container: HTMLElement | null,
  refs: Array<{ id?: string | number; name?: string }>,
): void {
  if (!container) return;
  container.innerHTML = "";
  if (!refs || refs.length === 0) {
    container.innerHTML =
      '<span class="text-base-content/40 text-xs font-sans">Sin datos</span>';
    return;
  }
  const frag = document.createDocumentFragment();
  for (const ref of refs) {
    const chip = document.createElement("span");
    chip.className =
      "badge badge-sm badge-soft bg-base-200 border border-base-300 text-base-content font-semibold max-w-full truncate";
    chip.title = ref.name || String(ref.id);
    chip.textContent = ref.name || String(ref.id);
    frag.appendChild(chip);
  }
  container.appendChild(frag);
}

function renderInvgatePhones(u: {
  phone?: string | null;
  mobile?: string | null;
  office?: string | null;
  other?: string | null;
  fax?: string | null;
}): void {
  const invgatePhones = document.getElementById("invgate-phones");
  if (!invgatePhones) return;
  invgatePhones.innerHTML = "";
  const phones: Array<[string, string]> = [
    ["Fijo", u.phone],
    ["Móvil", u.mobile],
    ["Oficina", u.office],
    ["Otro", u.other],
    ["Fax", u.fax],
  ].filter(([, value]) => value != null && value !== "") as Array<
    [string, string]
  >;
  if (phones.length === 0) {
    invgatePhones.innerHTML =
      '<span class="text-base-content/40 text-xs font-sans col-span-full">Sin datos</span>';
    return;
  }
  const frag = document.createDocumentFragment();
  for (const [label, num] of phones) {
    const card = document.createElement("div");
    card.className =
      "bg-base-200/50 border border-base-300 rounded-lg p-2 group relative flex items-start gap-2 min-w-0";
    card.innerHTML = `
      <div class="size-10 rounded-md bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" aria-hidden="true"><path d="M18.41 22h.37c.31-.01.6-.17.78-.43l2.27-3.27c.15-.22.21-.49.16-.76a1 1 0 0 0-.43-.65l-4.91-3.27c-.41-.27-.96-.21-1.29.15l-1.88 2.03c-.76-.45-2.03-1.26-3.03-2.26s-1.81-2.27-2.26-3.02l2.03-1.88c.36-.33.43-.88.15-1.29L7.1 2.44c-.15-.22-.38-.38-.64-.43c-.27-.05-.54 0-.76.16L2.43 4.43c-.26.18-.42.47-.43.78c-.03.71-.16 7.04 4.79 11.98c4.46 4.46 10.04 4.8 11.62 4.8Z"/></svg>
      </div>
      <div class="min-w-0 flex-1">
        <span class="text-base-content/50 text-xs uppercase font-bold tracking-wider select-none block truncate">${label}</span>
        <span class="text-xs font-semibold text-base-content mt-0.5 font-mono truncate block" title="${escapeHtml(num)}">${escapeHtml(num)}</span>
      </div>
    `;
    const copyBtn = cloneCopyIcon(num, `Copiar ${label}`);
    if (copyBtn) card.appendChild(copyBtn);
    frag.appendChild(card);
  }
  invgatePhones.appendChild(frag);
}

function statusBadgeClass(statusId: number): string {
  switch (statusId) {
    case 1:
      return "bg-info/10 text-info border-info/30";
    case 2:
      return "bg-accent/10 text-accent border-accent/30";
    case 3:
      return "bg-warning/10 text-warning border-warning/30";
    case 4:
      return "bg-neutral/10 text-neutral border-neutral/30";
    case 5:
    case 6:
      return "bg-success/10 text-success border-success/30";
    case 7:
      return "bg-error/10 text-error border-error/30";
    default:
      return "bg-base-300 text-base-content/60 border-base-content/30";
  }
}

function renderInvgateTickets(
  tickets: Array<{
    id?: number;
    pretty_id?: string;
    title?: string;
    status_id: number;
    status_name?: string;
    role?: string;
  }>,
): void {
  const invgateTicketsList = document.getElementById("invgate-tickets-list");
  const invgateOpenTickets = document.getElementById("invgate-open-tickets");
  if (!invgateTicketsList) return;
  invgateTicketsList.innerHTML = "";
  const list = tickets || [];
  if (invgateOpenTickets) {
    invgateOpenTickets.textContent = String(list.length);
    invgateOpenTickets.className =
      list.length > 0
        ? "badge badge-sm badge-soft bg-info/10 text-info font-semibold"
        : "badge badge-sm badge-soft bg-success/10 text-success font-semibold";
  }
  if (list.length === 0) {
    invgateTicketsList.innerHTML =
      '<span class="text-base-content/40 text-xs font-sans">Sin tickets relacionados</span>';
    return;
  }
  const frag = document.createDocumentFragment();
  for (const t of list) {
    const row = document.createElement("div");
    row.className =
      "flex items-center gap-2 px-1.5 py-1 rounded-md bg-base-200/50 border border-base-300 min-w-0";
    row.innerHTML = `
      <span class="badge badge-sm badge-soft border ${statusBadgeClass(t.status_id)}">${escapeHtml(t.status_name || String(t.status_id))}</span>
      <span class="font-mono text-xs text-base-content/70 shrink-0">${escapeHtml(t.pretty_id || String(t.id))}</span>
      <span class="text-xs text-base-content truncate flex-1 min-w-0" title="${escapeHtml(t.title || "")}">${escapeHtml(t.title || "Sin título")}</span>
      <span class="badge badge-sm badge-soft ${t.role === "agent" ? "bg-secondary/10 text-secondary border-secondary/30" : "bg-neutral/10 text-neutral border-neutral/30"}">${t.role === "agent" ? "Asignado" : "Solicitante"}</span>
    `;
    frag.appendChild(row);
  }
  invgateTicketsList.appendChild(frag);
}

function renderInvgateData(data: any): void {
  const u = data.user || {};
  const invgateFullname = document.getElementById("invgate-fullname");
  const btnCopyInvgateFullname = document.getElementById("btn-copy-invgate-fullname");
  const invgateEmail = document.getElementById("invgate-email");
  const btnCopyInvgateEmail = document.getElementById("btn-copy-invgate-email");
  const invgateRole = document.getElementById("invgate-role");
  const btnCopyInvgateRole = document.getElementById("btn-copy-invgate-role");
  const invgatePosition = document.getElementById("invgate-position");
  const btnCopyInvgatePosition = document.getElementById("btn-copy-invgate-position");
  const invgateUserid = document.getElementById("invgate-userid");
  const btnCopyInvgateUserid = document.getElementById("btn-copy-invgate-userid");
  const invgateGroups = document.getElementById("invgate-groups");
  const invgateHelpdesks = document.getElementById("invgate-helpdesks");
  const invgateLocations = document.getElementById("invgate-locations");
  const invgateManager = document.getElementById("invgate-manager");
  const btnCopyInvgateManager = document.getElementById("btn-copy-invgate-manager");
  const btnSearchInvgateManager = document.getElementById("btn-search-invgate-manager");

  setInvText(invgateFullname, u.fullname, btnCopyInvgateFullname);
  setInvText(invgateEmail, u.email, btnCopyInvgateEmail);
  setInvText(invgateRole, u.role_name, btnCopyInvgateRole);
  setInvText(invgatePosition, u.position, btnCopyInvgatePosition);
  setInvText(invgateUserid, u.id, btnCopyInvgateUserid);
  renderInvgatePhones(u);

  renderInvChips(invgateGroups, data.org?.groups);
  renderInvChips(invgateHelpdesks, data.org?.helpdesks);
  renderInvChips(invgateLocations, data.org?.locations);

  const managerName = data.manager?.fullname || null;
  if (invgateManager) {
    invgateManager.textContent = managerName || "No especificado";
  }
  if (btnCopyInvgateManager) {
    btnCopyInvgateManager.setAttribute("data-copy-value", managerName || "");
  }
  if (btnSearchInvgateManager) {
    btnSearchInvgateManager.classList.toggle("hidden", !managerName);
  }

  renderInvgateTickets(data.tickets);
}

export async function loadInvgateData(): Promise<void> {
  if (invgateLoaded || !currentInvgateUsername) return;
  invgateLoaded = true;

  const invgateLoading = document.getElementById("invgate-loading");
  const invgateError = document.getElementById("invgate-error");

  invgateError?.classList.add("hidden");
  invgateError?.classList.remove("flex");
  if (invgateLoading) {
    invgateLoading.classList.remove("hidden");
    invgateLoading.classList.add("flex");
  }

  try {
    const url = `${cleanBase}api/usuarios/invgate-user?username=${encodeURIComponent(currentInvgateUsername)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || "Error al consultar InvGate");
    }
    if (data.inInvGate) {
      renderInvgateData(data);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al conectar con InvGate";
    if (invgateError) {
      invgateError.innerHTML = `<span class="text-error text-xs font-sans">${escapeHtml(msg)}</span>`;
      invgateError.classList.remove("hidden");
      invgateError.classList.add("flex");
    }
  } finally {
    if (invgateLoading) {
      invgateLoading.classList.add("hidden");
      invgateLoading.classList.remove("flex");
    }
  }
}

export async function loadTerminalData(username: string): Promise<void> {
  const terminalLoading = document.getElementById("terminal-loading");
  const terminalOutput = document.getElementById("terminal-output");
  const copyTerminalBtn = document.getElementById("copy-terminal-btn");
  const termInfoFullname = document.getElementById("term-info-fullname");
  const btnCopyFullname = document.getElementById("btn-copy-fullname");
  const termInfoTitle = document.getElementById("term-info-title");
  const btnCopyTitle = document.getElementById("btn-copy-title");
  const termInfoEmployeeNumber = document.getElementById("term-info-employeenumber");
  const btnCopyEmployeeNumber = document.getElementById("btn-copy-employeenumber");
  const termInfoOffice = document.getElementById("term-info-office");
  const btnCopyOffice = document.getElementById("btn-copy-office");
  const termInfoManager = document.getElementById("term-info-manager");
  const btnCopyManager = document.getElementById("btn-copy-manager");
  const btnSearchManager = document.getElementById("btn-search-manager");
  const termInfoLastLogon = document.getElementById("term-info-lastlogon");
  const btnCopyLastLogon = document.getElementById("btn-copy-lastlogon");
  const termInfoWhenCreated = document.getElementById("term-info-whencreated");
  const btnCopyWhenCreated = document.getElementById("btn-copy-whencreated");
  const termInfoPwdLastSet = document.getElementById("term-info-pwdlastset");
  const btnCopyPwdLastSet = document.getElementById("btn-copy-pwdlastset");
  const termInfoExpires = document.getElementById("term-info-expires");
  const btnCopyExpires = document.getElementById("btn-copy-expires");
  const terminalGroupsCount = document.getElementById("terminal-groups-count");
  const terminalGroupsSearch = document.getElementById(
    "terminal-groups-search",
  ) as HTMLInputElement | null;
  const terminalGroupsList = document.getElementById("terminal-groups-list");

  if (!terminalLoading || !terminalOutput) return;
  terminalLoading.classList.remove("hidden");
  terminalLoading.classList.add("flex");

  try {
    const url = `${cleanBase}api/usuarios/net-user?username=${encodeURIComponent(username)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Error en la ejecución del comando en el servidor.");
    }
    const result = await response.json();

    if (result.status === "success") {
      if (result.employee_number) {
        netUserCache.set(username.toLowerCase(), result.employee_number);
      }
      terminalOutput.textContent = result.output;
      copyTerminalBtn?.setAttribute("data-copy-value", result.output);

      if (termInfoFullname) {
        termInfoFullname.textContent = result.fullname || "No especificado";
      }
      if (btnCopyFullname) {
        btnCopyFullname.setAttribute("data-copy-value", result.fullname || "");
      }
      if (termInfoTitle) {
        termInfoTitle.textContent = result.title || "No especificado";
      }
      if (btnCopyTitle) {
        btnCopyTitle.setAttribute("data-copy-value", result.title || "");
      }
      if (termInfoEmployeeNumber) {
        termInfoEmployeeNumber.textContent =
          result.employee_number || "No especificado";
      }
      if (btnCopyEmployeeNumber) {
        btnCopyEmployeeNumber.setAttribute(
          "data-copy-value",
          result.employee_number || "",
        );
      }
      if (termInfoOffice) {
        termInfoOffice.textContent = result.physical_office || "No especificado";
      }
      if (btnCopyOffice) {
        btnCopyOffice.setAttribute(
          "data-copy-value",
          result.physical_office || "",
        );
      }
      if (termInfoManager) {
        termInfoManager.textContent = result.manager_name || "No especificado";
      }
      if (btnCopyManager) {
        btnCopyManager.setAttribute("data-copy-value", result.manager_name || "");
      }
      if (btnSearchManager) {
        if (result.manager_name && result.manager_name !== "No especificado") {
          btnSearchManager.classList.remove("hidden");
        } else {
          btnSearchManager.classList.add("hidden");
        }
      }
      if (termInfoLastLogon) {
        termInfoLastLogon.textContent = result.last_logon || "No especificado";
      }
      if (btnCopyLastLogon) {
        btnCopyLastLogon.setAttribute("data-copy-value", result.last_logon || "");
      }
      if (termInfoWhenCreated) {
        termInfoWhenCreated.textContent =
          result.when_created || "No especificado";
      }
      if (btnCopyWhenCreated) {
        btnCopyWhenCreated.setAttribute(
          "data-copy-value",
          result.when_created || "",
        );
      }
      if (termInfoPwdLastSet) {
        termInfoPwdLastSet.textContent = result.pwd_last_set || "No especificado";
      }
      if (btnCopyPwdLastSet) {
        btnCopyPwdLastSet.setAttribute(
          "data-copy-value",
          result.pwd_last_set || "",
        );
      }
      if (termInfoExpires) {
        termInfoExpires.textContent = result.account_expires || "Nunca";
      }
      if (btnCopyExpires) {
        btnCopyExpires.setAttribute(
          "data-copy-value",
          result.account_expires || "Nunca",
        );
      }

      currentLdapGroups = result.groups || [];
      if (terminalGroupsCount) {
        terminalGroupsCount.textContent = `${currentLdapGroups.length} ${currentLdapGroups.length === 1 ? "grupo" : "grupos"}`;
      }

      updateCategoryCounts(currentLdapGroups);
      renderGroups(
        currentLdapGroups,
        terminalGroupsSearch?.value || "",
        currentSelectedCategory,
      );
    } else {
      const errorMsg = "Error: " + (result.error || "Ocurrió un problema.");
      terminalOutput.textContent = errorMsg;
      copyTerminalBtn?.setAttribute("data-copy-value", errorMsg);
      if (terminalGroupsList) {
        terminalGroupsList.innerHTML = `<div class="text-error text-center py-4 text-xs font-sans col-span-full">${errorMsg}</div>`;
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    const errorMsg =
      "Error de conexión: No se pudo conectar con el servidor corporativo.\n" +
      msg;
    terminalOutput.textContent = errorMsg;
    copyTerminalBtn?.setAttribute("data-copy-value", errorMsg);
    if (terminalGroupsList) {
      terminalGroupsList.innerHTML = `<div class="text-error text-center py-4 text-xs font-sans col-span-full">Error al conectar con la red.</div>`;
    }
  } finally {
    terminalLoading.classList.add("hidden");
    terminalLoading.classList.remove("flex");
    updatePanelFades(document.getElementById("panel-details-scroll"));
  }
}

export async function openTerminalModal(
  username: string,
  invgateExists = false,
): Promise<void> {
  const terminalModal = document.getElementById("terminal-modal") as HTMLDialogElement | null;
  const terminalUserTitle = document.getElementById("terminal-user-title");
  const terminalCommandUsername = document.getElementById("terminal-command-username");
  const terminalOutput = document.getElementById("terminal-output");
  const terminalLoading = document.getElementById("terminal-loading");
  const tabPanelBtn = document.getElementById("tab-panel-btn");
  const terminalGroupsSearch = document.getElementById(
    "terminal-groups-search",
  ) as HTMLInputElement | null;
  const clearGroupSearch = document.getElementById("clear-terminal-groups-search");
  const invgateError = document.getElementById("invgate-error");
  const tabInvgateBtn = document.getElementById("tab-invgate-btn");
  const viewInvgate = document.getElementById("view-invgate");
  const invgateTicketsList = document.getElementById("invgate-tickets-list");
  const invgateOpenTickets = document.getElementById("invgate-open-tickets");
  const invgatePhones = document.getElementById("invgate-phones");
  const copyTerminalBtn = document.getElementById("copy-terminal-btn");
  const termInfoUsername = document.getElementById("term-info-username");
  const btnCopyUsername = document.getElementById("btn-copy-username");
  const termInfoFullname = document.getElementById("term-info-fullname");
  const btnCopyFullname = document.getElementById("btn-copy-fullname");
  const termInfoTitle = document.getElementById("term-info-title");
  const btnCopyTitle = document.getElementById("btn-copy-title");
  const termInfoEmployeeNumber = document.getElementById("term-info-employeenumber");
  const btnCopyEmployeeNumber = document.getElementById("btn-copy-employeenumber");
  const termInfoOffice = document.getElementById("term-info-office");
  const btnCopyOffice = document.getElementById("btn-copy-office");
  const termInfoManager = document.getElementById("term-info-manager");
  const btnCopyManager = document.getElementById("btn-copy-manager");
  const btnSearchManager = document.getElementById("btn-search-manager");
  const termInfoPwdLastSet = document.getElementById("term-info-pwdlastset");
  const btnCopyPwdLastSet = document.getElementById("btn-copy-pwdlastset");
  const termInfoLastLogon = document.getElementById("term-info-lastlogon");
  const btnCopyLastLogon = document.getElementById("btn-copy-lastlogon");
  const termInfoWhenCreated = document.getElementById("term-info-whencreated");
  const btnCopyWhenCreated = document.getElementById("btn-copy-whencreated");
  const termInfoExpires = document.getElementById("term-info-expires");
  const btnCopyExpires = document.getElementById("btn-copy-expires");
  const terminalGroupsCount = document.getElementById("terminal-groups-count");
  const terminalGroupsList = document.getElementById("terminal-groups-list");

  if (
    !terminalModal ||
    !terminalUserTitle ||
    !terminalCommandUsername ||
    !terminalOutput ||
    !terminalLoading
  ) {
    return;
  }

  currentUsername = username;
  tabPanelBtn?.click();

  if (terminalGroupsSearch) {
    terminalGroupsSearch.value = "";
    clearGroupSearch?.classList.add("hidden");
  }
  currentSelectedCategory = "all";

  invgateLoaded = false;
  currentInvgateUsername = username;
  invgateError?.classList.add("hidden");
  invgateError?.classList.remove("flex");

  if (tabInvgateBtn) tabInvgateBtn.classList.toggle("hidden", !invgateExists);
  viewInvgate?.classList.add("hidden");
  if (invgateTicketsList) invgateTicketsList.innerHTML = "";
  if (invgateOpenTickets) invgateOpenTickets.textContent = "0";
  if (invgatePhones) invgatePhones.innerHTML = "";

  const categoryButtons = document.querySelectorAll(
    "#group-category-filters [data-filter]",
  );
  categoryButtons.forEach((b) => {
    b.className =
      "btn btn-sm rounded-full cursor-pointer transition-all bg-base-200 text-base-content/60 border border-base-300 hover:bg-base-300 hover:text-base-content font-sans font-bold gap-1";
  });
  const allBtn = document.querySelector(
    '#group-category-filters [data-filter="all"]',
  );
  if (allBtn) {
    allBtn.className =
      "btn btn-sm rounded-full cursor-pointer transition-all bg-secondary/10 text-secondary border border-secondary/30 hover:bg-secondary/20 font-sans font-bold gap-1";
  }

  terminalUserTitle.textContent = username;
  terminalCommandUsername.textContent = username;
  terminalOutput.textContent = "";
  copyTerminalBtn?.setAttribute("data-copy-value", "");

  if (termInfoUsername) termInfoUsername.textContent = username;
  if (btnCopyUsername) btnCopyUsername.setAttribute("data-copy-value", username);
  if (termInfoFullname) termInfoFullname.textContent = "-";
  if (btnCopyFullname) btnCopyFullname.setAttribute("data-copy-value", "");
  if (termInfoTitle) termInfoTitle.textContent = "-";
  if (btnCopyTitle) btnCopyTitle.setAttribute("data-copy-value", "");
  if (termInfoEmployeeNumber) termInfoEmployeeNumber.textContent = "-";
  if (btnCopyEmployeeNumber) btnCopyEmployeeNumber.setAttribute("data-copy-value", "");
  if (termInfoOffice) termInfoOffice.textContent = "-";
  if (btnCopyOffice) btnCopyOffice.setAttribute("data-copy-value", "");
  if (termInfoManager) termInfoManager.textContent = "-";
  if (btnCopyManager) btnCopyManager.setAttribute("data-copy-value", "");
  if (btnSearchManager) btnSearchManager.classList.add("hidden");
  if (termInfoPwdLastSet) termInfoPwdLastSet.textContent = "-";
  if (btnCopyPwdLastSet) btnCopyPwdLastSet.setAttribute("data-copy-value", "");
  if (termInfoLastLogon) termInfoLastLogon.textContent = "-";
  if (btnCopyLastLogon) btnCopyLastLogon.setAttribute("data-copy-value", "");
  if (termInfoWhenCreated) termInfoWhenCreated.textContent = "-";
  if (btnCopyWhenCreated) btnCopyWhenCreated.setAttribute("data-copy-value", "");
  if (termInfoExpires) termInfoExpires.textContent = "-";
  if (btnCopyExpires) btnCopyExpires.setAttribute("data-copy-value", "");
  if (terminalGroupsCount) terminalGroupsCount.textContent = "0 grupos";
  if (terminalGroupsList) terminalGroupsList.innerHTML = "";
  currentLdapGroups = [];

  terminalModal.showModal();
  await loadTerminalData(username);
}

export function closeTerminalModal(): void {
  const terminalModal = document.getElementById(
    "terminal-modal",
  ) as HTMLDialogElement | null;
  terminalModal?.close();
}

export function initTerminalModal(onSearchUser?: (name: string) => void): void {
  onSearchUserCallback = onSearchUser || null;

  const tabPanelBtn = document.getElementById("tab-panel-btn");
  const tabConsoleBtn = document.getElementById("tab-console-btn");
  const tabInvgateBtn = document.getElementById("tab-invgate-btn");
  const viewPanel = document.getElementById("view-panel");
  const viewConsole = document.getElementById("view-console");
  const viewInvgate = document.getElementById("view-invgate");
  const copyTerminalBtn = document.getElementById("copy-terminal-btn");
  const terminalLoading = document.getElementById("terminal-loading");
  const refreshTerminalBtn = document.getElementById("refresh-terminal-btn") as HTMLButtonElement | null;
  const refreshTerminalIcon = document.getElementById("refresh-terminal-icon");
  const closeTerminalFooterBtn = document.getElementById("close-terminal-footer-btn");
  const copyAllGroupsBtn = document.getElementById("copy-all-groups-btn");
  const btnViewGrid = document.getElementById("btn-view-grid");
  const btnViewList = document.getElementById("btn-view-list");
  const terminalGroupsSearch = document.getElementById("terminal-groups-search") as HTMLInputElement | null;
  const clearGroupSearch = document.getElementById("clear-terminal-groups-search");
  const btnSearchManager = document.getElementById("btn-search-manager");
  const btnSearchInvgateManager = document.getElementById("btn-search-invgate-manager");
  const termInfoManager = document.getElementById("term-info-manager");
  const invgateManager = document.getElementById("invgate-manager");

  const panelDetailsScroll = document.getElementById("panel-details-scroll");
  panelDetailsScroll?.addEventListener("scroll", () => {
    updatePanelFades(panelDetailsScroll);
  });

  window.addEventListener("resize", () => {
    const el = document.getElementById("panel-details-scroll");
    if (el) updatePanelFades(el);
  });

  tabPanelBtn?.addEventListener("click", () => {
    tabPanelBtn.classList.add("border-secondary", "text-secondary");
    tabPanelBtn.classList.remove("border-transparent", "text-base-content/60");
    tabConsoleBtn?.classList.remove("border-secondary", "text-secondary");
    tabConsoleBtn?.classList.add("border-transparent", "text-base-content/60");
    tabInvgateBtn?.classList.remove("border-secondary", "text-secondary");
    tabInvgateBtn?.classList.add("border-transparent", "text-base-content/60");

    viewPanel?.classList.remove("hidden");
    viewConsole?.classList.add("hidden");
    viewInvgate?.classList.add("hidden");
    copyTerminalBtn?.classList.remove("hidden");
  });

  tabConsoleBtn?.addEventListener("click", () => {
    tabConsoleBtn.classList.add("border-secondary", "text-secondary");
    tabConsoleBtn.classList.remove("border-transparent", "text-base-content/60");
    tabPanelBtn?.classList.remove("border-secondary", "text-secondary");
    tabPanelBtn?.classList.add("border-transparent", "text-base-content/60");
    tabInvgateBtn?.classList.remove("border-secondary", "text-secondary");
    tabInvgateBtn?.classList.add("border-transparent", "text-base-content/60");

    viewConsole?.classList.remove("hidden");
    viewPanel?.classList.add("hidden");
    viewInvgate?.classList.add("hidden");
    copyTerminalBtn?.classList.remove("hidden");
  });

  tabInvgateBtn?.addEventListener("click", () => {
    tabInvgateBtn.classList.add("border-secondary", "text-secondary");
    tabInvgateBtn.classList.remove("border-transparent", "text-base-content/60");
    tabPanelBtn?.classList.remove("border-secondary", "text-secondary");
    tabPanelBtn?.classList.add("border-transparent", "text-base-content/60");
    tabConsoleBtn?.classList.remove("border-secondary", "text-secondary");
    tabConsoleBtn?.classList.add("border-transparent", "text-base-content/60");

    viewPanel?.classList.add("hidden");
    viewConsole?.classList.add("hidden");
    viewInvgate?.classList.remove("hidden");

    terminalLoading?.classList.add("hidden");
    terminalLoading?.classList.remove("flex");

    copyTerminalBtn?.classList.add("hidden");

    loadInvgateData();
  });

  copyAllGroupsBtn?.addEventListener("click", (e) => {
    if (currentLdapGroups.length === 0) return;

    const filterText = terminalGroupsSearch?.value || "";
    const filtered = currentLdapGroups.filter((group) => {
      const matchesSearch = group
        .toLowerCase()
        .includes(filterText.toLowerCase());
      if (!matchesSearch) return false;

      if (currentSelectedCategory === "all") return true;
      return getGroupCategory(group).key === currentSelectedCategory;
    });

    if (filtered.length === 0) {
      e.stopPropagation();
      showToast("No hay grupos que coincidan con el filtro actual.", "alert-info");
      return;
    }

    copyAllGroupsBtn.setAttribute("data-copy-value", filtered.join("\n"));
  });

  btnViewGrid?.addEventListener("click", () => {
    currentViewMode = "grid";
    btnViewGrid.className =
      "btn btn-sm join-item px-3 text-secondary bg-base-300 cursor-pointer border-0";
    if (btnViewList) {
      btnViewList.className =
        "btn btn-sm join-item px-3 text-base-content/50 hover:text-base-content bg-transparent cursor-pointer border-0";
    }
    renderGroups(
      currentLdapGroups,
      terminalGroupsSearch?.value || "",
      currentSelectedCategory,
    );
  });

  btnViewList?.addEventListener("click", () => {
    currentViewMode = "list";
    if (btnViewGrid) {
      btnViewGrid.className =
        "btn btn-sm join-item px-3 text-base-content/50 hover:text-base-content bg-transparent cursor-pointer border-0";
    }
    btnViewList.className =
      "btn btn-sm join-item px-3 text-secondary bg-base-300 cursor-pointer border-0";
    renderGroups(
      currentLdapGroups,
      terminalGroupsSearch?.value || "",
      currentSelectedCategory,
    );
  });

  const categoryButtons = document.querySelectorAll(
    "#group-category-filters [data-filter]",
  );
  categoryButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      categoryButtons.forEach((b) => {
        b.className =
          "btn btn-sm rounded-full cursor-pointer transition-all bg-base-200 text-base-content/60 border border-base-300 hover:bg-base-300 hover:text-base-content font-sans font-bold gap-1";
      });

      const filter = btn.getAttribute("data-filter") || "all";
      currentSelectedCategory = filter;

      if (filter === "all") {
        btn.className =
          "btn btn-sm rounded-full cursor-pointer transition-all bg-secondary/10 text-secondary border border-secondary/30 hover:bg-secondary/20 font-sans font-bold gap-1";
      } else if (filter === "seguridad") {
        btn.className =
          "btn btn-sm rounded-full cursor-pointer transition-all bg-error/20 text-error border border-error/30 hover:bg-error/30 font-sans font-bold gap-1";
      } else if (filter === "correo") {
        btn.className =
          "btn btn-sm rounded-full cursor-pointer transition-all bg-success/20 text-success border border-success/30 hover:bg-success/30 font-sans font-bold gap-1";
      } else if (filter === "sistemas") {
        btn.className =
          "btn btn-sm rounded-full cursor-pointer transition-all bg-info/20 text-info border border-info/30 hover:bg-info/30 font-sans font-bold gap-1";
      } else if (filter === "otros") {
        btn.className =
          "btn btn-sm rounded-full cursor-pointer transition-all bg-base-300 text-base-content border border-base-content/30 hover:bg-base-300 font-sans font-bold gap-1";
      }

      renderGroups(
        currentLdapGroups,
        terminalGroupsSearch?.value || "",
        currentSelectedCategory,
      );
    });
  });

  clearGroupSearch?.addEventListener("click", () => {
    if (terminalGroupsSearch) {
      terminalGroupsSearch.value = "";
      clearGroupSearch.classList.add("hidden");
      renderGroups(currentLdapGroups, "", currentSelectedCategory);
    }
  });

  terminalGroupsSearch?.addEventListener("input", (e) => {
    const val = (e.target as HTMLInputElement).value || "";
    if (val) {
      clearGroupSearch?.classList.remove("hidden");
    } else {
      clearGroupSearch?.classList.add("hidden");
    }
    renderGroups(currentLdapGroups, val, currentSelectedCategory);
  });

  refreshTerminalBtn?.addEventListener("click", async () => {
    if (!currentUsername) return;
    refreshTerminalIcon?.classList.add("animate-spin");
    refreshTerminalBtn.disabled = true;
    try {
      const invgateActive =
        viewInvgate && !viewInvgate.classList.contains("hidden");
      if (invgateActive) {
        terminalLoading?.classList.add("hidden");
        terminalLoading?.classList.remove("flex");
      }
      await loadTerminalData(currentUsername);
      invgateLoaded = false;
      if (invgateActive) {
        await loadInvgateData();
      }
    } finally {
      refreshTerminalIcon?.classList.remove("animate-spin");
      refreshTerminalBtn.disabled = false;
    }
  });

  btnSearchManager?.addEventListener("click", () => {
    const managerName = termInfoManager?.textContent;
    if (
      managerName &&
      managerName !== "-" &&
      managerName !== "No especificado"
    ) {
      closeTerminalModal();
      onSearchUserCallback?.(managerName);
    }
  });

  btnSearchInvgateManager?.addEventListener("click", () => {
    const name = invgateManager?.textContent;
    if (name && name !== "-" && name !== "No especificado") {
      closeTerminalModal();
      onSearchUserCallback?.(name);
    }
  });

  closeTerminalFooterBtn?.addEventListener("click", closeTerminalModal);
}
