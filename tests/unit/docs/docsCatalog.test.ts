import { describe, expect, it } from "vitest";
import {
  getAllDocs,
  getDocBySlug,
  getDocSections,
  getDocUrl,
  resolveDocLink,
} from "@lib/docs/docsCatalog";

describe("docsCatalog", () => {
  it("carga los 22 documentos nuevos", () => {
    expect(getAllDocs()).toHaveLength(22);
  });

  it("usa slugs únicos y estables", () => {
    const slugs = getAllDocs().map((doc) => doc.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toContain("architecture/03-deuda-tecnica");
    expect(slugs).toContain("migration/00-roadmap");
    expect(slugs).toContain("adr/0001-monolito-modular");
  });

  it("extrae título y descripción de cada documento", () => {
    for (const doc of getAllDocs()) {
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.description.length).toBeGreaterThan(0);
      expect(doc.wordCount).toBeGreaterThan(0);
    }
  });

  it("agrupa en tres secciones", () => {
    const sections = getDocSections();
    expect(sections.map((section) => section.id)).toEqual([
      "architecture",
      "migration",
      "adr",
    ]);
    expect(sections.map((section) => section.docs.length)).toEqual([11, 5, 6]);
  });

  it("resuelve links relativos del mismo directorio", () => {
    expect(
      resolveDocLink("00-estado-actual.md", "architecture/03-deuda-tecnica"),
    ).toBe(getDocUrl("architecture/00-estado-actual"));
  });

  it("resuelve links a otras secciones", () => {
    expect(
      resolveDocLink("../migration/00-roadmap.md", "architecture/README"),
    ).toBe(getDocUrl("migration/00-roadmap"));
    expect(
      resolveDocLink("../adr/0001-monolito-modular.md", "architecture/README"),
    ).toBe(getDocUrl("adr/0001-monolito-modular"));
  });

  it("preserva anclas y links externos", () => {
    expect(
      resolveDocLink("00-estado-actual.md#resumen", "architecture/README"),
    ).toBe(`${getDocUrl("architecture/00-estado-actual")}#resumen`);
    expect(
      resolveDocLink("https://example.com/x.md", "architecture/README"),
    ).toBe("https://example.com/x.md");
  });

  it("devuelve null para un slug inexistente", () => {
    expect(getDocBySlug("architecture/no-existe")).toBeNull();
  });
});
