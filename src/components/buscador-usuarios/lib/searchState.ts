import { buildQueryString, updateBrowserUrl } from "@lib/clientUrlSync";
import { getCleanBase } from "@lib/baseUrl";
import type { BuscadorUser } from "./types";
import { displayResults } from "./cardRenderer";

const cleanBase = getCleanBase();

let isLoaded = false;
let currentUsers: BuscadorUser[] = [];
let searchTimeout: ReturnType<typeof setTimeout> | undefined;
let searchAbortController: AbortController | null = null;
let activeSearchQuery = "";

export function getCurrentUsers(): BuscadorUser[] {
  return currentUsers;
}

export function updateCurrentUser(
  dni: string,
  interno: string,
  telefono: string,
): void {
  const idx = currentUsers.findIndex((u) => u.dni === dni);
  if (idx !== -1) {
    currentUsers[idx].interno = interno || null;
    currentUsers[idx].telefono = telefono || null;
  }
  const searchInput = document.getElementById(
    "search-input",
  ) as HTMLInputElement | null;
  displayResults(currentUsers, searchInput?.value || "");
}

export async function handleSearch(): Promise<void> {
  const searchInput = document.getElementById(
    "search-input",
  ) as HTMLInputElement | null;
  const statusText = document.getElementById("search-status");
  const loadingIndicator = document.getElementById("loading-indicator");
  const resultsTitle = document.getElementById("results-title");

  if (!isLoaded || !searchInput) return;
  const query = (searchInput.value || "").trim();

  if (query === "") {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = undefined;
    }
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
    activeSearchQuery = "";
    loadingIndicator?.classList.add("hidden");
    currentUsers = [];
    displayResults([], "");
    if (resultsTitle?.firstChild) {
      resultsTitle.firstChild.textContent = "Usuarios sugeridos ";
    }
    if (statusText) statusText.textContent = "Listo para buscar.";
    const qs = buildQueryString({ q: "" });
    updateBrowserUrl(qs);
    return;
  }

  const qs = buildQueryString({ q: query });
  updateBrowserUrl(qs);

  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = undefined;
  }
  if (searchAbortController) {
    searchAbortController.abort();
    searchAbortController = null;
  }
  activeSearchQuery = query;
  loadingIndicator?.classList.remove("hidden");

  searchTimeout = setTimeout(async () => {
    const controller = new AbortController();
    searchAbortController = controller;
    try {
      const url = `${cleanBase}api/usuarios/search?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) throw new Error("API error");
      const data = await response.json();

      if (controller.signal.aborted || query !== activeSearchQuery) return;

      const mappedResults: BuscadorUser[] = (data.results || []).map((u: any) => ({
        nombre: u.fullname,
        dni: u.dni,
        usuario: u.username,
        interno: u.interno,
        telefono: u.telefono,
        email: u.username ? `${u.username}@correoargentino.com.ar` : null,
        sucursal: u.sucursal,
        sucursalNombre: u.sucursalNombre,
        sucursales: u.sucursales ?? [],
        invgateExists: u.invgateExists ?? false,
      }));

      currentUsers = mappedResults;
      displayResults(currentUsers, query);

      if (resultsTitle?.firstChild) {
        resultsTitle.firstChild.textContent = "Resultados ";
      }
      loadingIndicator?.classList.add("hidden");
      if (statusText) {
        statusText.textContent = `${mappedResults.length} encontrados`;
      }
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        return;
      }
      loadingIndicator?.classList.add("hidden");
      if (statusText) {
        statusText.textContent = "Error al conectar con la base de datos";
      }
    } finally {
      if (searchAbortController === controller) {
        searchAbortController = null;
      }
    }
  }, 300);
}

export function triggerSearch(query: string): void {
  const searchInput = document.getElementById(
    "search-input",
  ) as HTMLInputElement | null;
  if (searchInput) {
    searchInput.value = query;
    handleSearch();
  }
}

export function initSearchState(): void {
  const searchInput = document.getElementById(
    "search-input",
  ) as HTMLInputElement | null;
  const clearSearchBtn = document.getElementById("clear-search");
  const statusText = document.getElementById("search-status");
  const resultsSkeleton = document.getElementById("results-skeleton");
  const resultsGrid = document.getElementById("results-grid");
  const loadingIndicator = document.getElementById("loading-indicator");
  const resultsTitle = document.getElementById("results-title");

  isLoaded = true;
  if (statusText) statusText.textContent = "Listo para buscar.";
  resultsSkeleton?.classList.add("hidden");
  resultsGrid?.classList.remove("hidden");
  resultsGrid?.classList.add("grid");
  setTimeout(() => resultsGrid?.classList.remove("opacity-0"), 50);
  displayResults([], "");

  searchInput?.addEventListener("input", handleSearch);

  clearSearchBtn?.addEventListener("click", () => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = undefined;
    }
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
    activeSearchQuery = "";
    loadingIndicator?.classList.add("hidden");
    if (searchInput) searchInput.value = "";
    currentUsers = [];
    displayResults([], "");
    if (resultsTitle?.firstChild) {
      resultsTitle.firstChild.textContent = "Usuarios sugeridos ";
    }
    if (statusText) statusText.textContent = "Listo para buscar.";
    const qs = buildQueryString({ q: "" });
    updateBrowserUrl(qs);
  });

  document.addEventListener("keydown", (e) => {
    const el = document.activeElement as HTMLElement | null;
    const isEditing =
      el?.tagName === "INPUT" ||
      el?.tagName === "TEXTAREA" ||
      el?.isContentEditable;
    if (e.key === "/" && !isEditing) {
      e.preventDefault();
      searchInput?.focus();
    }
  });

  const urlParams = new URLSearchParams(window.location.search);
  const q = urlParams.get("q");
  if (q && searchInput) {
    searchInput.value = q;
    handleSearch();
  } else if (searchInput) {
    searchInput.focus();
  }
}
