import { useState, useEffect, useCallback } from "react";

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
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

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
            a.title.localeCompare("es", { sensitivity: "base" })
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

  useEffect(() => {
    const normalize = (str: string) =>
      str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

    const term = normalize(searchQuery);

    if (!term) {
      setFilteredTitles(titles);
    } else {
      setFilteredTitles(
        titles.filter(
          (t) =>
            normalize(t.title).includes(term) ||
            normalize(t.ci).includes(term) ||
            normalize(t.service).includes(term)
        )
      );
    }
  }, [searchQuery, titles]);

  const copyToClipboard = useCallback(async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);

      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
      
      if (typeof chrome !== "undefined" && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        chrome.tabs.sendMessage(tab.id!, {
          type: "SET_SUBJECT",
          payload: text,
        });
      }
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  }, []);

  return {
    titles,
    filteredTitles,
    loading,
    searchQuery,
    setSearchQuery,
    copyToClipboard,
    copiedIndex,
  };
}