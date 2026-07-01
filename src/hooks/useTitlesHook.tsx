import { useState, useEffect, useCallback, useMemo } from "react";
import { useDebounce } from "./useDebounce";

declare const chrome: any;

export interface TitleData {
  title: string;
  ci: string;
  service: string;
}

const SHEET_ID = "1zVeRuLjQSShxpyXnE8pDJNYe4B_m5edI5gCB-d71xJ4";
const SHEET_NAME = "Hoja 1";

const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;

export function useTitles() {
  const [titles, setTitles] = useState<TitleData[]>([]);
  const [filteredTitles, setFilteredTitles] = useState<TitleData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("Todos");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const saved = localStorage.getItem("favorites");
    return saved ? JSON.parse(saved) : [];
  })

  // Debounce
  const debouncedSearch = useDebounce(searchQuery, 200);

  // Fetch desde el sheet
   useEffect(() => {
    const loadTitles = async () => {
      try {
        const res = await fetch(SHEET_URL);
        const text = await res.text();

        const json = JSON.parse(
          text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1)
        );

        const parsed: TitleData[] = json.table.rows
          .map((row: any) => ({
            title: row.c?.[0]?.v?.trim() ?? "",
            service: row.c?.[1]?.v?.trim() ?? "",
            ci: row.c?.[2]?.v?.trim() ?? "",
          }))
          .filter((item: { title: any }) => item.title);

        const unique = parsed
          .filter((t, i, self) =>
            i === self.findIndex((x) => x.title === t.title)
          )
          .sort((a, b) =>
            a.title.localeCompare(b.title, "es", { sensitivity: "base" })
          );

        setTitles(unique);
        setFilteredTitles(unique);
      } catch (error) {
        console.error("Error loading titles:", error);
      } finally {
        setLoading(false);
      }
    };

    loadTitles();
  }, []);


  // Favoritos
  useEffect(() => {
    localStorage.setItem("favorites", JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (title: string) => {
    setFavorites((prev) => {
      if (prev.includes(title)) {
        return prev.filter(
          (item) => item !== title
        );
      }
      return [...prev, title];
    });
  };

  // Búsqueda y filtros 
  useEffect(() => {
    const normalize = (str: string) =>
      str.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    const term = normalize(debouncedSearch);

    let result = titles;

    // filtro en búsqueda
    if (term) {
      result = result.filter(
        (t) =>
          normalize(t.title).includes(term) ||
          normalize(t.ci).includes(term) ||
          normalize(t.service).includes(term)
      );
    }
    // filtro por categoría
    if (activeFilter === "Favoritos") {
      result = result.filter(
        (t) => favorites.includes(t.title)
      );
    }
    else if (activeFilter !== "Todos") {
      result = result.filter(
        (t) =>
          normalize(t.service) ===
          normalize(activeFilter)
      );
    }

    setFilteredTitles(result);
  }, [debouncedSearch, activeFilter, titles, favorites]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await copyText(text);
      setTimeout(() => setCopiedIndex(null), 2000);

      alert(`Titulo "${text}" copiado al portapapeles.`)
      if (typeof chrome !== "undefined" && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        chrome.tabs.sendMessage(tab.id!, {
          type: "SET_SUBJECT",
          payload: text,
        });
      }
    } catch (err) {
      console.error("Error copying to clipboard:", err);
    }
  }, []);

  const sortedTitles = useMemo(() => {
    return [...filteredTitles].sort((a, b) =>
      a.title.localeCompare(b.title, "es")
    )
  }, [filteredTitles])

  return {
    titles,
    filteredTitles,
    loading,
    searchQuery,
    setSearchQuery,
    copyToClipboard,
    copiedIndex,
    setActiveFilter,
    activeFilter,
    sortedTitles,
    favorites,
    toggleFavorite
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