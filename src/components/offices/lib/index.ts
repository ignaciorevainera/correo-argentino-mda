import { initOfficeInvgate } from "./officeInvgate";
import { initializeMap, invalidateMapSize } from "./officeMap";
import {
  initOfficeTable,
  fetchOffices,
  resetPagination,
  getCurrentSearch,
  setCurrentSearch,
  getCurrentSort,
} from "./officeTable";
import { initOfficeFilters, syncFiltersToURL } from "./officeFilters";

export * from "./officeInvgate";
export * from "./officeMap";
export * from "./officeTable";
export * from "./officeFilters";

export function initViewSwitcher(): void {
  const mainViewDir = document.getElementById("main-view-directory");
  const mainViewMap = document.getElementById("main-view-map");
  const switcher = document.getElementById("main-view-switcher");

  switcher?.addEventListener("view-change", (e: any) => {
    const value = e.detail.value;
    if (value === "directory") {
      mainViewDir?.classList.remove("hidden");
      mainViewMap?.classList.add("hidden");
    } else if (value === "map") {
      mainViewDir?.classList.add("hidden");
      mainViewMap?.classList.remove("hidden");
      initializeMap()
        .then(() => {
          invalidateMapSize();
        })
        .catch((err) => {
          console.error("Error initializing map:", err);
        });
    }
  });
}

let isAgentsTicketTriggerInitialized = false;

export function initAgentsTicketTrigger(): void {
  if (isAgentsTicketTriggerInitialized) return;
  isAgentsTicketTriggerInitialized = true;

  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const trigger = target.closest(
      "[data-agents-ticket-trigger]",
    ) as HTMLElement | null;
    if (!trigger) return;

    const officeName = trigger.getAttribute("data-office-name") || "";
    const officeCode = trigger.getAttribute("data-office-code") || "";
    if (!officeName || !officeCode) return;

    const openFn = (window as any).openAgentsTicketModal;
    if (typeof openFn === "function") {
      openFn(officeName, officeCode);
    }
  });
}

export function init(): void {
  initOfficeTable();

  initOfficeFilters((newSearch?: string) => {
    resetPagination();
    if (typeof newSearch === "string") {
      setCurrentSearch(newSearch);
    }
    fetchOffices(true);
    const { sortBy, sortOrder } = getCurrentSort();
    syncFiltersToURL(getCurrentSearch(), sortBy, sortOrder);
  });

  initOfficeInvgate();
  initViewSwitcher();
  initAgentsTicketTrigger();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
