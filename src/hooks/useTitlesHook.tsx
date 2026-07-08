import { useState, useEffect, useCallback, useMemo } from "react";
import { useDebounce } from "./useDebounce";
import { showToast } from "@lib/toastClient"

declare const chrome: any;

export interface Title {
  id: number;
  name: string;
  categoryId: number;
  category: string;
  icon: string;
  tone: string;
  route: string | null;
  description: string | null;
  articleOnKdb: string | null
}

export interface TitleFormData {
  name: string;
  categoryId: number;
  route: string;
  description: string;
  articleOnKdb: string;
}

export interface TitleCategory {
  id: number;
  name: string;
  icon: string;
  tone: string;
}
export function useTitles() {
  const [titles, setTitles] = useState<Title[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("Todos");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<TitleCategory[]>([]);

  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const saved = localStorage.getItem("favorites");
    return saved ? JSON.parse(saved) : [];
  })


  // Debounce
  const debouncedSearch = useDebounce(searchQuery, 200);

  // Fetch
  useEffect(() => {
    setLoading(true)
    const fetchTitles = async () => {
      try {
        const res = await fetch("/api/titulos");
        if (!res.ok) {
          throw new Error("Error obteniendo títulos");
        }
        const data: Title[] = await res.json();
        setTitles(data)
      } catch (error) {
        console.error("Error loading titles:", error);
      } finally {
        setLoading(false)
      }
    }
    fetchTitles()
  }, []);

  const refreshTitles = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/titulos");

      if (!res.ok) {
        throw new Error("Error cargando títulos.");
      }

      const data: Title[] = await res.json();
      setTitles(data)
        ;
    } catch (error) {
      console.error(error);
      showToast(
        "No se pudieron obtener los títulos",
        "alert-error",
        3000
      )
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshCategories = useCallback(async () => {

    try {

      const res = await fetch("/api/titulos/categorias");

      if (!res.ok) throw new Error();

      const data: TitleCategory[] = await res.json();

      setCategories(data);

    } catch (err) {

      console.error(err);

    }

  }, []);

  useEffect(() => {
    refreshTitles();
    refreshCategories();
  }, [refreshTitles, refreshCategories]);

  const createTitle = async (title: TitleFormData) => {
    try {

      const res = await fetch("/api/titulos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(title),
      });
      if (!res.ok) {
        throw new Error();
      }

      showToast(
        "Título creado correctamente.",
        "alert-success",
        3000
      )

      await refreshTitles();
      await refreshCategories();
      return true;

    } catch (error) {
      showToast(
        "No se pudo crear el título",
        "alert-error",
        3000
      );

      return false;
    }
  }

  const updateTitle = async (
    id: number,
    title: TitleFormData
  ) => {
    try {
      const res = await fetch(`/api/titulos/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(title),
      });

      if (!res.ok) {
        throw new Error();
      }

      showToast(
        "Título actualizado",
        "alert-success",
        3000
      );

      await refreshTitles();
      await refreshCategories();
      return true;

    } catch (error) {
      showToast(
        "Error actualizando título",
        "alert-error",
        3000
      );

      return false;
    }
  }

  const deleteTitle = async (
    id: number
  ) => {

    try {

      const res = await fetch(`/api/titulos/${id}`, {

        method: "DELETE",

      });

      if (!res.ok) {
        throw new Error();
      }

      showToast(
        "Título eliminado",
        "alert-success",
        3000
      );

      await refreshTitles();

      return true;

    } catch {

      showToast(
        "No se pudo eliminar",
        "alert-error",
        3000
      );

      return false;

    }

  };



  // Favoritos
  useEffect(() => {
    localStorage.setItem("favorites", JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (title: string) => {
    setFavorites((prev) => {
      if (prev.includes(title)) {
        showToast(`Título "${title}" eliminado de favoritos.`, 'alert-info', 3000);
        return prev.filter(
          (item) => item !== title
        );
      }
      showToast(`Título "${title}" agregado a favoritos.`, 'alert-success', 3000);
      return [...prev, title];
    });
  };

  // Búsqueda y filtros
  const filteredTitles = useMemo(() => {
    const normalize = (str: string) =>
      str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    const term = normalize(debouncedSearch);

    let result = [...titles];

    // Filtro de búsqueda
    if (term) {
      result = result.filter((title) =>
        normalize(title.name).includes(term) ||
        normalize(title.description ?? "").includes(term) ||
        normalize(title.route ?? "").includes(term)
      );
    }

    // Filtro de favoritos y categorías
    if (activeFilter === "Favoritos") {
      result = result.filter((title) =>
        favorites.includes(title.name)
      );
    }

    else if (activeFilter !== "Todos") {
      result = result.filter(
        (title) =>
          normalize(title.category) === normalize(activeFilter)
      );
    }
    return result;
  }, [titles, favorites, debouncedSearch, activeFilter])

  const filters = useMemo(() => {
    const categories = [
      ...new Set(
        titles.map((t) => t.category)
      ),
    ].sort();

    return [
      "Todos",
      "Favoritos",
      ...categories,
    ];
  }, [titles]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await copyText(text);
      setTimeout(() => setCopiedIndex(null), 2000);

      showToast(`Titulo "${text}" copiado al portapapeles.`, 'alert-success', 3000);
      if (typeof chrome !== "undefined" && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        chrome.tabs.sendMessage(tab.id!, {
          type: "SET_SUBJECT",
          payload: text,
        });
      }
    } catch (err) {
      showToast("Error al copiar al portapapeles", 'alert-error', 3000);
      console.error("Error copying to clipboard:", err);
    }
  }, []);

  return {
    titles,
    setTitles,
    categories,
    filters,
    filteredTitles,
    loading,
    searchQuery,
    setSearchQuery,
    copyToClipboard,
    copiedIndex,
    activeFilter,
    setActiveFilter,
    favorites,
    toggleFavorite,

    updateTitle,
    createTitle,
    deleteTitle
  };
}

function fallbackCopyToClipboard(value: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    const legacyCopyApi = document as unknown as {
      execCommand?: (commandId: string) => boolean;
    };
    copied =
      typeof legacyCopyApi.execCommand === "function"
        ? legacyCopyApi.execCommand("copy")
        : false;
  } catch {
    copied = false;
  }

  textarea.remove();
  return copied;
}

async function copyText(value: string): Promise<boolean> {
  const canUseClipboardApi =
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard !== "undefined" &&
    typeof navigator.clipboard.writeText === "function";

  if (canUseClipboardApi) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return fallbackCopyToClipboard(value);
    }
  }
  return fallbackCopyToClipboard(value);
}