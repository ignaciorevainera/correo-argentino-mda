import { describe, expect, it } from "vitest";
import {
  categoryKey,
  countArticlesWithCategory,
} from "../../src/lib/kbCategories";

type ExecutorArg = Parameters<typeof countArticlesWithCategory>[2];

function stubExecutor(rows: { category: string | null }[]): ExecutorArg {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ all: () => rows }),
      }),
    }),
  } as unknown as ExecutorArg;
}

describe("categoryKey", () => {
  it("colapsa espacios, recorta y baja a minúsculas", () => {
    expect(categoryKey("  Prueba   de   Fuego ")).toBe("prueba de fuego");
    expect(categoryKey("PRUEBA DE FUEGO")).toBe("prueba de fuego");
  });

  it("normaliza NFC (compuesto vs descompuesto)", () => {
    expect(categoryKey("Soluci\u00f3n")).toBe(categoryKey("Solucio\u0301n"));
  });
});

describe("countArticlesWithCategory", () => {
  it("cuenta variantes de espacio y mayúsculas como la misma categoría", () => {
    const executor = stubExecutor([
      { category: "Prueba" },
      { category: "prueba " },
      { category: " PRUEBA" },
      { category: "Otra" },
      { category: null },
    ]);
    expect(countArticlesWithCategory(1, "Prueba", executor)).toBe(3);
  });

  it("no cuenta una categoría distinta", () => {
    const executor = stubExecutor([{ category: "Otra" }]);
    expect(countArticlesWithCategory(1, "Prueba", executor)).toBe(0);
  });
});
