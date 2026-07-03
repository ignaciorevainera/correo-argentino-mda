import { escapeHtml } from "@lib/sanitize";

const HIGHLIGHT_CLASS = "rounded bg-warning/30 px-0.5 text-base-content";

type SearchValue = string | null | undefined;

interface TextRange {
  start: number;
  end: number;
}

export const normalizeSearchValue = (value: SearchValue): string =>
  (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const matchesSearchQuery = (
  query: SearchValue,
  values: SearchValue[],
): boolean => {
  const normalizedQuery = normalizeSearchValue(query).trim();

  if (normalizedQuery.length === 0) {
    return true;
  }

  return (values || []).some((value) =>
    normalizeSearchValue(value).includes(normalizedQuery),
  );
};

const getNormalizedIndexMap = (
  value: string,
): { normalizedText: string; indexMap: TextRange[] } => {
  let normalizedText = "";
  const indexMap: TextRange[] = [];
  let offset = 0;

  for (const character of value) {
    const start = offset;
    offset += character.length;

    const normalizedCharacter = normalizeSearchValue(character);
    normalizedText += normalizedCharacter;

    for (let index = 0; index < normalizedCharacter.length; index += 1) {
      indexMap.push({ start, end: offset });
    }
  }

  return { normalizedText, indexMap };
};

const getMatchRanges = (value: string, query: string): TextRange[] => {
  const normalizedQuery = normalizeSearchValue(query).trim();

  if (normalizedQuery.length === 0) {
    return [];
  }

  const { normalizedText, indexMap } = getNormalizedIndexMap(value);
  const ranges: TextRange[] = [];
  let searchIndex = normalizedText.indexOf(normalizedQuery);

  while (searchIndex >= 0) {
    const endIndex = searchIndex + normalizedQuery.length - 1;
    const startRange = indexMap[searchIndex];
    const endRange = indexMap[endIndex];

    if (startRange && endRange) {
      ranges.push({ start: startRange.start, end: endRange.end });
    }

    searchIndex = normalizedText.indexOf(
      normalizedQuery,
      searchIndex + normalizedQuery.length,
    );
  }

  return ranges;
};

export const highlightSearchTarget = (
  element: HTMLElement,
  query: SearchValue,
): void => {
  if (!element) return;
  const originalText =
    element.dataset?.originalText ?? element.textContent ?? "";

  if (!element.dataset?.originalText) {
    element.dataset.originalText = originalText;
  }

  const rawQuery = query?.trim() ?? "";

  if (rawQuery.length === 0) {
    element.textContent = originalText;
    return;
  }

  const matchRanges = getMatchRanges(originalText, rawQuery);

  if (matchRanges.length === 0) {
    element.textContent = originalText;
    return;
  }

  let highlightedText = "";
  let currentIndex = 0;

  matchRanges.forEach((range) => {
    highlightedText += escapeHtml(originalText.slice(currentIndex, range.start));
    highlightedText += `<mark class="${HIGHLIGHT_CLASS}">${escapeHtml(
      originalText.slice(range.start, range.end),
    )}</mark>`;
    currentIndex = range.end;
  });

  highlightedText += escapeHtml(originalText.slice(currentIndex));
  element.innerHTML = highlightedText;
};

export const highlightSearchTargets = (
  root: ParentNode,
  query: SearchValue,
  selector = "[data-highlight-target]",
): void => {
  if (!root) return;
  const targets = Array.from(root.querySelectorAll<HTMLElement>(selector));

  targets.forEach((target) => {
    highlightSearchTarget(target, query);
  });
};
