import { test, expect } from "@playwright/test";

test.describe("Duplicados de terminales", () => {
  test("la API agrupa duplicadas con header de cluster", async ({ request }) => {
    const response = await request.get("/api/terminals?duplicates=true&limit=50");
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain("data-duplicate-cluster-header");
  });

  test("el agrupado aparece en una busqueda sin switch", async ({ request }) => {
    const dupResponse = await request.get(
      "/api/terminals?duplicates=true&limit=1",
    );
    const dupHtml = await dupResponse.text();

    const pickFirst = (pattern: RegExp): string | undefined =>
      dupHtml.match(pattern)?.[1]?.split(" ").filter(Boolean)[0];

    const shared =
      pickFirst(/data-shared-ips="([^"]*)"/) ??
      pickFirst(/data-shared-macs="([^"]*)"/) ??
      pickFirst(/data-shared-hostnames="([^"]*)"/);

    test.skip(!shared, "No hay valores compartidos en la primera pagina");

    const response = await request.get(
      `/api/terminals?search=${encodeURIComponent(shared!)}&limit=50`,
    );
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("data-duplicate-cluster-header");
  });

  test("el header de cluster antecede filas de terminal", async ({ request }) => {
    const response = await request.get("/api/terminals?duplicates=true&limit=50");
    const html = await response.text();
    const headerIndex = html.indexOf("data-duplicate-cluster-header");
    if (headerIndex >= 0) {
      expect(html.slice(headerIndex)).toContain("data-terminal-row");
    }
  });
});
