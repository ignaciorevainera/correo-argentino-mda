import { getCleanBase } from "@lib/baseUrl";
import { renderMarkdown } from "@lib/markdown";

export type DocSectionId = "architecture" | "migration" | "adr";

export interface DocEntry {
  slug: string;
  section: DocSectionId;
  sectionLabel: string;
  title: string;
  description: string;
  order: number;
  wordCount: number;
  filePath: string;
  content: string;
}

export interface DocSection {
  id: DocSectionId;
  label: string;
  description: string;
  docs: DocEntry[];
}

const SECTION_META: Array<{
  id: DocSectionId;
  label: string;
  description: string;
}> = [
  {
    id: "architecture",
    label: "Arquitectura",
    description:
      "Estado actual, inventario de módulos, deuda técnica y arquitectura objetivo.",
  },
  {
    id: "migration",
    label: "Migración",
    description:
      "Roadmap, piloto de Títulos, migración de datos, riesgos y cutover.",
  },
  {
    id: "adr",
    label: "Decisiones (ADR)",
    description:
      "Registro de decisiones de arquitectura y su estado de aprobación.",
  },
];

const SECTION_LABELS: Record<DocSectionId, string> = {
  architecture: "Arquitectura",
  migration: "Migración",
  adr: "Decisiones (ADR)",
};

const DOCS_BASE = "admin/documentacion";

const architectureModules = import.meta.glob<string>(
  "../../../docs/architecture/**/*.md",
  { eager: true, query: "?raw", import: "default" },
);

const migrationModules = import.meta.glob<string>(
  "../../../docs/migration/**/*.md",
  { eager: true, query: "?raw", import: "default" },
);

const adrModules = import.meta.glob<string>("../../../docs/adr/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const allModules: Record<string, string> = {
  ...architectureModules,
  ...migrationModules,
  ...adrModules,
};

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function toDocPath(key: string): string {
  const normalized = normalizeSlashes(key);
  const marker = "docs/";
  const markerIndex = normalized.lastIndexOf(marker);
  return markerIndex >= 0
    ? normalized.slice(markerIndex + marker.length)
    : normalized;
}

function extractTitle(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (!match) return fallback;
  return match[1]
    .replace(/[*_`]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function extractDescription(content: string): string {
  const lines = content.split(/\r?\n/);
  let seenH1 = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("# ")) {
      seenH1 = true;
      continue;
    }

    if (!seenH1) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("|")) continue;
    if (line.startsWith("```")) continue;
    if (line.startsWith("---")) continue;
    if (/^[-*]\s/.test(line)) continue;
    if (/^\d+\.\s/.test(line)) continue;

    const cleaned = line
      .replace(/^>\s?/, "")
      .replace(/[*_`]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();

    if (cleaned.length < 20) continue;
    return cleaned.length > 180
      ? `${cleaned.slice(0, 177).trimEnd()}...`
      : cleaned;
  }

  return "";
}

function humanizeFile(file: string): string {
  return file
    .replace(/\.md$/i, "")
    .replace(/^\d+[-_]?/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildDoc(key: string, content: string): DocEntry | null {
  const pathInDocs = toDocPath(key);
  const [section, ...rest] = pathInDocs.split("/");
  const file = rest.join("/");

  if (!SECTION_META.some((entry) => entry.id === section)) return null;
  if (!file.toLowerCase().endsWith(".md")) return null;

  const slug = pathInDocs.replace(/\.md$/i, "");
  const orderMatch = file.match(/^(\d+)/);
  const fallbackTitle = humanizeFile(file);

  return {
    slug,
    section: section as DocSectionId,
    sectionLabel: SECTION_LABELS[section as DocSectionId],
    title: extractTitle(content, fallbackTitle),
    description: extractDescription(content),
    order: orderMatch ? Number(orderMatch[1]) : 999,
    wordCount: content.trim().split(/\s+/).filter(Boolean).length,
    filePath: `docs/${pathInDocs}`,
    content,
  };
}

const allDocs: DocEntry[] = Object.entries(allModules)
  .map(([key, content]) => buildDoc(key, content))
  .filter((doc): doc is DocEntry => doc !== null)
  .sort((a, b) => {
    const sectionOrder =
      SECTION_META.findIndex((entry) => entry.id === a.section) -
      SECTION_META.findIndex((entry) => entry.id === b.section);
    if (sectionOrder !== 0) return sectionOrder;
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title, "es");
  });

const docsBySlug = new Map(allDocs.map((doc) => [doc.slug, doc]));

export function getAllDocs(): DocEntry[] {
  return allDocs;
}

export function getDocSections(): DocSection[] {
  return SECTION_META.map((meta) => ({
    ...meta,
    docs: allDocs.filter((doc) => doc.section === meta.id),
  })).filter((section) => section.docs.length > 0);
}

export function getDocBySlug(slug: string): DocEntry | null {
  return docsBySlug.get(slug.replace(/^\/+|\/+$/g, "")) ?? null;
}

export function getAdjacentDocs(slug: string): {
  previous: DocEntry | null;
  next: DocEntry | null;
} {
  const index = allDocs.findIndex((doc) => doc.slug === slug);
  if (index < 0) return { previous: null, next: null };
  return {
    previous: index > 0 ? allDocs[index - 1] : null,
    next: index < allDocs.length - 1 ? allDocs[index + 1] : null,
  };
}

export function getDocsIndexUrl(): string {
  return `${getCleanBase()}${DOCS_BASE}`;
}

export function getDocUrl(slug: string): string {
  return `${getCleanBase()}${DOCS_BASE}/${slug.replace(/^\/+/, "")}`;
}

function normalizeRelativePath(value: string): string {
  const parts: string[] = [];
  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

/**
 * Resuelve un link relativo a otro `.md` del catálogo.
 * Deja intactos links externos, absolutos, anclas y archivos que no son `.md`.
 */
export function resolveDocLink(href: string, currentSlug: string): string {
  if (!href || href.startsWith("#")) return href;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(href)) return href;

  const [rawPath, anchor] = href.split("#");
  if (!rawPath || !rawPath.toLowerCase().endsWith(".md")) return href;

  const currentDir = currentSlug.split("/").slice(0, -1).join("/");
  const target = normalizeRelativePath(`${currentDir}/${rawPath}`);
  const targetSlug = target.replace(/\.md$/i, "");

  if (!docsBySlug.has(targetSlug)) return href;

  return `${getDocUrl(targetSlug)}${anchor ? `#${anchor}` : ""}`;
}

export function rewriteDocHtmlLinks(html: string, currentSlug: string): string {
  return html.replace(/href="([^"]*)"/g, (match, href: string) => {
    const resolved = resolveDocLink(href, currentSlug);
    return resolved === href ? match : `href="${resolved}"`;
  });
}

export function renderDocHtml(slug: string): string | null {
  const doc = getDocBySlug(slug);
  if (!doc) return null;
  return rewriteDocHtmlLinks(renderMarkdown(doc.content), doc.slug);
}
